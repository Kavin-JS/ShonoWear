/**
 * SHONOWEAR — server/razorpay.js
 * The only code that talks to Razorpay or checks its signatures.
 *
 * Money rules:
 *   - Amounts are integers in paise, computed on the server from the catalogue.
 *   - A payment is only trusted after its HMAC signature is verified with the key secret.
 *   - Webhook bodies are only trusted after verifying X-Razorpay-Signature over the RAW body.
 */
import crypto from 'node:crypto';
import { safeEqual } from './guard.js';

const base = () => process.env.RAZORPAY_API_BASE || 'https://api.razorpay.com'; // override is for tests only

export const keyId = () => process.env.RAZORPAY_KEY_ID || '';
export const isConfigured = () => Boolean(process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET);
export const isTestMode = () => keyId().startsWith('rzp_test_');
export const isLiveMode = () => keyId().startsWith('rzp_live_');

export async function createRazorpayOrder({ amountPaise, receipt, notes = {} }) {
  if (!Number.isInteger(amountPaise) || amountPaise < 100) throw new Error('invalid amount');
  const auth = Buffer.from(`${process.env.RAZORPAY_KEY_ID}:${process.env.RAZORPAY_KEY_SECRET}`).toString('base64');
  const res = await fetch(`${base()}/v1/orders`, {
    method: 'POST',
    headers: { Authorization: `Basic ${auth}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ amount: amountPaise, currency: 'INR', receipt, notes }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new Error(`Razorpay order creation failed (${res.status})`);
  const data = await res.json();
  if (!data?.id || data.amount !== amountPaise) throw new Error('Razorpay returned an unexpected order');
  return { id: data.id, amount: data.amount };
}

/** Signature the checkout popup returns: HMAC_SHA256(order_id|payment_id, key_secret). */
export function verifyPaymentSignature({ orderId, paymentId, signature }) {
  const secret = process.env.RAZORPAY_KEY_SECRET;
  if (!secret || !orderId || !paymentId || !signature) return false;
  const expected = crypto.createHmac('sha256', secret).update(`${orderId}|${paymentId}`).digest('hex');
  return safeEqual(expected, String(signature));
}

/** Webhook signature: HMAC_SHA256(raw body, webhook secret). */
export function verifyWebhookSignature(rawBody, signature) {
  const secret = process.env.RAZORPAY_WEBHOOK_SECRET;
  if (!secret || !signature || typeof rawBody !== 'string') return false;
  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
  return safeEqual(expected, String(signature));
}
