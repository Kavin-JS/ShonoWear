/**
 * GET /api/config → tells the website whether checkout is switched on (no secrets).
 * GET  /api/config?health=1 → uptime check (yes/no flags only).
 * POST /api/config {e, id?} → counts one anonymous event (cookieless; see server/analytics.js). Always answers 204 so it never disturbs the page.
 */
import { preflight, storeAvailable, rateLimit, ipKey, log } from '../server/guard.js';
import { recordEvent } from '../server/analytics.js';
import { captureClient, health } from '../server/monitor.js';
import { refreshOverrides, publicOverrides } from '../server/overrides.js';
import { isConfigured, isTestMode } from '../server/razorpay.js';

export default async function handler(req, res) {
  if (!preflight(req, res, { methods: ['GET', 'POST'], maxBytes: 512 })) return;
  if (req.method === 'POST') {
    try {
      if (storeAvailable()) {
        const body = typeof req.body === 'object' && req.body ? req.body : {};
        if (body.e === 'client_error') {
          const { limited } = await rateLimit('cerr', ipKey(req), 10, 600);
          if (!limited) await captureClient({ m: body.m, r: body.r });
        } else {
          const { limited } = await rateLimit('an', ipKey(req), 120, 60);
          if (!limited) await recordEvent(body);
        }
      }
    } catch (err) { log('analytics_failed', { err: String(err?.message || err) }); }
    return res.status(204).end();
  }
  if (req.query?.health) {            // uptime check: GET /api/config?health=1 → 200 when the database answers, 503 when it does not
    const h = await health();
    res.setHeader('Cache-Control', 'no-store');
    return res.status(h.ok ? 200 : 503).json(h);
  }
  let overrides = {};
  if (storeAvailable()) { await refreshOverrides(); overrides = publicOverrides(); }
  res.status(200).json({ checkoutEnabled: isConfigured() && storeAvailable(), testMode: isTestMode(), overrides });
}
