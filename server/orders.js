/**
 * SHONOWEAR — server/orders.js
 * Order records in the key-value store, and the one place an order becomes "paid".
 *
 * Statuses: pending_payment → paid → shipped → delivered
 *           pending_payment → cancelled | expired      paid → cancelled (refund by hand)
 *
 * Money has already been taken by the time finalizePaid() runs, so it never refuses:
 * even if the hold expired or the order was cancelled, the order becomes "paid" and is
 * flagged for review so a human can ship it or refund it.
 */
import { eKey } from './ekey.js';
import { recordConsent } from './marketing.js';
import crypto from 'node:crypto';
import { store, log } from './guard.js';
import { commit, uncommit, release, availability } from './stock.js';
import { sendOrderEmails, sendLowStockAlert, sendGiftCardEmail, sendGiftReceipt } from './notify.js';
import { commitPromo, uncommitPromo, releasePromo, markCustomerPaid, referralCodeFor, custKeys } from './promos.js';
import { commitGift, uncommitGift, releaseGift, issueForOrder } from './giftcards.js';
import { forgetBag } from './bags.js';
import { STORE } from '../src/data/storeConfig.js';

const orderKey = (id) => `order:${id}`;
const PAID_STATES = new Set(['paid', 'shipped', 'delivered', 'cod_placed']);

export const newOrderId = () => crypto.randomBytes(12).toString('base64url');

export async function nextOrderNumber() {
  const [n] = await store([['INCR', 'order:seq']]);
  return `SW-${1000 + Number(n)}`;
}

export async function saveOrder(order) {
  await store([['SET', orderKey(order.id), JSON.stringify(order)]]);
}

export async function insertOrder(order) {
  await store([
    ['SET', orderKey(order.id), JSON.stringify(order)],
    ...(order.razorpay?.orderId ? [['SET', `rzp:${order.razorpay.orderId}`, order.id, 'EX', 31536000]] : []),
    ['LPUSH', 'orders:index', order.id],
    ['LTRIM', 'orders:index', 0, 999],
    // per-customer index for "My orders" (hashed email; nothing readable in the key)
    ...(order.customer?.email ? [['LPUSH', `ordersby:${eKey(order.customer.email)}`, order.id], ['LTRIM', `ordersby:${eKey(order.customer.email)}`, 0, 199]] : []),
  ]);
}

/**
 * Reads an order. A payment record (`paid:<id>`) is the source of truth for "money received":
 * if it exists, a stale write that said expired/cancelled-by-customer cannot hide the payment.
 * Pass { raw: true } to skip that merge.
 */
export async function getOrder(id, { raw: wantRaw = false } = {}) {
  if (typeof id !== 'string' || !/^[A-Za-z0-9_-]{16}$/.test(id)) return null;
  const [raw, paidRaw] = await store([['GET', orderKey(id)], ['GET', `paid:${id}`]]);
  if (!raw) return null;
  let o;
  try { o = JSON.parse(raw); } catch { return null; }
  if (!wantRaw && paidRaw && (o.status === 'pending_payment' || o.status === 'expired' || (o.status === 'cancelled' && o.cancelledBy !== 'admin'))) {
    try {
      const m = JSON.parse(paidRaw);
      o = { ...o, status: 'paid', paidAt: m.paidAt, razorpay: { ...o.razorpay, paymentId: m.paymentId } };
    } catch { /* ignore */ }
  }
  return o;
}

/** Pending orders past their hold are reported as expired (and saved so lists agree). */
export async function getOrderFresh(id, now = Date.now()) {
  const o = await getOrder(id);
  if (o && o.status === 'pending_payment' && now > o.expiresAt) {
    const fresh = await getOrder(id, { raw: true });           // re-read: never overwrite a newer state
    if (fresh && fresh.status === 'pending_payment') await saveOrder({ ...fresh, status: 'expired' }).catch(() => {});
    return { ...o, status: 'expired' };
  }
  return o;
}

export async function findByRazorpayOrder(razorpayOrderId) {
  if (typeof razorpayOrderId !== 'string' || !/^order_[A-Za-z0-9]+$/.test(razorpayOrderId)) return null;
  const [id] = await store([['GET', `rzp:${razorpayOrderId}`]]);
  return id ? getOrder(id) : null;
}

/**
 * Mark an order paid after a verified payment (checkout signature or webhook).
 * Every step is idempotent, so a crash halfway is repaired by the next call (Razorpay retries webhooks):
 *   1. record the payment (`paid:<id>`, set once)   2. commit stock (hash, same field)
 *   3. save the order as paid                         4. send emails once (`emailed:<id>` NX)
 * `done:<id>` is set last. After that, nothing here ever runs again, so a cancelled or refunded
 * order cannot be turned back into "paid" by a replayed request.
 * Money has already been taken, so this never refuses: oddities are flagged for a human.
 */
/** Emails the owner once per product+size (per week) when stock falls to the threshold. Best effort. */
async function lowStockCheck(items) {
  const avail = await availability([...new Set(items.map(i => i.id))]);
  const rows = [];
  for (const i of items) {
    const left = avail[i.id]?.[i.size];
    if (left === undefined || left > STORE.lowStockThreshold) continue;
    const [first] = await store([['SET', `lowalert:${i.id}:${i.size}`, '1', 'NX', 'EX', 7 * 86400]]);
    if (first === 'OK') rows.push({ name: i.name, size: i.size, left });
  }
  if (rows.length) await sendLowStockAlert(rows);
}

export async function finalizePaid(orderId, { paymentId, source }) {
  const order = await getOrder(orderId, { raw: true });
  if (!order) return { ok: false, reason: 'not_found' };
  const [done] = await store([['GET', `done:${order.id}`]]);
  if (done) return { ok: true, already: true, order: await getOrder(order.id) };

  const paidAt = new Date().toISOString();
  await store([['SET', `paid:${order.id}`, JSON.stringify({ paidAt, paymentId }), 'NX']]);
  const [mRaw] = await store([['GET', `paid:${order.id}`]]);
  const marker = JSON.parse(mRaw);

  const flags = [...(order.flags || [])];
  if (order.status === 'expired' || Date.now() > order.expiresAt) flags.push('paid-after-hold-expired');
  if (order.status === 'cancelled') flags.push('paid-after-cancel');

  if (order.kind !== 'giftcard') {
    const { oversold } = await commit(order.id, order.items);
    if (oversold) flags.push('oversold-needs-review');
  }
  flags.push(...await commitPromo(order), ...await commitGift(order));
  await markCustomerPaid(order);
  const extra = {};
  if (order.kind === 'giftcard') extra.giftcardCode = (await issueForOrder({ ...order })).code;
  else { const rc = await referralCodeFor(order.customer).catch(() => null); if (rc) extra.referralCode = rc; }

  const paid = {
    ...order,
    ...extra,
    status: PAID_STATES.has(order.status) ? order.status : 'paid',
    paidAt: marker.paidAt,
    razorpay: { ...order.razorpay, paymentId: marker.paymentId },
    flags: [...new Set(flags)],
  };
  delete paid.cancelledBy;
  await saveOrder(paid);
  await store([['SET', `done:${order.id}`, '1']]);
  log('order_paid', { source, flags: paid.flags });
  await afterConfirm(paid);
  return { ok: true, order: paid };
}

/** Emails once, then the saved-bag cleanup and the low-stock check. Never throws: the order is already safe. */
async function afterConfirm(o) {
  const [first] = await store([['SET', `emailed:${o.id}`, '1', 'NX', 'EX', 31536000]]);
  if (first === 'OK') {
    if (o.kind === 'giftcard') await sendGiftEmails(o).catch(err => log('order_email_failed', { msg: err.message }));
    else {
      await sendOrderEmails(o).catch(err => log('order_email_failed', { msg: err.message }));
      await lowStockCheck(o.items).catch(err => log('low_stock_check_failed', { msg: err.message }));
    }
  }
  await forgetBag(o.customer?.email).catch(() => {});
  if (o.marketingOptIn) await recordConsent(o.customer, { source: 'checkout' }).catch(() => {});
}

async function sendGiftEmails(o) {
  const card = await issueForOrder(o);
  const base = (process.env.SITE_URL || '').replace(/\/+$/, '');
  await sendGiftCardEmail({ to: o.giftcard.to, from: o.customer.name, amount: card.amount, code: card.code, expiresAt: card.expiresAt, message: o.giftcard.message, url: base });
  await sendGiftReceipt({ to: o.customer.email, name: o.customer.name, amount: card.amount, number: o.number, recipient: o.giftcard.to });
}

/**
 * Cash on delivery: nothing is paid yet, so the order is "placed" and its stock is taken for good
 * (a held unit would expire). Idempotent in the same way as finalizePaid.
 */
export async function confirmCod(orderId) {
  const order = await getOrder(orderId, { raw: true });
  if (!order) return { ok: false, reason: 'not_found' };
  const [done] = await store([['GET', `done:${order.id}`]]);
  if (done) return { ok: true, already: true, order };
  const flags = [...(order.flags || [])];
  const { oversold } = await commit(order.id, order.items);
  if (oversold) flags.push('oversold-needs-review');
  flags.push(...await commitPromo(order));
  await markCustomerPaid(order);
  const pk = custKeys(order.customer).find(k => k.startsWith('p:'));
  if (pk) await store([['HSET', `codopen:${pk}`, order.id, '1']]);
  const rc = await referralCodeFor(order.customer).catch(() => null);
  const placed = { ...order, status: 'cod_placed', placedAt: new Date().toISOString(), flags: [...new Set(flags)], ...(rc ? { referralCode: rc } : {}) };
  await saveOrder(placed);
  await store([['SET', `done:${order.id}`, '1']]);
  log('order_cod_placed', { flags: placed.flags });
  await afterConfirm(placed);
  return { ok: true, order: placed };
}

/** Give the units, coupon use and COD slot of a COD order back (cancelled, refused at the door). Idempotent. */
export async function restockCod(order) {
  await uncommit(order.id, order.items);
  await uncommitPromo(order);
  await uncommitGift(order);
  await closeCodSlot(order);
}

export async function closeCodSlot(order) {
  const pk = custKeys(order.customer).find(k => k.startsWith('p:'));
  if (pk) await store([['HDEL', `codopen:${pk}`, order.id]]).catch(() => {});
}

/** Release every unpaid claim an order holds: stock, coupon use, gift-card amount. */
export async function releaseClaims(order) {
  await release(order.id, order.items);
  await releasePromo(order);
  await releaseGift(order);
}

export async function listOrders(limit = 100) {
  const [ids] = await store([['LRANGE', 'orders:index', 0, limit - 1]]);
  if (!ids?.length) return [];
  const raws = await store(ids.map(id => ['GET', orderKey(id)]));
  return raws.map(r => { try { return r ? JSON.parse(r) : null; } catch { return null; } }).filter(Boolean);
}

/** Customer-safe view: no phone, email or street address. */
export function publicView(o) {
  return {
    id: o.id, number: o.number, status: o.status, createdAt: o.createdAt, paidAt: o.paidAt || null,
    kind: o.kind || 'order',
    items: o.items.map(i => ({ id: i.id, name: i.name, size: i.size, qty: i.qty, price: i.price, ...(i.listPrice ? { listPrice: i.listPrice } : {}), ...(i.preorder ? { preorder: i.preorder } : {}) })),
    totals: o.totals,
    payment: o.payment?.method || 'online',
    promoCode: o.promo?.code || null,
    shipsBy: o.shipsBy || null,
    city: o.customer?.city, state: o.customer?.state,
    shipment: o.shipment || null,
    referralCode: o.referralCode || null,
    giftCode: o.kind === 'giftcard' && PAID_STATES.has(o.status) ? (o.giftcardCode || null) : null,
    codCollected: Boolean(o.codCollectedAt),
  };
}
