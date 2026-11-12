/** GET /api/stock?ids=a,b → units available right now per size, for own-stock products. */
import { preflight, storeAvailable, rateLimit, ipKey, log } from '../server/guard.js';
import { availability } from '../server/stock.js';

export default async function handler(req, res) {
  if (!preflight(req, res, { methods: ['GET'] })) return;
  if (!storeAvailable()) return res.status(503).json({ error: 'Stock information is unavailable.' });

  const ids = String(req.query?.ids || '').split(',').map(s => s.trim()).filter(s => /^[a-z0-9-]{1,40}$/i.test(s)).slice(0, 30);
  if (!ids.length) return res.status(400).json({ error: 'ids is required' });

  try {
    const rl = await rateLimit('stock', ipKey(req), 120, 600);
    if (rl.limited) return res.status(429).json({ error: 'Too many requests.', retryAfter: rl.retryAfter });
    res.status(200).json({ stock: await availability(ids) });
  } catch (err) {
    log('stock_error', { msg: err.message });
    res.status(503).json({ error: 'Stock information is unavailable.' });
  }
}
