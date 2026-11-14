/**
 * SHONOWEAR — returns and exchanges.
 * A signed-in customer asks for a return/exchange on a DELIVERED order inside STORE.returnDays. You decide in /admin.
 * Status: requested → approved | rejected → received → refunded | exchanged.
 * Refunds are made by you (Razorpay dashboard, or UPI/bank for COD): this module only records and emails.
 * One open request per order. Stock is NOT put back automatically (a returned item may not be resellable): edit the stock yourself.
 */
import crypto from 'node:crypto';
import { STORE } from '../src/data/storeConfig.js';
import { store } from './guard.js';
import { normEmail } from './ekey.js';
import { getOrder } from './orders.js';
import { catalog } from '../src/data/catalog.js';

const products = new Map(catalog.map(p => [p.id, p]));
const clean = (v, n) => String(v ?? '').replace(/[\u0000-\u001F\u007F<>]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, n);
const parse = (r) => { try { return JSON.parse(r); } catch { return null; } };
const retKey = (id) => `ret:${id}`;
const DAY = 86400000;
export const OPEN = ['requested', 'approved', 'received'];

/** Can this order still be returned? Counts from the day the owner marked it delivered. */
export function returnWindow(order, now = Date.now()) {
  if (!STORE.returns?.enabled) return { ok: false, reason: 'Returns are not available.' };
  if (order.kind === 'giftcard') return { ok: false, reason: 'Gift cards cannot be returned.' };
  if (order.status !== 'delivered') return { ok: false, reason: 'You can request a return after the order is delivered.' };
  const at = Date.parse(order.deliveredAt || '');
  if (!at) return { ok: false, reason: `Please email ${STORE.supportEmail} for this order.` };
  const left = at + STORE.returnDays * DAY - now;
  if (left < 0) return { ok: false, reason: `The ${STORE.returnDays}-day return window has ended.` };
  return { ok: true, daysLeft: Math.ceil(left / DAY) };
}

/** Value of the returned goods after the order's discounts (a suggestion for you; shipping and COD fee are not included). */
export function suggestedRefund(order, lines) {
  const goods = order.items.reduce((n, i) => n + i.price * i.qty, 0);
  const t = order.totals || {};
  const sub = Number(t.subtotal) || goods;
  const paidShare = Math.max(0, sub - Number(t.discount || 0)) / (sub || 1);
  const value = lines.reduce((n, l) => { const it = order.items.find(i => i.id === l.id && i.size === l.size); return n + (it ? it.price * l.qty : 0); }, 0);
  return Math.round(value * paidShare);
}

export async function requestReturn(email, { orderId, kind, items, reason, note, newSize }) {
  const order = await getOrder(String(orderId || ''));
  if (!order || normEmail(order.customer?.email) !== normEmail(email)) return { ok: false, status: 404, error: 'Order not found.' };
  const w = returnWindow(order);
  if (!w.ok) return { ok: false, status: 409, error: w.reason };
  if (!['return', 'exchange'].includes(kind) || (kind === 'exchange' && !STORE.returns.allowExchange)) return { ok: false, status: 400, error: 'Choose return or exchange.' };
  if (!STORE.returns.reasons.includes(reason)) return { ok: false, status: 400, error: 'Choose a reason.' };
  if (!Array.isArray(items) || !items.length || items.length > 10) return { ok: false, status: 400, error: 'Choose the items.' };
  const lines = [];
  for (const l of items) {
    const it = order.items.find(i => i.id === l.id && i.size === l.size);
    const qty = Math.floor(Number(l.qty));
    if (!it || !(qty >= 1 && qty <= it.qty) || lines.some(x => x.id === it.id && x.size === it.size)) return { ok: false, status: 400, error: 'Those items are not in this order.' };
    lines.push({ id: it.id, size: it.size, qty, name: it.name });
  }
  let exchangeSize = null;
  if (kind === 'exchange') {
    if (lines.length !== 1) return { ok: false, status: 400, error: 'An exchange is for one item at a time.' };
    const p = products.get(lines[0].id);
    exchangeSize = String(newSize || '');
    if (!p?.sizes || !Object.hasOwn(p.sizes, exchangeSize) || exchangeSize === lines[0].size) return { ok: false, status: 400, error: 'Choose a different size.' };
  }
  const id = crypto.randomBytes(6).toString('hex');
  const [lock] = await store([['SET', `retopen:${order.id}`, id, 'NX']]);
  if (lock !== 'OK') return { ok: false, status: 409, error: 'There is already a return or exchange request for this order.' };
  const rec = { id, orderId: order.id, number: order.number, email: normEmail(email), name: order.customer.name, kind, items: lines, exchangeSize, reason,
    note: clean(note, 300), status: 'requested', createdAt: new Date().toISOString(), suggestedRefund: kind === 'return' ? suggestedRefund(order, lines) : 0,
    cod: order.payment?.method === 'cod', history: [{ status: 'requested', at: new Date().toISOString() }] };
  await store([['SET', retKey(id), JSON.stringify(rec)], ['LPUSH', 'returns:index', id], ['LTRIM', 'returns:index', 0, 499], ['LPUSH', `retby:${order.id}`, id]]);
  return { ok: true, request: rec };
}

export async function getReturn(id) { const [r] = await store([['GET', retKey(String(id))]]); return parse(r); }
export async function returnsFor(email) {
  const [ids] = await store([['LRANGE', 'returns:index', 0, 199]]);
  const out = [];
  for (const id of ids || []) { const r = await getReturn(id); if (r && r.email === normEmail(email)) out.push(publicReturn(r)); }
  return out;
}
export const publicReturn = (r) => ({ id: r.id, orderId: r.orderId, number: r.number, kind: r.kind, items: r.items, exchangeSize: r.exchangeSize, reason: r.reason, status: r.status,
  createdAt: r.createdAt, adminNote: r.adminNote || '', refundAmount: r.refundAmount ?? null });
export async function listReturnsAdmin(limit = 200) {
  const [ids] = await store([['LRANGE', 'returns:index', 0, limit - 1]]);
  const out = [];
  for (const id of ids || []) { const r = await getReturn(id); if (r) out.push(r); }
  return out;
}

const NEXT = { requested: ['approved', 'rejected'], approved: ['received'], received: ['refunded', 'exchanged'] };
export async function updateReturn(id, status, { note, refundAmount } = {}) {
  const r = await getReturn(id);
  if (!r) return { ok: false, status: 404, error: 'Request not found.' };
  if (!NEXT[r.status]?.includes(status)) return { ok: false, status: 409, error: `A ${r.status} request cannot become ${status}.` };
  if (status === 'refunded' && r.kind !== 'return') return { ok: false, status: 409, error: 'Only return requests are refunded.' };
  if (status === 'exchanged' && r.kind !== 'exchange') return { ok: false, status: 409, error: 'Only exchanges are marked exchanged.' };
  const next = { ...r, status, adminNote: clean(note, 300) || r.adminNote || '', history: [...r.history, { status, at: new Date().toISOString() }] };
  if (status === 'refunded') {
    const a = Math.round(Number(refundAmount));
    if (!(a > 0 && a <= 500000)) return { ok: false, status: 400, error: 'Enter the amount you refunded, in rupees.' };
    next.refundAmount = a;
  }
  await store([['SET', retKey(id), JSON.stringify(next)]]);
  // rejected or finished: the order can have a new request later (a rejected one may be re-filed)
  if (status === 'rejected') await store([['DEL', `retopen:${r.orderId}`]]);
  return { ok: true, request: next };
}
