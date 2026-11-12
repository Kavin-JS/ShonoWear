/**
 * SHONOWEAR — server/waitlist.js
 * "Tell me when it's back": emails kept per product+size in a sorted set (score = signup time).
 * Only sold-out own-stock sizes accept sign-ups. The owner sends the alerts from /admin after restocking.
 */
import { store } from './guard.js';
import { availability } from './stock.js';
import { sendBackInStock, emailConfigured } from './notify.js';
import { catalog } from '../src/data/catalog.js';

const MAX_PER_SKU = 500;
const key = (id, size) => `wl:${id}:${size}`;
const INDEX = 'wl:index';
export const validEmail = (e) => typeof e === 'string' && e.length <= 254 && /^[^\s@<>"'`,;]+@[^\s@<>"'`,;]+\.[A-Za-z]{2,}$/.test(e);

export async function addToWaitlist(id, size, rawEmail, now = Date.now()) {
  const p = catalog.find(x => x.id === id);
  if (!p || p.fulfilment !== 'own' || typeof size !== 'string' || !Object.hasOwn(p.sizes, size)) return { ok: false, reason: 'bad_item' };
  const email = String(rawEmail).trim().toLowerCase();
  if (!validEmail(email)) return { ok: false, reason: 'bad_email' };
  const avail = (await availability([id], now))[id]?.[size] ?? 0;
  if (avail > 0) return { ok: false, reason: 'in_stock' };
  const existing = await store([['ZRANGEBYSCORE', key(id, size), '-inf', '+inf']]);
  if ((existing[0] || []).length >= MAX_PER_SKU) return { ok: false, reason: 'full' };
  await store([['ZADD', key(id, size), now, email], ['ZADD', INDEX, now, `${id}|${size}`]]);
  return { ok: true };
}

export async function listWaitlist() {
  const [idx] = await store([['ZRANGEBYSCORE', INDEX, '-inf', '+inf']]);
  const out = [];
  for (const entry of idx || []) {
    const [id, size] = String(entry).split('|');
    const [emails] = await store([['ZRANGEBYSCORE', key(id, size), '-inf', '+inf']]);
    const p = catalog.find(x => x.id === id);
    if (p && emails?.length) out.push({ id, size, name: p.name, count: emails.length });
  }
  return out;
}

/** Sends up to `limit` alerts for one product+size, and only if it is actually available again. */
export async function notifyWaitlist(id, size, { limit = 50, siteUrl = process.env.SITE_URL, now = Date.now() } = {}) {
  const p = catalog.find(x => x.id === id);
  if (!p || p.fulfilment !== 'own' || typeof size !== 'string' || !Object.hasOwn(p.sizes, size)) return { ok: false, error: 'Unknown product or size.' };
  if (!emailConfigured()) return { ok: false, error: 'Email is not configured (RESEND_API_KEY, ORDER_FROM_EMAIL).' };
  const avail = (await availability([id], now))[id]?.[size] ?? 0;
  if (avail <= 0) return { ok: false, error: 'That size is still sold out. Restock it in catalog.js and redeploy first.' };
  const [emails] = await store([['ZRANGEBYSCORE', key(id, size), '-inf', '+inf']]);
  const batch = (emails || []).slice(0, Math.min(limit, avail * 5 + 5));   // a few more than units, since not everyone buys
  const url = siteUrl ? `${siteUrl.replace(/\/+$/, '')}/product/${id}` : '';
  let sent = 0, failed = 0;
  for (let i = 0; i < batch.length; i += 10) {
    const results = await Promise.allSettled(batch.slice(i, i + 10).map(to => sendBackInStock({ to, productName: p.name, size, url })));
    results.forEach((r, k) => { if (r.status === 'fulfilled') { sent += 1; } else { failed += 1; batch[i + k] = null; } });
  }
  const done = batch.filter(Boolean);                                        // failed ones stay on the list for a retry
  if (done.length) await store(done.map(e => ['ZREM', key(id, size), e]));
  const remaining = (emails || []).length - done.length;
  if (!remaining) await store([['ZREM', INDEX, `${id}|${size}`]]);
  return { ok: true, sent, failed, remaining };
}
