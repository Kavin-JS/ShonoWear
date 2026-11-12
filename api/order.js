/** GET /api/order?id=…  → customer-safe order status (id is an unguessable 96-bit token). */
import { preflight, storeAvailable, rateLimit, ipKey } from '../server/guard.js';
import { getOrderFresh, publicView } from '../server/orders.js';

export default async function handler(req, res) {
  if (!preflight(req, res, { methods: ['GET'] })) return;
  if (!storeAvailable()) return res.status(503).json({ error: 'Unavailable.' });
  try {
    const rl = await rateLimit('order', ipKey(req), 60, 600);
    if (rl.limited) return res.status(429).json({ error: 'Too many requests.' });
    const o = await getOrderFresh(String(req.query?.id || ''));
    if (!o) return res.status(404).json({ error: 'Order not found.' });
    res.status(200).json({ order: publicView(o) });
  } catch {
    res.status(500).json({ error: 'Could not load the order.' });
  }
}
