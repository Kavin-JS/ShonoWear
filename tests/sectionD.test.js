import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import crypto from 'node:crypto';
import { mockRes, mockReq } from './helpers.js';
import { allocate, slabRate, buildInvoice, invoiceHtml, slipHtml } from '../src/lib/invoice.js';
import { parseCsv, toCsv } from '../src/lib/csv.js';

const KEY_SECRET = 'test_key_secret_123', WH_SECRET = 'test_webhook_secret_456', ADMIN = 'a'.repeat(32);
const ENV_KEYS = ['VERCEL_ENV', 'NODE_ENV', 'UPSTASH_REDIS_REST_URL', 'UPSTASH_REDIS_REST_TOKEN', 'RAZORPAY_KEY_ID', 'RAZORPAY_KEY_SECRET',
  'RAZORPAY_WEBHOOK_SECRET', 'ADMIN_TOKEN', 'RESEND_API_KEY', 'ORDER_FROM_EMAIL', 'ORDER_NOTIFY_EMAIL', 'SITE_URL', 'ALLOWED_ORIGINS', 'RAZORPAY_API_BASE'];
const hmac = (secret, s) => crypto.createHmac('sha256', secret).update(s).digest('hex');
const customer = { name: 'Asha Rao', phone: '9876543210', email: 'asha@example.com', line1: '12 MG Road', city: 'Chennai', state: 'Tamil Nadu', pincode: '600001' };
const other = { ...customer, name: 'Ravi K', phone: '9123456780', email: 'ravi@example.com', state: 'Karnataka', city: 'Bengaluru', pincode: '560001' };
const TEE = 'own-sample-tee', PANTS = 'own-sample-pants';
const cartOf = (...l) => l.map(([id, size, qty = 1]) => ({ id, size, qty }));
const EMAIL = { RESEND_API_KEY: 're_x', ORDER_FROM_EMAIL: 'shop@example.com', ORDER_NOTIFY_EMAIL: 'me@example.com', SITE_URL: 'https://shonowear.test' };

let emails, rzpCount, refundCalls, refundDelay, refundFail;
async function setup(env = {}) {
  vi.resetModules();
  for (const k of ENV_KEYS) delete process.env[k];
  Object.assign(process.env, { RAZORPAY_KEY_ID: 'rzp_test_abc', RAZORPAY_KEY_SECRET: KEY_SECRET, RAZORPAY_WEBHOOK_SECRET: WH_SECRET, ADMIN_TOKEN: ADMIN }, env);
  const m = {
    create: (await import('../api/checkout/create.js')).default, verify: (await import('../api/checkout/verify.js')).default,
    admin: (await import('../api/admin/orders.js')).default, account: (await import('../api/account.js')).default,
    config: (await import('../api/config.js')).default, stockApi: (await import('../api/stock.js')).default,
    orders: await import('../server/orders.js'), stock: await import('../server/stock.js'), ov: await import('../server/overrides.js'),
    inv: await import('../server/invoices.js'), mkt: await import('../server/marketing.js'), ops: await import('../server/adminOps.js'),
    refunds: await import('../server/refunds.js'),
  };
  m.ov.resetForTests();
  return m;
}
let ipN = 40;
const freshIp = () => ({ 'x-vercel-forwarded-for': `198.51.100.${(ipN++ % 250) + 1}` });
async function call(handler, { method = 'POST', body, query, headers = {}, ip = true } = {}) {
  const req = mockReq(body, { method, headers: { ...(ip ? freshIp() : {}), ...headers } }); req.query = query || {};
  const res = mockRes(); await handler(req, res); return res;
}
const adminCall = (m, body, query, method) => call(m.admin, { method: method || (body ? 'POST' : 'GET'), body, query, headers: { authorization: `Bearer ${ADMIN}` } });
const place = (m, cust = customer, cart = cartOf([TEE, 'M', 1]), extra = {}) => call(m.create, { body: { cart, customer: cust, ...extra } });
const pay = (m, c, pid = 'pay_X1') => call(m.verify, { body: { orderId: c.orderId, razorpay_order_id: c.razorpayOrderId, razorpay_payment_id: pid, razorpay_signature: hmac(KEY_SECRET, `${c.razorpayOrderId}|${pid}`) } });
async function paidOrder(m, cust = customer, cart, extra) { const pl = await place(m, cust, cart, extra); const c = pl.body; expect(pl.statusCode).toBe(200); expect((await pay(m, c, 'pay_' + c.orderId.slice(0, 8))).statusCode).toBe(200); return c.orderId; }

beforeEach(() => {
  rzpCount = 0; emails = []; refundCalls = []; refundDelay = 0; refundFail = false;
  vi.stubGlobal('fetch', vi.fn(async (url, init) => {
    const u = String(url);
    if (u.includes('/refund')) {
      refundCalls.push({ url: u, body: JSON.parse(init.body) });
      if (refundDelay) await new Promise(r => setTimeout(r, refundDelay));
      if (refundFail) return { ok: false, status: 400, json: async () => ({ error: { description: 'The refund amount is more than the payment' } }) };
      return { ok: true, status: 200, json: async () => ({ id: `rfnd_${refundCalls.length}`, status: 'processed' }) };
    }
    if (u.includes('/v1/orders')) { const b = JSON.parse(init.body); rzpCount += 1; return { ok: true, status: 200, json: async () => ({ id: `order_D${rzpCount}`, amount: b.amount }) }; }
    if (u.includes('api.resend.com')) { emails.push(JSON.parse(init.body)); return { ok: true, status: 200, json: async () => ({}) }; }
    throw new Error('unexpected fetch ' + u);
  }));
});
afterEach(() => { vi.unstubAllGlobals(); });

/* ───────── live price and stock edits ───────── */
describe('price and stock edits', () => {
  it('a new price applies to checkout at once, and reset brings the file price back', async () => {
    const m = await setup();
    const base = (await place(m)).body.amount;
    expect((await adminCall(m, { action: 'product-update', id: TEE, price: 499 })).statusCode).toBe(200);
    const after = (await place(m)).body.amount;
    expect(after).toBeLessThan(base);
    const items = (await m.orders.getOrder((await place(m)).body.orderId)).items;
    expect(items[0].price).toBe(499);
    await adminCall(m, { action: 'product-reset', id: TEE });
    expect((await place(m)).body.amount).toBe(base);
  });
  it('a price edit made on another server instance is picked up by checkout without waiting', async () => {
    const m = await setup();
    await place(m);
    await m.ov.resetForTests();
    const { store } = await import('../server/guard.js');
    await store([['HSET', 'pov', TEE, JSON.stringify({ price: 450 })]]);
    const c = (await place(m)).body;
    expect((await m.orders.getOrder(c.orderId)).items[0].price).toBe(450);
  });
  it('the public config shows edited prices, never stock', async () => {
    const m = await setup();
    await adminCall(m, { action: 'product-update', id: TEE, price: 499, mrp: 799, available: { M: 3 } });
    const r = await call(m.config, { method: 'GET' });
    expect(r.body.overrides[TEE]).toEqual({ price: 499, mrp: 799 });
    expect(JSON.stringify(r.body)).not.toMatch(/stock|"M"/);
  });
  it('refuses nonsense: bad prices, MRP at or below price, unknown size, affiliate products, negative stock', async () => {
    const m = await setup();
    const up = (b) => adminCall(m, { action: 'product-update', id: TEE, ...b });
    expect((await up({ price: 0 })).statusCode).toBe(400);
    expect((await up({ price: 12.5 })).statusCode).toBe(400);
    expect((await up({ price: -5 })).statusCode).toBe(400);
    expect((await up({ price: 'abc' })).statusCode).toBe(400);
    expect((await up({ price: 500, mrp: 500 })).statusCode).toBe(400);
    expect((await up({ available: { XXXL: 5 } })).statusCode).toBe(400);
    expect((await up({ available: { M: -1 } })).statusCode).toBe(400);
    expect((await up({ available: { M: 1.5 } })).statusCode).toBe(400);
    expect((await adminCall(m, { action: 'product-update', id: 'amz-1', price: 100 })).statusCode).toBe(400);
    expect((await adminCall(m, { action: 'product-reset', id: 'nope' })).statusCode).toBe(404);
  });
  it('"available now" keeps sold units out: sold 2, set 3 → 3 left, a 4th is refused', async () => {
    const m = await setup();
    await paidOrder(m, customer, cartOf([TEE, 'M', 2]));
    expect((await m.stock.availability([TEE]))[TEE].M).toBe(6);
    expect((await adminCall(m, { action: 'product-update', id: TEE, available: { M: 3 } })).statusCode).toBe(200);
    expect((await m.stock.availability([TEE]))[TEE].M).toBe(3);
    expect((await place(m, other, cartOf([TEE, 'M', 4]))).statusCode).toBe(409);
    expect((await place(m, other, cartOf([TEE, 'M', 3]))).statusCode).toBe(200);
  });
  it('setting stock to 0 sells the size out; raising it again reopens it', async () => {
    const m = await setup();
    await adminCall(m, { action: 'product-update', id: TEE, available: { L: 0 } });
    expect((await place(m, customer, cartOf([TEE, 'L', 1]))).statusCode).toBe(409);
    await adminCall(m, { action: 'product-update', id: TEE, available: { L: 4 } });
    expect((await place(m, customer, cartOf([TEE, 'L', 1]))).statusCode).toBe(200);
  });
  it('the product list shows file values next to edited ones', async () => {
    const m = await setup();
    await adminCall(m, { action: 'product-update', id: TEE, price: 499 });
    const p = (await adminCall(m, null, { view: 'products' })).body.products.find(x => x.id === TEE);
    expect(p).toMatchObject({ price: 499, basePrice: 599, edited: true });
    expect(p.sizes.find(s => s.size === 'M')).toMatchObject({ base: 8, available: 8 });
  });
  it('an edit that clears the sale MRP works', async () => {
    const m = await setup();
    await adminCall(m, { action: 'product-update', id: TEE, price: 499, mrp: 799 });
    await adminCall(m, { action: 'product-update', id: TEE, clearMrp: true });
    const p = (await adminCall(m, null, { view: 'products' })).body.products.find(x => x.id === TEE);
    expect(p.mrp).toBeNull();
  });
});

/* ───────── refunds ───────── */
describe('refunds', () => {
  it('refunds part of an online payment, records it, and refuses to go past what was charged', async () => {
    const m = await setup();
    const id = await paidOrder(m);
    const o = await m.orders.getOrder(id);
    const r = await adminCall(m, { action: 'refund', id, amount: 100, reason: 'Late' });
    expect(r.statusCode).toBe(200); expect(r.body.refund).toMatchObject({ id: 'rfnd_1', amount: 100 });
    expect(refundCalls[0].url).toContain(`/payments/pay_${id.slice(0, 8)}/refund`); expect(refundCalls[0].body.amount).toBe(10000);
    expect((await m.orders.getOrder(id)).refunds).toHaveLength(1);
    const over = await adminCall(m, { action: 'refund', id, amount: o.totals.total });
    expect(over.statusCode).toBe(409); expect(over.body.error).toMatch(/at most/);
    expect(refundCalls).toHaveLength(1);
    expect((await adminCall(m, { action: 'refund', id, amount: o.totals.total - 100 })).statusCode).toBe(200);
    expect((await adminCall(m, { action: 'refund', id, amount: 1 })).statusCode).toBe(409);
  });
  it('two clicks at once send one refund to Razorpay', async () => {
    const m = await setup();
    const id = await paidOrder(m);
    refundDelay = 30;
    const r = await Promise.all([1, 2].map(() => adminCall(m, { action: 'refund', id, amount: 150 })));
    expect(r.map(x => x.statusCode).sort()).toEqual([200, 409]);
    expect(refundCalls).toHaveLength(1);
  });
  it('a Razorpay failure records nothing and says why', async () => {
    const m = await setup();
    const id = await paidOrder(m);
    refundFail = true;
    const r = await adminCall(m, { action: 'refund', id, amount: 100 });
    expect(r.statusCode).toBe(502); expect(r.body.error).toMatch(/more than the payment/);
    expect(await m.refunds.refundedSoFar(id)).toBe(0);
    refundFail = false;
    expect((await adminCall(m, { action: 'refund', id, amount: 100 })).statusCode).toBe(200);
  });
  it('refuses unpaid, COD, unknown and invalid amounts', async () => {
    const m = await setup();
    const unpaid = (await place(m)).body.orderId;
    expect((await adminCall(m, { action: 'refund', id: unpaid, amount: 10 })).statusCode).toBe(409);
    const cod = await call(m.create, { body: { cart: cartOf([TEE, 'M', 1]), customer, payment: 'cod' } });
    expect(cod.statusCode).toBe(200);
    const r = await adminCall(m, { action: 'refund', id: cod.body.orderId, amount: 10 });
    expect(r.statusCode).toBe(409); expect(r.body.error).toMatch(/UPI/);
    const id = await paidOrder(m, other);
    expect((await adminCall(m, { action: 'refund', id, amount: 0 })).statusCode).toBe(400);
    expect((await adminCall(m, { action: 'refund', id, amount: 'x' })).statusCode).toBe(400);
    expect((await adminCall(m, { action: 'refund', id: 'zzzzzzzzzzzzzzzz', amount: 5 })).statusCode).toBe(404);
    expect(refundCalls).toHaveLength(0);
  });
  it('refunds only the card part when a gift card covered some of the order', async () => {
    const m = await setup();
    const card = await (await import('../server/giftcards.js')).issueGiftCard({ amount: 200 });
    const id = await paidOrder(m, customer, cartOf([TEE, 'M', 1]), { gift: card.code });
    const o = await m.orders.getOrder(id);
    expect(o.totals.giftApplied).toBe(200);
    const r = await adminCall(m, { action: 'refund', id, amount: o.totals.total + 1 });
    expect(r.statusCode).toBe(409);
    expect((await adminCall(m, { action: 'refund', id, amount: o.totals.total })).statusCode).toBe(200);
  });
  it('refunding from a return request marks the return refunded and emails the customer', async () => {
    const m = await setup(EMAIL);
    const id = await paidOrder(m);
    await adminCall(m, { id, action: 'delivered' });
    const ret = await import('../server/returns.js');
    const rq = await ret.requestReturn(customer.email, { orderId: id, kind: 'return', items: [{ id: TEE, size: 'M', qty: 1 }], reason: 'Does not fit' });
    expect(rq.ok).toBe(true);
    await ret.updateReturn(rq.request.id, 'approved'); await ret.updateReturn(rq.request.id, 'received');
    const r = await adminCall(m, { action: 'refund', id, amount: 300, rid: rq.request.id });
    expect(r.statusCode).toBe(200); expect(r.body.returnUpdated).toBe(true);
    expect((await ret.getReturn(rq.request.id))).toMatchObject({ status: 'refunded', refundAmount: 300 });
  });
});

/* ───────── invoice maths ───────── */
describe('invoice maths', () => {
  const gst = { sellerState: 'Tamil Nadu', slabs: [{ upTo: 2500, rate: 5 }, { rate: 18 }], hsn: { top: '6109', bottom: '6203' } };
  const mk = (items, totals, state = 'Tamil Nadu') => ({ items, totals: { subtotal: 0, discount: 0, shipping: 0, codFee: 0, giftApplied: 0, total: 0, ...totals }, customer: { state } });
  it('allocate always adds up and never goes negative', () => {
    for (const [total, w] of [[100, [1, 1, 1]], [7, [3, 3]], [1, [5, 1, 1, 1]], [0, [4, 4]], [99, [599, 1299, 1]], [10, [0, 0]]]) {
      const a = allocate(total, w); expect(a.every(x => x >= 0)).toBe(true);
      expect(a.reduce((n, x) => n + x, 0)).toBe(w.some(x => x > 0) ? total : 0);
    }
  });
  it('slab picks the rate by price per piece', () => { expect(slabRate(2500, gst.slabs)).toBe(5); expect(slabRate(2501, gst.slabs)).toBe(18); expect(slabRate(100, gst.slabs)).toBe(5); });
  it('same state splits CGST+SGST, other state is IGST, and lines add to the invoice total', () => {
    const items = [{ id: TEE, name: 'Tee', size: 'M', qty: 2, price: 599 }, { id: PANTS, name: 'Pants', size: '32', qty: 1, price: 1299 }];
    const o = mk(items, { subtotal: 2497, discount: 250, shipping: 79, total: 2326 });
    for (const state of ['Tamil Nadu', 'Kerala']) {
      const c = buildInvoice({ ...o, customer: { state } }, { gstin: '33AAAAA0000A1Z5', gst });
      expect(c.total).toBe((2497 - 250 + 79) * 100);
      expect(c.taxable + c.cgst + c.sgst + c.igst).toBe(c.total);
      expect(c.lines.reduce((n, l) => n + l.incl, 0)).toBe(c.total);
      if (state === 'Tamil Nadu') { expect(c.intra).toBe(true); expect(c.igst).toBe(0); expect(Math.abs(c.cgst - c.sgst)).toBeLessThanOrEqual(c.lines.length); }
      else { expect(c.intra).toBe(false); expect(c.cgst + c.sgst).toBe(0); expect(c.igst).toBeGreaterThan(0); }
    }
  });
  it('a 5% line: taxable = amount / 1.05 (to the paisa)', () => {
    const c = buildInvoice(mk([{ id: TEE, name: 'Tee', size: 'M', qty: 1, price: 1050 }], { subtotal: 1050, total: 1050 }), { gstin: 'X', gst });
    expect(c.lines[0].taxable).toBe(100000); expect(c.cgst + c.sgst).toBe(5000);
  });
  it('price above the slab is taxed at 18%', () => {
    const c = buildInvoice(mk([{ id: TEE, name: 'Coat', size: 'M', qty: 1, price: 3540 }], { subtotal: 3540, total: 3540 }), { gstin: 'X', gst });
    expect(c.lines[0].rate).toBe(18); expect(c.lines[0].taxable).toBe(300000);
  });
  it('the discount is shared across lines and can change the slab per piece', () => {
    const c = buildInvoice(mk([{ id: TEE, name: 'Coat', size: 'M', qty: 1, price: 2600 }], { subtotal: 2600, discount: 200, total: 2400 }), { gstin: 'X', gst });
    expect(c.lines[0].rate).toBe(5);
  });
  it('without a GSTIN there is no tax at all', () => {
    const c = buildInvoice(mk([{ id: TEE, name: 'Tee', size: 'M', qty: 1, price: 599 }], { subtotal: 599, total: 599 }), { gstin: '', gst });
    expect(c.registered).toBe(false); expect(c.cgst + c.sgst + c.igst).toBe(0); expect(c.taxable).toBe(c.total);
    expect(invoiceHtml({ number: 'X', date: '2026-11-01', order: { number: 'SW1', customer: {}, items: [], totals: {}, payment: {} }, calc: c, seller: {} })).not.toMatch(/GSTIN|CGST|TAX INVOICE/);
  });
  it('gift card money is tender, not a discount: the invoice is for the full value', () => {
    const c = buildInvoice(mk([{ id: TEE, name: 'Tee', size: 'M', qty: 1, price: 599 }], { subtotal: 599, giftApplied: 200, total: 399 }), { gstin: 'X', gst });
    expect(c.total).toBe(59900); expect(c.giftApplied).toBe(20000);
  });
  it('printable pages escape customer text', () => {
    const order = { number: 'SW1', customer: { name: '<script>x</script>', line1: 'a', city: 'c', state: 's', pincode: '1', phone: '9' }, items: [{ name: '<b>Tee</b>', size: 'M', qty: 1, price: 100 }], totals: { total: 100 }, payment: { method: 'cod' } };
    const html = slipHtml({ order, seller: { email: 'a@b.c' } });
    expect(html).not.toContain('<script>'); expect(html).not.toContain('<b>Tee'); expect(html).toContain('CASH ON DELIVERY');
  });
});

describe('invoice numbers', () => {
  it('financial year runs April to March in India time', async () => {
    const { financialYear } = await import('../server/invoices.js');
    expect(financialYear('2026-03-31T18:30:00Z')).toBe('2026-27');   // midnight IST: 1 April
    expect(financialYear('2026-03-31T18:29:00Z')).toBe('2025-26');   // 11:59pm IST on 31 March
    expect(financialYear('2026-11-14T00:00:00Z')).toBe('2026-27');
    expect(financialYear('2027-01-05T00:00:00Z')).toBe('2026-27');
  });
  it('one order keeps one number, new orders get the next, and parallel requests never share a number', async () => {
    const m = await setup();
    const a = await m.orders.getOrder(await paidOrder(m)), b = await m.orders.getOrder(await paidOrder(m, other));
    const n1 = await m.inv.invoiceNumber(a);
    expect(n1).toMatch(/^SW\/\d{4}-\d{2}\/0001$/);
    expect(await m.inv.invoiceNumber(a)).toBe(n1);
    expect(await m.inv.invoiceNumber(b)).toMatch(/0002$/);
    const orders = []; for (let i = 0; i < 4; i++) orders.push(await m.orders.getOrder(await paidOrder(m, { ...customer, email: `c${i}@example.com`, phone: `98000000${i}0` }, cartOf([PANTS, '32', 1]))));
    const nums = await Promise.all(orders.flatMap(o => [m.inv.invoiceNumber(o), m.inv.invoiceNumber(o)]));
    expect(new Set(nums).size).toBe(4);
  });
  it('the invoice endpoint needs a placed order and returns printable html', async () => {
    const m = await setup({});
    const unpaid = (await place(m)).body.orderId;
    expect((await adminCall(m, null, { view: 'invoice', id: unpaid })).statusCode).toBe(409);
    const id = await paidOrder(m, other);
    const r = await adminCall(m, null, { view: 'invoice', id });
    expect(r.statusCode).toBe(200); expect(r.body.html).toContain('INVOICE'); expect(r.body.html).toContain('SW/');
    const slip = await adminCall(m, null, { view: 'slip', id });
    expect(slip.body.html).toContain('Packing slip');
  });
});

/* ───────── CSV ───────── */
describe('csv', () => {
  it('reads quotes, commas, newlines and BOMs', () => {
    expect(parseCsv('﻿a,b\n"x, y","he said ""hi"""\r\n\r\nz,\n')).toEqual([['a', 'b'], ['x, y', 'he said "hi"'], ['z', '']]);
  });
  it('writes safely: formulas are neutralised, numbers and negatives stay numbers', () => {
    expect(toCsv([['=SUM(A1)', '+1', '-5', '@x', 'plain', 'a,b']])).toBe(`'=SUM(A1),'+1,-5,'@x,plain,"a,b"\n`);
  });
  it('bulk import is all-or-nothing and says which line is wrong', async () => {
    const m = await setup();
    const csv = `id,size,stock,price,mrp\n${TEE},M,4,550,\n${TEE},XXL,3,,\n`;
    const r = await adminCall(m, { action: 'csv-import', csv, dryRun: false });
    expect(r.statusCode).toBe(400); expect(r.body.errors[0]).toMatch(/Line 3.*XXL/);
    expect((await m.stock.availability([TEE]))[TEE].M).toBe(8);
    expect((await call(m.config, { method: 'GET' })).body.overrides).toEqual({});
  });
  it('dry run changes nothing; the real run applies price and stock', async () => {
    const m = await setup();
    const csv = `id,name,size,stock,price,mrp\n${TEE},Tee,M,4,550,799\n${TEE},Tee,L,2,,\n`;
    const dry = await adminCall(m, { action: 'csv-import', csv });
    expect(dry.body.dryRun).toBe(true); expect(dry.body.products[0]).toMatchObject({ id: TEE, price: 550, sizes: 2 });
    expect((await m.stock.availability([TEE]))[TEE].M).toBe(8);
    expect((await adminCall(m, { action: 'csv-import', csv, dryRun: false })).statusCode).toBe(200);
    expect(await m.stock.availability([TEE])).toMatchObject({ [TEE]: { M: 4, L: 2 } });
    expect((await call(m.config, { method: 'GET' })).body.overrides[TEE]).toEqual({ price: 550, mrp: 799 });
  });
  it('rejects bad files: no id column, unknown product, decimals, MRP below price, too many rows', async () => {
    const m = await setup();
    const bad = async (csv) => (await adminCall(m, { action: 'csv-import', csv, dryRun: false })).statusCode;
    expect(await bad('name,price\nx,5')).toBe(400);
    expect(await bad('id,price\namz-1,100')).toBe(400);
    expect(await bad(`id,price\n${TEE},12.5`)).toBe(400);
    expect(await bad(`id,price,mrp\n${TEE},500,400`)).toBe(400);
    expect(await bad(`id,size,stock\n${TEE},,4`)).toBe(400);
    expect(await bad('id\n' + Array(600).fill(TEE).join('\n'))).toBe(400);
    expect(await bad('')).toBe(400);
  });
  it('export lists every own size with what is available now', async () => {
    const m = await setup();
    const csv = (await adminCall(m, null, { view: 'export-products' })).body.csv;
    const rows = parseCsv(csv); expect(rows[0]).toEqual(['id', 'name', 'size', 'stock', 'price', 'mrp']);
    expect(rows.find(r => r[0] === TEE && r[2] === 'M')[3]).toBe('8');
  });
});

/* ───────── customers and campaigns ───────── */
describe('customers and campaigns', () => {
  it('consent is recorded only for a placed order that ticked the box', async () => {
    const m = await setup(EMAIL);
    await place(m, customer, cartOf([TEE, 'M', 1]), { marketing: true });                // never paid
    expect(await m.mkt.audience()).toEqual([]);
    await paidOrder(m, other, cartOf([TEE, 'L', 1]), { marketing: true });
    await paidOrder(m, { ...customer, email: 'nope@example.com', phone: '9000000001' }, cartOf([TEE, 'S', 1]));
    const a = await m.mkt.audience();
    expect(a.map(x => x.email)).toEqual(['ravi@example.com']); expect(a[0].at).toBeTruthy(); expect(a[0].tok.length).toBeGreaterThan(15);
  });
  it('a campaign goes to subscribed customers only, with an unsubscribe link, and escapes the message', async () => {
    const m = await setup(EMAIL);
    await paidOrder(m, other, cartOf([TEE, 'L', 1]), { marketing: true });
    await paidOrder(m, { ...customer, email: 'bob@example.com', phone: '9000000002' }, cartOf([TEE, 'S', 1]), { marketing: true });
    const aud = await m.mkt.audience();
    const bob = aud.find(x => x.email === 'bob@example.com');
    expect(await m.mkt.unsubscribe('bob@example.com', 'wrong-token')).toBe(false);
    expect(await m.mkt.unsubscribe('bob@example.com', bob.tok)).toBe(true);
    emails.length = 0;
    const r = await adminCall(m, { action: 'campaign', subject: 'New drop', body: 'Hello <b>friends</b>\n\nOur new tee is here.' });
    expect(r.statusCode).toBe(200); expect(r.body.sent).toBe(1);
    expect(emails).toHaveLength(1); expect(emails[0].to).toBe('ravi@example.com');
    expect(emails[0].html).toContain('/unsubscribe?e=ravi%40example.com&amp;t='); expect(emails[0].html).not.toContain('<b>friends</b>'); expect(emails[0].html).toContain('&lt;b&gt;');
    expect((await adminCall(m, { action: 'campaign', subject: 'Again', body: 'Second one right away' })).statusCode).toBe(429);
  });
  it('test sends go to you only; a campaign needs a subject, a body and SITE_URL', async () => {
    const m = await setup(EMAIL);
    await paidOrder(m, other, cartOf([TEE, 'L', 1]), { marketing: true });
    emails.length = 0;
    const t = await adminCall(m, { action: 'campaign', subject: 'Preview', body: 'Just a test of it', test: true });
    expect(t.statusCode).toBe(200); expect(emails.map(e => e.to)).toEqual(['me@example.com']);
    expect((await adminCall(m, { action: 'campaign', subject: '', body: '' })).statusCode).toBe(400);
    const m2 = await setup({ ...EMAIL, SITE_URL: '' });
    expect((await adminCall(m2, { action: 'campaign', subject: 'Hello there', body: 'A message long enough' })).statusCode).toBe(409);
  });
  it('the unsubscribe page endpoint works with the right token and refuses guesses', async () => {
    const m = await setup(EMAIL);
    await paidOrder(m, other, cartOf([TEE, 'L', 1]), { marketing: true });
    const [rec] = await m.mkt.audience();
    const post = (b) => call(m.account, { body: { action: 'unsubscribe', ...b } });
    expect((await post({ email: 'ravi@example.com', token: 'x' })).statusCode).toBe(400);
    expect((await post({ email: 'nobody@example.com', token: rec.tok })).statusCode).toBe(400);
    expect((await post({ email: 'ravi@example.com', token: rec.tok })).statusCode).toBe(200);
    expect((await m.mkt.audience())[0].unsubscribed).toBe(true);
    await paidOrder(m, other, cartOf([TEE, 'M', 1]), { marketing: true });             // ticking the box again re-subscribes
    expect((await m.mkt.audience())[0].unsubscribed).toBe(false);
  });
  it('the customer list adds up orders and spend per email and never lists unpaid attempts', async () => {
    const m = await setup();
    await place(m, { ...customer, email: 'ghost@example.com', phone: '9111111111' });
    await paidOrder(m, customer, cartOf([TEE, 'M', 1])); await paidOrder(m, customer, cartOf([PANTS, '32', 1])); await paidOrder(m, other, cartOf([TEE, 'L', 1]));
    const list = (await adminCall(m, null, { view: 'customers' })).body.customers;
    expect(list.map(c => c.email).sort()).toEqual(['asha@example.com', 'ravi@example.com']);
    const asha = list.find(c => c.email === 'asha@example.com'); expect(asha.orders).toBe(2); expect(asha.spent).toBeGreaterThan(1000);
    const csv = (await adminCall(m, null, { view: 'export-customers' })).body.csv;
    expect(csv.split('\n')[0]).toBe('name,email,phone,orders,spent,last_order,marketing_consent');
  });
});

/* ───────── dashboard ───────── */
describe('dashboard', () => {
  it('counts placed orders only, subtracts refunds, lists low stock, shows COD still to collect', async () => {
    const m = await setup();
    await place(m);                                                                    // unpaid: ignored
    const a = await paidOrder(m, customer, cartOf([TEE, 'S', 5]));                     // S has 5: now 0 left
    const cod = await call(m.create, { body: { cart: cartOf([PANTS, '32', 1]), customer: other, payment: 'cod' } });
    expect(cod.statusCode).toBe(200);
    const oa = await m.orders.getOrder(a);
    await adminCall(m, { action: 'refund', id: a, amount: 100 });
    const d = (await adminCall(m, null, { view: 'dashboard' })).body;
    expect(d.totals.orders).toBe(2);
    const codOrder = await m.orders.getOrder(cod.body.orderId);
    expect(d.totals.revenue).toBe(oa.totals.total + codOrder.totals.total - 100);
    expect(d.totals.codToCollect).toBe(codOrder.totals.total); expect(d.totals.refunded).toBe(100);
    expect(d.series).toHaveLength(30); expect(d.series.at(-1).orders).toBe(2);
    expect(d.top[0]).toMatchObject({ id: TEE, units: 5 });
    expect(d.lowStock.some(x => x.id === TEE && x.size === 'S' && x.available === 0)).toBe(true);
    expect(d.status.paid).toBeGreaterThanOrEqual(1);
  });
});

describe('admin protection', () => {
  it('every new view and action needs the admin token', async () => {
    const m = await setup();
    for (const v of ['dashboard', 'products', 'customers', 'export-products', 'export-customers', 'invoice', 'slip']) expect((await call(m.admin, { method: 'GET', query: { view: v } })).statusCode).toBe(401);
    for (const a of ['product-update', 'product-reset', 'csv-import', 'refund', 'campaign']) expect((await call(m.admin, { body: { action: a } })).statusCode).toBe(401);
  });
});

/* ───────── new products from a CSV ───────── */
describe('product CSV (new products)', () => {
  it('turns good rows into catalogue entries', async () => {
    const { rowsToProducts, renderModule } = await import('../src/lib/productCsv.js');
    const csv = `id,name,category,price,mrp,image,sizes,tags,preorder\nown-cargo-black,"Black Cargo, Relaxed",bottom,1499,1999,https://cdn.example.com/a.jpg,S:5|M:10,streetwear|black,\nown-cap,Cap,accessory,399,,https://cdn.example.com/c.jpg,OS:20,casual,2027-02-01\n`;
    const { products, errors } = rowsToProducts(csv, { existingIds: ['own-sample-tee'] });
    expect(errors).toEqual([]);
    expect(products[0]).toMatchObject({ id: 'own-cargo-black', name: 'Black Cargo, Relaxed', price: 1499, mrp: 1999, fulfilment: 'own', sizes: { S: 5, M: 10 }, tags: ['streetwear', 'black'] });
    expect(products[1].preorder).toEqual({ shipsOn: '2027-02-01' });
    expect(renderModule(products)).toContain('export const importedProducts');
  });
  it('rejects bad rows with the line number and writes nothing', async () => {
    const { rowsToProducts } = await import('../src/lib/productCsv.js');
    const head = 'id,name,category,price,image,sizes,tags\n';
    const bad = (row, re) => { const r = rowsToProducts(head + row, { existingIds: ['own-sample-tee'] }); expect(r.products).toEqual([]); expect(r.errors.join(' ')).toMatch(re); };
    bad('Bad Id,Name here,top,500,https://x.co/a.jpg,S:1,casual', /Line 2.*id/);
    bad('own-sample-tee,Name here,top,500,https://x.co/a.jpg,S:1,casual', /already used/);
    bad('own-x1,Name here,hat,500,https://x.co/a.jpg,S:1,casual', /category/);
    bad('own-x1,Name here,top,5.5,https://x.co/a.jpg,S:1,casual', /price/);
    bad('own-x1,Name here,top,500,http://x.co/a.jpg,S:1,casual', /https/);
    bad('own-x1,Name here,top,500,javascript:alert(1),S:1,casual', /https/);
    bad('own-x1,Name here,top,500,https://x.co/a.jpg,S-1,casual', /sizes/);
    bad('own-x1,Name here,top,500,https://x.co/a.jpg,,casual', /size/);
    bad('own-x1,Name here,top,500,https://x.co/a.jpg,S:1,casual\nown-x1,Other name,top,500,https://x.co/a.jpg,S:1,casual', /Line 3.*already used/);
    expect(rowsToProducts('name\nx').errors[0]).toMatch(/Missing column/);
    expect(rowsToProducts(head + 'own-x1,Name here,top,500,https://x.co/a.jpg,S:1,').errors[0]).toMatch(/tag/);
  });
  it('mrp must be above price; preorder must be a real date', async () => {
    const { rowsToProducts } = await import('../src/lib/productCsv.js');
    const r = rowsToProducts('id,name,category,price,mrp,image,sizes,tags,preorder\nown-x1,Name here,top,500,400,https://x.co/a.jpg,S:1,casual,\nown-x2,Name here,top,500,,https://x.co/a.jpg,S:1,casual,2027-13-45\n');
    expect(r.errors).toHaveLength(2);
  });
});
