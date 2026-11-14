/**
 * SHONOWEAR — server/guard.js
 * Shared protections for every /api endpoint.
 *
 *  - Upstash Redis REST client (POST + JSON, so user data never lands in a URL)
 *  - FAIL CLOSED in production: no store => no checkout, no stock reservation
 *  - Same-origin check on state-changing requests (no wildcard CORS)
 *  - Client IP from a trusted header order, hashed before use as a key
 *  - Body size limits, atomic fixed-window rate limiter, constant-time compare
 *  - Structured logs with no PII
 *
 * Outside production, a small in-memory store stands in for Upstash so
 * `npm run dev:api` works with no setup. It supports exactly the commands used here.
 */

import crypto from 'node:crypto';

export const IS_PROD =
  process.env.VERCEL_ENV === 'production' || process.env.NODE_ENV === 'production';

/* ───────────────────────── logging ───────────────────────── */
export function log(event, fields = {}) {
  // Never pass emails, IPs, prompts, profiles or model output in here.
  console.log(JSON.stringify({ t: new Date().toISOString(), event, ...fields }));
  // Problems are also kept for the admin "Recent problems" panel and may email the owner (best effort, never throws).
  if (/_(error|failed|mismatch)$/.test(event)) import('./monitor.js').then(m => m.capture(event, fields)).catch(() => {});
}

/* ───────────────────────── store ───────────────────────── */
const mem = new Map(); // dev only: key -> { value, expiresAt }

function storeConfigured() {
  return Boolean(process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN);
}

/** True when it is safe to rely on a store. Production requires Upstash. */
export function storeAvailable() {
  return storeConfigured() || !IS_PROD;
}

async function upstash(commands) {
  const res = await fetch(`${process.env.UPSTASH_REDIS_REST_URL}/pipeline`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.UPSTASH_REDIS_REST_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(commands),
    signal: AbortSignal.timeout(2500),
  });
  if (!res.ok) throw new Error(`Upstash ${res.status}`);
  const out = await res.json();
  return out.map(r => {
    if (r.error) throw new Error('Upstash command error');
    return r.result;
  });
}

function memCmd([cmd, key, ...args]) {
  const now = Date.now();
  let e = mem.get(key);
  if (e && e.expiresAt && e.expiresAt < now) { mem.delete(key); e = undefined; }
  switch (String(cmd).toUpperCase()) {
    case 'INCR':
    case 'INCRBY': {
      const by = String(cmd).toUpperCase() === 'INCR' ? 1 : Number(args[0]);
      const v = (e ? Number(e.value) : 0) + by;
      mem.set(key, { value: v, expiresAt: e?.expiresAt });
      return v;
    }
    case 'EXPIRE':
      if (e && !e.expiresAt) e.expiresAt = now + Number(args[0]) * 1000;
      return 1;
    case 'TTL':
      return e?.expiresAt ? Math.ceil((e.expiresAt - now) / 1000) : -1;
    case 'GET':
      return e ? String(e.value) : null;
    case 'SET': {
      const exIdx = args.findIndex(a => String(a).toUpperCase() === 'EX');
      const nx = args.some(a => String(a).toUpperCase() === 'NX');
      if (nx && e) return null;
      mem.set(key, { value: args[0], expiresAt: exIdx >= 0 ? now + Number(args[exIdx + 1]) * 1000 : undefined });
      return 'OK';
    }
    case 'DEL':
      mem.delete(key);
      return 1;
    case 'DECRBY': {
      const v = (e ? Number(e.value) : 0) - Number(args[0]);
      mem.set(key, { value: v, expiresAt: e?.expiresAt });
      return v;
    }
    case 'ZADD': {          // ZADD key score member [score member ...]
      const z = e?.value instanceof Map ? e.value : new Map();
      let added = 0;
      for (let i = 0; i + 1 < args.length; i += 2) { if (!z.has(String(args[i + 1]))) added++; z.set(String(args[i + 1]), Number(args[i])); }
      mem.set(key, { value: z, expiresAt: e?.expiresAt });
      return added;
    }
    case 'ZREM': {
      if (!(e?.value instanceof Map)) return 0;
      return e.value.delete(String(args[0])) ? 1 : 0;
    }
    case 'ZREMRANGEBYSCORE': {
      if (!(e?.value instanceof Map)) return 0;
      const lo = Number(args[0] === '-inf' ? -Infinity : args[0]), hi = Number(args[1] === '+inf' ? Infinity : args[1]);
      let n = 0;
      for (const [m, sc] of e.value) if (sc >= lo && sc <= hi) { e.value.delete(m); n++; }
      return n;
    }
    case 'ZRANGEBYSCORE': {
      if (!(e?.value instanceof Map)) return [];
      const lo = args[0] === '-inf' ? -Infinity : Number(args[0]);
      const hi = args[1] === '+inf' ? Infinity : Number(args[1]);
      return [...e.value].filter(([, sc]) => sc >= lo && sc <= hi).sort((a, b) => a[1] - b[1]).map(([m]) => m);
    }
    case 'HSET': {          // HSET key field value [field value ...]
      const h = e?.value instanceof Map ? e.value : new Map();
      for (let i = 0; i + 1 < args.length; i += 2) h.set(String(args[i]), String(args[i + 1]));
      mem.set(key, { value: h, expiresAt: e?.expiresAt });
      return 1;
    }
    case 'HSETNX': {
      const h = e?.value instanceof Map ? e.value : new Map();
      if (h.has(String(args[0]))) return 0;
      h.set(String(args[0]), String(args[1]));
      mem.set(key, { value: h, expiresAt: e?.expiresAt });
      return 1;
    }
    case 'HINCRBY': {
      const h = e?.value instanceof Map ? e.value : new Map();
      const v = Number(h.get(String(args[0])) || 0) + Number(args[1]);
      h.set(String(args[0]), String(v));
      mem.set(key, { value: h, expiresAt: e?.expiresAt });
      return v;
    }
    case 'HGET':
      return e?.value instanceof Map && e.value.has(String(args[0])) ? e.value.get(String(args[0])) : null;
    case 'HEXISTS':
      return e?.value instanceof Map && e.value.has(String(args[0])) ? 1 : 0;
    case 'HLEN':
      return e?.value instanceof Map ? e.value.size : 0;
    case 'HDEL':
      return e?.value instanceof Map && e.value.delete(String(args[0])) ? 1 : 0;
    case 'HGETALL': {
      if (!(e?.value instanceof Map)) return [];
      return [...e.value].flat();
    }
    case 'ZCARD':
      return e?.value instanceof Map ? e.value.size : 0;
    case 'HVALS':
      return e?.value instanceof Map ? [...e.value.values()] : [];
    case 'LPUSH': {
      const list = Array.isArray(e?.value) ? e.value : [];
      list.unshift(String(args[0]));
      mem.set(key, { value: list, expiresAt: e?.expiresAt });
      return list.length;
    }
    case 'LTRIM': {
      if (Array.isArray(e?.value)) e.value = e.value.slice(Number(args[0]), Number(args[1]) + 1);
      return 'OK';
    }
    case 'LRANGE': {
      if (!Array.isArray(e?.value)) return [];
      const end = Number(args[1]);
      return e.value.slice(Number(args[0]), end === -1 ? undefined : end + 1);
    }
    case 'TYPE': {
      if (!e) return 'none';
      if (e.value instanceof Map) { const first = e.value.values().next().value; return typeof first === 'number' ? 'zset' : 'hash'; }
      return Array.isArray(e.value) ? 'list' : 'string';
    }
    case 'PTTL': return !e ? -2 : e.expiresAt ? Math.max(1, e.expiresAt - now) : -1;
    case 'PEXPIRE': if (e) e.expiresAt = now + Number(args[0]); return e ? 1 : 0;
    case 'RPUSH': {
      const list = Array.isArray(e?.value) ? e.value : [];
      for (const a of args) list.push(String(a));
      mem.set(key, { value: list, expiresAt: e?.expiresAt });
      return list.length;
    }
    case 'ZRANGE': {          // only the form `ZRANGE key 0 -1 WITHSCORES` is needed (backups)
      if (!(e?.value instanceof Map)) return [];
      return [...e.value].sort((a, b) => a[1] - b[1]).flatMap(([m, sc]) => [m, String(sc)]);
    }
    default:
      throw new Error(`unsupported dev command ${cmd}`);
  }
}

/** Run commands as one pipeline. Throws if the store is unavailable. */
/** Every key in the store (SCAN in production). Used by backups only. */
export async function allKeys() {
  if (storeConfigured()) {
    const keys = []; let cursor = '0';
    do {
      const [[next, batch]] = await upstash([['SCAN', cursor, 'COUNT', 500]]);
      cursor = String(next); keys.push(...batch);
    } while (cursor !== '0' && keys.length < 200000);
    return [...new Set(keys)];
  }
  if (!IS_PROD) { const now = Date.now(); return [...mem].filter(([, e]) => !e.expiresAt || e.expiresAt > now).map(([k]) => k); }
  throw new Error('store not configured');
}

export async function store(commands) {
  if (storeConfigured()) return upstash(commands);
  if (!IS_PROD) return commands.map(memCmd);
  throw new Error('store not configured');
}

/* ───────────────────────── request helpers ───────────────────────── */

export function hash(value, salt = '') {
  return crypto.createHash('sha256').update(`${salt}${value}`).digest('hex');
}

/**
 * Trusted IP order. On Vercel, `x-vercel-forwarded-for` is set by the platform
 * and cannot be spoofed by the client. `x-forwarded-for` is only consulted outside
 * production, where there is no trusted proxy anyway.
 */
export function clientIp(req) {
  const h = req.headers || {};
  const v = h['x-vercel-forwarded-for'] || h['x-real-ip'];
  if (v) return String(v).split(',')[0].trim();
  if (!IS_PROD && h['x-forwarded-for']) return String(h['x-forwarded-for']).split(',')[0].trim();
  return req.socket?.remoteAddress || 'unknown';
}

export function ipKey(req) {
  return hash(clientIp(req), process.env.IP_HASH_SALT || 'shonowear').slice(0, 24);
}

/**
 * Same-origin check. Browsers always send Origin on cross-origin and on
 * same-origin POSTs, so a missing Origin on a POST is not a browser call.
 * Allowed: the request's own host, SITE_URL, ALLOWED_ORIGINS (comma list),
 * and localhost outside production.
 */
export function originAllowed(req) {
  const origin = req.headers?.origin;
  if (!origin) return !IS_PROD; // allow curl/tests locally, refuse in production

  let host;
  try { host = new URL(origin).host; } catch { return false; }

  const allowed = new Set();
  if (req.headers.host) allowed.add(req.headers.host);
  for (const o of [process.env.SITE_URL, ...(process.env.ALLOWED_ORIGINS || '').split(',')]) {
    if (!o) continue;
    try { allowed.add(new URL(o.trim()).host); } catch { /* ignore */ }
  }
  if (!IS_PROD && /^(localhost|127\.0\.0\.1)(:\d+)?$/.test(host)) return true;
  return allowed.has(host);
}

export function bodyTooLarge(req, maxBytes) {
  const declared = Number(req.headers?.['content-length'] || 0);
  if (declared > maxBytes) return true;
  try {
    return Buffer.byteLength(JSON.stringify(req.body ?? {})) > maxBytes;
  } catch {
    return true;
  }
}

/**
 * Standard preamble for every endpoint. Returns true if the request may proceed;
 * otherwise it has already sent the response.
 *  - methods: allowed HTTP methods (default POST)
 *  - Origin is required only for state-changing requests; same-origin GETs don't carry one.
 *  - Set raw:true for webhooks that read the unparsed body themselves.
 */
export function preflight(req, res, { methods = ['POST'], maxBytes = 8 * 1024, raw = false, checkOrigin = true } = {}) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method === 'OPTIONS') { res.status(204).end(); return false; }
  if (!methods.includes(req.method)) { res.setHeader('Allow', methods.join(', ')); res.status(405).json({ error: 'Method not allowed' }); return false; }
  const mutating = req.method !== 'GET' && req.method !== 'HEAD';
  if (mutating && checkOrigin && !originAllowed(req)) { res.status(403).json({ error: 'Forbidden' }); return false; }
  if (mutating && !raw && bodyTooLarge(req, maxBytes)) { res.status(413).json({ error: 'Request too large' }); return false; }
  return true;
}

/** Read the raw request body (for webhook signatures). Rejects past maxBytes. */
export async function readRawBody(req, maxBytes = 64 * 1024) {
  const chunks = [];
  let size = 0;
  for await (const c of req) {
    size += c.length;
    if (size > maxBytes) throw new Error('body too large');
    chunks.push(c);
  }
  return Buffer.concat(chunks).toString('utf8');
}

/** Constant-time string comparison (hashes first so lengths never leak). */
export function safeEqual(a, b) {
  const ha = crypto.createHash('sha256').update(String(a)).digest();
  const hb = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(ha, hb);
}

/* ───────────────────────── rate limiting ───────────────────────── */

/**
 * Atomic fixed window: INCR + EXPIRE NX + TTL in one pipeline, so a crash
 * between calls can never leave a counter without an expiry.
 * Throws if the store is unavailable; callers decide what failing closed means.
 */
export async function rateLimit(name, id, max, windowSec) {
  const key = `rl:${name}:${id}`;
  const [count, , ttl] = await store([
    ['INCR', key],
    ['EXPIRE', key, windowSec, 'NX'],
    ['TTL', key],
  ]);
  return { limited: count > max, count, retryAfter: Math.max(Number(ttl) || 0, 1) };
}

/** HGETALL answers a flat [field, value, field, value…] list (Upstash REST and our dev store). This turns it into an object. */
export function hgetall(raw) {
  if (!raw) return {};
  if (!Array.isArray(raw)) return { ...raw };
  const out = {};
  for (let i = 0; i + 1 < raw.length; i += 2) out[String(raw[i])] = raw[i + 1];
  return out;
}
