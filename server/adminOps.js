/**
 * SHONOWEAR — owner tools behind /api/admin/orders: dashboard numbers, product price/stock edits, CSV bulk edit, customer list, invoices.
 * Everything here is admin-only (the handler checks the admin token first).
 */
import { catalog } from '../src/data/catalog.js';
import { STORE } from '../src/data/storeConfig.js';
import { store, hgetall } from './guard.js';
import { listOrders } from './orders.js';
import { refreshOverrides, cleanOverride, saveOverride, resetOverride, currentOverrides, baselineOf } from './overrides.js';
import { stockRow } from './stock.js';
import { eKey } from './ekey.js';
import { invoiceNumber } from './invoices.js';
import { buildInvoice } from '../src/lib/invoice.js';
import { parseCsv, toCsv } from '../src/lib/csv.js';
import { refundList } from './refunds.js';

const own = catalog.filter(p => p.fulfilment === 'own');
const SOLD = new Set(['paid', 'cod_placed', 'shipped', 'delivered']);
const istDay = (iso) => new Date(new Date(iso).getTime() + 5.5 * 3600_000).toISOString().slice(0, 10);
const goodsOrder = (o) => o.kind !== 'giftcard';

/* ── dashboard ── */
export async function dashboard({ now = Date.now(), days = 30 } = {}) {
  await refreshOverrides({ force: true });
  const orders = await listOrders(1000);
  const placed = orders.filter(o => SOLD.has(o.status));
  const goods = placed.filter(goodsOrder);
  const refunded = (o) => (o.refunds || []).reduce((n, r) => n + r.amount, 0);
  const revenue = goods.reduce((n, o) => n + o.totals.total + (o.totals.giftApplied || 0) - refunded(o), 0);
  const series = [];
  for (let i = days - 1; i >= 0; i--) series.push({ day: istDay(new Date(now - i * 86400_000).toISOString()), orders: 0, revenue: 0 });
  const at = new Map(series.map(s => [s.day, s]));
  for (const o of goods) { const s = at.get(istDay(o.paidAt || o.createdAt)); if (s) { s.orders += 1; s.revenue += o.totals.total + (o.totals.giftApplied || 0); } }
  const top = new Map();
  for (const o of goods) for (const i of o.items) { const t = top.get(i.id) || { id: i.id, name: i.name, units: 0, revenue: 0 }; t.units += i.qty; t.revenue += i.price * i.qty; top.set(i.id, t); }
  const status = {};
  for (const o of orders) status[o.status] = (status[o.status] || 0) + 1;
  const low = [];
  for (const p of own) for (const size of Object.keys(p.sizes || {})) {
    const r = await stockRow(p.id, size, now);
    if (r.available <= STORE.lowStockThreshold) low.push({ id: p.id, name: p.name, size, available: r.available });
  }
  const [pendingRev] = await store([['LRANGE', 'rev:index', 0, 199]]);
  return {
    totals: { orders: goods.length, revenue, aov: goods.length ? Math.round(revenue / goods.length) : 0,
      codToCollect: goods.filter(o => o.status !== 'delivered' && o.payment?.method === 'cod').reduce((n, o) => n + o.totals.total, 0),
      giftCardSales: placed.filter(o => !goodsOrder(o)).reduce((n, o) => n + o.totals.total, 0),
      refunded: orders.reduce((n, o) => n + refunded(o), 0) },
    series, top: [...top.values()].sort((a, b) => b.units - a.units).slice(0, 5), status, lowStock: low.slice(0, 30),
    needsAttention: { toShip: orders.filter(o => ['paid', 'cod_placed'].includes(o.status) && goodsOrder(o)).length, reviewsIndexed: (pendingRev || []).length },
  };
}

/* ── products: price and stock ── */
export async function productsAdmin(now = Date.now()) {
  await refreshOverrides({ force: true });
  const ov = currentOverrides();
  const out = [];
  for (const p of own) {
    const b = baselineOf(p.id);
    const sizes = [];
    for (const size of Object.keys(b.sizes)) sizes.push({ ...(await stockRow(p.id, size, now)), base: b.sizes[size] });
    out.push({ id: p.id, name: p.name, sample: Boolean(p.sample), price: p.price, mrp: p.mrp ?? null, basePrice: b.price, baseMrp: b.mrp ?? null, edited: Boolean(ov[p.id]), sizes });
  }
  return out;
}

/** "available now" per size → the stored base is that number plus what is already sold, so held/sold units keep their meaning. */
async function baseFor(id, availableNow) {
  const out = {};
  for (const [size, n] of Object.entries(availableNow || {})) {
    const r = await stockRow(id, size);
    out[size] = Number(n) + r.sold;
  }
  return out;
}

export async function updateProduct(id, { price, mrp, available, clearMrp }) {
  await refreshOverrides({ force: true });
  const cur = { ...(currentOverrides()[id] || {}) };
  delete cur.updatedAt;
  const input = { price, mrp };
  if (available && typeof available === 'object') {
    for (const [s, n] of Object.entries(available)) { const v = Number(n); if (!Number.isInteger(v) || v < 0 || v > 100000) return { ok: false, status: 400, error: 'Stock must be a whole number, 0 or more.' }; void s; }
    const check = cleanOverride(id, { stock: available });
    if (!check.ok) return { ok: false, status: 400, error: check.error };
    input.stock = await baseFor(id, available);
  }
  const merged = { ...cur };
  const c = cleanOverride(id, { price: input.price ?? cur.price, mrp: clearMrp ? undefined : (input.mrp ?? cur.mrp), stock: { ...(cur.stock || {}), ...(input.stock || {}) } });
  if (!c.ok) return { ok: false, status: 400, error: c.error };
  Object.assign(merged, c.value);
  if (clearMrp) delete merged.mrp;
  if (c.value.price === undefined) delete merged.price;
  await saveOverride(id, merged);
  return { ok: true };
}
export async function resetProduct(id) {
  if (!baselineOf(id)) return { ok: false, status: 404, error: 'Unknown product.' };
  await resetOverride(id);
  return { ok: true };
}

/* ── CSV ── */
export async function exportProductsCsv() {
  const rows = [['id', 'name', 'size', 'stock', 'price', 'mrp']];
  for (const p of await productsAdmin()) for (const s of p.sizes) rows.push([p.id, p.name, s.size, s.available, p.price, p.mrp ?? '']);
  return toCsv(rows);
}
export async function exportCustomersCsv() {
  const rows = [['name', 'email', 'phone', 'orders', 'spent', 'last_order', 'marketing_consent']];
  for (const c of await customers()) rows.push([c.name, c.email, c.phone, c.orders, c.spent, c.lastOrder, c.marketing ? (c.unsubscribed ? 'unsubscribed' : 'yes') : 'no']);
  return toCsv(rows);
}

/** Bulk edit from a CSV with columns id,size,stock,price,mrp (name is ignored; extra columns too). All rows must be valid, or nothing is applied. */
export async function importCsv(text, { dryRun = true } = {}) {
  const rows = parseCsv(text);
  if (rows.length < 2) return { ok: false, status: 400, errors: ['The file has no rows.'] };
  const head = rows[0].map(h => h.toLowerCase());
  const col = (n) => head.indexOf(n);
  if (col('id') < 0) return { ok: false, status: 400, errors: ['The first row must have an "id" column.'] };
  if (rows.length > 501) return { ok: false, status: 400, errors: ['Up to 500 rows at a time.'] };
  const errors = [], plan = new Map();
  rows.slice(1).forEach((r, i) => {
    const line = i + 2, id = r[col('id')];
    const p = own.find(x => x.id === id);
    if (!p) return errors.push(`Line ${line}: "${id}" is not a product we ship.`);
    const p2 = plan.get(id) || { stock: {} };
    const get = (n) => (col(n) >= 0 ? r[col(n)] : '');
    const size = get('size'), stock = get('stock'), price = get('price'), mrp = get('mrp');
    if (stock !== '' && stock !== undefined) {
      if (!size) return errors.push(`Line ${line}: stock needs a size.`);
      if (!Object.hasOwn(p.sizes, size)) return errors.push(`Line ${line}: ${id} has no size "${size}".`);
      if (!/^\d{1,6}$/.test(stock)) return errors.push(`Line ${line}: stock must be a whole number.`);
      p2.stock[size] = Number(stock);
    }
    if (price !== '' && price !== undefined) { if (!/^\d{1,6}$/.test(price)) return errors.push(`Line ${line}: price must be a whole number.`); p2.price = Number(price); }
    if (mrp !== '' && mrp !== undefined) { if (!/^\d{1,6}$/.test(mrp)) return errors.push(`Line ${line}: mrp must be a whole number.`); p2.mrp = Number(mrp); }
    plan.set(id, p2);
  });
  if (!errors.length) {
    for (const [id, v] of plan) { const c = cleanOverride(id, { price: v.price, mrp: v.mrp, stock: v.stock }); if (!c.ok) errors.push(`${id}: ${c.error}`); }
  }
  if (errors.length) return { ok: false, status: 400, errors: errors.slice(0, 20) };
  const summary = [...plan].map(([id, v]) => ({ id, price: v.price ?? null, mrp: v.mrp ?? null, sizes: Object.keys(v.stock).length }));
  if (dryRun) return { ok: true, dryRun: true, products: summary };
  for (const [id, v] of plan) await updateProduct(id, { price: v.price, mrp: v.mrp, available: Object.keys(v.stock).length ? v.stock : undefined });
  return { ok: true, applied: summary };
}

/* ── customers (from orders) ── */
export async function customers() {
  const orders = await listOrders(1000);
  const mkt = hgetall((await store([['HGETALL', 'mkt']]))[0]);
  const by = new Map();
  for (const o of orders) {
    if (!SOLD.has(o.status) || !o.customer?.email) continue;
    const k = eKey(o.customer.email);
    const c = by.get(k) || { name: o.customer.name, email: o.customer.email, phone: o.customer.phone, orders: 0, spent: 0, lastOrder: '' };
    c.orders += 1; c.spent += o.totals.total + (o.totals.giftApplied || 0);
    if (o.createdAt > c.lastOrder) { c.lastOrder = o.createdAt; c.name = o.customer.name; c.phone = o.customer.phone; }
    by.set(k, c);
  }
  const out = [];
  for (const [k, c] of by) {
    const [un] = mkt?.[k] ? await store([['GET', `mktun:${k}`]]) : [null];
    out.push({ ...c, lastOrder: c.lastOrder.slice(0, 10), marketing: Boolean(mkt?.[k]), unsubscribed: Boolean(un) });
  }
  return out.sort((a, b) => b.spent - a.spent);
}

/* ── invoices and slips ── */
export async function invoiceFor(order) {
  const calc = buildInvoice(order, { gstin: STORE.gstin, gst: STORE.gst, categoryOf: (id) => catalog.find(p => p.id === id)?.category || 'top' });
  const number = await invoiceNumber(order);
  return {
    number, date: (order.paidAt || order.createdAt).slice(0, 10), order, calc,
    seller: { legalName: STORE.legalName, address: STORE.address, gstin: STORE.gstin, email: STORE.supportEmail },
    refunds: await refundList(order.id),
  };
}
