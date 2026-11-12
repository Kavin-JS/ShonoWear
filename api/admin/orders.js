/**
 * Admin API (Bearer ADMIN_TOKEN).
 *   GET  /api/admin/orders                         → latest orders (full details)
 *   GET  /api/admin/orders?view=waitlist           → back-in-stock sign-ups per product+size
 *   POST /api/admin/orders {action:'notify-waitlist', productId, size} → email the waiting customers (only if restocked)
 *   POST /api/admin/orders {id, action, courier?, tracking?}
 *        action: shipped | delivered | cancelled   (cancel of a paid order does NOT refund: refund in Razorpay)
 * Fails closed if ADMIN_TOKEN is unset or short. Wrong guesses are rate limited per IP.
 */
import { preflight, storeAvailable, rateLimit, ipKey, safeEqual, log } from '../../server/guard.js';
import { getOrder, saveOrder, listOrders } from '../../server/orders.js';
import { listWaitlist, notifyWaitlist } from '../../server/waitlist.js';

const clean = (v, n) => String(v ?? '').replace(/[\u0000-\u001F\u007F]/g, ' ').trim().slice(0, n);

export default async function handler(req, res) {
  if (!preflight(req, res, { methods: ['GET', 'POST'], maxBytes: 2 * 1024 })) return;
  const token = process.env.ADMIN_TOKEN || '';
  if (token.length < 24 || !storeAvailable()) return res.status(503).json({ error: 'Admin is not configured.' });

  try {
    const rl = await rateLimit('admin', ipKey(req), 30, 600);
    if (rl.limited) return res.status(429).json({ error: 'Too many attempts.' });
  } catch { return res.status(503).json({ error: 'Unavailable.' }); }

  const given = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  if (!safeEqual(given, token)) { log('admin_bad_token'); return res.status(401).json({ error: 'Unauthorized' }); }

  try {
    if (req.method === 'GET') {
      if (req.query?.view === 'waitlist') return res.status(200).json({ waitlist: await listWaitlist() });
      return res.status(200).json({ orders: await listOrders(200) });
    }
    if (req.body?.action === 'notify-waitlist') {
      const r = await notifyWaitlist(String(req.body.productId || ''), req.body.size);
      return res.status(r.ok ? 200 : 409).json(r);
    }

    const { id, action } = req.body || {};
    const order = await getOrder(String(id || ''));
    if (!order) return res.status(404).json({ error: 'Order not found.' });

    const allowed = {
      shipped:   ['paid'],
      delivered: ['paid', 'shipped'],
      cancelled: ['paid', 'pending_payment', 'expired'],
    };
    if (typeof action !== 'string' || !Object.hasOwn(allowed, action) || !allowed[action].includes(order.status)) return res.status(409).json({ error: `Cannot mark a ${order.status} order as ${action}.` });

    const next = { ...order, status: action };
    if (action === 'cancelled') next.cancelledBy = 'admin';
    if (action === 'shipped') next.shipment = { courier: clean(req.body.courier, 40), tracking: clean(req.body.tracking, 60), shippedAt: new Date().toISOString() };
    await saveOrder(next);
    res.status(200).json({ order: next });
  } catch (err) {
    log('admin_error', { msg: err.message });
    res.status(500).json({ error: 'Failed.' });
  }
}
