/**
 * POST /api/razorpay-webhook
 * Razorpay calls this when a payment is captured, even if the customer closed the tab.
 * Configure in Razorpay Dashboard → Webhooks: URL https://YOUR-DOMAIN/api/razorpay-webhook,
 * events payment.captured and order.paid, secret = RAZORPAY_WEBHOOK_SECRET.
 *
 * The signature is computed over the RAW body, so Vercel's body parser is switched off here.
 */
import { preflight, storeAvailable, readRawBody, log } from '../server/guard.js';
import { verifyWebhookSignature } from '../server/razorpay.js';
import { findByRazorpayOrder, finalizePaid } from '../server/orders.js';

export const config = { api: { bodyParser: false } };

export default async function handler(req, res) {
  // Server-to-server: no Origin header, so skip the browser origin check. The signature is the authentication.
  if (!preflight(req, res, { raw: true, checkOrigin: false })) return;
  if (!storeAvailable()) return res.status(503).json({ error: 'Unavailable' });

  let raw;
  try { raw = await readRawBody(req, 64 * 1024); } catch { return res.status(413).json({ error: 'Too large' }); }

  if (!verifyWebhookSignature(raw, req.headers['x-razorpay-signature'])) {
    log('webhook_bad_signature');
    return res.status(400).json({ error: 'Bad signature' });
  }

  let event;
  try { event = JSON.parse(raw); } catch { return res.status(400).json({ error: 'Bad JSON' }); }

  if (!event || typeof event !== 'object') return res.status(400).json({ error: 'Bad JSON' });
  if (event.event !== 'payment.captured' && event.event !== 'order.paid') return res.status(200).json({ ok: true, ignored: true });

  const payment = event.payload?.payment?.entity;
  const rzpOrderId = payment?.order_id || event.payload?.order?.entity?.id;
  try {
    const order = await findByRazorpayOrder(rzpOrderId);
    if (!order) { log('webhook_unknown_order'); return res.status(200).json({ ok: true, ignored: true }); } // 200 so Razorpay stops retrying
    if (!payment || payment.status !== 'captured' || payment.currency !== 'INR' || !payment.id) {
      log('webhook_no_captured_payment');
      return res.status(200).json({ ok: true, ignored: 'not-captured' });
    }
    if (payment.amount !== order.totals.total * 100) {
      log('webhook_amount_mismatch');
      return res.status(200).json({ ok: true, ignored: 'amount' }); // flagged in logs; never mark paid on a wrong amount
    }
    const r = await finalizePaid(order.id, { paymentId: String(payment.id).slice(0, 40), source: 'webhook' });
    return res.status(200).json({ ok: r.ok });
  } catch (err) {
    log('webhook_error', { msg: err.message });
    return res.status(500).json({ error: 'Retry' }); // non-2xx makes Razorpay retry later
  }
}
