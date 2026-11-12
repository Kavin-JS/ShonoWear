/** POST /api/checkout/cancel  body: { orderId }  → releases the stock hold of an UNPAID order. */
import { preflight, storeAvailable, rateLimit, ipKey } from '../../server/guard.js';
import { getOrder, saveOrder } from '../../server/orders.js';
import { release } from '../../server/stock.js';

export default async function handler(req, res) {
  if (!preflight(req, res, { maxBytes: 1024 })) return;
  if (!storeAvailable()) return res.status(503).json({ error: 'Unavailable.' });
  try {
    const rl = await rateLimit('cancel', ipKey(req), 30, 600);
    if (rl.limited) return res.status(429).json({ error: 'Too many attempts.' });
    const order = await getOrder(req.body?.orderId);
    if (!order) return res.status(404).json({ error: 'Order not found.' });
    if (order.status !== 'pending_payment') return res.status(200).json({ ok: true, status: order.status }); // never touches paid orders
    await release(order.id, order.items);
    await saveOrder({ ...order, status: 'cancelled', cancelledBy: 'customer' });
    return res.status(200).json({ ok: true, status: 'cancelled' });
  } catch {
    return res.status(500).json({ error: 'Could not cancel.' });
  }
}
