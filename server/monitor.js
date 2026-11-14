/**
 * SHONOWEAR — knowing when something breaks.
 *   capture(event, fields)  keeps the problem in a short list (newest first, 100 max) for the admin "Recent problems" panel,
 *                           counts it per day, and emails the owner about serious ones (at most one email per kind per hour).
 *   captureClient({m, r})   the same for errors that happen in a visitor's browser (cleaned, de-duplicated).
 *   health()                what the uptime check at /api/config?health=1 reports.
 * Nothing personal is stored: emails and long numbers are masked and messages are cut short.
 * Best effort by design: monitoring must never break a customer's request.
 */
import { store, storeAvailable, hash } from './guard.js';

const KEEP = 100;
export const CRITICAL = ['webhook_error', 'webhook_amount_mismatch', 'checkout_error', 'verify_error', 'refund_call_failed', 'refund_mirror_failed', 'stock_error', 'order_email_failed'];
const istDay = (ms = Date.now()) => new Date(ms + 5.5 * 3600_000).toISOString().slice(0, 10);

/** Removes things that look personal and shortens the text. */
export function clean(text, max = 200) {
  return String(text ?? '')
    .replace(/[\w.+-]+@[\w-]+(\.[\w-]+)+/g, '[email]')
    .replace(/\b\d{7,}\b/g, '[number]')
    .replace(/[?#][^\s]*/g, '')                       // query strings and fragments (tokens live there)
    .replace(/\s+/g, ' ').trim().slice(0, max);
}

async function keep(entry) {
  const day = istDay();
  await store([['LPUSH', 'errs', JSON.stringify(entry)], ['LTRIM', 'errs', 0, KEEP - 1], ['HINCRBY', `errc:${day}`, entry.kind, 1], ['EXPIRE', `errc:${day}`, 14 * 86400]]);
}

export async function capture(event, fields = {}) {
  try {
    if (!storeAvailable()) return;
    const msg = clean(fields.msg || fields.err || fields.reason || '');
    await keep({ t: new Date().toISOString(), kind: String(event).slice(0, 60), msg, ref: clean(fields.orderId || fields.id || '', 40) });
    if (CRITICAL.includes(event)) {
      const [first, n] = await store([['SET', `alert:${event}`, '1', 'EX', 3600, 'NX'], ['HINCRBY', `errc:${istDay()}`, event, 0]]);
      if (first === 'OK') {
        const { sendAlertEmail } = await import('./notify.js');
        await sendAlertEmail({ kind: event, msg, count: Number(n) || 1 });
      }
    }
  } catch { /* never throw from monitoring */ }
}

export async function captureClient({ m, r } = {}) {
  try {
    if (!storeAvailable()) return false;
    const msg = clean(m, 200); const route = clean(String(r || '').split('?')[0], 80);
    if (!msg) return false;
    const [first] = await store([['SET', `cerr:${hash(msg + route)}`, '1', 'EX', 600, 'NX']]);   // the same error again within 10 minutes is ignored
    if (first !== 'OK') return false;
    await keep({ t: new Date().toISOString(), kind: 'client_error', msg, ref: route });
    return true;
  } catch { return false; }
}

export async function recentProblems(n = 20) {
  const [rows, today] = await store([['LRANGE', 'errs', 0, n - 1], ['HGETALL', `errc:${istDay()}`]]);
  const parsed = (rows || []).map(r => { try { return JSON.parse(r); } catch { return null; } }).filter(Boolean);
  const flat = Array.isArray(today) ? today : [];
  let total = 0; for (let i = 1; i < flat.length; i += 2) total += Number(flat[i]) || 0;
  return { recent: parsed, today: total };
}

/** For the uptime check. Reveals only yes/no, never values. */
export async function health() {
  let storeOk = false;
  try { if (storeAvailable()) { await store([['SET', 'health:ping', '1', 'EX', 60]]); storeOk = true; } } catch { storeOk = false; }
  return {
    ok: storeOk, time: new Date().toISOString(),
    store: storeOk, payments: Boolean(process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET),
    email: Boolean(process.env.RESEND_API_KEY && process.env.ORDER_FROM_EMAIL), alerts: Boolean(process.env.ORDER_NOTIFY_EMAIL),
    backupEncryption: (process.env.BACKUP_PASSPHRASE || '').length >= 12,
  };
}
