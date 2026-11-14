/**
 * SHONOWEAR — customer accounts (passwordless).
 * Sign-in: we email a one-time link (15 min). Opening it creates a session cookie (HttpOnly, 30 days).
 * No passwords are stored. Orders are tied to an email by a hashed index written when the order is created.
 */
import crypto from 'node:crypto';
import { STORE } from '../src/data/storeConfig.js';
import { store, hash, IS_PROD } from './guard.js';
import { getOrder } from './orders.js';

export const COOKIE = 'sw_sid';
import { normEmail, eKey } from './ekey.js';
export { normEmail, eKey };
const rnd = () => crypto.randomBytes(32).toString('base64url');
const tokKey = (t) => `login:${hash(t, 'login').slice(0, 40)}`;
const sessKey = (s) => `sess:${hash(s, 'sess').slice(0, 40)}`;

export async function startLogin(email) {
  const token = rnd();
  const ttl = (STORE.accounts?.loginMinutes || 15) * 60;
  await store([['SET', tokKey(token), normEmail(email), 'EX', ttl]]);
  return token;
}

/** One-time: the NX marker makes sure two simultaneous clicks cannot both succeed. */
export async function consumeLogin(token) {
  if (typeof token !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(token)) return null;
  const [email] = await store([['GET', tokKey(token)]]);
  if (!email) return null;
  const [first] = await store([['SET', `${tokKey(token)}:used`, '1', 'NX', 'EX', 3600]]);
  if (first !== 'OK') return null;
  await store([['DEL', tokKey(token)]]);
  return String(email);
}

export async function createSession(email) {
  const sid = rnd();
  const days = STORE.accounts?.sessionDays || 30;
  await store([['SET', sessKey(sid), JSON.stringify({ email: normEmail(email), at: Date.now() }), 'EX', days * 86400]]);
  return { sid, maxAge: days * 86400 };
}
export const cookieHeader = (sid, maxAge) =>
  `${COOKIE}=${sid}; HttpOnly; Path=/api; Max-Age=${maxAge}; SameSite=Lax${IS_PROD ? '; Secure' : ''}`;

export function readCookie(req, name = COOKIE) {
  const raw = String(req.headers?.cookie || '');
  for (const part of raw.split(';')) {
    const i = part.indexOf('=');
    if (i > 0 && part.slice(0, i).trim() === name) return part.slice(i + 1).trim();
  }
  return '';
}

/** The signed-in customer's email, or null. */
export async function sessionEmail(req) {
  const sid = readCookie(req);
  if (!/^[A-Za-z0-9_-]{43}$/.test(sid)) return null;
  const [raw] = await store([['GET', sessKey(sid)]]);
  if (!raw) return null;
  try { return JSON.parse(raw).email || null; } catch { return null; }
}
export async function endSession(req) {
  const sid = readCookie(req);
  if (/^[A-Za-z0-9_-]{43}$/.test(sid)) await store([['DEL', sessKey(sid)]]);
}

const SHOWN = new Set(['paid', 'cod_placed', 'shipped', 'delivered']);
/** Orders for a verified email (placed ones only; unpaid attempts are not listed). */
export async function ordersFor(email) {
  const [ids] = await store([['LRANGE', `ordersby:${eKey(email)}`, 0, 99]]);
  const out = [];
  for (const id of ids || []) {
    const o = await getOrder(id);
    if (!o || normEmail(o.customer?.email) !== normEmail(email) || !SHOWN.has(o.status)) continue;
    out.push(o);
  }
  return out;
}
