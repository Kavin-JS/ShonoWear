/**
 * SHONOWEAR — server/bags.js
 * "Remind me" for customers who ticked the box at checkout. We keep their email and bag for at most
 * STORE.abandonedBag.maxDays days, send ONE reminder when you press the button in /admin, then delete it.
 * A paid order deletes the saved bag at once. Nothing is stored without the explicit consent flag.
 */
import { store, hash, log } from './guard.js';
import { parseCart } from './cart.js';
import { sendBagReminder, emailConfigured } from './notify.js';
import { validEmail } from './waitlist.js';
import { unitPrice } from '../src/lib/offers.js';
import { STORE } from '../src/data/storeConfig.js';

const bagKey = (email) => `bag:${hash(String(email).trim().toLowerCase(), 'bag:')}`;
const INDEX = 'bag:index';

export async function rememberBag({ email, cart, consent, now = Date.now() }) {
  const cfg = STORE.abandonedBag;
  if (!cfg?.enabled || consent !== true) return { ok: false, reason: 'no_consent' };
  const e = String(email || '').trim().toLowerCase();
  if (!validEmail(e)) return { ok: false, reason: 'bad_email' };
  const parsed = parseCart(cart);
  if (!parsed.ok) return { ok: false, reason: 'bad_cart' };
  const key = bagKey(e);
  const data = { email: e, cart: parsed.lines.map(l => ({ id: l.id, size: l.size, qty: l.qty })), savedAt: now };
  await store([['SET', key, JSON.stringify(data), 'EX', cfg.maxDays * 86400], ['ZADD', INDEX, now, key]]);
  return { ok: true };
}

export async function forgetBag(email) {
  if (!email) return;
  const key = bagKey(email);
  await store([['DEL', key], ['ZREM', INDEX, key]]).catch(() => {});
}

/** How many saved bags are old enough to remind, without sending anything. */
export async function countDue(now = Date.now()) {
  const cfg = STORE.abandonedBag;
  const [due] = await store([['ZRANGEBYSCORE', INDEX, '-inf', now - cfg.minHours * 3600_000]]);
  return (due || []).length;
}

export async function sendReminders(now = Date.now()) {
  if (!emailConfigured()) return { ok: false, reason: 'email_not_configured' };
  const cfg = STORE.abandonedBag;
  const [due] = await store([['ZRANGEBYSCORE', INDEX, '-inf', now - cfg.minHours * 3600_000]]);
  const base = (process.env.SITE_URL || '').replace(/\/+$/, '');
  let sent = 0, skipped = 0, failed = 0;
  for (const key of (due || []).slice(0, 50)) {
    const [raw] = await store([['GET', key]]);
    await store([['ZREM', INDEX, key]]);                                  // never remind twice, whatever happens next
    if (!raw) { skipped++; continue; }
    let d; try { d = JSON.parse(raw); } catch { skipped++; continue; }
    const parsed = parseCart(d.cart);
    if (!parsed.ok) { await store([['DEL', key]]); skipped++; continue; }
    const items = parsed.lines.map(l => ({ name: l.product.name, size: l.size, qty: l.qty, price: unitPrice(l.product, now) }));
    const restore = d.cart.map(l => `${l.id}~${l.size}~${l.qty}`).join(',');
    try {
      await sendBagReminder({ to: d.email, items, url: base ? `${base}/bag?restore=${encodeURIComponent(restore)}` : '' });
      sent++;
    } catch (err) { failed++; log('bag_reminder_failed', { msg: err.message }); }
    await store([['DEL', key]]);                                          // keep nothing after the one reminder
  }
  return { ok: true, sent, skipped, failed };
}
