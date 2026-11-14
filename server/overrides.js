/**
 * SHONOWEAR — live price and stock edits (set in /admin, stored in Redis key `pov`).
 * The catalogue file stays the base. An edit overrides price, MRP or the stock base of an EXISTING size of an own product,
 * by patching the same product objects the rest of the server already uses, so pricing, carts and stock need no changes.
 * Money paths (checkout) call refreshOverrides({ force: true }) so a price or stock change applies at once;
 * other readers refresh at most every TTL_MS, which is also how long another server instance can lag behind an edit.
 */
import { catalog } from '../src/data/catalog.js';
import { store, hgetall } from './guard.js';

export const TTL_MS = 10_000;
const own = catalog.filter(p => p.fulfilment === 'own');
const byId = new Map(own.map(p => [p.id, p]));
const baseline = new Map(own.map(p => [p.id, { price: p.price, mrp: p.mrp, sizes: { ...p.sizes } }]));
let loadedAt = 0;
let current = {};

export const baselineOf = (id) => baseline.get(id) || null;
export const isEditable = (id) => byId.has(id);

/** Validate an edit. Returns { ok, value } with a clean override, or { ok:false, error }. */
export function cleanOverride(id, input) {
  const b = baseline.get(id);
  if (!b) return { ok: false, error: 'Unknown product (only products we ship can be edited).' };
  const out = {};
  if (input.price !== undefined && input.price !== null && input.price !== '') {
    const n = Number(input.price);
    if (!Number.isInteger(n) || n < 1 || n > 100000) return { ok: false, error: 'Price must be a whole number of rupees between 1 and 100000.' };
    out.price = n;
  }
  if (input.mrp !== undefined && input.mrp !== null && input.mrp !== '') {
    const n = Number(input.mrp);
    if (!Number.isInteger(n) || n < 1 || n > 200000) return { ok: false, error: 'MRP must be a whole number of rupees.' };
    out.mrp = n;
  }
  const price = out.price ?? b.price;
  if (out.mrp !== undefined && out.mrp <= price) return { ok: false, error: 'MRP must be higher than the price (leave it empty to hide the strike-through).' };
  if (input.stock && typeof input.stock === 'object') {
    out.stock = {};
    for (const [size, v] of Object.entries(input.stock)) {
      if (!Object.hasOwn(b.sizes, size)) return { ok: false, error: `Size ${size} is not on this product. New sizes are added in catalog.js.` };
      const n = Number(v);
      if (!Number.isInteger(n) || n < 0 || n > 100000) return { ok: false, error: 'Stock must be a whole number, 0 or more.' };
      out.stock[size] = n;
    }
    if (!Object.keys(out.stock).length) delete out.stock;
  }
  return { ok: true, value: out };
}

export function applyOverrides(map) {
  current = map || {};
  for (const p of own) {
    const b = baseline.get(p.id), o = current[p.id] || {};
    p.price = o.price ?? b.price;
    if (o.mrp !== undefined) p.mrp = o.mrp; else if (b.mrp !== undefined) p.mrp = b.mrp; else delete p.mrp;
    p.sizes = { ...b.sizes, ...(o.stock || {}) };
  }
}

const parseAll = (all) => {
  const out = {};
  for (const [id, raw] of Object.entries(hgetall(all))) {
    if (!byId.has(id)) continue;
    try { const v = typeof raw === 'string' ? JSON.parse(raw) : raw; if (v && typeof v === 'object') out[id] = v; } catch { /* ignore a bad row */ }
  }
  return out;
};

export async function refreshOverrides({ force = false } = {}) {
  if (!force && Date.now() - loadedAt < TTL_MS) return;
  try {
    const [all] = await store([['HGETALL', 'pov']]);
    applyOverrides(parseAll(all));
    loadedAt = Date.now();
  } catch { /* the store is down: keep what we have; checkout will fail on its own store calls anyway */ }
}

export async function saveOverride(id, value) {
  if (!Object.keys(value).length) await store([['HDEL', 'pov', id]]);
  else await store([['HSET', 'pov', id, JSON.stringify({ ...value, updatedAt: new Date().toISOString() })]]);
  await refreshOverrides({ force: true });
}
export async function resetOverride(id) { await store([['HDEL', 'pov', id]]); await refreshOverrides({ force: true }); }
export const currentOverrides = () => current;

/** What the browser needs to show current prices (no stock). */
export function publicOverrides() {
  const out = {};
  for (const [id, o] of Object.entries(current)) if (o.price !== undefined || o.mrp !== undefined) out[id] = { ...(o.price !== undefined ? { price: o.price } : {}), ...(o.mrp !== undefined ? { mrp: o.mrp } : {}) };
  return out;
}
export function resetForTests() { loadedAt = 0; applyOverrides({}); }
