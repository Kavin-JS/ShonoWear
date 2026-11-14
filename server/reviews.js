/**
 * SHONOWEAR — reviews and product questions.
 * A review needs a signed-in customer with a DELIVERED order containing the product; one review per customer per product.
 * With STORE.reviews.moderate (default) nothing shows until you approve it in /admin. We never invent or edit ratings.
 */
import crypto from 'node:crypto';
import { STORE } from '../src/data/storeConfig.js';
import { store, hgetall } from './guard.js';
import { eKey } from './ekey.js';
import { ordersFor } from './accounts.js';
import { catalog } from '../src/data/catalog.js';

const own = new Map(catalog.filter(p => p.fulfilment === 'own').map(p => [p.id, p]));
export const isReviewable = (id) => own.has(id);
const clean = (v, n) => String(v ?? '').replace(/[\u0000-\u001F\u007F<>]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, n);
const shortName = (name) => { const [a, b] = clean(name, 60).split(' '); return b ? `${a} ${b[0]}.` : a || 'Customer'; };
const parse = (r) => { try { return JSON.parse(r); } catch { return null; } };

/** The products this customer may review: delivered, not yet reviewed. */
export async function reviewable(email) {
  const orders = await ordersFor(email);
  const done = new Set();
  const out = new Map();
  for (const o of orders) {
    if (o.status !== 'delivered' || o.kind === 'giftcard') continue;
    for (const i of o.items) if (own.has(i.id) && !out.has(i.id)) out.set(i.id, { id: i.id, name: i.name, orderNumber: o.number });
  }
  const k = eKey(email);
  const keys = [...out.keys()];
  const has = keys.length ? await store(keys.map(id => ['HEXISTS', `rev:${id}`, k])) : [];
  keys.forEach((id, n) => { if (Number(has[n])) done.add(id); });
  return [...out.values()].map(x => ({ ...x, reviewed: done.has(x.id) }));
}

export async function submitReview(email, { productId, rating, title, body, name }) {
  if (!STORE.reviews?.enabled) return { ok: false, status: 404, error: 'Reviews are off.' };
  const r = Number(rating);
  if (!own.has(productId)) return { ok: false, status: 400, error: 'Unknown product.' };
  if (!Number.isInteger(r) || r < 1 || r > 5) return { ok: false, status: 400, error: 'Choose 1 to 5 stars.' };
  const text = clean(body, 1000);
  if (text.length < 10) return { ok: false, status: 400, error: 'Please write at least a sentence (10 characters).' };
  const list = await reviewable(email);
  const item = list.find(x => x.id === productId);
  if (!item) return { ok: false, status: 403, error: 'You can review a product after your order with it is delivered.' };
  if (item.reviewed) return { ok: false, status: 409, error: 'You have already reviewed this product.' };
  const k = eKey(email);
  const rec = { id: crypto.randomBytes(6).toString('hex'), rating: r, title: clean(title, 80), body: text, name: shortName(name), orderNumber: item.orderNumber,
    createdAt: new Date().toISOString(), status: STORE.reviews.moderate === false ? 'approved' : 'pending' };
  // HSETNX: two simultaneous submissions cannot both be stored
  const [stored] = await store([['HSETNX', `rev:${productId}`, k, JSON.stringify(rec)]]);
  if (!Number(stored)) return { ok: false, status: 409, error: 'You have already reviewed this product.' };
  await store([['LPUSH', 'rev:index', `${productId}|${k}`], ['LTRIM', 'rev:index', 0, 499]]);
  return { ok: true, review: { ...rec, key: undefined }, pending: rec.status === 'pending' };
}

/** Approved reviews + the average, for a product page. */
export async function publicReviews(productId) {
  if (!own.has(productId)) return { count: 0, average: null, reviews: [] };
  const [all] = await store([['HGETALL', `rev:${productId}`]]);
  const rows = Object.values(hgetall(all)).map(parse).filter(r => r && r.status === 'approved').sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const count = rows.length;
  const average = count ? Math.round((rows.reduce((n, r) => n + r.rating, 0) / count) * 10) / 10 : null;
  return { count, average, reviews: rows.slice(0, 30).map(r => ({ id: r.id, rating: r.rating, title: r.title, body: r.body, name: r.name, createdAt: r.createdAt })) };
}

/* ── admin ── */
export async function listReviewsAdmin(limit = 200) {
  const [idx] = await store([['LRANGE', 'rev:index', 0, limit - 1]]);
  const out = [];
  for (const pair of idx || []) {
    const [pid, k] = String(pair).split('|');
    const [raw] = await store([['HGET', `rev:${pid}`, k]]);
    const r = parse(raw);
    if (r) out.push({ productId: pid, key: k, ...r });
  }
  return out;
}
export async function moderateReview(productId, key, decision) {
  const [raw] = await store([['HGET', `rev:${productId}`, key]]);
  const r = parse(raw);
  if (!r) return { ok: false, error: 'Review not found.' };
  if (decision === 'delete') { await store([['HDEL', `rev:${productId}`, key]]); return { ok: true }; }
  if (!['approved', 'rejected'].includes(decision)) return { ok: false, error: 'Unknown decision.' };
  await store([['HSET', `rev:${productId}`, key, JSON.stringify({ ...r, status: decision })]]);
  return { ok: true };
}

/* ── questions ── */
export async function askQuestion(email, productId, question, name) {
  if (!own.has(productId)) return { ok: false, status: 400, error: 'Unknown product.' };
  const q = clean(question, 300);
  if (q.length < 8) return { ok: false, status: 400, error: 'Please write your question in a sentence.' };
  const [all] = await store([['HGETALL', `qa:${productId}`]]);
  const rows = Object.values(hgetall(all)).map(parse).filter(Boolean);
  if (rows.filter(x => !x.answer).length >= 50) return { ok: false, status: 429, error: 'There are many unanswered questions on this product. Please try again later.' };
  const k = eKey(email);
  if (rows.filter(x => x.by === k && !x.answer).length >= 2) return { ok: false, status: 429, error: 'You already have questions waiting for an answer here.' };
  const rec = { id: crypto.randomBytes(6).toString('hex'), q, name: shortName(name), by: k, createdAt: new Date().toISOString() };
  await store([['HSET', `qa:${productId}`, rec.id, JSON.stringify(rec)], ['LPUSH', 'qa:index', `${productId}|${rec.id}`], ['LTRIM', 'qa:index', 0, 499]]);
  return { ok: true };
}
export async function publicQuestions(productId) {
  if (!own.has(productId)) return [];
  const [all] = await store([['HGETALL', `qa:${productId}`]]);
  return Object.values(hgetall(all)).map(parse).filter(x => x && x.answer).sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, 30).map(x => ({ id: x.id, q: x.q, a: x.answer, name: x.name, answeredAt: x.answeredAt }));
}
export async function listQuestionsAdmin(limit = 200) {
  const [idx] = await store([['LRANGE', 'qa:index', 0, limit - 1]]);
  const out = [];
  for (const pair of idx || []) {
    const [pid, id] = String(pair).split('|');
    const [raw] = await store([['HGET', `qa:${pid}`, id]]);
    const r = parse(raw);
    if (r) out.push({ productId: pid, id, q: r.q, name: r.name, answer: r.answer || '', createdAt: r.createdAt });
  }
  return out;
}
export async function answerQuestion(productId, id, answer) {
  const [raw] = await store([['HGET', `qa:${productId}`, id]]);
  const r = parse(raw);
  if (!r) return { ok: false, error: 'Question not found.' };
  if (answer === null) { await store([['HDEL', `qa:${productId}`, id]]); return { ok: true }; }
  const a = clean(answer, 600);
  if (!a) return { ok: false, error: 'Write an answer first.' };
  await store([['HSET', `qa:${productId}`, id, JSON.stringify({ ...r, answer: a, answeredAt: new Date().toISOString() })]]);
  return { ok: true };
}
