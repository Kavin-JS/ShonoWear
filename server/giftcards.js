/**
 * SHONOWEAR — server/giftcards.js
 * Store credit with a ledger, so a code can never be spent twice:
 *   gc:<CODE>        card   JSON { code, amount, createdAt, expiresAt, source, note, email, voided? }
 *   gc:spent:<CODE>  hash   orderId → rupees        (set once per order, so a retry changes nothing)
 *   gc:hold:<CODE>   zset   "<orderId>:<rupees>", score = expiry  (an unpaid checkout keeps its amount for the hold time)
 *   balance = amount − spent − unexpired holds. Codes carry 60 random bits.
 */
import crypto from 'node:crypto';
import { store } from './guard.js';
import { STORE } from '../src/data/storeConfig.js';

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export const normGift = (s) => String(s ?? '').trim().toUpperCase().replace(/[\s]/g, '');
export const giftShape = (c) => /^SW-[A-Z2-9]{4}-[A-Z2-9]{4}-[A-Z2-9]{4}$/.test(c);
const sum = (vals) => (vals || []).reduce((n, v) => n + (Number(v) || 0), 0);
const amountOf = (m) => Number(String(m).split(':').pop()) || 0;

export function newGiftCode() {
  const b = crypto.randomBytes(12);
  const chunk = (i) => Array.from(b.subarray(i, i + 4), x => ALPHABET[x % ALPHABET.length]).join('');
  return `SW-${chunk(0)}-${chunk(4)}-${chunk(8)}`;
}

export async function issueGiftCard({ amount, source = 'admin', note = '', email = '', orderId = null, now = Date.now() }) {
  if (!Number.isInteger(amount) || amount < 1 || amount > 50000) throw new Error('bad amount');
  const months = STORE.giftCards?.validMonths || 12;
  const exp = new Date(now); exp.setMonth(exp.getMonth() + months);
  let code, card;
  for (let i = 0; i < 5; i++) {                                  // collisions are astronomically unlikely; retry anyway
    code = newGiftCode();
    card = { code, amount, createdAt: new Date(now).toISOString(), expiresAt: exp.toISOString(), source, note: String(note).slice(0, 120), email: String(email).slice(0, 120), orderId };
    const [ok] = await store([['SET', `gc:${code}`, JSON.stringify(card), 'NX']]);
    if (ok === 'OK') { await store([['LPUSH', 'gc:index', code], ['LTRIM', 'gc:index', 0, 499]]); return card; }
  }
  throw new Error('could not allocate a code');
}

/** Gift card for a purchase order: issued once however many times the payment is confirmed. */
export async function issueForOrder(order, now = Date.now()) {
  const [have] = await store([['GET', `gcorder:${order.id}`]]);
  if (have) return JSON.parse(have);
  const card = await issueGiftCard({ amount: order.totals.total, source: 'purchase', note: `Order ${order.number}`, email: order.giftcard?.to || order.customer.email, orderId: order.id, now });
  const [first] = await store([['SET', `gcorder:${order.id}`, JSON.stringify(card), 'NX']]);
  if (first === 'OK') return card;
  const [again] = await store([['GET', `gcorder:${order.id}`]]);     // another request won the race: use its card, void ours
  await store([['SET', `gc:${card.code}`, JSON.stringify({ ...card, voided: true })]]);
  return JSON.parse(again);
}

export async function getCard(code) {
  const [raw] = await store([['GET', `gc:${code}`]]);
  if (!raw) return null;
  try { return JSON.parse(raw); } catch { return null; }
}

export async function giftBalance(rawCode, now = Date.now()) {
  const code = normGift(rawCode);
  if (!giftShape(code)) return { ok: false, reason: 'That gift card code is not valid.' };
  const card = await getCard(code);
  if (!card || card.voided) return { ok: false, reason: 'That gift card code is not valid.' };
  if (now >= Date.parse(card.expiresAt)) return { ok: false, reason: 'This gift card has expired.' };
  const [spent, holds] = await store([['HVALS', `gc:spent:${code}`], ['ZRANGEBYSCORE', `gc:hold:${code}`, now, '+inf']]);
  const balance = card.amount - sum(spent) - (holds || []).reduce((n, m) => n + amountOf(m), 0);
  if (balance <= 0) return { ok: false, reason: 'This gift card has no balance left.' };
  return { ok: true, code, balance, expiresAt: card.expiresAt };
}

/** Hold `amount` rupees for an unpaid order. Fails (and leaves nothing behind) if the card cannot cover it. */
export async function reserveGift(code, orderId, amount, expiresAt, now = Date.now()) {
  const member = `${orderId}:${amount}`;
  await store([['ZREMRANGEBYSCORE', `gc:hold:${code}`, '-inf', now], ['ZADD', `gc:hold:${code}`, expiresAt, member]]);
  const card = await getCard(code);
  const [spent, holds] = await store([['HVALS', `gc:spent:${code}`], ['ZRANGEBYSCORE', `gc:hold:${code}`, now, '+inf']]);
  const left = (card?.amount || 0) - sum(spent) - (holds || []).reduce((n, m) => n + amountOf(m), 0);
  if (!card || card.voided || left < 0) { await store([['ZREM', `gc:hold:${code}`, member]]); return { ok: false, reason: 'This gift card no longer has enough balance.' }; }
  return { ok: true };
}

export async function releaseGift(order) {
  const g = order?.gift;
  if (!g?.code) return;
  await store([['ZREM', `gc:hold:${g.code}`, `${order.id}:${g.applied}`]]).catch(() => {});
}

/** Spend the held amount for real. Idempotent. Returns flags ('giftcard-overspent') if the ledger went negative. */
export async function commitGift(order) {
  const g = order?.gift;
  if (!g?.code) return [];
  await store([['HSET', `gc:spent:${g.code}`, order.id, String(g.applied)]]);
  await releaseGift(order);
  const card = await getCard(g.code);
  const [spent] = await store([['HVALS', `gc:spent:${g.code}`]]);
  return card && sum(spent) > card.amount ? ['giftcard-overspent'] : [];
}

export async function uncommitGift(order) {
  if (order?.gift?.code) await store([['HDEL', `gc:spent:${order.gift.code}`, order.id]]).catch(() => {});
}

export async function voidGift(code) {
  const card = await getCard(code);
  if (card) await store([['SET', `gc:${code}`, JSON.stringify({ ...card, voided: true })]]);
}

export async function listGiftCards(limit = 100, now = Date.now()) {
  const [codes] = await store([['LRANGE', 'gc:index', 0, limit - 1]]);
  const out = [];
  for (const code of codes || []) {
    const card = await getCard(code);
    if (!card) continue;
    const [spent] = await store([['HVALS', `gc:spent:${code}`]]);
    out.push({ code, amount: card.amount, balance: Math.max(0, card.amount - sum(spent)), source: card.source, note: card.note, email: card.email, createdAt: card.createdAt, expiresAt: card.expiresAt, voided: Boolean(card.voided), expired: now >= Date.parse(card.expiresAt) });
  }
  return out;
}
