/**
 * SHONOWEAR — backups of everything the store keeps (orders, customers, returns, reviews, stock, gift cards, settings…).
 * It copies every key of the database generically (string, hash, sorted set, list), so new features are covered automatically.
 * Short-lived things (sign-in sessions, rate limits, stock holds, error lists) are left out.
 *
 *   dumpAll()                      → { format, version, createdAt, count, check, items }
 *   seal(dump, passphrase?)        → Buffer  (gzip, then AES-256-GCM when a passphrase is given)
 *   unseal(buffer, passphrase?)    → dump    (verifies the checksum)
 *   restoreDump(dump, {force})     → writes it back; refuses to touch a non-empty database unless force
 * The same code is used by the admin page, the daily e-mail and scripts/backup.mjs / scripts/restore.mjs.
 */
import crypto from 'node:crypto';
import zlib from 'node:zlib';
import { store, allKeys } from './guard.js';

export const SKIP = ['rl:', 'sess:', 'login:', 'hold:', 'health:', 'alert:', 'cerr:', 'errs', 'errc:', 'refundlock:', 'invlock:', 'campaignlock', 'lowalert:'];
const skipped = (k) => SKIP.some(p => k === p || k.startsWith(p));
const MAGIC = Buffer.from('SWB1');
const checkOf = (items) => crypto.createHash('sha256').update(JSON.stringify(items)).digest('hex');
const pairs = (flat) => { const o = {}; for (let i = 0; i + 1 < flat.length; i += 2) o[flat[i]] = flat[i + 1]; return o; };

export async function dumpAll() {
  const keys = (await allKeys()).filter(k => !skipped(k)).sort();
  const items = [];
  for (let i = 0; i < keys.length; i += 100) {
    const batch = keys.slice(i, i + 100);
    const meta = await store(batch.flatMap(k => [['TYPE', k], ['PTTL', k]]));
    const reads = [], plan = [];
    batch.forEach((k, j) => {
      const type = meta[j * 2], ms = Number(meta[j * 2 + 1]);
      if (type === 'string') reads.push(['GET', k]);
      else if (type === 'hash') reads.push(['HGETALL', k]);
      else if (type === 'zset') reads.push(['ZRANGE', k, 0, -1, 'WITHSCORES']);
      else if (type === 'list') reads.push(['LRANGE', k, 0, -1]);
      else return;                                   // vanished or an unsupported type: skip
      plan.push({ k, t: type, ms: ms > 0 ? ms : 0 });
    });
    const vals = reads.length ? await store(reads) : [];
    plan.forEach((p, n) => {
      const raw = vals[n];
      if (raw === null || raw === undefined) return;   // expired between the two reads
      items.push({ ...p, v: p.t === 'hash' ? (Array.isArray(raw) ? pairs(raw) : raw) : p.t === 'zset' ? pairs(raw) : raw });
    });
  }
  return { format: 'shonowear-backup', version: 1, createdAt: new Date().toISOString(), count: items.length, check: checkOf(items), items };
}

export function summarise(dump) {
  const has = (p) => dump.items.filter(i => i.k.startsWith(p)).length;
  return { date: dump.createdAt.slice(0, 10), keys: dump.count, orders: has('order:') - dump.items.filter(i => i.k === 'order:seq').length };
}

export function seal(dump, passphrase = '') {
  const gz = zlib.gzipSync(Buffer.from(JSON.stringify(dump)));
  if (!passphrase) return gz;
  const salt = crypto.randomBytes(16), iv = crypto.randomBytes(12);
  const key = crypto.scryptSync(passphrase, salt, 32);
  const c = crypto.createCipheriv('aes-256-gcm', key, iv);
  const enc = Buffer.concat([c.update(gz), c.final()]);
  return Buffer.concat([MAGIC, salt, iv, c.getAuthTag(), enc]);
}

export function unseal(buf, passphrase = '') {
  let gz = buf;
  if (buf.subarray(0, 4).equals(MAGIC)) {
    if (!passphrase) throw new Error('This backup is encrypted: a passphrase is needed.');
    const salt = buf.subarray(4, 20), iv = buf.subarray(20, 32), tag = buf.subarray(32, 48), enc = buf.subarray(48);
    try {
      const d = crypto.createDecipheriv('aes-256-gcm', crypto.scryptSync(passphrase, salt, 32), iv); d.setAuthTag(tag);
      gz = Buffer.concat([d.update(enc), d.final()]);
    } catch { throw new Error('Wrong passphrase, or the file is damaged.'); }
  }
  let dump;
  try { dump = JSON.parse(zlib.gunzipSync(gz).toString('utf8')); } catch { throw new Error('Not a valid backup file.'); }
  if (dump?.format !== 'shonowear-backup' || dump.version !== 1 || !Array.isArray(dump.items)) throw new Error('Not a Shonowear backup.');
  if (checkOf(dump.items) !== dump.check || dump.items.length !== dump.count) throw new Error('The backup is damaged (checksum does not match).');
  return dump;
}

export async function restoreDump(dump, { force = false } = {}) {
  const existing = (await allKeys()).filter(k => !skipped(k));
  if (existing.length && !force) throw new Error(`The database already has ${existing.length} records. Restoring would overwrite them; use force to confirm.`);
  let written = 0;
  for (let i = 0; i < dump.items.length; i += 50) {
    const cmds = [];
    for (const { k, t, v, ms } of dump.items.slice(i, i + 50)) {
      if (skipped(k)) continue;
      cmds.push(['DEL', k]);
      if (t === 'string') cmds.push(['SET', k, String(v)]);
      else if (t === 'hash') { const f = Object.entries(v).flat(); if (f.length) cmds.push(['HSET', k, ...f]); }
      else if (t === 'zset') { const f = Object.entries(v).flatMap(([m, sc]) => [Number(sc), m]); if (f.length) cmds.push(['ZADD', k, ...f]); }
      else if (t === 'list') { if (v.length) cmds.push(['RPUSH', k, ...v]); }
      else continue;
      if (ms > 0) cmds.push(['PEXPIRE', k, ms]);
      written++;
    }
    if (cmds.length) await store(cmds);
  }
  return { written };
}
