/** GET /api/config → tells the website whether checkout is switched on (no secrets). */
import { preflight, storeAvailable } from '../server/guard.js';
import { isConfigured, isTestMode } from '../server/razorpay.js';

export default function handler(req, res) {
  if (!preflight(req, res, { methods: ['GET'] })) return;
  res.status(200).json({ checkoutEnabled: isConfigured() && storeAvailable(), testMode: isTestMode() });
}
