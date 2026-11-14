import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import crypto from 'node:crypto';
import { mockRes, mockReq } from './helpers.js';

const KEY_SECRET = 'test_key_secret_123', WH_SECRET = 'test_webhook_secret_456', ADMIN = 'a'.repeat(32);
const ENV_KEYS = ['VERCEL_ENV', 'NODE_ENV', 'UPSTASH_REDIS_REST_URL', 'UPSTASH_REDIS_REST_TOKEN', 'RAZORPAY_KEY_ID', 'RAZORPAY_KEY_SECRET',
  'RAZORPAY_WEBHOOK_SECRET', 'ADMIN_TOKEN', 'RESEND_API_KEY', 'ORDER_FROM_EMAIL', 'ORDER_NOTIFY_EMAIL', 'SITE_URL', 'ALLOWED_ORIGINS', 'RAZORPAY_API_BASE'];
const hmac = (secret, s) => crypto.createHmac('sha256', secret).update(s).digest('hex');
const customer = { name: 'Asha Rao', phone: '9876543210', email: 'asha@example.com', line1: '12 MG Road', city: 'Bengaluru', state: 'Karnataka', pincode: '560001' };
const other = { ...customer, name: 'Ravi K', phone: '9123456780', email: 'ravi@example.com' };
const TEE = 'own-sample-tee', PANTS = 'own-sample-pants';
const cartOf = (...l) => l.map(([id, size, qty = 1]) => ({ id, size, qty }));
const EMAIL = { RESEND_API_KEY: 're_x', ORDER_FROM_EMAIL: 'shop@example.com', ORDER_NOTIFY_EMAIL: 'me@example.com', SITE_URL: 'https://shonowear.test' };

let emails, rzpCount;
async function setup(env = {}) {
  vi.resetModules();
  for (const k of ENV_KEYS) delete process.env[k];
  Object.assign(process.env, { RAZORPAY_KEY_ID: 'rzp_test_abc', RAZORPAY_KEY_SECRET: KEY_SECRET, RAZORPAY_WEBHOOK_SECRET: WH_SECRET, ADMIN_TOKEN: ADMIN }, env);
  return {
    create: (await import('../api/checkout/create.js')).default, verify: (await import('../api/checkout/verify.js')).default,
    admin: (await import('../api/admin/orders.js')).default, account: (await import('../api/account.js')).default,
    orders: await import('../server/orders.js'), accounts: await import('../server/accounts.js'), returns: await import('../server/returns.js'),
  };
}
let ipN = 10;
const freshIp = () => ({ 'x-vercel-forwarded-for': `198.51.100.${(ipN++ % 250) + 1}` });
async function call(handler, { method = 'POST', body, query, headers = {}, ip = true } = {}) {
  const req = mockReq(body, { method, headers: { ...(ip ? freshIp() : {}), ...headers } }); req.query = query || {};
  const res = mockRes(); await handler(req, res); return res;
}
const adminCall = (m, body, query, method) => call(m.admin, { method: method || (body ? 'POST' : 'GET'), body, query, headers: { authorization: `Bearer ${ADMIN}` } });
const acct = (m, body, cookie) => call(m.account, { body, headers: cookie ? { cookie } : {} });
const acctGet = (m, query, cookie) => call(m.account, { method: 'GET', query, headers: cookie ? { cookie } : {} });
const place = (m, cust = customer, cart = cartOf([TEE, 'M', 1])) => call(m.create, { body: { cart, customer: cust } });
const pay = (m, c, pid = 'pay_X1') => call(m.verify, { body: { orderId: c.orderId, razorpay_order_id: c.razorpayOrderId, razorpay_payment_id: pid, razorpay_signature: hmac(KEY_SECRET, `${c.razorpayOrderId}|${pid}`) } });

/** sign in and return the cookie string */
async function signIn(m, email = customer.email) {
  const l = await acct(m, { action: 'login', email });
  const token = l.body.devToken || /token=([A-Za-z0-9_-]+)/.exec(emails.at(-1)?.html || '')?.[1];
  const v = await acct(m, { action: 'verify', token });
  expect(v.statusCode).toBe(200);
  return String(v.headers['set-cookie']).split(';')[0];
}
async function paidOrder(m, cust = customer, cart) { const pl = await place(m, cust, cart); const c = pl.body; expect((await pay(m, c)).statusCode).toBe(200); return c.orderId; }
async function deliveredOrder(m, cust = customer, cart) {
  const id = await paidOrder(m, cust, cart);
  const r = await adminCall(m, { id, action: 'delivered' }); expect(r.statusCode).toBe(200);
  return id;
}

beforeEach(() => {
  rzpCount = 0; emails = [];
  vi.stubGlobal('fetch', vi.fn(async (url, init) => {
    const u = String(url);
    if (u.includes('/v1/orders')) { const b = JSON.parse(init.body); rzpCount += 1; return { ok: true, status: 200, json: async () => ({ id: `order_C${rzpCount}`, amount: b.amount }) }; }
    if (u.includes('api.resend.com')) { emails.push(JSON.parse(init.body)); return { ok: true, status: 200, json: async () => ({}) }; }
    throw new Error('unexpected fetch ' + u);
  }));
});
afterEach(() => { vi.unstubAllGlobals(); });

describe('sign-in', () => {
  it('emails a one-time link; the link is not in the response when email works', async () => {
    const m = await setup(EMAIL);
    const l = await acct(m, { action: 'login', email: 'Asha@Example.com' });
    expect(l.statusCode).toBe(200); expect(l.body.devToken).toBeUndefined();
    expect(emails.at(-1).to).toBe('asha@example.com'); expect(emails.at(-1).html).toContain('https://shonowear.test/account?token=');
  });
  it('rejects a bad email, answers the same for unknown emails, and limits emails per address', async () => {
    const m = await setup();
    expect((await acct(m, { action: 'login', email: 'nope' })).statusCode).toBe(400);
    for (let i = 0; i < 4; i++) expect((await acct(m, { action: 'login', email: 'x@example.com' })).statusCode).toBe(200);
    expect((await acct(m, { action: 'login', email: 'x@example.com' })).statusCode).toBe(429);
  });
  it('a link works once, makes an HttpOnly cookie, and me/logout behave', async () => {
    const m = await setup();
    const l = await acct(m, { action: 'login', email: customer.email });
    const v = await acct(m, { action: 'verify', token: l.body.devToken });
    expect(v.statusCode).toBe(200); expect(v.headers['set-cookie']).toMatch(/HttpOnly.*SameSite=Lax|SameSite=Lax.*HttpOnly/);
    const cookie = String(v.headers['set-cookie']).split(';')[0];
    expect((await acct(m, { action: 'verify', token: l.body.devToken })).statusCode).toBe(400);           // reuse refused
    expect((await acctGet(m, { action: 'me' }, cookie)).body.email).toBe(customer.email);
    expect((await acctGet(m, { action: 'me' })).body.email).toBeNull();
    await acct(m, { action: 'logout' }, cookie);
    expect((await acctGet(m, { action: 'me' }, cookie)).body.email).toBeNull();
  });
  it('two simultaneous clicks on the same link: exactly one signs in', async () => {
    const m = await setup();
    const t = await m.accounts.startLogin(customer.email);
    const r = await Promise.all([m.accounts.consumeLogin(t), m.accounts.consumeLogin(t), m.accounts.consumeLogin(t)]);
    expect(r.filter(Boolean)).toHaveLength(1);
  });
  it('garbage tokens and cookies are refused', async () => {
    const m = await setup();
    expect((await acct(m, { action: 'verify', token: 'x' })).statusCode).toBe(400);
    expect((await acct(m, { action: 'verify', token: 'A'.repeat(43) })).statusCode).toBe(400);
    expect((await acctGet(m, { action: 'orders' }, 'sw_sid=' + 'A'.repeat(43))).statusCode).toBe(401);
  });
});

describe('my orders', () => {
  it('lists only my placed orders, never someone else’s or unpaid attempts', async () => {
    const m = await setup();
    await place(m);                                                   // unpaid attempt
    const mine = await paidOrder(m, customer, cartOf([TEE, 'L', 1]));
    await paidOrder(m, other, cartOf([PANTS, '32', 1]));
    const cookie = await signIn(m);
    const r = await acctGet(m, { action: 'orders' }, cookie);
    expect(r.body.orders.map(o => o.id)).toEqual([mine]);
    expect(JSON.stringify(r.body)).not.toMatch(/9876543210|MG Road|ravi@/);
    const r2 = await acctGet(m, { action: 'orders' }, await signIn(m, other.email));
    expect(r2.body.orders).toHaveLength(1); expect(r2.body.orders[0].id).not.toBe(mine);
    expect((await acctGet(m, { action: 'orders' })).statusCode).toBe(401);
  });
});

describe('reviews', () => {
  it('only after delivery, one per product, hidden until approved, then shown with the average', async () => {
    const m = await setup();
    const id = await paidOrder(m);
    const cookie = await signIn(m);
    const body = { action: 'review', productId: TEE, rating: 5, title: 'Great', body: 'Fits well and the fabric is heavy.', name: 'Asha Rao' };
    expect((await acct(m, body, cookie)).statusCode).toBe(403);       // paid, not delivered
    await adminCall(m, { id, action: 'delivered' });
    expect((await acct(m, { ...body, rating: 9 }, cookie)).statusCode).toBe(400);
    expect((await acct(m, { ...body, body: 'ok' }, cookie)).statusCode).toBe(400);
    expect((await acct(m, { ...body, productId: 'amz-1' }, cookie)).statusCode).toBe(400);
    const ok = await acct(m, body, cookie);
    expect(ok.statusCode).toBe(200); expect(ok.body.pending).toBe(true);
    expect((await acct(m, body, cookie)).statusCode).toBe(409);
    expect((await acctGet(m, { action: 'reviews', product: TEE })).body).toMatchObject({ count: 0, average: null });
    const list = (await adminCall(m, null, { view: 'reviews' })).body.reviews;
    expect(list).toHaveLength(1); expect(JSON.stringify(list)).not.toContain('asha@example.com');
    expect((await adminCall(m, { action: 'review-moderate', productId: TEE, key: list[0].key, decision: 'approved' })).statusCode).toBe(200);
    const pub = (await acctGet(m, { action: 'reviews', product: TEE })).body;
    expect(pub).toMatchObject({ count: 1, average: 5 }); expect(pub.reviews[0].name).toBe('Asha R.');
    expect(JSON.stringify(pub)).not.toMatch(/asha@|orderNumber|key/);
    await adminCall(m, { action: 'review-moderate', productId: TEE, key: list[0].key, decision: 'rejected' });
    expect((await acctGet(m, { action: 'reviews', product: TEE })).body.count).toBe(0);
  });
  it('a customer cannot review a product only someone else bought; simultaneous submits store one', async () => {
    const m = await setup();
    await deliveredOrder(m, other, cartOf([PANTS, '32', 1]));
    const cookie = await signIn(m);                                   // Asha has nothing delivered
    expect((await acct(m, { action: 'review', productId: PANTS, rating: 4, body: 'I never bought this one.' }, cookie)).statusCode).toBe(403);
    await deliveredOrder(m);
    const two = await Promise.all([1, 2].map(() => acct(m, { action: 'review', productId: TEE, rating: 4, body: 'Good quality overall.' }, cookie)));
    expect(two.map(r => r.statusCode).sort()).toEqual([200, 409]);
  });
  it('markup in a review is stripped', async () => {
    const m = await setup();
    await deliveredOrder(m);
    const cookie = await signIn(m);
    await acct(m, { action: 'review', productId: TEE, rating: 3, title: '<b>x</b>', body: 'Nice <script>alert(1)</script> tee', name: '<i>Asha</i> Rao' }, cookie);
    const r = (await adminCall(m, null, { view: 'reviews' })).body.reviews[0];
    expect(JSON.stringify(r)).not.toMatch(/[<>]/);
  });
});

describe('questions', () => {
  it('needs sign-in, shows only after you answer, and is capped per customer', async () => {
    const m = await setup();
    expect((await acct(m, { action: 'ask', productId: TEE, question: 'Does it shrink after washing?' })).statusCode).toBe(401);
    const cookie = await signIn(m);
    expect((await acct(m, { action: 'ask', productId: TEE, question: 'short' }, cookie)).statusCode).toBe(400);
    expect((await acct(m, { action: 'ask', productId: TEE, question: 'Does it shrink after washing?', name: 'Asha' }, cookie)).statusCode).toBe(200);
    expect((await acct(m, { action: 'ask', productId: TEE, question: 'Is the fabric very thick?', name: 'Asha' }, cookie)).statusCode).toBe(200);
    expect((await acct(m, { action: 'ask', productId: TEE, question: 'What about the colour fading?', name: 'Asha' }, cookie)).statusCode).toBe(429);
    expect((await acctGet(m, { action: 'qa', product: TEE })).body.questions).toEqual([]);
    const q = (await adminCall(m, null, { view: 'reviews' })).body.questions[0];
    expect((await adminCall(m, { action: 'qa-answer', productId: TEE, qid: q.id, answer: 'Wash cold; it shrinks under 2%.' })).statusCode).toBe(200);
    const pub = (await acctGet(m, { action: 'qa', product: TEE })).body.questions;
    expect(pub).toHaveLength(1); expect(pub[0].a).toMatch(/shrinks/); expect(JSON.stringify(pub)).not.toMatch(/by|@/);
    expect((await adminCall(m, { action: 'qa-answer', productId: TEE, qid: q.id, answer: null })).statusCode).toBe(200);
    expect((await acctGet(m, { action: 'qa', product: TEE })).body.questions).toEqual([]);
  });
});

describe('returns and exchanges', () => {
  const ret = (id, extra = {}) => ({ action: 'return', orderId: id, kind: 'return', items: [{ id: TEE, size: 'M', qty: 1 }], reason: 'Does not fit', ...extra });
  it('not before delivery, not for someone else’s order, not after the window', async () => {
    const m = await setup();
    const id = await paidOrder(m);
    const cookie = await signIn(m);
    expect((await acct(m, ret(id), cookie)).statusCode).toBe(409);
    await adminCall(m, { id, action: 'delivered' });
    expect((await acct(m, ret(id), await signIn(m, other.email))).statusCode).toBe(404);
    const o = await m.orders.getOrder(id);
    await m.orders.saveOrder({ ...o, deliveredAt: new Date(Date.now() - 8 * 86400000).toISOString() });
    const r = await acct(m, ret(id), cookie);
    expect(r.statusCode).toBe(409); expect(r.body.error).toMatch(/window/);
  });
  it('validates items, reason and exchange size; one open request per order', async () => {
    const m = await setup();
    const id = await deliveredOrder(m);
    const cookie = await signIn(m);
    expect((await acct(m, ret(id, { reason: 'because' }), cookie)).statusCode).toBe(400);
    expect((await acct(m, ret(id, { items: [{ id: TEE, size: 'M', qty: 2 }] }), cookie)).statusCode).toBe(400);
    expect((await acct(m, ret(id, { items: [{ id: PANTS, size: '32', qty: 1 }] }), cookie)).statusCode).toBe(400);
    expect((await acct(m, ret(id, { kind: 'exchange', newSize: 'M' }), cookie)).statusCode).toBe(400);   // same size
    expect((await acct(m, ret(id, { kind: 'exchange', newSize: 'XXL' }), cookie)).statusCode).toBe(400);
    expect((await acct(m, ret(id), cookie)).statusCode).toBe(200);
    expect((await acct(m, ret(id), cookie)).statusCode).toBe(409);
  });
  it('simultaneous requests for one order: exactly one is stored', async () => {
    const m = await setup();
    const id = await deliveredOrder(m);
    const cookie = await signIn(m);
    const r = await Promise.all([1, 2, 3].map(() => acct(m, ret(id), cookie)));
    expect(r.filter(x => x.statusCode === 200)).toHaveLength(1);
  });
  it('flow: requested → approved → received → refunded, each step emailed, bad jumps refused', async () => {
    const m = await setup(EMAIL);
    const id = await deliveredOrder(m);
    const cookie = await signIn(m);
    const r = await acct(m, ret(id, { note: 'Too tight' }), cookie);
    const rid = r.body.request.id;
    const up = (status, extra = {}) => adminCall(m, { action: 'return-update', rid, status, ...extra });
    expect((await up('refunded', { refundAmount: 500 })).statusCode).toBe(409);
    expect((await up('received')).statusCode).toBe(409);
    expect((await up('approved', { note: 'Send it back' })).statusCode).toBe(200);
    expect((await up('received')).statusCode).toBe(200);
    expect((await up('refunded')).statusCode).toBe(400);              // amount required
    expect((await up('exchanged')).statusCode).toBe(409);
    const done = await up('refunded', { refundAmount: 599 });
    expect(done.body.request).toMatchObject({ status: 'refunded', refundAmount: 599 });
    expect((await up('approved')).statusCode).toBe(409);
    const mine = (await acctGet(m, { action: 'returns' }, cookie)).body.returns[0];
    expect(mine).toMatchObject({ status: 'refunded', refundAmount: 599 }); expect(JSON.stringify(mine)).not.toMatch(/asha@|suggested/);
    const subjects = emails.map(e => e.subject).filter(s => /return for order/i.test(s));
    expect(subjects.length).toBeGreaterThanOrEqual(4);
    expect((await acct(m, ret(id), cookie)).statusCode).toBe(409);    // finished requests are not reopened
  });
  it('a rejected request can be filed again; an exchange is marked exchanged, not refunded', async () => {
    const m = await setup();
    const id = await deliveredOrder(m);
    const cookie = await signIn(m);
    const a = await acct(m, ret(id), cookie);
    await adminCall(m, { action: 'return-update', rid: a.body.request.id, status: 'rejected', note: 'Worn' });
    const b = await acct(m, ret(id, { kind: 'exchange', newSize: 'L' }), cookie);
    expect(b.statusCode).toBe(200);
    const rid = b.body.request.id;
    await adminCall(m, { action: 'return-update', rid, status: 'approved' });
    await adminCall(m, { action: 'return-update', rid, status: 'received' });
    expect((await adminCall(m, { action: 'return-update', rid, status: 'refunded', refundAmount: 100 })).statusCode).toBe(409);
    expect((await adminCall(m, { action: 'return-update', rid, status: 'exchanged' })).statusCode).toBe(200);
  });
  it('the suggested refund shares the order discount across the returned items', async () => {
    const m = await setup();
    const id = await deliveredOrder(m, customer, cartOf([TEE, 'M', 1], [PANTS, '32', 1]));
    const o = await m.orders.getOrder(id);
    const lines = [{ id: TEE, size: 'M', qty: 1 }];
    const sub = o.totals.subtotal, tee = o.items.find(i => i.id === TEE).price;
    expect(o.totals.discount).toBeGreaterThan(0);
    expect(m.returns.suggestedRefund(o, lines)).toBe(Math.round(tee * (sub - o.totals.discount) / sub));
    expect(m.returns.suggestedRefund(o, lines)).toBeLessThan(tee);
  });
});

describe('shipping and delivery emails, tracking links', () => {
  it('shipped email carries the courier link; delivered email invites a review; both are best effort', async () => {
    const m = await setup(EMAIL);
    const id = await paidOrder(m);
    await adminCall(m, { id, action: 'shipped', courier: 'Delhivery', tracking: 'DL12345678' });
    await new Promise(r => setTimeout(r, 20));
    const shipped = emails.find(e => /has shipped/.test(e.subject));
    expect(shipped.to).toBe(customer.email); expect(shipped.html).toContain('delhivery.com/track/package/DL12345678');
    await adminCall(m, { id, action: 'delivered' });
    await new Promise(r => setTimeout(r, 20));
    expect(emails.some(e => /was delivered/.test(e.subject))).toBe(true);
    expect((await m.orders.getOrder(id)).deliveredAt).toBeTruthy();
  });
  it('an email failure does not undo the status change', async () => {
    const m = await setup(EMAIL);
    const id = await paidOrder(m);
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('down'); }));
    const r = await adminCall(m, { id, action: 'shipped', courier: 'DTDC', tracking: 'D1234567' });
    expect(r.statusCode).toBe(200); expect(r.body.order.status).toBe('shipped');
  });
  it('courier links: known couriers map, unknown ones and odd numbers do not', async () => {
    const { trackUrl, waLink } = await import('../src/lib/courier.js');
    expect(trackUrl('Blue Dart', '1234567890')).toContain('bluedart.com');
    expect(trackUrl('India Post', 'EE123456789IN')).toContain('indiapost');
    expect(trackUrl('Local rider', '1234567')).toBeNull();
    expect(trackUrl('Delhivery', '<script>')).toBeNull();
    expect(trackUrl('Delhivery', '')).toBeNull();
    expect(waLink('+91 98765-43210', 'Order SW-1')).toBe('https://wa.me/919876543210?text=Order%20SW-1');
    expect(waLink('', 'x')).toBeNull(); expect(waLink('12', 'x')).toBeNull();
  });
});

describe('admin protection', () => {
  it('the new admin views and actions need the admin token', async () => {
    const m = await setup();
    for (const q of ['reviews', 'returns']) expect((await call(m.admin, { method: 'GET', query: { view: q } })).statusCode).toBe(401);
    expect((await call(m.admin, { body: { action: 'review-moderate', productId: TEE, key: 'x', decision: 'approved' } })).statusCode).toBe(401);
    expect((await call(m.admin, { body: { action: 'return-update', rid: 'x', status: 'approved' } })).statusCode).toBe(401);
  });
  it('POSTs from another origin are refused (cookie sessions need the origin check)', async () => {
    const m = await setup();
    const req = mockReq({ action: 'logout' }, { origin: 'https://evil.test' }); req.query = {};
    const res = mockRes(); await m.account(req, res);
    expect(res.statusCode).toBe(403);
  });
});
