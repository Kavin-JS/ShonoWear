/**
 * POST /api/checkout/create
 * body: { cart: [{ id, size, qty }], customer: {...}, code?, gift?, payment?: 'online'|'cod', expectTotal? }
 *    or { giftcard: { amount, to, message? }, customer: { name, email, phone? } }   (buying a gift card)
 *
 * 1. price everything on the server (catalogue prices, flash sale, bundle, coupon, gift card, COD fee)
 * 2. claim stock, the coupon use and the gift-card amount for 15 minutes
 * 3. online: create the Razorpay order for the server-computed amount
 *    COD or fully covered by a gift card: the order is confirmed right here, no payment window
 * 4. save the order
 * Every failure after step 2 releases what was claimed. Fails closed without the store (and without Razorpay keys for online payment).
 */
import { preflight, storeAvailable, rateLimit, ipKey, store, log } from '../../server/guard.js';
import { reserve } from '../../server/stock.js';
import { createRazorpayOrder, isConfigured, keyId, isTestMode } from '../../server/razorpay.js';
import { getOrder, saveOrder, newOrderId, nextOrderNumber, insertOrder, finalizePaid, confirmCod, releaseClaims } from '../../server/orders.js';
import { priceOrder } from '../../server/pricing.js';
import { reservePromo, custKeys } from '../../server/promos.js';
import { reserveGift } from '../../server/giftcards.js';
import { validEmail } from '../../server/waitlist.js';
import { validateCustomer } from '../../src/lib/checkoutValidation.js';
import { STORE } from '../../src/data/storeConfig.js';

const UNAVAILABLE = { error: 'Checkout is not available right now. Please try again later.' };
const clean = (v, n) => String(v ?? '').replace(/[\u0000-\u001F\u007F]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, n);

export default async function handler(req, res) {
  if (!preflight(req, res, { maxBytes: 8 * 1024 })) return;
  if (!storeAvailable()) return res.status(503).json(UNAVAILABLE);

  const body = req.body && typeof req.body === 'object' ? req.body : {};
  const buyingGift = body.giftcard && typeof body.giftcard === 'object';
  const wantsCod = body.payment === 'cod';

  let cust = null, gcInput = null;
  if (buyingGift) {
    const g = body.giftcard, c = body.customer || {};
    const amount = Number(g.amount), to = clean(g.to, 120).toLowerCase(), name = clean(c.name, 80), email = clean(c.email, 120).toLowerCase();
    if (!STORE.giftCards?.enabled || !STORE.giftCards.amounts.includes(amount)) return res.status(400).json({ error: 'Choose one of the gift card amounts.' });
    if (name.length < 2) return res.status(400).json({ error: 'Enter your name.', fields: { name: 'Enter your name.' } });
    if (!validEmail(email)) return res.status(400).json({ error: 'Enter your email address.', fields: { email: 'Enter a valid email address.' } });
    if (!validEmail(to)) return res.status(400).json({ error: 'Enter the email address to send the gift card to.', fields: { to: 'Enter a valid email address.' } });
    cust = { ok: true, data: { name, email, phone: String(c.phone ?? '').replace(/\D/g, '').slice(-10) } };
    gcInput = { amount, to, message: clean(g.message, 200) };
  } else {
    cust = validateCustomer(body.customer);
    if (!cust.ok) return res.status(400).json({ error: 'Please check your details.', fields: cust.errors });
  }
  if (!wantsCod && !isConfigured()) return res.status(503).json(UNAVAILABLE);

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
      await releaseClaims(prev);
      await saveOrder({ ...prev, status: 'cancelled', cancelledBy: 'system' });
    }
  } catch { /* best effort */ }

  const id = newOrderId();
  const now = Date.now();
  const expiresAt = now + STORE.holdMinutes * 60_000;

  /* ───── gift card purchase: nothing to ship, nothing to hold ───── */
  if (buyingGift) {
    try {
      const number = await nextOrderNumber();
      const total = gcInput.amount;
      const rzp = await createRazorpayOrder({ amountPaise: total * 100, receipt: number, notes: { orderId: id } });
      await insertOrder({
        id, number, kind: 'giftcard', status: 'pending_payment', createdAt: new Date(now).toISOString(), expiresAt,
        items: [{ id: 'giftcard', name: `${STORE.name} gift card`, size: `₹${total}`, qty: 1, price: total }],
        totals: { subtotal: total, discount: 0, bundleDiscount: 0, couponDiscount: 0, shipping: 0, codFee: 0, giftApplied: 0, total },
        customer: cust.data, giftcard: gcInput, payment: { method: 'online' }, razorpay: { orderId: rzp.id }, flags: [],
      });
      await store([['SET', ipHoldKey, id, 'EX', STORE.holdMinutes * 60]]).catch(() => {});
      return res.status(200).json({ orderId: id, number, razorpayOrderId: rzp.id, amount: rzp.amount, currency: 'INR', keyId: keyId(), testMode: isTestMode(), expiresAt, holdMinutes: STORE.holdMinutes });
    } catch (err) {
      log('checkout_error', { msg: err.message, kind: 'giftcard' });
      return res.status(502).json({ error: 'We could not start the payment. Please try again.' });
    }
  }

  /* ───── normal order ───── */
  let priced;
  try {
    priced = await priceOrder({ cart: body.cart, code: body.code, gift: body.gift, payment: wantsCod ? 'cod' : 'online', customer: cust.data, now });
  } catch (err) {
    log('checkout_blocked', { reason: 'pricing_error', msg: err.message });
    return res.status(503).json(UNAVAILABLE);
  }
  if (!priced.ok) return res.status(400).json({ error: priced.error });
  if (priced.promo && !priced.promo.ok) return res.status(400).json({ error: priced.promo.error, field: 'code' });
  if (priced.gift && !priced.gift.ok) return res.status(400).json({ error: priced.gift.error, field: 'gift' });
  const { totals, items } = priced;

  // The price the customer saw must be the price they pay: if it moved (a sale ended, a code ran out), tell them first.
  if (Number.isInteger(body.expectTotal) && body.expectTotal !== totals.total) {
    return res.status(409).json({ error: 'prices_changed', message: 'The price changed since you last looked. Please review your total.', totals });
  }
  if (!wantsCod && totals.total > 0 && !isConfigured()) return res.status(503).json(UNAVAILABLE);

  const promo = priced.promo?.ok && priced.promo.applied > 0 ? priced.promo : null;
  const gift = priced.gift?.ok && priced.gift.applied > 0 ? priced.gift : null;

  if (wantsCod) {
    try {
      const pk = custKeys(cust.data).find(k => k.startsWith('p:'));
      const [open] = pk ? await store([['HLEN', `codopen:${pk}`]]) : [0];
      if (Number(open) >= STORE.cod.maxOpenPerPhone) return res.status(409).json({ error: 'You already have cash-on-delivery orders on the way. Please pay online or wait until they arrive.' });
    } catch { return res.status(503).json(UNAVAILABLE); }
  }

  const claimed = { stock: false, promo: false, gift: false };
  const orderBase = {
    id, status: 'pending_payment', createdAt: new Date(now).toISOString(), expiresAt, items, totals, customer: cust.data, flags: [],
    ...(body.marketing === true ? { marketingOptIn: true } : {}),   // consent is recorded only once the order is really placed
    payment: { method: wantsCod ? 'cod' : 'online' },
    ...(promo ? { promo: { code: promo.code, kind: promo.kind, label: promo.label, ...(promo.referrerEmail ? { referrerEmail: promo.referrerEmail } : {}) } } : {}),
    ...(gift ? { gift: { code: gift.code, applied: gift.applied } } : {}),
    ...(priced.shipsBy ? { shipsBy: priced.shipsBy } : {}),
  };
  const unclaim = () => releaseClaims(orderBase).catch(() => {});

  try {
    const r = await reserve(id, items.map(i => ({ id: i.id, size: i.size, qty: i.qty })), now);
    if (!r.ok) {
      const name = items.find(l => l.id === r.id)?.name || 'An item';
      return res.status(409).json({
        error: r.available > 0 ? `Only ${r.available} left in size ${r.size} for ${name}. Please reduce the quantity.` : `${name} (size ${r.size}) just sold out.`,
        item: { id: r.id, size: r.size, available: r.available },
      });
    }
    claimed.stock = true;

    if (promo) {
      const p = await reservePromo({ code: promo.code, coupon: promo.coupon }, id, cust.data, expiresAt, now);
      if (!p.ok) { await unclaim(); return res.status(409).json({ error: p.reason, field: 'code' }); }
      claimed.promo = true;
    }
    if (gift) {
      const g = await reserveGift(gift.code, id, gift.applied, expiresAt, now);
      if (!g.ok) { await unclaim(); return res.status(409).json({ error: g.reason, field: 'gift' }); }
      claimed.gift = true;
    }

    const number = await nextOrderNumber();

    if (wantsCod) {                                               // no payment window: the order is placed now
      await insertOrder({ ...orderBase, number });        // stays pending until confirmCod places it
      const c = await confirmCod(id);
      if (!c.ok) throw new Error('cod_confirm_failed');
      log('checkout_cod', { total: totals.total, lines: items.length });
      return res.status(200).json({ orderId: id, number, cod: true, amountDue: totals.total });
    }

    if (totals.total === 0) {                                     // a gift card covers everything
      await insertOrder({ ...orderBase, number });
      const f = await finalizePaid(id, { paymentId: 'giftcard', source: 'giftcard' });
      if (!f.ok) throw new Error('gift_confirm_failed');
      log('checkout_giftcard_only', { lines: items.length });
      return res.status(200).json({ orderId: id, number, paid: true });
    }

    const rzp = await createRazorpayOrder({ amountPaise: totals.total * 100, receipt: number, notes: { orderId: id } });
    await insertOrder({ ...orderBase, number, razorpay: { orderId: rzp.id } });
    await store([['SET', ipHoldKey, id, 'EX', STORE.holdMinutes * 60]]).catch(() => {});
    log('checkout_created', { total: totals.total, lines: items.length });
    return res.status(200).json({
      orderId: id, number, razorpayOrderId: rzp.id, amount: rzp.amount, currency: 'INR',
      keyId: keyId(), testMode: isTestMode(), expiresAt, holdMinutes: STORE.holdMinutes,
    });
  } catch (err) {
    if (claimed.stock || claimed.promo || claimed.gift) await unclaim();
    log('checkout_error', { msg: err.message });
    return res.status(502).json({ error: 'We could not start the payment. Please try again.' });
  }
}
