/**
 * SHONOWEAR — /api/subscribe.js
 * Vercel Serverless Function — newsletter capture
 *
 * Behaviour:
 *   - Honeypot (field "website") silently swallows bots
 *   - Strict email validation + disposable-domain blocklist
 *   - Same-origin check, 2 KB body limit, 3 attempts / IP / hour (fails closed)
 *   - Duplicate detection keyed by HMAC-SHA256(email) — no raw emails in Redis
 *   - Subscription state is written ONLY AFTER the provider confirms, so a
 *     provider outage never permanently blocks a legitimate subscriber
 *   - In production, with no provider configured, it returns 503 instead of
 *     pretending the address was saved
 *
 * Opt-in honesty:
 *   - Mailchimp (status "pending")  → real double opt-in; user must confirm by email
 *   - Resend contacts API           → SINGLE opt-in; no confirmation email is sent by
 *                                     the API. The response says so (confirm:false).
 *
 * Env: RESEND_API_KEY + RESEND_AUDIENCE_ID   or   MAILCHIMP_API_KEY + MAILCHIMP_LIST_ID
 *      EMAIL_HASH_SALT (random string, set once)   UPSTASH_* (required in production)
 */

import crypto from 'node:crypto';
import { preflight, rateLimit, ipKey, storeAvailable, store, log } from '../server/guard.js';

/* ─────────────────────────────────────────────────────────────
   EMAIL VALIDATION
   ───────────────────────────────────────────────────────────── */

// Common disposable/throwaway email domains — not exhaustive, catches the obvious
const BLOCKED_DOMAINS = new Set([
  'mailinator.com', 'guerrillamail.com', 'trashmail.com', 'tempmail.com',
  'throwaway.email', 'fakeinbox.com', 'yopmail.com', 'sharklasers.com',
  'guerrillamailblock.com', 'grr.la', 'dispostable.com', 'spamgourmet.com',
  '10minutemail.com', 'maildrop.cc', 'discard.email',
]);

function validateEmail(email) {
  if (!email || typeof email !== 'string') {
    return { ok: false, error: 'Email is required.' };
  }

  const trimmed = email.trim().toLowerCase();

  // Length check
  if (trimmed.length < 5 || trimmed.length > 254) {
    return { ok: false, error: 'Invalid email address.' };
  }

  // Format check — RFC 5322 simplified
  const emailRegex = /^[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}$/;
  if (!emailRegex.test(trimmed)) {
    return { ok: false, error: 'Invalid email address format.' };
  }

  // Domain check
  const domain = trimmed.split('@')[1];
  if (BLOCKED_DOMAINS.has(domain)) {
    return { ok: false, error: 'Please use a real email address.' };
  }

  return { ok: true, email: trimmed };
}

const SUB_RATE_MAX    = 3;
const SUB_RATE_WINDOW = 60 * 60; // 1 hour

/* ─────────────────────────────────────────────────────────────
   RESEND — SINGLE opt-in
   The contacts API adds the address straight to the audience; it does not
   send a confirmation email. If you need double opt-in, use Mailchimp or
   send your own confirmation message before adding the contact.
   ───────────────────────────────────────────────────────────── */
async function addToResend(email) {
  const res = await fetch('https://api.resend.com/contacts', {
    method: 'POST',
    headers: {
      'Content-Type':  'application/json',
      'Authorization': `Bearer ${process.env.RESEND_API_KEY}`,
    },
    body: JSON.stringify({
      email,
      audience_id:    process.env.RESEND_AUDIENCE_ID,
      unsubscribed:   false,
    }),
    signal: AbortSignal.timeout(8000),
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    // Ignore already-exists errors
    if (res.status === 409 || (body.message || '').toLowerCase().includes('already exists')) return;
    throw new Error(`Resend error ${res.status}`);
  }
}

/* ─────────────────────────────────────────────────────────────
   MAILCHIMP — pending status = double opt-in
   ───────────────────────────────────────────────────────────── */
async function addToMailchimp(email) {
  const dc     = process.env.MAILCHIMP_API_KEY?.split('-').pop();
  const listId = process.env.MAILCHIMP_LIST_ID;

  const res = await fetch(
    `https://${dc}.api.mailchimp.com/3.0/lists/${listId}/members`,
    {
      method: 'POST',
      headers: {
        'Content-Type':  'application/json',
        'Authorization': `apikey ${process.env.MAILCHIMP_API_KEY}`,
      },
      body: JSON.stringify({
        email_address: email,
        status:        'pending', // double opt-in — user gets a confirmation email
      }),
      signal: AbortSignal.timeout(8000),
    }
  );

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    if (body.title === 'Member Exists') return; // already subscribed — not an error
    throw new Error(`Mailchimp error ${res.status}`);
  }
}


/* ─────────────────────────────────────────────────────────────
   DUPLICATES — keyed by HMAC, written only after provider success
   ───────────────────────────────────────────────────────────── */
function emailKey(email) {
  const salt = process.env.EMAIL_HASH_SALT || 'shonowear-email';
  return `sub:${crypto.createHmac('sha256', salt).update(email).digest('hex')}`;
}

async function alreadySubscribed(key) {
  const [v] = await store([['GET', key]]);
  return v !== null && v !== undefined;
}

async function markSubscribed(key) {
  await store([['SET', key, '1', 'EX', 31536000]]);
}

/* ─────────────────────────────────────────────────────────────
   HANDLER
   ───────────────────────────────────────────────────────────── */
export default async function handler(req, res) {
  if (!preflight(req, res, { maxBytes: 2 * 1024 })) return;

  const body = req.body && typeof req.body === 'object' ? req.body : {};

  // Honeypot: bots fill the hidden field. Answer 200 so they learn nothing.
  if (body.website) return res.status(200).json({ ok: true, confirm: false });

  const resendOn    = Boolean(process.env.RESEND_API_KEY && process.env.RESEND_AUDIENCE_ID);
  const mailchimpOn = Boolean(process.env.MAILCHIMP_API_KEY && process.env.MAILCHIMP_LIST_ID);

  if (!resendOn && !mailchimpOn) {
    if (process.env.VERCEL_ENV === 'production') {
      log('subscribe_blocked', { reason: 'no_provider' });
      return res.status(503).json({ error: 'Sign-ups are not available right now. Please try again later.' });
    }
    log('subscribe_dev_no_provider');
  }

  // Fail closed: without the store we can't rate-limit, so we don't accept sign-ups.
  if (!storeAvailable()) {
    log('subscribe_blocked', { reason: 'store_not_configured' });
    return res.status(503).json({ error: 'Sign-ups are not available right now. Please try again later.' });
  }

  try {
    const rl = await rateLimit('subscribe', ipKey(req), SUB_RATE_MAX, SUB_RATE_WINDOW);
    if (rl.limited) return res.status(429).json({ error: 'Too many requests. Try again later.' });
  } catch (err) {
    log('subscribe_blocked', { reason: 'rate_limit_store_error', msg: err.message });
    return res.status(503).json({ error: 'Sign-ups are not available right now. Please try again later.' });
  }

  const validation = validateEmail(body.email);
  if (!validation.ok) return res.status(400).json({ error: validation.error });
  const { email } = validation;

  const key = emailKey(email);
  try {
    // Same answer whether or not the address exists — never confirm who is subscribed.
    if (await alreadySubscribed(key)) return res.status(200).json({ ok: true, confirm: mailchimpOn && !resendOn });

    if (resendOn)         await addToResend(email);
    else if (mailchimpOn) await addToMailchimp(email);

    // Provider succeeded — only now do we remember the address.
    if (resendOn || mailchimpOn) await markSubscribed(key).catch(err => log('subscribe_mark_failed', { msg: err.message }));

    return res.status(200).json({ ok: true, confirm: mailchimpOn && !resendOn });
  } catch (err) {
    log('subscribe_error', { msg: err.message });
    return res.status(500).json({ error: 'Could not save your email. Please try again.' });
  }
}
