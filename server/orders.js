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
import crypto from 'node:crypto';
import { store, log } from './guard.js';
import { commit, availability } from './stock.js';
import { sendOrderEmails, sendLowStockAlert } from './notify.js';
import { STORE } from '../src/data/storeConfig.js';

const orderKey = (id) => `order:${id}`;
const PAID_STATES = new Set(['paid', 'shipped', 'delivered']);

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
    ['SET', `rzp:${order.razorpay.orderId}`, order.id, 'EX', 31536000],
    ['LPUSH', 'orders:index', order.id],
    ['LTRIM', 'orders:index', 0, 999],
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

  const { oversold } = await commit(order.id, order.items);
  if (oversold) flags.push('oversold-needs-review');

  const paid = {
    ...order,
    status: PAID_STATES.has(order.status) ? order.status : 'paid',
    paidAt: marker.paidAt,
    razorpay: { ...order.razorpay, paymentId: marker.paymentId },
    flags: [...new Set(flags)],
  };
  delete paid.cancelledBy;
  await saveOrder(paid);
  await store([['SET', `done:${order.id}`, '1']]);
  log('order_paid', { source, flags: paid.flags });

  const [first] = await store([['SET', `emailed:${order.id}`, '1', 'NX', 'EX', 31536000]]);
  if (first === 'OK') {
    await sendOrderEmails(paid).catch(err => log('order_email_failed', { msg: err.message }));
    await lowStockCheck(paid.items).catch(err => log('low_stock_check_failed', { msg: err.message }));
  }
  return { ok: true, order: paid };
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
    items: o.items.map(i => ({ id: i.id, name: i.name, size: i.size, qty: i.qty, price: i.price })),
    totals: o.totals,
    city: o.customer?.city, state: o.customer?.state,
    shipment: o.shipment || null,
  };
}
