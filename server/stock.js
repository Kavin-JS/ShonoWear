/**
 * SHONOWEAR — server/stock.js
 * Per-size stock with time-limited holds. No counters that can leak:
 *
 *   total stock  = catalogue (src/data/catalog.js)
 *   sold         = `sold:<id>:<size>`   integer, incremented when a payment is confirmed
 *   held         = `hold:<id>:<size>`   sorted set, member "<orderId>:<qty>", score = expiry (ms)
 *   available    = total - sold - (sum of unexpired holds)
 *
 * Reserving = add our hold, then re-count. If the count exceeds stock we remove our hold
 * and fail. Two buyers racing for the last unit can both be refused (safe), never both served.
 * Holds expire on their own, so abandoned checkouts free their stock without any cron job.
 */
import { catalog } from '../src/data/catalog.js';
import { STORE } from '../src/data/storeConfig.js';
import { store } from './guard.js';

const products = new Map(catalog.map(p => [p.id, p]));
// sold units live in a hash {orderId: qty}: writing the same order twice changes nothing, so a retry is always safe.
const soldKey = (id, size) => `soldh:${id}:${size}`;
const sum = (vals) => (vals || []).reduce((n, v) => n + (Number(v) || 0), 0);
const holdKey = (id, size) => `hold:${id}:${size}`;
const qtyOf = (member) => Number(String(member).split(':').pop()) || 0;

export const totalStock = (id, size) => {
  const sizes = products.get(id)?.sizes;
  if (!sizes || !Object.hasOwn(sizes, size)) return 0;
  const n = sizes[size];
  return Number.isInteger(n) && n > 0 ? n : 0;
};

export async function reserve(orderId, lines, now = Date.now()) {
  const expiresAt = now + STORE.holdMinutes * 60_000;
  const taken = [];

  const rollback = () => Promise.all(taken.map(t => store([['ZREM', t.key, t.member]]).catch(() => {})));

  try {
    for (const l of lines) {
      const key = holdKey(l.id, l.size);
      const member = `${orderId}:${l.qty}`;
      await store([['ZREMRANGEBYSCORE', key, '-inf', now], ['ZADD', key, expiresAt, member]]);
      taken.push({ key, member });

      const [members, sold] = await store([['ZRANGEBYSCORE', key, now, '+inf'], ['HVALS', soldKey(l.id, l.size)]]);
      const held = members.reduce((n, m) => n + qtyOf(m), 0);
      const total = totalStock(l.id, l.size);
      const soldN = sum(sold);
      if (soldN + held > total) {
        await rollback();
        const availableForUs = Math.max(0, total - soldN - (held - l.qty));
        return { ok: false, id: l.id, size: l.size, available: availableForUs };
      }
    }
    return { ok: true, expiresAt };
  } catch (err) {
    await rollback();
    throw err;
  }
}

export async function release(orderId, lines) {
  await Promise.all(lines.map(l => store([['ZREM', holdKey(l.id, l.size), `${orderId}:${l.qty}`]]).catch(() => {})));
}

/**
 * Turn holds into sold units after a confirmed payment. Safe to call twice:
 * each line is claimed once. Returns { oversold } if more was sold than exists
 * (possible only if payment arrived after the hold expired and someone else bought the unit).
 */
export async function commit(orderId, lines) {
  let oversold = false;
  for (const l of lines) {
    // idempotent: same field, same value
    const [, vals] = await store([['HSET', soldKey(l.id, l.size), orderId, String(l.qty)], ['HVALS', soldKey(l.id, l.size)]]);
    if (sum(vals) > totalStock(l.id, l.size)) oversold = true;
    await store([['ZREM', holdKey(l.id, l.size), `${orderId}:${l.qty}`]]).catch(() => {});
  }
  return { oversold };
}

/** { productId: { size: unitsAvailableNow } } for own products. */
export async function availability(ids, now = Date.now()) {
  const out = {};
  const wanted = [...new Set(ids)].map(id => products.get(id)).filter(p => p?.fulfilment === 'own');
  const cmds = [];
  const order = [];
  for (const p of wanted) {
    for (const size of Object.keys(p.sizes || {})) {
      cmds.push(['HVALS', soldKey(p.id, size)], ['ZRANGEBYSCORE', holdKey(p.id, size), now, '+inf']);
      order.push([p, size]);
    }
  }
  if (!cmds.length) return out;
  const res = await store(cmds);
  order.forEach(([p, size], i) => {
    const sold = sum(res[i * 2]);
    const held = (res[i * 2 + 1] || []).reduce((n, m) => n + qtyOf(m), 0);
    (out[p.id] ??= {})[size] = Math.max(0, totalStock(p.id, size) - sold - held);
  });
  return out;
}
