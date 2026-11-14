import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import crypto from 'node:crypto';
import { Readable } from 'node:stream';
import { mockRes, mockReq } from './helpers.js';

const KEY_SECRET = 'test_key_secret_123';
const WH_SECRET = 'test_webhook_secret_456';
const ADMIN = 'a'.repeat(32);
const ENV_KEYS = ['VERCEL_ENV', 'NODE_ENV', 'UPSTASH_REDIS_REST_URL', 'UPSTASH_REDIS_REST_TOKEN', 'RAZORPAY_KEY_ID', 'RAZORPAY_KEY_SECRET',
  'RAZORPAY_WEBHOOK_SECRET', 'ADMIN_TOKEN', 'RESEND_API_KEY', 'ORDER_FROM_EMAIL', 'ORDER_NOTIFY_EMAIL', 'SITE_URL', 'ALLOWED_ORIGINS', 'RAZORPAY_API_BASE'];

const hmac = (secret, s) => crypto.createHmac('sha256', secret).update(s).digest('hex');
const customer = { name: 'Asha Rao', phone: '9876543210', email: 'asha@example.com', line1: '12 MG Road', city: 'Bengaluru', state: 'Karnataka', pincode: '560001' };

let fetchMock, rzpCount, emails;

async function setup(env = {}) {
  vi.resetModules();
  for (const k of ENV_KEYS) delete process.env[k];
  Object.assign(process.env, { RAZORPAY_KEY_ID: 'rzp_test_abc', RAZORPAY_KEY_SECRET: KEY_SECRET, RAZORPAY_WEBHOOK_SECRET: WH_SECRET, ADMIN_TOKEN: ADMIN }, env);
  for (const [k, v] of Object.entries(env)) if (v === null) delete process.env[k];
  const m = {
    create:  (await import('../api/checkout/create.js')).default,
    verify:  (await import('../api/checkout/verify.js')).default,
    cancel:  (await import('../api/checkout/cancel.js')).default,
    webhook: (await import('../api/razorpay-webhook.js')).default,
    order:   (await import('../api/order.js')).default,
    admin:   (await import('../api/admin/orders.js')).default,
    stockApi:(await import('../api/stock.js')).default,
    config:  (await import('../api/config.js')).default,
    notifyMe:(await import('../api/notify-me.js')).default,
    stock:   await import('../server/stock.js'),
    orders:  await import('../server/orders.js'),
  };
  return m;
}

let ipN = 0;
const freshIp = () => ({ 'x-vercel-forwarded-for': `198.51.100.${(ipN++ % 250) + 1}` });

async function call(handler, { method = 'POST', body, query, headers = {} } = {}) {
  const req = mockReq(body, { method, headers: { ...freshIp(), ...headers } });
  req.query = query || {};
  const res = mockRes();
  await handler(req, res);
  return res;
}

const cartOf = (...lines) => lines.map(([id, size, qty = 1]) => ({ id, size, qty }));
const TEE = 'own-sample-tee', PANTS = 'own-sample-pants', CAP = 'own-sample-cap';

beforeEach(() => {
  rzpCount = 0; emails = [];
  fetchMock = vi.fn(async (url, init) => {
    const u = String(url);
    if (u.includes('/v1/orders')) {
      const b = JSON.parse(init.body);
      rzpCount += 1;
      return { ok: true, status: 200, json: async () => ({ id: `order_TEST${rzpCount}`, amount: b.amount }) };
    }
    if (u.includes('api.resend.com')) { emails.push(JSON.parse(init.body)); return { ok: true, status: 200, json: async () => ({}) }; }
    throw new Error('unexpected fetch ' + u);
  });
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

async function placeOrder(m, cart = cartOf([TEE, 'M', 1]), cust = customer) {
  const res = await call(m.create, { body: { cart, customer: cust } });
  return res;
}
const pay = (m, c, secret = KEY_SECRET, paymentId = 'pay_TEST1') =>
  call(m.verify, { body: { orderId: c.orderId, razorpay_order_id: c.razorpayOrderId, razorpay_payment_id: paymentId, razorpay_signature: hmac(secret, `${c.razorpayOrderId}|${paymentId}`) } });

describe('checkout/create', () => {
  it('computes the amount on the server, ignoring any client price', async () => {
    const m = await setup();
    const res = await call(m.create, { body: { cart: [{ id: TEE, size: 'M', qty: 2, price: 1 }], customer, total: 1 } });
    expect(res.statusCode).toBe(200);
    expect(res.body.amount).toBe((1198 - 119) * 100);             // 2 items → 10% bundle discount (₹119), then ≥ ₹999 → free shipping
    const one = await call(m.create, { body: { cart: cartOf([TEE, 'S', 1]), customer } });
    expect(one.body.amount).toBe((599 + 79) * 100);               // under threshold → ₹79 shipping
  });
  it('rejects bad input without holding any stock', async () => {
    const m = await setup();
    const bad = [
      { cart: cartOf([TEE, 'XXL', 1]), customer },                          // size doesn't exist
      { cart: cartOf(['sw-001', 'M', 1]), customer },                       // affiliate product
      { cart: cartOf([TEE, 'M', 99]), customer },                           // qty over limit
      { cart: cartOf([TEE, 'M', 1], [TEE, 'M', 1]), customer },             // duplicate line
      { cart: [], customer },
      { cart: cartOf([TEE, 'M', 1]), customer: { ...customer, pincode: '12' } },
      { cart: cartOf([TEE, 'M', 1]), customer: { ...customer, phone: '12345' } },
      { cart: cartOf([TEE, 'M', 1]), customer: { ...customer, state: 'Atlantis' } },
    ];
    for (const b of bad) expect((await call(m.create, { body: b })).statusCode).toBe(400);
    expect((await m.stock.availability([TEE]))[TEE].M).toBe(8);
    expect(rzpCount).toBe(0);
  });
  it('holds stock while unpaid', async () => {
    const m = await setup();
    await placeOrder(m, cartOf([TEE, 'L', 3]));
    expect((await m.stock.availability([TEE]))[TEE].L).toBe(5);
  });
  it('never oversells the last units', async () => {
    const m = await setup();
    const results = await Promise.all(Array.from({ length: 6 }, () => placeOrder(m, cartOf([CAP, 'One size', 1]))));
    const ok = results.filter(r => r.statusCode === 200).length;
    expect(ok).toBeLessThanOrEqual(2);                       // only 2 caps exist
    expect(results.every(r => [200, 409].includes(r.statusCode))).toBe(true);
    const after = await m.stock.availability([CAP]);
    expect(after[CAP]['One size']).toBe(2 - ok);
  });
  it('sells out cleanly one at a time and says so', async () => {
    const m = await setup();
    expect((await placeOrder(m, cartOf([CAP, 'One size', 1]))).statusCode).toBe(200);
    expect((await placeOrder(m, cartOf([CAP, 'One size', 1]))).statusCode).toBe(200);
    const third = await placeOrder(m, cartOf([CAP, 'One size', 1]));
    expect(third.statusCode).toBe(409);
    expect(third.body.error).toMatch(/sold out/i);
  });
  it('tells the buyer how many are left when they ask for too many', async () => {
    const m = await setup();
    const r = await placeOrder(m, cartOf([CAP, 'One size', 3]));
    expect(r.statusCode).toBe(409);
    expect(r.body.error).toMatch(/Only 2 left/);
  });
  it('releases the hold if Razorpay fails', async () => {
    const m = await setup();
    fetchMock.mockImplementationOnce(async () => ({ ok: false, status: 500, json: async () => ({}) }));
    const r = await placeOrder(m, cartOf([TEE, 'M', 2]));
    expect(r.statusCode).toBe(502);
    expect((await m.stock.availability([TEE]))[TEE].M).toBe(8);
  });
  it('FAILS CLOSED without Razorpay keys, and in production without a store', async () => {
    let m = await setup({ RAZORPAY_KEY_ID: null, RAZORPAY_KEY_SECRET: null });
    expect((await placeOrder(m)).statusCode).toBe(503);
    m = await setup({ VERCEL_ENV: 'production' });                 // keys present, no Upstash
    expect((await placeOrder(m)).statusCode).toBe(503);
    expect(rzpCount).toBe(0);
  });
  it('refuses sample products when live keys are used', async () => {
    const m = await setup({ RAZORPAY_KEY_ID: 'rzp_live_xyz' });
    const r = await placeOrder(m);
    expect(r.statusCode).toBe(400);
    expect(r.body.error).toMatch(/not for sale/);
  });
  it('rejects cross-origin requests', async () => {
    const m = await setup({ VERCEL_ENV: 'production', UPSTASH_REDIS_REST_URL: 'https://u.example', UPSTASH_REDIS_REST_TOKEN: 't' });
    const req = mockReq({ cart: cartOf([TEE, 'M', 1]), customer }, { origin: 'https://evil.example' });
    const res = mockRes(); await m.create(req, res);
    expect(res.statusCode).toBe(403);
  });
  it('rate limits checkout creation per IP', async () => {
    const m = await setup();
    let last;
    for (let i = 0; i < 10; i++) last = await call(m.create, { body: { cart: cartOf([TEE, 'S', 1]), customer }, headers: { 'x-vercel-forwarded-for': '203.0.113.99' } });
    expect(last.statusCode).toBe(429);
  });
});

describe('checkout/verify', () => {
  it('rejects a forged signature and changes nothing', async () => {
    const m = await setup();
    const c = (await placeOrder(m)).body;
    const r = await pay(m, c, 'wrong-secret');
    expect(r.statusCode).toBe(400);
    expect((await m.orders.getOrder(c.orderId)).status).toBe('pending_payment');
  });
  it('rejects a payment id from a different Razorpay order', async () => {
    const m = await setup();
    const a = (await placeOrder(m)).body, b = (await placeOrder(m)).body;
    const res = await call(m.verify, { body: { orderId: a.orderId, razorpay_order_id: b.razorpayOrderId, razorpay_payment_id: 'pay_X', razorpay_signature: hmac(KEY_SECRET, `${b.razorpayOrderId}|pay_X`) } });
    expect(res.statusCode).toBe(400);
  });
  it('marks paid once, commits stock permanently, emails once', async () => {
    const m = await setup({ RESEND_API_KEY: 're_x', ORDER_FROM_EMAIL: 'shop@example.com', ORDER_NOTIFY_EMAIL: 'me@example.com' });
    const c = (await placeOrder(m, cartOf([TEE, 'M', 2]))).body;
    const r1 = await pay(m, c);
    expect(r1.statusCode).toBe(200);
    expect(r1.body.order.status).toBe('paid');
    const r2 = await pay(m, c);                                      // double click / retry
    expect(r2.statusCode).toBe(200);
    expect(emails).toHaveLength(2);                                  // customer + owner, once
    // sold, not merely held: survives hold expiry
    const later = await m.stock.availability([TEE], Date.now() + 3600_000);
    expect(later[TEE].M).toBe(6);
  });
  it('public order view hides phone, email and street address', async () => {
    const m = await setup();
    const c = (await placeOrder(m)).body;
    const res = await call(m.order, { method: 'GET', query: { id: c.orderId } });
    const text = JSON.stringify(res.body);
    expect(res.statusCode).toBe(200);
    expect(text).not.toMatch(/9876543210|asha@example|MG Road/);
    expect(res.body.order.city).toBe('Bengaluru');
  });
  it('order ids cannot be guessed or injected', async () => {
    const m = await setup();
    for (const id of ['', 'x', "' OR 1=1", '../../etc/passwd', 'A'.repeat(16)]) {
      expect((await call(m.order, { method: 'GET', query: { id } })).statusCode).toBe(404);
    }
  });
});

describe('holds and cancellation', () => {
  it('expired holds stop blocking other buyers', async () => {
    const m = await setup();
    await placeOrder(m, cartOf([CAP, 'One size', 2]));
    expect((await placeOrder(m, cartOf([CAP, 'One size', 1]))).statusCode).toBe(409);
    const later = await m.stock.reserve('someone-else', [{ id: CAP, size: 'One size', qty: 2 }], Date.now() + 20 * 60_000);
    expect(later.ok).toBe(true);
  });
  it('cancel frees the stock but never touches a paid order', async () => {
    const m = await setup();
    const c = (await placeOrder(m, cartOf([TEE, 'S', 2]))).body;
    expect((await call(m.cancel, { body: { orderId: c.orderId } })).body.status).toBe('cancelled');
    expect((await m.stock.availability([TEE]))[TEE].S).toBe(5);
    const p = (await placeOrder(m, cartOf([TEE, 'S', 1]))).body;
    await pay(m, p);
    expect((await call(m.cancel, { body: { orderId: p.orderId } })).body.status).toBe('paid');
  });
  it('flags (never drops) a payment that arrives after someone else took the stock', async () => {
    const m = await setup();
    const a = (await placeOrder(m, cartOf([CAP, 'One size', 2]))).body;
    await m.stock.release(a.orderId, [{ id: CAP, size: 'One size', qty: 2 }]);        // simulate A's hold expiring
    const b = (await placeOrder(m, cartOf([CAP, 'One size', 2]))).body;
    expect((await pay(m, b, KEY_SECRET, 'pay_B')).body.order.status).toBe('paid');
    const late = await pay(m, a, KEY_SECRET, 'pay_A');                               // A pays anyway
    expect(late.body.order.status).toBe('paid');
    const stored = await m.orders.getOrder(a.orderId);
    expect(stored.flags).toContain('oversold-needs-review');
  });
});

describe('razorpay webhook', () => {
  const wh = (m, payload, { secret = WH_SECRET, sig } = {}) => {
    const raw = JSON.stringify(payload);
    const req = Readable.from([Buffer.from(raw)]);
    req.method = 'POST';
    req.headers = { 'x-razorpay-signature': sig ?? hmac(secret, raw), host: 'shonowear.test' };
    const res = mockRes();
    return m.webhook(req, res).then(() => res);
  };
  const captured = (c, amount, id = 'pay_W1') => ({ event: 'payment.captured', payload: { payment: { entity: { id, order_id: c.razorpayOrderId, amount, status: 'captured', currency: 'INR' } } } });

  it('rejects a bad signature', async () => {
    const m = await setup();
    const c = (await placeOrder(m)).body;
    expect((await wh(m, captured(c, c.amount), { sig: 'deadbeef' })).statusCode).toBe(400);
    expect((await wh(m, captured(c, c.amount), { secret: 'other' })).statusCode).toBe(400);
    expect((await m.orders.getOrder(c.orderId)).status).toBe('pending_payment');
  });
  it('marks the order paid even if the customer closed the tab, and is idempotent', async () => {
    const m = await setup({ RESEND_API_KEY: 're_x', ORDER_FROM_EMAIL: 'shop@example.com' });
    const c = (await placeOrder(m, cartOf([TEE, 'XL', 1]))).body;
    expect((await wh(m, captured(c, c.amount))).statusCode).toBe(200);
    expect((await wh(m, captured(c, c.amount))).statusCode).toBe(200);
    expect((await m.orders.getOrder(c.orderId)).status).toBe('paid');
    expect(emails).toHaveLength(1);
  });
  it('ignores a payment whose amount does not match the order', async () => {
    const m = await setup();
    const c = (await placeOrder(m)).body;
    await wh(m, captured(c, 100));
    expect((await m.orders.getOrder(c.orderId)).status).toBe('pending_payment');
  });
  it('returns 200 for unknown orders and unrelated events (so Razorpay stops retrying)', async () => {
    const m = await setup();
    expect((await wh(m, captured({ razorpayOrderId: 'order_NOPE' }, 100))).statusCode).toBe(200);
    expect((await wh(m, { event: 'payment.failed', payload: {} })).statusCode).toBe(200);
  });
  it('checkout verify and webhook together still pay once', async () => {
    const m = await setup({ RESEND_API_KEY: 're_x', ORDER_FROM_EMAIL: 'shop@example.com' });
    const c = (await placeOrder(m, cartOf([TEE, 'L', 1]))).body;
    await Promise.all([pay(m, c), wh(m, captured(c, c.amount))]);
    expect(emails.length).toBeLessThanOrEqual(1);
    expect((await m.stock.availability([TEE], Date.now() + 3600_000))[TEE].L).toBe(7);
  });
});

describe('admin', () => {
  const auth = { authorization: `Bearer ${ADMIN}` };
  it('is closed without a long token, with a wrong token, and without one', async () => {
    let m = await setup({ ADMIN_TOKEN: 'short' });
    expect((await call(m.admin, { method: 'GET', headers: { authorization: 'Bearer short' } })).statusCode).toBe(503);
    m = await setup();
    expect((await call(m.admin, { method: 'GET' })).statusCode).toBe(401);
    expect((await call(m.admin, { method: 'GET', headers: { authorization: 'Bearer nope' } })).statusCode).toBe(401);
  });
  it('lists orders and enforces a sane status flow', async () => {
    const m = await setup();
    const c = (await placeOrder(m)).body;
    const list = await call(m.admin, { method: 'GET', headers: auth });
    expect(list.body.orders[0].customer.email).toBe('asha@example.com');
    const early = await call(m.admin, { body: { id: c.orderId, action: 'shipped' }, headers: auth });
    expect(early.statusCode).toBe(409);                                  // can't ship an unpaid order
    await pay(m, c);
    const shipped = await call(m.admin, { body: { id: c.orderId, action: 'shipped', courier: 'Delhivery', tracking: 'DL123' }, headers: auth });
    expect(shipped.body.order.shipment.tracking).toBe('DL123');
    expect((await call(m.admin, { body: { id: c.orderId, action: 'delivered' }, headers: auth })).body.order.status).toBe('delivered');
  });
  it('cannot ban brute force: too many guesses are throttled', async () => {
    const m = await setup();
    let last;
    for (let i = 0; i < 35; i++) last = await call(m.admin, { method: 'GET', headers: { 'x-vercel-forwarded-for': '203.0.113.50', authorization: 'Bearer x' + i } });
    expect(last.statusCode).toBe(429);
  });
});

describe('misc', () => {
  it('config reports checkout state without secrets', async () => {
    let m = await setup();
    let r = await call(m.config, { method: 'GET' });
    expect(r.body).toEqual({ checkoutEnabled: true, testMode: true, overrides: {} });
    m = await setup({ RAZORPAY_KEY_ID: null, RAZORPAY_KEY_SECRET: null });
    r = await call(m.config, { method: 'GET' });
    expect(r.body.checkoutEnabled).toBe(false);
    expect(JSON.stringify(r.body)).not.toMatch(/secret|rzp_/i);
  });
  it('stock endpoint only exposes own products and validates ids', async () => {
    const m = await setup();
    const r = await call(m.stockApi, { method: 'GET', query: { ids: `${TEE},sw-001,<script>` } });
    expect(Object.keys(r.body.stock)).toEqual([TEE]);
    expect((await call(m.stockApi, { method: 'GET', query: { ids: '' } })).statusCode).toBe(400);
  });
});

describe('review fixes (regressions)', () => {
  const auth = { authorization: `Bearer ${ADMIN}` };
  const MAIL = { RESEND_API_KEY: 're_x', ORDER_FROM_EMAIL: 'shop@example.com', ORDER_NOTIFY_EMAIL: 'me@example.com' };

  it('inherited property names are not valid sizes and cannot bypass stock', async () => {
    const m = await setup();
    for (const size of ['constructor', 'toString', '__proto__', 'hasOwnProperty']) {
      expect((await placeOrder(m, cartOf([TEE, size, 5]))).statusCode).toBe(400);
    }
    expect(m.stock.totalStock(TEE, 'constructor')).toBe(0);
  });

  it('a stale "expired"/"cancelled" write cannot hide a payment', async () => {
    const m = await setup();
    const c = (await placeOrder(m)).body;
    const stale = await m.orders.getOrder(c.orderId, { raw: true });      // a reader holding the old pending copy
    await pay(m, c);
    await m.orders.saveOrder({ ...stale, status: 'expired' });            // …writes it back after payment
    expect((await m.orders.getOrder(c.orderId)).status).toBe('paid');
    await m.orders.saveOrder({ ...stale, status: 'cancelled', cancelledBy: 'customer' });
    expect((await m.orders.getOrder(c.orderId)).status).toBe('paid');
    // and admin can still ship it
    expect((await call(m.admin, { body: { id: c.orderId, action: 'shipped' }, headers: auth })).statusCode).toBe(200);
  });

  it('a cancelled/refunded paid order is not resurrected by a replayed payment', async () => {
    const m = await setup(MAIL);
    const c = (await placeOrder(m)).body;
    await pay(m, c);
    expect((await call(m.admin, { body: { id: c.orderId, action: 'cancelled' }, headers: auth })).statusCode).toBe(200);
    await pay(m, c);                                                      // replay verify
    const hook = { event: 'payment.captured', payload: { payment: { entity: { id: 'pay_TEST1', order_id: c.razorpayOrderId, amount: c.amount, status: 'captured', currency: 'INR' } } } };
    const raw = JSON.stringify(hook);
    const r = mockReq(null, { method: 'POST', headers: { 'x-razorpay-signature': hmac(WH_SECRET, raw), 'content-type': 'application/json' } });
    r[Symbol.asyncIterator] = async function* () { yield Buffer.from(raw); };
    await m.webhook(r, mockRes());
    expect((await m.orders.getOrder(c.orderId)).status).toBe('cancelled');
    expect(emails).toHaveLength(2);                                       // customer + owner, once
  });

  it('a crash half-way through finalising is repaired by the retry', async () => {
    const m = await setup(MAIL);
    const c = (await placeOrder(m, cartOf([TEE, 'L', 2]))).body;
    // simulate: payment recorded, then the function died before stock/commit/save
    const { store } = await import('../server/guard.js');
    await store([['SET', `paid:${c.orderId}`, JSON.stringify({ paidAt: new Date().toISOString(), paymentId: 'pay_X' }), 'NX']]);
    const res = await pay(m, c, KEY_SECRET, 'pay_X');
    expect(res.statusCode).toBe(200);
    expect((await m.stock.availability([TEE]))[TEE].L).toBe(6);           // 8 - 2, counted exactly once
    await pay(m, c, KEY_SECRET, 'pay_X');
    expect((await m.stock.availability([TEE]))[TEE].L).toBe(6);
    expect(emails).toHaveLength(2);
  });

  it('webhook ignores events without a captured INR payment', async () => {
    const m = await setup();
    const c = (await placeOrder(m)).body;
    for (const payload of [{}, { payment: { entity: { id: 'p', order_id: c.razorpayOrderId, amount: c.amount, status: 'authorized', currency: 'INR' } } }]) {
      const raw = JSON.stringify({ event: 'order.paid', payload });
      const r = mockReq(null, { method: 'POST', headers: { 'x-razorpay-signature': hmac(WH_SECRET, raw) } });
      r[Symbol.asyncIterator] = async function* () { yield Buffer.from(raw); };
      const res = mockRes(); await m.webhook(r, res);
      expect(res.statusCode).toBe(200);
    }
    expect((await m.orders.getOrder(c.orderId)).status).toBe('pending_payment');
  });

  it('starting a new checkout frees the same visitor\'s previous unpaid hold', async () => {
    const m = await setup();
    const ip = { 'x-vercel-forwarded-for': '203.0.113.7' };
    await call(m.create, { body: { cart: cartOf([CAP, 'One size', 2]), customer }, headers: ip });
    const again = await call(m.create, { body: { cart: cartOf([CAP, 'One size', 2]), customer }, headers: ip });
    expect(again.statusCode).toBe(200);                                   // would be 409 if the first hold were kept
  });

  it('admin action names like __proto__ are rejected cleanly', async () => {
    const m = await setup();
    const c = (await placeOrder(m)).body;
    expect((await call(m.admin, { body: { id: c.orderId, action: '__proto__' }, headers: auth })).statusCode).toBe(409);
  });
});

describe('bundle discount', () => {
  it('is priced on the server: charged amount, order record and totals all agree', async () => {
    const m = await setup();
    const c = (await placeOrder(m, cartOf([TEE, 'M', 1], [PANTS, '32', 1]))).body;   // 599 + 1299 = 1898
    expect(c.amount).toBe((1898 - 189) * 100);                                       // floor(1898 * 10%) = 189
    const o = await m.orders.getOrder(c.orderId);
    expect(o.totals).toMatchObject({ subtotal: 1898, discount: 189, bundleDiscount: 189, couponDiscount: 0, shipping: 0, codFee: 0, giftApplied: 0, total: 1709 });
  });
  it('does not apply to a single item, and the shared function matches', async () => {
    const m = await setup();
    const c = (await placeOrder(m, cartOf([TEE, 'M', 1]))).body;
    expect((await m.orders.getOrder(c.orderId)).totals.discount).toBe(0);
    const { computeTotals, bundleGap } = await import('../src/lib/store.js');
    const { catalog } = await import('../src/data/catalog.js');
    const tee = catalog.find(p => p.id === TEE);
    expect(computeTotals([{ product: tee, qty: 1 }]).discount).toBe(0);
    expect(computeTotals([{ product: tee, qty: 3 }]).discount).toBe(179);            // floor(1797 * .1)
    expect(bundleGap(1)).toBe(1); expect(bundleGap(2)).toBe(0); expect(bundleGap(0)).toBe(0);
  });
  it('the webhook amount check uses the discounted total', async () => {
    const m = await setup();
    const c = (await placeOrder(m, cartOf([TEE, 'M', 2]))).body;
    const hook = (amount) => { const raw = JSON.stringify({ event: 'payment.captured', payload: { payment: { entity: { id: 'pay_B', order_id: c.razorpayOrderId, amount, status: 'captured', currency: 'INR' } } } });
      const r = mockReq(null, { method: 'POST', headers: { 'x-razorpay-signature': hmac(WH_SECRET, raw) } }); r[Symbol.asyncIterator] = async function* () { yield Buffer.from(raw); }; return r; };
    await m.webhook(hook(119800), mockRes());                                         // the undiscounted amount: must not pay
    expect((await m.orders.getOrder(c.orderId)).status).toBe('pending_payment');
    await m.webhook(hook(107900), mockRes());
    expect((await m.orders.getOrder(c.orderId)).status).toBe('paid');
  });
});

describe('waitlist and low-stock alerts', () => {
  const MAIL = { RESEND_API_KEY: 're_x', ORDER_FROM_EMAIL: 'shop@example.com', ORDER_NOTIFY_EMAIL: 'me@example.com', SITE_URL: 'https://shop.example.com' };
  const admin = { authorization: `Bearer ${ADMIN}` };
  const join = (m, body) => call(m.notifyMe, { body });

  it('only sold-out sizes accept sign-ups, with validation and a honeypot', async () => {
    const m = await setup(MAIL);
    expect((await join(m, { id: TEE, size: 'M', email: 'a@b.co' })).body.inStock).toBe(true);        // in stock: refused politely
    expect((await join(m, { id: TEE, size: '__proto__', email: 'a@b.co' })).statusCode).toBe(400);
    expect((await join(m, { id: 'nope', size: 'M', email: 'a@b.co' })).statusCode).toBe(400);
    expect((await join(m, { id: 'own-sample-tee-white', size: 'S', email: 'not-an-email' })).statusCode).toBe(400);
    expect((await join(m, { id: 'own-sample-tee-white', size: 'S', email: 'x@y.co', website: 'http://spam' })).statusCode).toBe(200);
    expect((await call(m.admin, { method: 'GET', query: { view: 'waitlist' }, headers: admin })).body.waitlist).toEqual([]);   // honeypot stored nothing
    expect((await join(m, { id: 'own-sample-tee-white', size: 'S', email: 'Real@Person.com' })).statusCode).toBe(200);
    expect((await join(m, { id: 'own-sample-tee-white', size: 'S', email: 'real@person.com' })).statusCode).toBe(200);          // duplicate: no error, no second row
    const list = (await call(m.admin, { method: 'GET', query: { view: 'waitlist' }, headers: admin })).body.waitlist;
    expect(list).toEqual([{ id: 'own-sample-tee-white', size: 'S', name: expect.any(String), count: 1 }]);
  });

  it('alerts go out only after a restock, once, and the list is cleared', async () => {
    const m = await setup(MAIL);
    const hold = (await placeOrder(m, cartOf([TEE, 'XL', 3]))).body;                  // all 3 XL held → sold out
    expect((await join(m, { id: TEE, size: 'XL', email: 'wait@me.co' })).statusCode).toBe(200);
    const early = await call(m.admin, { body: { action: 'notify-waitlist', productId: TEE, size: 'XL' }, headers: admin });
    expect(early.statusCode).toBe(409);                                               // still sold out
    expect(emails).toHaveLength(0);
    await call(m.cancel, { body: { orderId: hold.orderId } });                        // hold released = back in stock
    const ok = await call(m.admin, { body: { action: 'notify-waitlist', productId: TEE, size: 'XL' }, headers: admin });
    expect(ok.body).toMatchObject({ ok: true, sent: 1, remaining: 0 });
    expect(emails.map(e => e.to)).toEqual(['wait@me.co']);
    expect(emails[0].html).toContain('https://shop.example.com/product/' + TEE);
    const again = await call(m.admin, { body: { action: 'notify-waitlist', productId: TEE, size: 'XL' }, headers: admin });
    expect(again.body.sent).toBe(0);
  });

  it('the waitlist endpoints refuse strangers', async () => {
    const m = await setup(MAIL);
    expect((await call(m.admin, { method: 'GET', query: { view: 'waitlist' } })).statusCode).toBe(401);
    expect((await call(m.admin, { body: { action: 'notify-waitlist', productId: TEE, size: 'XL' } })).statusCode).toBe(401);
  });

  it('emails the owner once when a size runs low', async () => {
    const m = await setup(MAIL);
    const c = (await placeOrder(m, cartOf([TEE, 'XL', 2]))).body;                     // 3 → 1 left (threshold 2)
    await pay(m, c);
    const low = emails.filter(e => /Low stock/.test(e.subject));
    expect(low).toHaveLength(1);
    expect(low[0].to).toBe('me@example.com');
    const c2 = (await placeOrder(m, cartOf([TEE, 'XL', 1]))).body;                    // 1 → 0 left: already alerted this week
    await pay(m, c2);
    expect(emails.filter(e => /Low stock/.test(e.subject))).toHaveLength(1);
  });
});
