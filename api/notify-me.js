/**
 * POST /api/notify-me { id, size, email, website }  → join the back-in-stock list for a SOLD-OUT size.
 * Honeypot field "website", same-origin check, 6 attempts / IP / 10 min. The reply never says whether an
 * address was already on the list.
 */
import { preflight, storeAvailable, rateLimit, ipKey, log } from '../server/guard.js';
import { addToWaitlist } from '../server/waitlist.js';

export default async function handler(req, res) {
  if (!preflight(req, res, { maxBytes: 2 * 1024 })) return;
  const b = req.body && typeof req.body === 'object' ? req.body : {};
  if (b.website) return res.status(200).json({ ok: true });                  // bot: pretend
  if (!storeAvailable()) return res.status(503).json({ error: 'Unavailable right now.' });
  try {
    const rl = await rateLimit('notify', ipKey(req), 6, 600);
    if (rl.limited) return res.status(429).json({ error: 'Too many attempts. Try again later.' });
    const r = await addToWaitlist(String(b.id || ''), b.size, b.email);
    if (!r.ok) {
      const msg = { bad_email: 'Please enter a valid email.', in_stock: 'Good news: that size is in stock now.', full: 'The list is full for this item.' }[r.reason] || 'Could not add you to the list.';
      return res.status(r.reason === 'in_stock' ? 200 : 400).json({ error: msg, inStock: r.reason === 'in_stock' });
    }
    return res.status(200).json({ ok: true });
  } catch (err) {
    log('notify_me_error', { msg: err.message });
    return res.status(500).json({ error: 'Something went wrong.' });
  }
}
