/**
 * SHONOWEAR — marketing consent and campaigns.
 * Only customers who ticked "email me offers" at checkout are on the list (with the time they agreed). Every email carries an
 * unsubscribe link tied to a random per-customer token. An unsubscribed address is never emailed again, even if it opts in later on its own...
 * until they tick the box again on a new order (which clears the unsubscribe).
 */
import crypto from 'node:crypto';
import { store, safeEqual, hgetall } from './guard.js';
import { eKey, normEmail } from './ekey.js';
import { sendCampaignEmail } from './notify.js';

export async function recordConsent(customer, { source = 'checkout' } = {}) {
  const email = normEmail(customer?.email);
  if (!email) return;
  const k = eKey(email);
  const [old] = await store([['HGET', 'mkt', k]]);
  let tok; try { tok = JSON.parse(old).tok; } catch { /* new */ }
  const rec = { email, name: String(customer.name || '').slice(0, 60), tok: tok || crypto.randomBytes(16).toString('base64url'), at: new Date().toISOString(), source };
  await store([['HSET', 'mkt', k, JSON.stringify(rec)], ['DEL', `mktun:${k}`]]);
}

export async function unsubscribe(email, tok) {
  const k = eKey(email);
  const [raw] = await store([['HGET', 'mkt', k]]);
  let rec; try { rec = JSON.parse(raw); } catch { return false; }
  if (!rec?.tok || !safeEqual(rec.tok, String(tok || ''))) return false;
  await store([['SET', `mktun:${k}`, new Date().toISOString()]]);
  return true;
}

export async function audience() {
  const [all] = await store([['HGETALL', 'mkt']]);
  const rows = [];
  for (const [k, raw] of Object.entries(hgetall(all))) {
    let r; try { r = JSON.parse(raw); } catch { continue; }
    const [un] = await store([['GET', `mktun:${k}`]]);
    rows.push({ ...r, unsubscribed: Boolean(un) });
  }
  return rows;
}

const MAX_PER_SEND = 200;
export async function sendCampaign({ subject, body, test = false }) {
  const s = String(subject || '').replace(/[\u0000-\u001F]/g, ' ').trim().slice(0, 120);
  const text = String(body || '').trim().slice(0, 3000);
  if (s.length < 3 || text.length < 10) return { ok: false, status: 400, error: 'Write a subject and a message first.' };
  const site = (process.env.SITE_URL || '').replace(/\/+$/, '');
  if (!site) return { ok: false, status: 409, error: 'Set SITE_URL first: every email needs a working unsubscribe link.' };
  if (test) {
    const to = process.env.ORDER_NOTIFY_EMAIL;
    if (!to) return { ok: false, status: 409, error: 'Set ORDER_NOTIFY_EMAIL to receive a test.' };
    await sendCampaignEmail({ to, subject: `[TEST] ${s}`, text, unsub: `${site}/unsubscribe` });
    return { ok: true, sent: 1, test: true };
  }
  const [lock] = await store([['SET', 'campaignlock', '1', 'NX', 'EX', 600]]);
  if (lock !== 'OK') return { ok: false, status: 429, error: 'A campaign was sent in the last 10 minutes. Wait before sending another.' };
  const list = (await audience()).filter(r => !r.unsubscribed).slice(0, MAX_PER_SEND);
  let sent = 0, failed = 0;
  for (let i = 0; i < list.length; i += 10) {
    const out = await Promise.allSettled(list.slice(i, i + 10).map(r => sendCampaignEmail({ to: r.email, subject: s, text, unsub: `${site}/unsubscribe?e=${encodeURIComponent(r.email)}&t=${encodeURIComponent(r.tok)}` })));
    for (const o of out) o.status === 'fulfilled' ? sent++ : failed++;
  }
  await store([['LPUSH', 'campaigns', JSON.stringify({ at: new Date().toISOString(), subject: s, sent, failed })], ['LTRIM', 'campaigns', 0, 49]]);
  return { ok: true, sent, failed, capped: list.length === MAX_PER_SEND };
}
export async function campaignLog() { const [l] = await store([['LRANGE', 'campaigns', 0, 9]]); return (l || []).map(x => { try { return JSON.parse(x); } catch { return null; } }).filter(Boolean); }
