/**
 * SHONOWEAR — server/promos.js
 * Coupons and referral codes. One "promo code" box accepts either.
 *
 * Usage is counted like stock, so two people racing for the last use cannot both get it:
 *   committed  cpn:used:<CODE>   hash   orderId → 1            (set when the order is paid/placed; same value twice = no change)
 *   holds      cpn:hold:<CODE>   zset   orderId, score = expiry (an unpaid checkout keeps its use for the hold time)
 *   customers  cpn:cu:<CODE>     hash   customerKey → orderId   (email and phone, hashed)
 *   cust holds cpn:ch:<CODE>     zset   "<customerKey>|<orderId>"
 *   custpaid:<customerKey>       set once any order is paid: "first order only" looks here
 */
import crypto from 'node:crypto';
import { store, hash } from './guard.js';
import { isLiveMode } from './razorpay.js';
import { STORE } from '../src/data/storeConfig.js';
import { COUPONS } from './couponsConfig.js';
import { sendReferralReward } from './notify.js';
import { issueGiftCard } from './giftcards.js';

export const normCode = (s) => String(s ?? '').trim().toUpperCase().replace(/\s+/g, '');
export const validCodeShape = (c) => /^[A-Z0-9_-]{3,24}$/.test(c);

export function custKeys(c) {
  const email = String(c?.email || '').trim().toLowerCase();
  const phone = String(c?.phone || '').replace(/\D/g, '').slice(-10);
  const out = [];
  if (email) out.push(`e:${hash(email, 'cust:')}`);
  if (phone.length === 10) out.push(`p:${hash(phone, 'cust:')}`);
  return out;
}
const eKey = (email) => `e:${hash(String(email || '').trim().toLowerCase(), 'cust:')}`;

const k = {
  used: (c) => `cpn:used:${c}`, hold: (c) => `cpn:hold:${c}`, cu: (c) => `cpn:cu:${c}`, ch: (c) => `cpn:ch:${c}`,
};

/** Static look-up in your config. null when unknown, inactive, outside its dates, or a sample in live mode. */
export function findCoupon(code, now = Date.now()) {
  const c = COUPONS.find(x => x.code === code);
  if (!c || !c.active) return null;
  if (c.sample && isLiveMode()) return null;
  if (c.startsAt && now < Date.parse(c.startsAt)) return null;
  if (c.endsAt && now >= Date.parse(c.endsAt)) return null;
  return c;
}

export async function hasPaidBefore(customer) {
  const keys = custKeys(customer);
  if (!keys.length) return false;
  const res = await store(keys.map(key => ['GET', `custpaid:${key}`]));
  return res.some(Boolean);
}

/** Referral codes look like SWF-ABC234. The code belongs to the person who got it after a paid order. */
async function findReferral(code) {
  if (!STORE.referral?.enabled || !/^SWF-[A-Z0-9]{6}$/.test(code)) return null;
  const [raw] = await store([['GET', `ref:c:${code}`]]);
  if (!raw) return null;
  try { return JSON.parse(raw); } catch { return null; }
}

/**
 * Read-only check used by the price quote and again by checkout.
 * Returns { ok, promo } where promo = { code, kind, label, coupon, referrerEmail? } or { ok:false, reason }.
 * `customer` is optional while the customer is still typing their details.
 */
export async function checkPromo(rawCode, { now = Date.now(), customer = null } = {}) {
  const code = normCode(rawCode);
  if (!validCodeShape(code)) return { ok: false, reason: 'That code is not valid.' };
  const BAD = { ok: false, reason: 'That code is not valid or has expired.' };

  let promo = null;
  const c = findCoupon(code, now);
  if (c) promo = { code, kind: 'coupon', label: c.label || code, coupon: c };
  else {
    const ref = await findReferral(code);
    if (!ref) return BAD;
    const f = STORE.referral;
    promo = { code, kind: 'referral', label: `${f.friendOff ? `₹${f.friendOff} off` : 'Discount'} your first order, from a friend`, referrerEmail: ref.email,
      coupon: { code, kind: 'flat', value: f.friendOff, minSubtotal: f.minSubtotal, oncePerCustomer: true, firstOrderOnly: true, stackWithBundle: false } };
    if (customer && custKeys(customer).includes(eKey(ref.email))) return { ok: false, reason: 'You cannot use your own referral code.' };
  }

  const cp = promo.coupon;
  const [used, live] = await Promise.all([
    store([['HLEN', k.used(code)]]).then(r => r[0]),
    store([['ZRANGEBYSCORE', k.hold(code), now, '+inf']]).then(r => r[0] || []),
  ]);
  if (cp.usageLimit && Number(used) + live.length >= cp.usageLimit) return { ok: false, reason: 'This code has been fully redeemed.' };

  if (customer) {
    const keys = custKeys(customer);
    if (cp.firstOrderOnly && await hasPaidBefore(customer)) return { ok: false, reason: 'This code is for first orders only.' };
    if (cp.oncePerCustomer) {
      const hit = await store(keys.map(key => ['HGET', k.cu(code), key]));
      if (hit.some(Boolean)) return { ok: false, reason: 'You have already used this code.' };
    }
  }
  return { ok: true, promo };
}

/** Claim one use of the code for this order. Safe against races: both racers may be refused, never both served. */
export async function reservePromo(promo, orderId, customer, expiresAt, now = Date.now()) {
  const cp = promo.coupon, code = promo.code, keys = custKeys(customer);
  const members = keys.map(key => `${key}|${orderId}`);
  const rollback = () => store([['ZREM', k.hold(code), orderId], ...members.map(m => ['ZREM', k.ch(code), m])]).catch(() => {});

  if (cp.firstOrderOnly && await hasPaidBefore(customer)) return { ok: false, reason: 'This code is for first orders only.' };
  if (cp.oncePerCustomer) {
    const hit = await store(keys.map(key => ['HGET', k.cu(code), key]));
    if (hit.some(v => v && v !== orderId)) return { ok: false, reason: 'You have already used this code.' };
  }
  await store([
    ['ZREMRANGEBYSCORE', k.hold(code), '-inf', now], ['ZADD', k.hold(code), expiresAt, orderId],
    ['ZREMRANGEBYSCORE', k.ch(code), '-inf', now], ...members.map(m => ['ZADD', k.ch(code), expiresAt, m]),
  ]);
  const [used, live, chLive] = await store([['HLEN', k.used(code)], ['ZRANGEBYSCORE', k.hold(code), now, '+inf'], ['ZRANGEBYSCORE', k.ch(code), now, '+inf']]);
  if (cp.usageLimit && Number(used) + live.length > cp.usageLimit) { await rollback(); return { ok: false, reason: 'This code has been fully redeemed.' }; }
  if (cp.oncePerCustomer && chLive.some(m => keys.includes(m.split('|')[0]) && m.split('|')[1] !== orderId)) {
    await rollback(); return { ok: false, reason: 'You already have an order in progress with this code.' };
  }
  return { ok: true };
}

export async function releasePromo(order) {
  if (!order?.promo?.code) return;
  const code = order.promo.code;
  await store([['ZREM', k.hold(code), order.id], ...custKeys(order.customer).map(key => ['ZREM', k.ch(code), `${key}|${order.id}`])]).catch(() => {});
}

/** Turn the claim into a use. Idempotent. Returns flags for the owner ('coupon-over-limit'). */
export async function commitPromo(order) {
  const flags = [];
  if (!order?.promo?.code) return flags;
  const code = order.promo.code, keys = custKeys(order.customer);
  await store([['HSET', k.used(code), order.id, '1'], ...keys.map(key => ['HSET', k.cu(code), key, order.id])]);
  await releasePromo(order);
  const limit = findCouponLimit(order.promo);
  if (limit) { const [n] = await store([['HLEN', k.used(code)]]); if (Number(n) > limit) flags.push('coupon-over-limit'); }
  return flags;
}
const findCouponLimit = (promo) => COUPONS.find(c => c.code === promo.code)?.usageLimit || 0;

/** COD order cancelled or refused: the coupon use goes back. */
export async function uncommitPromo(order) {
  if (!order?.promo?.code) return;
  const code = order.promo.code;
  await store([['HDEL', k.used(code), order.id], ...custKeys(order.customer).map(key => ['HDEL', k.cu(code), key])]).catch(() => {});
}

export async function markCustomerPaid(order) {
  const keys = custKeys(order.customer);
  if (keys.length) await store(keys.map(key => ['SET', `custpaid:${key}`, '1']));
}

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const randomCode = (n) => Array.from(crypto.randomBytes(n), b => ALPHABET[b % ALPHABET.length]).join('');

/** The buyer's own referral code (created once, from their first paid order). */
export async function referralCodeFor(customer) {
  if (!STORE.referral?.enabled || !customer?.email) return null;
  const key = `ref:e:${eKey(customer.email)}`;
  const [have] = await store([['GET', key]]);
  if (have) return have;
  const code = `SWF-${randomCode(6)}`;
  await store([['SET', `ref:c:${code}`, JSON.stringify({ email: String(customer.email).toLowerCase() }), 'NX']]);
  await store([['SET', key, code, 'NX']]);
  const [final] = await store([['GET', key]]);
  return final;
}

/** When a referred order is delivered, the referrer gets store credit once (capped per referrer). */
export async function rewardReferrer(order) {
  const r = STORE.referral;
  if (!r?.enabled || order?.promo?.kind !== 'referral' || !order.promo.referrerEmail || !(r.referrerReward > 0)) return { ok: false, reason: 'none' };
  const [first] = await store([['SET', `refrewarded:${order.id}`, '1', 'NX']]);
  if (first !== 'OK') return { ok: false, reason: 'already' };
  const ek = eKey(order.promo.referrerEmail);
  const [n] = await store([['INCR', `refcount:${ek}`]]);
  if (Number(n) > r.maxRewardsPerReferrer) return { ok: false, reason: 'cap' };
  const gc = await issueGiftCard({ amount: r.referrerReward, source: 'referral', note: `Referral reward for order ${order.number}`, email: order.promo.referrerEmail });
  await sendReferralReward({ to: order.promo.referrerEmail, amount: r.referrerReward, code: gc.code, expiresAt: gc.expiresAt }).catch(() => {});
  return { ok: true, code: gc.code };
}
