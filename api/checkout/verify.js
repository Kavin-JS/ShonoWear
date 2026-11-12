/**
 * POST /api/checkout/verify
 * body: { orderId, razorpay_order_id, razorpay_payment_id, razorpay_signature }
 * Marks the order paid ONLY if the signature checks out against the order's own Razorpay id.
 */
import { preflight, storeAvailable, rateLimit, ipKey, log } from '../../server/guard.js';
import { verifyPaymentSignature } from '../../server/razorpay.js';
import { getOrder, finalizePaid, publicView } from '../../server/orders.js';

export default async function handler(req, res) {
  if (!preflight(req, res, { maxBytes: 4 * 1024 })) return;
  if (!storeAvailable()) return res.status(503).json({ error: 'Unavailable.' });

  const b = req.body && typeof req.body === 'object' ? req.body : {};
  try {
    const rl = await rateLimit('verify', ipKey(req), 30, 600);
    if (rl.limited) return res.status(429).json({ error: 'Too many attempts.', retryAfter: rl.retryAfter });

    const order = await getOrder(b.orderId);
    if (!order) return res.status(404).json({ error: 'Order not found.' });
    if (b.razorpay_order_id !== order.razorpay.orderId) return res.status(400).json({ error: 'Payment does not match this order.' });

    const valid = verifyPaymentSignature({ orderId: b.razorpay_order_id, paymentId: b.razorpay_payment_id, signature: b.razorpay_signature });
    if (!valid) { log('verify_bad_signature'); return res.status(400).json({ error: 'Payment could not be verified.' }); }

    const result = await finalizePaid(order.id, { paymentId: String(b.razorpay_payment_id).slice(0, 40), source: 'checkout' });
    if (!result.ok) return res.status(500).json({ error: 'Could not record the payment.' });
    return res.status(200).json({ ok: true, order: publicView(result.order) });
  } catch (err) {
    log('verify_error', { msg: err.message });
    // The money may have moved: tell the customer it is safe and that the webhook will finish the job.
    return res.status(500).json({ error: 'We could not confirm your order yet. If you were charged, your order will be confirmed automatically; check your email.' });
  }
}
