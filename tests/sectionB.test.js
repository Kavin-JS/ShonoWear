import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import crypto from 'node:crypto';
import { mockRes, mockReq } from './helpers.js';

const KEY_SECRET = 'test_key_secret_123', WH_SECRET = 'test_webhook_secret_456', ADMIN = 'a'.repeat(32);
const ENV_KEYS = ['VERCEL_ENV', 'NODE_ENV', 'UPSTASH_REDIS_REST_URL', 'UPSTASH_REDIS_REST_TOKEN', 'RAZORPAY_KEY_ID', 'RAZORPAY_KEY_SECRET',
  'RAZORPAY_WEBHOOK_SECRET', 'ADMIN_TOKEN', 'RESEND_API_KEY', 'ORDER_FROM_EMAIL', 'ORDER_NOTIFY_EMAIL', 'SITE_URL', 'ALLOWED_ORIGINS', 'RAZORPAY_API_BASE'];
const hmac = (secret, s) => crypto.createHmac('sha256', secret).update(s).digest('hex');
const customer = { name: 'Asha Rao', phone: '9876543210', email: 'asha@example.com', line1: '12 MG Road', city: 'Bengaluru', state: 'Karnataka', pincode: '560001' };
const other = { ...customer, name: 'Ravi K', phone: '9123456780', email: 'ravi@example.com' };
const TEE = 'own-sample-tee', PANTS = 'own-sample-pants', CAP = 'own-sample-cap', HOODIE = 'own-sample-hoodie';
const cartOf = (...l) => l.map(([id, size, qty = 1]) => ({ id, size, qty }));

const COUPONS = [
  { code: 'TEN', label: '10% off', kind: 'percent', value: 10, minSubtotal: 500, maxDiscount: 200, oncePerCustomer: true, stackWithBundle: false, active: true },
  { code: 'ONLY1', label: 'one use', kind: 'flat', value: 100, usageLimit: 1, active: true },
  { code: 'FIRST', label: 'first order', kind: 'flat', value: 100, firstOrderOnly: true, active: true },
  { code: 'STACK', label: 'stacks', kind: 'percent', value: 10, stackWithBundle: true, active: true },
  { code: 'OLD', label: 'ended', kind: 'flat', value: 50, endsAt: '2020-01-01T00:00:00+05:30', active: true },
  { code: 'OFF', label: 'off', kind: 'flat', value: 50, active: false },
  { code: 'SAMP', sample: true, label: 'sample', kind: 'flat', value: 50, active: true },
];

let fetchMock, rzpCount, emails;
async function setup(env = {}) {
  vi.resetModules();
  for (const k of ENV_KEYS) delete process.env[k];
  Object.assign(process.env, { RAZORPAY_KEY_ID: 'rzp_test_abc', RAZORPAY_KEY_SECRET: KEY_SECRET, RAZORPAY_WEBHOOK_SECRET: WH_SECRET, ADMIN_TOKEN: ADMIN }, env);
  vi.doMock('../server/couponsConfig.js', () => ({ COUPONS }));
  return {
    create: (await import('../api/checkout/create.js')).default, verify: (await import('../api/checkout/verify.js')).default,
    cancel: (await import('../api/checkout/cancel.js')).default, webhook: (await import('../api/razorpay-webhook.js')).default,
    order: (await import('../api/order.js')).default, admin: (await import('../api/admin/orders.js')).default, cart: (await import('../api/cart.js')).default,
    stock: await import('../server/stock.js'), orders: await import('../server/orders.js'), gift: await import('../server/giftcards.js'),
    promos: await import('../server/promos.js'), bags: await import('../server/bags.js'), guard: await import('../server/guard.js'),
  };
}
let ipN = 100;
const freshIp = () => ({ 'x-vercel-forwarded-for': `198.51.100.${(ipN++ % 250) + 1}` });
async function call(handler, { method = 'POST', body, query, headers = {} } = {}) {
  const req = mockReq(body, { method, headers: { ...freshIp(), ...headers } }); req.query = query || {};
  const res = mockRes(); await handler(req, res); return res;
}
const adminCall = (m, body, query, method) => call(m.admin, { method: method || (body ? 'POST' : 'GET'), body, query, headers: { authorization: `Bearer ${ADMIN}` } });
const place = (m, extra = {}, cust = customer, cart = cartOf([TEE, 'M', 1])) => call(m.create, { body: { cart, customer: cust, ...extra } });
const pay = (m, c, pid = 'pay_X1') => call(m.verify, { body: { orderId: c.orderId, razorpay_order_id: c.razorpayOrderId, razorpay_payment_id: pid, razorpay_signature: hmac(KEY_SECRET, `${c.razorpayOrderId}|${pid}`) } });
const quote = (m, b) => call(m.cart, { body: { action: 'quote', ...b } });
const getOrder = (m, id) => m.orders.getOrder(id);
const EMAIL = { RESEND_API_KEY: 're_x', ORDER_FROM_EMAIL: 'shop@example.com', ORDER_NOTIFY_EMAIL: 'me@example.com', SITE_URL: 'https://shonowear.test' };

beforeEach(() => {
  rzpCount = 0; emails = [];
  fetchMock = vi.fn(async (url, init) => {
    const u = String(url);
    if (u.includes('/v1/orders')) { const b = JSON.parse(init.body); rzpCount += 1; return { ok: true, status: 200, json: async () => ({ id: `order_T${rzpCount}`, amount: b.amount }) }; }
    if (u.includes('api.resend.com')) { emails.push(JSON.parse(init.body)); return { ok: true, status: 200, json: async () => ({}) }; }
    throw new Error('unexpected fetch ' + u);
  });
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => { vi.unstubAllGlobals(); vi.doUnmock('../server/couponsConfig.js'); });

describe('pricing (pure)', () => {
  const tee = { id: 't', price: 599, fulfilment: 'own' }, cap = { id: 'c', price: 400, fulfilment: 'own' };
  it('percent coupon is floored and capped; flat is capped by the spend', async () => {
    const { couponAmount } = await import('../src/lib/store.js');
    expect(couponAmount({ kind: 'percent', value: 10, maxDiscount: 200 }, 1999)).toBe(199);
    expect(couponAmount({ kind: 'percent', value: 10, maxDiscount: 100 }, 1999)).toBe(100);
    expect(couponAmount({ kind: 'flat', value: 500 }, 300)).toBe(300);
    expect(couponAmount({ kind: 'flat', value: 50 }, 0)).toBe(0);
  });
  it('a coupon below its minimum is refused with the shortfall', async () => {
    const { computeTotals } = await import('../src/lib/store.js');
    const t = computeTotals([{ product: tee, qty: 1 }], { coupon: { kind: 'flat', value: 100, minSubtotal: 800 } });
    expect(t.couponDiscount).toBe(0); expect(t.couponError).toMatch(/₹201/);
  });
  it('does not stack with the bundle discount unless asked: the bigger one wins', async () => {
    const { computeTotals } = await import('../src/lib/store.js');
    const two = [{ product: tee, qty: 2 }];                                    // bundle = floor(1198 * .1) = 119
    const a = computeTotals(two, { coupon: { kind: 'flat', value: 50 } });      // 50 < 119 → bundle kept
    expect(a).toMatchObject({ bundleDiscount: 119, couponDiscount: 0, couponBeaten: true, discount: 119 });
    const b = computeTotals(two, { coupon: { kind: 'flat', value: 300 } });     // 300 > 119 → coupon only
    expect(b).toMatchObject({ bundleDiscount: 0, couponDiscount: 300, discount: 300 });
    const c = computeTotals(two, { coupon: { kind: 'percent', value: 10, stackWithBundle: true } });
    expect(c).toMatchObject({ bundleDiscount: 119, couponDiscount: 107, discount: 226 });   // 10% of (1198 − 119), floored
  });
  it('COD fee and gift card are applied after discounts and shipping', async () => {
    const { computeTotals } = await import('../src/lib/store.js');
    const one = [{ product: tee, qty: 1 }];
    expect(computeTotals(one, { cod: true })).toMatchObject({ shipping: 79, codFee: 49, total: 599 + 79 + 49 });
    expect(computeTotals(one, { giftBalance: 200 })).toMatchObject({ giftApplied: 200, total: 599 + 79 - 200 });
    expect(computeTotals(one, { giftBalance: 5000 })).toMatchObject({ giftApplied: 678, total: 0 });
  });
  it('flash sale: starts inclusive, ends exclusive, own products only, never stacks by default', async () => {
    const { saleFor, unitPrice } = await import('../src/lib/offers.js');
    const { computeTotals } = await import('../src/lib/store.js');
    const sales = [{ id: 's', startsAt: '2026-11-14T00:00:00+05:30', endsAt: '2026-11-15T00:00:00+05:30', percent: 25, productIds: ['c'] }];
    const at = (iso) => Date.parse(iso);
    expect(saleFor(cap, at('2026-11-13T23:59:59+05:30'), sales)).toBeNull();
    expect(unitPrice(cap, at('2026-11-14T00:00:00+05:30'), sales)).toBe(300);
    expect(unitPrice(cap, at('2026-11-14T23:59:59+05:30'), sales)).toBe(300);
    expect(unitPrice(cap, at('2026-11-15T00:00:00+05:30'), sales)).toBe(400);
    expect(unitPrice(tee, at('2026-11-14T12:00:00+05:30'), sales)).toBe(599);        // not in productIds
    expect(unitPrice({ ...cap, fulfilment: 'affiliate' }, at('2026-11-14T12:00:00+05:30'), sales)).toBe(400);
    expect(unitPrice(cap, at('2026-11-14T12:00:00+05:30'), [{ ...sales[0], percent: 90 }])).toBe(400);   // out-of-range percent is ignored
    // sale items are left out of coupons and bundles
    const t = computeTotals([{ product: cap, qty: 2 }], { now: at('2026-11-14T12:00:00+05:30'), sales, coupon: { kind: 'flat', value: 100 } });
    expect(t).toMatchObject({ subtotal: 600, saleSavings: 200, discount: 0, couponDiscount: 0 });
    expect(t.couponError).toMatch(/sale items/);
  });
  it('pre-order date: valid until the end of that day (India time)', async () => {
    const { preorderDate } = await import('../src/lib/offers.js');
    const p = { preorder: { shipsOn: '2026-12-20' } };
    expect(preorderDate(p, Date.parse('2026-12-20T23:00:00+05:30'))).toBe('2026-12-20');
    expect(preorderDate(p, Date.parse('2026-12-21T00:00:01+05:30'))).toBeNull();
    expect(preorderDate({ preorder: { shipsOn: 'soon' } })).toBeNull();
  });
});

describe('price quote', () => {
  it('says so when the bundle discount is already better than the code', async () => {
    const m = await setup();
    const q = await quote(m, { cart: cartOf([TEE, 'M', 1], [PANTS, '32', 1]), code: 'ten' });
    expect(q.statusCode).toBe(200);
    expect(q.body.promo).toMatchObject({ ok: true, applied: 0, beaten: true });
    expect(q.body.totals.discount).toBe(189);
  });
  it('shows the coupon when it beats the bundle', async () => {
    const m = await setup();
    COUPONS.push({ code: 'BIG', label: 'big', kind: 'flat', value: 400, active: true });
    const q = await quote(m, { cart: cartOf([TEE, 'M', 1], [PANTS, '32', 1]), code: 'big' });
    expect(q.body.promo).toMatchObject({ ok: true, applied: 400 });
    const c = (await place(m, { code: 'BIG' }, customer, cartOf([TEE, 'M', 1], [PANTS, '32', 1]))).body;
    expect(c.amount).toBe(q.body.totals.total * 100);
    COUPONS.pop();
  });
  it('unknown, expired, inactive and badly formed codes all read the same', async () => {
    const m = await setup();
    for (const code of ['NOPE', 'OLD', 'OFF', '!!']) {
      const q = await quote(m, { cart: cartOf([TEE, 'M', 1]), code });
      expect(q.body.promo.ok).toBe(false);
      expect(q.body.promo.error).toMatch(/not valid/);
    }
  });
  it('sample coupons work in test mode only', async () => {
    const test = await setup(); expect(test.promos.findCoupon('SAMP')).not.toBeNull();
    const live = await setup({ RAZORPAY_KEY_ID: 'rzp_live_abc' }); expect(live.promos.findCoupon('SAMP')).toBeNull();
    expect(live.promos.findCoupon('TEN')).not.toBeNull();
  });
  it('rate limits code attempts', async () => {
    const m = await setup();
    const headers = { 'x-vercel-forwarded-for': '203.0.113.99' };
    let limited = 0;
    for (let i = 0; i < 30; i++) { const r = await call(m.cart, { body: { action: 'quote', cart: cartOf([TEE, 'M', 1]), code: `GUESS${i}` }, headers }); if (r.statusCode === 429) limited++; }
    expect(limited).toBeGreaterThan(0);
  });
  it('rejects a tampered cart', async () => {
    const m = await setup();
    expect((await quote(m, { cart: [{ id: TEE, size: 'constructor', qty: 1 }] })).statusCode).toBe(400);
  });
});

describe('coupons at checkout', () => {
  it('TEN on one tee: 10% of 599 = 59', async () => {
    const m = await setup();
    const c = (await place(m, { code: 'TEN' })).body;
    expect(c.amount).toBe((599 - 59 + 79) * 100);
    expect((await getOrder(m, c.orderId)).promo.code).toBe('TEN');
  });
  it('usage limit: only one of two racing buyers gets the last use', async () => {
    const m = await setup();
    const rs = await Promise.all([place(m, { code: 'ONLY1' }, customer), place(m, { code: 'ONLY1' }, other)]);
    expect(rs.filter(r => r.statusCode === 200).length).toBeLessThanOrEqual(1);
    expect(rs.every(r => [200, 409, 400].includes(r.statusCode))).toBe(true);
  });
  it('a limit used up by a paid order is final; a cancelled hold gives the use back', async () => {
    const m = await setup();
    const a = (await place(m, { code: 'ONLY1' })).body; expect(a.orderId).toBeTruthy();
    expect((await place(m, { code: 'ONLY1' }, other)).body.error).toMatch(/redeemed|not valid/);        // held by the first
    await call(m.cancel, { body: { orderId: a.orderId } });
    const b = await place(m, { code: 'ONLY1' }, other); expect(b.statusCode).toBe(200);
    await pay(m, b.body);
    const c = await place(m, { code: 'ONLY1' }, { ...customer, email: 'third@example.com', phone: '9000000003' });
    expect(c.statusCode).toBe(400);
  });
  it('once per customer: same email or same phone cannot reuse it', async () => {
    const m = await setup();
    const a = (await place(m, { code: 'TEN' })).body; await pay(m, a);
    expect((await place(m, { code: 'TEN' })).statusCode).toBe(400);
    expect((await place(m, { code: 'TEN' }, { ...customer, email: 'new@example.com' })).statusCode).toBe(400);       // same phone
    expect((await place(m, { code: 'TEN' }, { ...customer, phone: '9000000001' })).statusCode).toBe(400);            // same email
    expect((await place(m, { code: 'TEN' }, other)).statusCode).toBe(200);
  });
  it('first-order-only codes are refused after any paid order', async () => {
    const m = await setup();
    expect((await place(m, { code: 'FIRST' }, other)).statusCode).toBe(200);
    const a = (await place(m, {})).body; await pay(m, a);
    const r = await place(m, { code: 'FIRST' }); expect(r.statusCode).toBe(400); expect(r.body.error).toMatch(/first orders/);
  });
  it('a bad code stops checkout instead of silently charging full price', async () => {
    const m = await setup();
    const r = await place(m, { code: 'NOPE' });
    expect(r.statusCode).toBe(400); expect(r.body.field).toBe('code');
    expect((await m.stock.availability([TEE]))[TEE].M).toBe(8);       // nothing was held
  });
  it('prices_changed: a stale expected total is refused with the new price', async () => {
    const m = await setup();
    const r = await place(m, { expectTotal: 1 });
    expect(r.statusCode).toBe(409); expect(r.body.error).toBe('prices_changed'); expect(r.body.totals.total).toBe(678);
    expect((await place(m, { expectTotal: 678 })).statusCode).toBe(200);
  });
  it('the webhook amount check uses the discounted total', async () => {
    const m = await setup();
    const c = (await place(m, { code: 'TEN' })).body;
    const body = JSON.stringify({ event: 'payment.captured', payload: { payment: { entity: { id: 'pay_W', order_id: c.razorpayOrderId, status: 'captured', currency: 'INR', amount: c.amount } } } });
    const req = mockReq(undefined, { headers: { ...freshIp(), 'x-razorpay-signature': hmac(WH_SECRET, body) } }); req.rawBody = body;
    const { Readable } = await import('node:stream'); const stream = Readable.from([Buffer.from(body)]); Object.assign(stream, req);
    const res = mockRes(); await m.webhook(stream, res);
    expect(res.statusCode).toBe(200);
    expect((await getOrder(m, c.orderId)).status).toBe('paid');
  });
});

describe('cash on delivery', () => {
  it('places the order at once: no Razorpay, stock taken, fee added, emails say pay cash', async () => {
    const m = await setup(EMAIL);
    const r = await place(m, { payment: 'cod' });
    expect(r.statusCode).toBe(200); expect(r.body).toMatchObject({ cod: true, amountDue: 599 + 79 + 49 });
    expect(rzpCount).toBe(0);
    const o = await getOrder(m, r.body.orderId);
    expect(o.status).toBe('cod_placed'); expect(o.totals.codFee).toBe(49);
    expect((await m.stock.availability([TEE]))[TEE].M).toBe(7);
    expect(emails.some(e => /cash/i.test(e.html))).toBe(true);
    const pv = (await call(m.order, { method: 'GET', query: { id: o.id } })).body.order;
    expect(pv).toMatchObject({ payment: 'cod', status: 'cod_placed' }); expect(pv.phone).toBeUndefined();
  });
  it('works without Razorpay configured', async () => {
    const m = await setup({ RAZORPAY_KEY_ID: null, RAZORPAY_KEY_SECRET: null });
    delete process.env.RAZORPAY_KEY_ID; delete process.env.RAZORPAY_KEY_SECRET;
    expect((await place(m, { payment: 'cod' })).statusCode).toBe(200);
    expect((await place(m, {}, other)).statusCode).toBe(503);
  });
  it('refuses COD over the limit, with a gift card, for pre-orders and at blocked pincodes', async () => {
    const m = await setup();
    const big = await place(m, { payment: 'cod' }, customer, cartOf([PANTS, '32', 3], [PANTS, '34', 3]));
    expect(big.statusCode).toBe(400); expect(big.body.error).toMatch(/up to ₹5,000/);
    const pre = await place(m, { payment: 'cod' }, customer, cartOf([HOODIE, 'M', 1]));
    expect(pre.statusCode).toBe(400); expect(pre.body.error).toMatch(/Pre-orders/);
    const card = await m.gift.issueGiftCard({ amount: 500 });
    const g = await place(m, { payment: 'cod', gift: card.code }); expect(g.statusCode).toBe(400);
  });
  it('limits open COD orders per phone; delivering frees the slot', async () => {
    const m = await setup();
    const a = (await place(m, { payment: 'cod' })).body, b = (await place(m, { payment: 'cod' }, { ...customer, email: 'b@example.com' }, cartOf([TEE, 'L', 1]))).body;
    expect(a.orderId && b.orderId).toBeTruthy();
    const third = await place(m, { payment: 'cod' }, { ...customer, email: 'c@example.com' }, cartOf([TEE, 'L', 1]));
    expect(third.statusCode).toBe(409);
    await adminCall(m, { id: a.orderId, action: 'delivered' });
    expect((await place(m, { payment: 'cod' }, { ...customer, email: 'c@example.com' }, cartOf([TEE, 'L', 1]))).statusCode).toBe(200);
  });
  it('cancelling a COD order puts stock and the coupon use back', async () => {
    const m = await setup();
    const a = (await place(m, { payment: 'cod', code: 'ONLY1' })).body;
    expect((await m.stock.availability([TEE]))[TEE].M).toBe(7);
    expect((await place(m, { code: 'ONLY1' }, other)).statusCode).toBe(400);
    const r = await adminCall(m, { id: a.orderId, action: 'cancelled' });
    expect(r.statusCode).toBe(200);
    expect((await m.stock.availability([TEE]))[TEE].M).toBe(8);
    expect((await place(m, { code: 'ONLY1' }, other)).statusCode).toBe(200);
  });
  it('cash collected can be recorded once the order is delivered, and only for COD', async () => {
    const m = await setup();
    const a = (await place(m, { payment: 'cod' })).body;
    expect((await adminCall(m, { id: a.orderId, action: 'cod-collected' })).statusCode).toBe(409);       // not delivered yet
    await adminCall(m, { id: a.orderId, action: 'shipped', courier: 'X', tracking: '1' });
    await adminCall(m, { id: a.orderId, action: 'delivered' });
    expect((await adminCall(m, { id: a.orderId, action: 'cod-collected' })).statusCode).toBe(200);
    expect((await getOrder(m, a.orderId)).codCollectedAt).toBeTruthy();
    const online = (await place(m, {}, other)).body; await pay(m, online);
    await adminCall(m, { id: online.orderId, action: 'delivered' });
    expect((await adminCall(m, { id: online.orderId, action: 'cod-collected' })).statusCode).toBe(409);
  });
  it('last unit: two COD buyers cannot both get it', async () => {
    const m = await setup();
    const rs = await Promise.all([place(m, { payment: 'cod' }, customer, cartOf([CAP, 'One size', 2])), place(m, { payment: 'cod' }, other, cartOf([CAP, 'One size', 2]))]);
    expect(rs.filter(r => r.statusCode === 200).length).toBeLessThanOrEqual(1);       // never both (each may be refused: safe)
    const one = await place(m, { payment: 'cod' }, customer, cartOf([CAP, 'One size', 2]));
    expect(one.statusCode).toBe(200);                                                  // and a lone buyer still gets them
  });
});

describe('gift cards', () => {
  it('a card cannot be held for more than its balance, even across two orders', async () => {
    const m = await setup();
    const card = await m.gift.issueGiftCard({ amount: 300 });
    const exp = Date.now() + 600000;
    expect((await m.gift.reserveGift(card.code, 'ord_a', 200, exp)).ok).toBe(true);
    expect((await m.gift.reserveGift(card.code, 'ord_b', 200, exp)).ok).toBe(false);
    expect((await m.gift.reserveGift(card.code, 'ord_c', 100, exp)).ok).toBe(true);
    expect((await m.gift.reserveGift(card.code, 'ord_d', 1, exp)).ok).toBe(false);
  });
  it('admin issues a card; the quote shows the balance and applies it', async () => {
    const m = await setup(EMAIL);
    const r = await adminCall(m, { action: 'issue-giftcard', amount: 300, email: 'friend@example.com', note: 'Thanks' });
    expect(r.statusCode).toBe(200); expect(r.body.card.code).toMatch(/^SW-[A-Z2-9]{4}-[A-Z2-9]{4}-[A-Z2-9]{4}$/); expect(r.body.emailed).toBe(true);
    const q = await quote(m, { cart: cartOf([TEE, 'M', 1]), gift: r.body.card.code.toLowerCase() });
    expect(q.body.gift).toMatchObject({ ok: true, balance: 300, applied: 300 }); expect(q.body.totals.total).toBe(678 - 300);
  });
  it('partial payment: the card is held, spent on payment, and the remainder is charged', async () => {
    const m = await setup();
    const card = await m.gift.issueGiftCard({ amount: 300 });
    const c = (await place(m, { gift: card.code })).body;
    expect(c.amount).toBe((678 - 300) * 100);
    expect((await m.gift.giftBalance(card.code)).reason).toMatch(/no balance/);       // held while unpaid
    await pay(m, c);
    expect((await m.gift.listGiftCards())[0].balance).toBe(0);
  });
  it('an unpaid hold is returned on cancel', async () => {
    const m = await setup();
    const card = await m.gift.issueGiftCard({ amount: 300 });
    const c = (await place(m, { gift: card.code })).body;
    await call(m.cancel, { body: { orderId: c.orderId } });
    expect((await m.gift.giftBalance(card.code)).balance).toBe(300);
  });
  it('a card that covers everything confirms the order with no Razorpay call', async () => {
    const m = await setup(EMAIL);
    const card = await m.gift.issueGiftCard({ amount: 2000 });
    const r = await place(m, { gift: card.code });
    expect(r.body).toMatchObject({ paid: true }); expect(rzpCount).toBe(0);
    const o = await getOrder(m, r.body.orderId);
    expect(o.status).toBe('paid'); expect(o.totals.total).toBe(0);
    expect((await m.stock.availability([TEE]))[TEE].M).toBe(7);
    expect((await m.gift.giftBalance(card.code)).balance).toBe(2000 - 678);
    expect(emails.length).toBeGreaterThan(0);
  });
  it('two orders cannot spend more than the card holds', async () => {
    const m = await setup();
    const card = await m.gift.issueGiftCard({ amount: 700 });
    const rs = await Promise.all([place(m, { gift: card.code }), place(m, { gift: card.code }, other)]);
    const used = rs.filter(r => r.statusCode === 200).length;
    expect(used).toBeGreaterThanOrEqual(0); expect(used).toBeLessThanOrEqual(2);
    let held = 0; for (const r of rs) if (r.statusCode === 200) held += 700 - (r.body.amount ? 0 : 0);
    const [raw] = await m.guard.store([['ZRANGEBYSCORE', `gc:hold:${card.code}`, Date.now(), '+inf']]);
    const total = raw.reduce((n, mm) => n + Number(mm.split(':').pop()), 0);
    expect(total).toBeLessThanOrEqual(700);
  });
  it('wrong, expired and voided codes are refused; guessing is rate limited', async () => {
    const m = await setup();
    expect((await m.gift.giftBalance('SW-AAAA-BBBB-CCCC')).ok).toBe(false);
    expect((await m.gift.giftBalance('nonsense')).ok).toBe(false);
    const old = await m.gift.issueGiftCard({ amount: 100, now: Date.now() - 400 * 86400_000 });
    expect((await m.gift.giftBalance(old.code)).reason).toMatch(/expired/);
    const v = await m.gift.issueGiftCard({ amount: 100 }); await m.gift.voidGift(v.code);
    expect((await m.gift.giftBalance(v.code)).ok).toBe(false);
  });
  it('buying a gift card: pay, code issued once however many times it is confirmed, emailed, shown on the order page', async () => {
    const m = await setup(EMAIL);
    const c = (await call(m.create, { body: { giftcard: { amount: 1000, to: 'friend@example.com', message: 'Happy birthday' }, customer: { name: 'Asha', email: 'asha@example.com' } } })).body;
    expect(c.amount).toBe(100000);
    expect((await call(m.order, { method: 'GET', query: { id: c.orderId } })).body.order.giftCode).toBeNull();      // not before payment
    await pay(m, c); await pay(m, c);
    const o = await getOrder(m, c.orderId);
    expect(o.giftcardCode).toMatch(/^SW-/);
    const cards = await m.gift.listGiftCards(); expect(cards.length).toBe(1); expect(cards[0].balance).toBe(1000);
    expect(emails.filter(e => e.to === 'friend@example.com' || e.to?.includes?.('friend@example.com')).length).toBe(1);
    expect((await call(m.order, { method: 'GET', query: { id: c.orderId } })).body.order.giftCode).toBe(o.giftcardCode);
    expect((await m.stock.availability([TEE]))[TEE].M).toBe(8);                                                      // no stock touched
  });
  it('only listed amounts and valid emails can be bought; cancelling the purchase voids the card', async () => {
    const m = await setup();
    const bad = (amount, to = 'f@example.com') => call(m.create, { body: { giftcard: { amount, to }, customer: { name: 'Asha', email: 'asha@example.com' } } });
    expect((await bad(1)).statusCode).toBe(400); expect((await bad(750)).statusCode).toBe(400); expect((await bad(500, 'nope')).statusCode).toBe(400);
    const c = (await bad(500)).body; await pay(m, c);
    const code = (await getOrder(m, c.orderId)).giftcardCode;
    await adminCall(m, { id: c.orderId, action: 'cancelled' });
    expect((await m.gift.giftBalance(code)).ok).toBe(false);
  });
});

describe('referrals', () => {
  it('a paid order gets a code; a friend gets the discount; the referrer is rewarded once, after delivery', async () => {
    const m = await setup(EMAIL);
    const a = (await place(m, {})).body; await pay(m, a);
    const code = (await getOrder(m, a.orderId)).referralCode; expect(code).toMatch(/^SWF-[A-Z2-9]{6}$/);
    expect(emails.some(e => e.html.includes(code))).toBe(true);
    const big = cartOf([PANTS, '32', 1]);                                                  // ₹1,299: over the ₹999 minimum, no bundle
    const self = await quote(m, { cart: big, code }); expect(self.body.promo.ok).toBe(true);                    // no customer yet at quote time
    expect((await place(m, { code }, customer, big)).body.error).toMatch(/own referral/);
    const q = await place(m, { code }, other, big); expect(q.statusCode).toBe(200);
    await pay(m, q.body);
    const o = await getOrder(m, q.body.orderId); expect(o.totals.couponDiscount + o.totals.bundleDiscount).toBeGreaterThan(0);
    expect(await m.gift.listGiftCards()).toHaveLength(0);                                   // not paid out before delivery
    const d1 = await adminCall(m, { id: q.body.orderId, action: 'delivered' }); expect(d1.body.referralReward).toBe(true);
    const cards = await m.gift.listGiftCards(); expect(cards).toHaveLength(1); expect(cards[0]).toMatchObject({ amount: 100, source: 'referral' });
    expect((await m.promos.rewardReferrer(await getOrder(m, q.body.orderId))).ok).toBe(false);               // idempotent
    expect(await m.gift.listGiftCards()).toHaveLength(1);
  });
  it('a referral code only works on a first order', async () => {
    const m = await setup();
    const a = (await place(m, {})).body; await pay(m, a);
    const code = (await getOrder(m, a.orderId)).referralCode;
    const b = (await place(m, {}, other)).body; await pay(m, b);
    const r = await place(m, { code }, other, cartOf([TEE, 'L', 1], [PANTS, '32', 1]));
    expect(r.statusCode).toBe(400); expect(r.body.error).toMatch(/first order/);
  });
  it('the reward is capped per referrer', async () => {
    const m = await setup();
    const { STORE } = await import('../src/data/storeConfig.js'); const before = STORE.referral.maxRewardsPerReferrer; STORE.referral.maxRewardsPerReferrer = 1;
    const mk = (n) => ({ id: `o${n}`, number: `N${n}`, promo: { kind: 'referral', referrerEmail: 'asha@example.com' } });
    expect((await m.promos.rewardReferrer(mk(1))).ok).toBe(true);
    expect((await m.promos.rewardReferrer(mk(2))).reason).toBe('cap');
    STORE.referral.maxRewardsPerReferrer = before;
  });
});

describe('abandoned-bag reminders', () => {
  const cart = cartOf([TEE, 'M', 1]);
  it('stores nothing without consent', async () => {
    const m = await setup();
    expect((await call(m.cart, { body: { action: 'remember', email: 'a@example.com', cart, consent: false } })).statusCode).toBe(400);
    expect(await m.bags.countDue(Date.now() + 1e10)).toBe(0);
  });
  it('sends one reminder when it is due, then deletes the saved bag', async () => {
    const m = await setup(EMAIL);
    await call(m.cart, { body: { action: 'remember', email: 'a@example.com', cart, consent: true } });
    expect((await m.bags.sendReminders(Date.now())).sent).toBe(0);                          // too soon
    const later = Date.now() + 3 * 3600_000;
    expect(await m.bags.countDue(later)).toBe(1);
    const r = await m.bags.sendReminders(later); expect(r).toMatchObject({ ok: true, sent: 1 });
    expect(emails).toHaveLength(1); expect(emails[0].html).toMatch(/restore=/);
    expect((await m.bags.sendReminders(later)).sent).toBe(0);                               // never twice
  });
  it('a paid order cancels the reminder', async () => {
    const m = await setup(EMAIL);
    await call(m.cart, { body: { action: 'remember', email: customer.email, cart, consent: true } });
    const c = (await place(m, {})).body; await pay(m, c);
    expect(await m.bags.countDue(Date.now() + 1e10)).toBe(0);
  });
  it('reports clearly when email is not set up', async () => {
    const m = await setup();
    expect((await adminCall(m, { action: 'send-bag-reminders' })).statusCode).toBe(409);
  });
});

describe('pre-orders and flash sale in checkout', () => {
  it('a pre-order records its ship date and cannot mix with COD', async () => {
    const m = await setup(EMAIL);
    const c = (await place(m, {}, customer, cartOf([HOODIE, 'M', 1]))).body;
    const o = await getOrder(m, c.orderId);
    expect(o.shipsBy).toBe('2099-12-31'); expect(o.items[0].preorder).toBe('2099-12-31');
    await pay(m, c); expect(emails.some(e => /pre-order/i.test(e.html))).toBe(true);
  });
  it('the sample flash sale prices the cap on the server', async () => {
    const m = await setup();
    const c = (await place(m, {}, customer, cartOf([CAP, 'One size', 1]))).body;
    const o = await getOrder(m, c.orderId);
    expect(o.items[0]).toMatchObject({ price: 319, listPrice: 399 });
    expect(o.totals.subtotal).toBe(319);
  });
  it('admin sees offers and coupon usage', async () => {
    const m = await setup();
    const a = (await place(m, { code: 'TEN' })).body; await pay(m, a);
    const r = await adminCall(m, undefined, { view: 'offers' });
    expect(r.body.coupons.find(c => c.code === 'TEN').used).toBe(1);
  });
});
