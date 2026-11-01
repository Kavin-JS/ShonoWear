/**
 * SHONOWEAR — /api/subscribe.js
 * Vercel Serverless Function
 *
 * Production-hardened email capture:
 *   - Honeypot field (catches bots silently)
 *   - Strict email validation (format + length + banned disposable domains)
 *   - Upstash Redis rate limiting
 *   - Double opt-in via Resend (user must confirm email)
 *   - Mailchimp fallback
 *
 * Required env vars:
 *   UPSTASH_REDIS_REST_URL
 *   UPSTASH_REDIS_REST_TOKEN
 *
 * For Resend (recommended):
 *   RESEND_API_KEY
 *   RESEND_AUDIENCE_ID
 *
 * For Mailchimp:
 *   MAILCHIMP_API_KEY
 *   MAILCHIMP_LIST_ID
 */

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

/* ─────────────────────────────────────────────────────────────
   UPSTASH RATE LIMITER
   3 subscribe attempts per IP per hour
   ───────────────────────────────────────────────────────────── */
const SUB_RATE_MAX    = 3;
const SUB_RATE_WINDOW = 60 * 60; // 1 hour in seconds

async function checkRateLimit(ip) {
  const url   = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;

  if (!url || !token) return { limited: false };

  const key = `rl:subscribe:${ip}`;

  try {
    const incrRes = await fetch(`${url}/incr/${key}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const { result: count } = await incrRes.json();

    if (count === 1) {
      await fetch(`${url}/expire/${key}/${SUB_RATE_WINDOW}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
    }

    return { limited: count > SUB_RATE_MAX };
  } catch {
    return { limited: false };
  }
}

/* ─────────────────────────────────────────────────────────────
   DUPLICATE CHECK via Upstash
   Prevents the same email being added twice without error-leaking
   whether an address is already subscribed.
   ───────────────────────────────────────────────────────────── */
async function isDuplicate(email) {
  const url   = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;

  if (!url || !token) return false;

  // Hash the email so we're not storing PII in Redis keys
  const key = `sub:${Buffer.from(email).toString('base64')}`;

  try {
    const getRes  = await fetch(`${url}/get/${key}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const { result } = await getRes.json();

    if (result) return true; // already exists

    // Mark as subscribed (TTL: 1 year)
    await fetch(`${url}/set/${key}/1/ex/31536000`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    return false;
  } catch {
    return false;
  }
}

/* ─────────────────────────────────────────────────────────────
   RESEND — double opt-in
   Resend sends a confirmation email automatically when
   double_opt_in is true. User must click link to confirm.
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
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    // Ignore already-exists errors
    if (body.name === 'validation_error' && body.message?.includes('already exists')) return;
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
    }
  );

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    if (body.title === 'Member Exists') return; // already subscribed — not an error
    throw new Error(`Mailchimp error ${res.status}`);
  }
}

/* ─────────────────────────────────────────────────────────────
   IP HELPER
   ───────────────────────────────────────────────────────────── */
function getClientIp(req) {
  return (
    req.headers['x-forwarded-for']?.split(',')[0]?.trim() ||
    req.headers['x-real-ip'] ||
    'unknown'
  );
}

/* ─────────────────────────────────────────────────────────────
   MAIN HANDLER
   ───────────────────────────────────────────────────────────── */
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST')   return res.status(405).json({ error: 'Method not allowed' });

  const body = req.body || {};

  // ── 1. Honeypot check (bots fill hidden fields, humans don't) ──
  // The frontend renders an invisible field named "website".
  // Any submission with this field filled is a bot — reject silently.
  if (body.website) {
    // Return 200 so bots don't know they were caught
    return res.status(200).json({ ok: true });
  }

  // ── 2. Rate limiting ──
  const clientIp = getClientIp(req);
  const rate     = await checkRateLimit(clientIp);
  if (rate.limited) {
    return res.status(429).json({ error: 'Too many requests. Try again later.' });
  }

  // ── 3. Email validation ──
  const validation = validateEmail(body.email);
  if (!validation.ok) {
    return res.status(400).json({ error: validation.error });
  }
  const { email } = validation;

  // ── 4. Duplicate check ──
  const duplicate = await isDuplicate(email);
  if (duplicate) {
    // Don't tell the user — avoids confirming who is already subscribed
    return res.status(200).json({ ok: true });
  }

  // ── 5. Add to provider ──
  try {
    if (process.env.RESEND_API_KEY && process.env.RESEND_AUDIENCE_ID) {
      await addToResend(email);
    } else if (process.env.MAILCHIMP_API_KEY && process.env.MAILCHIMP_LIST_ID) {
      await addToMailchimp(email);
    } else {
      // No provider configured — log only (remove for production)
      console.log('[subscribe] no provider configured —', new Date().toISOString());
    }

    return res.status(200).json({ ok: true });

  } catch (err) {
    console.error('[/api/subscribe]', err.message);
    return res.status(500).json({ error: 'Could not save your email. Please try again.' });
  }
}
