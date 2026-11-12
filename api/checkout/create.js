/**
 * POST /api/checkout/create
 * body: { cart: [{ id, size, qty }], customer: {...} }
 *
 * 1. validate cart + customer (server-side, catalogue prices)
 * 2. hold the stock (15 min)
 * 3. create the Razorpay order for the server-computed amount
 * 4. save the pending order
 * Every failure after step 2 releases the hold. Fails closed without Razorpay keys or the store.
 */
import { preflight, storeAvailable, rateLimit, ipKey, store, log } from '../../server/guard.js';
import { parseCart } from '../../server/cart.js';
import { reserve, release } from '../../server/stock.js';
import { createRazorpayOrder, isConfigured, keyId, isTestMode } from '../../server/razorpay.js';
import { getOrder, saveOrder, newOrderId, nextOrderNumber, insertOrder } from '../../server/orders.js';
import { validateCustomer } from '../../src/lib/checkoutValidation.js';
import { computeTotals } from '../../src/lib/store.js';
import { STORE } from '../../src/data/storeConfig.js';

const UNAVAILABLE = { error: 'Checkout is not available right now. Please try again later.' };

export default async function handler(req, res) {
  if (!preflight(req, res, { maxBytes: 8 * 1024 })) return;
  if (!isConfigured() || !storeAvailable()) return res.status(503).json(UNAVAILABLE);

  const body = req.body && typeof req.body === 'object' ? req.body : {};
  const cart = parseCart(body.cart);
  if (!cart.ok) return res.status(400).json({ error: cart.error });
  const cust = validateCustomer(body.customer);
  if (!cust.ok) return res.status(400).json({ error: 'Please check your details.', fields: cust.errors });

  try {
    const rl = await rateLimit('checkout', ipKey(req), 8, 600);
    if (rl.limited) return res.status(429).json({ error: 'Too many attempts. Please wait a few minutes.', retryAfter: rl.retryAfter });
  } catch (err) {
    log('checkout_blocked', { reason: 'rate_limit_store_error', msg: err.message });
    return res.status(503).json(UNAVAILABLE);
  }

  // One open hold per visitor: starting a new checkout frees the previous unpaid one (limits stock-hoarding).
  const ipHoldKey = `iphold:${ipKey(req)}`;
  try {
    const [prevId] = await store([['GET', ipHoldKey]]);
    const prev = prevId && await getOrder(prevId, { raw: true });
    if (prev && prev.status === 'pending_payment') {
      await release(prev.id, prev.items);
      await saveOrder({ ...prev, status: 'cancelled', cancelledBy: 'system' });
    }
  } catch { /* best effort */ }

  const totals = computeTotals(cart.lines);
  const id = newOrderId();
  const items = cart.lines.map(l => ({ id: l.id, name: l.product.name, size: l.size, qty: l.qty, price: l.product.price }));

  let held = false;
  try {
    const r = await reserve(id, items);
    if (!r.ok) {
      const name = cart.lines.find(l => l.id === r.id)?.product.name || 'An item';
      return res.status(409).json({
        error: r.available > 0
          ? `Only ${r.available} left in size ${r.size} for ${name}. Please reduce the quantity.`
          : `${name} (size ${r.size}) just sold out.`,
        item: { id: r.id, size: r.size, available: r.available },
      });
    }
    held = true;

    const number = await nextOrderNumber();
    const rzp = await createRazorpayOrder({ amountPaise: totals.total * 100, receipt: number, notes: { orderId: id } });

    await insertOrder({
      id, number, status: 'pending_payment',
      createdAt: new Date().toISOString(), expiresAt: r.expiresAt,
      items, totals, customer: cust.data,
      razorpay: { orderId: rzp.id }, flags: [],
    });

    await store([['SET', ipHoldKey, id, 'EX', STORE.holdMinutes * 60]]).catch(() => {});
    log('checkout_created', { total: totals.total, lines: items.length });
    return res.status(200).json({
      orderId: id, number, razorpayOrderId: rzp.id, amount: rzp.amount, currency: 'INR',
      keyId: keyId(), testMode: isTestMode(), expiresAt: r.expiresAt, holdMinutes: STORE.holdMinutes,
    });
  } catch (err) {
    if (held) await release(id, items);
    log('checkout_error', { msg: err.message });
    return res.status(502).json({ error: 'We could not start the payment. Please try again.' });
  }
}
