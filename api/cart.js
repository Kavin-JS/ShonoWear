/**
 * POST /api/cart
 *   { action: 'quote', cart, code?, gift?, payment?, pincode? }  → the exact price checkout would charge
 *   { action: 'remember', email, cart, consent: true }            → save the bag for ONE reminder email (opt-in)
 * The preview uses the same pricing code as checkout. Code look-ups are rate limited so codes cannot be guessed.
 */
import { preflight, storeAvailable, rateLimit, ipKey, log } from '../server/guard.js';
import { priceOrder } from '../server/pricing.js';
import { rememberBag } from '../server/bags.js';

export default async function handler(req, res) {
  if (!preflight(req, res, { maxBytes: 6 * 1024 })) return;
  if (!storeAvailable()) return res.status(503).json({ error: 'Unavailable.' });
  const b = req.body && typeof req.body === 'object' ? req.body : {};

  try {
    if (b.action === 'quote') {
      const rl = await rateLimit('quote', ipKey(req), 60, 600);
      if (rl.limited) return res.status(429).json({ error: 'Too many requests. Please wait a moment.' });
      if (b.code || b.gift) {
        const rc = await rateLimit('code', ipKey(req), 25, 600);          // guessing protection
        if (rc.limited) return res.status(429).json({ error: 'Too many code attempts. Please wait a few minutes.' });
      }
      const p = await priceOrder({
        cart: b.cart, code: b.code ? String(b.code).slice(0, 32) : '', gift: b.gift ? String(b.gift).slice(0, 32) : '',
        payment: b.payment === 'cod' ? 'cod' : 'online', pincode: /^\d{6}$/.test(String(b.pincode || '')) ? String(b.pincode) : '', strict: false,
      });
      if (!p.ok) return res.status(400).json({ error: p.error });
      return res.status(200).json({
        totals: p.totals, items: p.items, shipsBy: p.shipsBy, cod: p.cod,
        promo: p.promo && { ok: p.promo.ok, code: p.promo.code, label: p.promo.label, applied: p.promo.applied, beaten: p.promo.beaten, error: p.promo.error },
        gift: p.gift && { ok: p.gift.ok, balance: p.gift.balance, applied: p.gift.applied, error: p.gift.error },
      });
    }
    if (b.action === 'remember') {
      const rl = await rateLimit('remember', ipKey(req), 10, 600);
      if (rl.limited) return res.status(429).json({ error: 'Too many requests.' });
      const r = await rememberBag({ email: b.email, cart: b.cart, consent: b.consent });
      return res.status(r.ok ? 200 : 400).json({ ok: r.ok });
    }
    return res.status(400).json({ error: 'Unknown action.' });
  } catch (err) {
    log('cart_error', { msg: err.message });
    return res.status(500).json({ error: 'Could not price your bag. Please try again.' });
  }
}
