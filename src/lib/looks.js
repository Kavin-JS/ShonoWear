/*
  SHONOWEAR — looks and outfit builder (pure logic, no React; used by the pages, tests and the build step).
  A look is a list of catalogue products. Prices come from the catalogue only; the URL and storage only ever carry product ids.
*/
import { catalog } from '../data/catalog.js';
import { LOOKS } from '../data/looks.js';
import { STORE } from '../data/storeConfig.js';
import { isOwn, computeTotals, sizesOf } from './store.js';
import { unitPrice } from './offers.js';
import { addToBag } from './bag.js';

export const SLOTS = ['top', 'bottom', 'outerwear', 'footwear', 'accessory'];
export const SLOT_LABEL = { top: 'Top', bottom: 'Bottom', outerwear: 'Layer', footwear: 'Shoes', accessory: 'Extra' };
export const MAX_LOOK_ITEMS = 6;
const byId = () => new Map(catalog.map(p => [p.id, p]));

/** Ids → products that exist, no repeats, capped. Unknown ids are dropped silently. */
export function lookItems(ids) {
  const idx = byId(), seen = new Set(), out = [];
  for (const id of Array.isArray(ids) ? ids : []) {
    const p = idx.get(String(id));
    if (p && !seen.has(p.id)) { seen.add(p.id); out.push(p); }
    if (out.length >= MAX_LOOK_ITEMS) break;
  }
  return out;
}
/** Curated looks that still have at least 2 real products. */
export function activeLooks() {
  return LOOKS.map(l => ({ ...l, products: lookItems(l.items) })).filter(l => l.products.length >= 2);
}
export const lookBySlug = (slug) => activeLooks().find(l => l.slug === slug) || null;
/** Looks that include a product (for "Worn in these looks" on the product page). */
export const looksWith = (id) => activeLooks().filter(l => l.products.some(p => p.id === id));

/** Products a visitor can choose for a builder slot. */
export const pickables = (slot) => catalog.filter(p => p.category === slot);

/** ?top=id&bottom=id → {slot: product}. Ignores unknown ids and ids placed in the wrong slot. */
export function parseBuild(search) {
  const q = new URLSearchParams(search || '');
  const out = {};
  for (const slot of SLOTS) {
    const p = catalog.find(x => x.id === q.get(slot));
    if (p && p.category === slot) out[slot] = p;
  }
  return out;
}
export function buildQuery(sel) {
  const q = new URLSearchParams();
  for (const slot of SLOTS) if (sel[slot]) q.set(slot, sel[slot].id);
  return q.toString();
}

/**
 * What the look costs. Own items are bought here, so they get the real totals (sale price, bundle discount, delivery).
 * Partner items are bought elsewhere at the partner's price, so they are summed separately and never mixed into our total.
 * `sizes` maps product id → chosen size.
 */
export function lookSummary(products, sizes = {}, now = Date.now()) {
  const own = products.filter(isOwn), partner = products.filter(p => !isOwn(p));
  const lines = own.filter(p => sizes[p.id]).map(p => ({ product: p, qty: 1 }));
  const totals = computeTotals(lines, { now });
  return {
    ownCount: own.length, partnerCount: partner.length,
    ownItemsSubtotal: own.reduce((n, p) => n + unitPrice(p, now), 0),
    sized: lines.length, totals,
    partnerTotal: partner.reduce((n, p) => n + p.price, 0),
    missingSize: own.filter(p => !sizes[p.id]).map(p => p.id),
    bundleNote: lines.length >= (STORE.bundleDiscount?.minQty ?? Infinity) && totals.bundleDiscount > 0,
  };
}

/**
 * All or nothing: if any own item has no size chosen, or its size is sold out, nothing is added and the page says what to fix.
 * (A half-filled bag with the cap but not the trousers is worse than a clear message.)
 */
export function addLookToBag(products, sizes, left = () => Infinity) {
  const added = [], needSize = [], soldOut = [], ready = [];
  for (const p of products) {
    if (!isOwn(p)) continue;
    const size = sizes[p.id];
    if (!size || !sizesOf(p).includes(size)) needSize.push(p.id);
    else if (!(left(p.id, size) > 0)) soldOut.push(p.id);
    else ready.push([p.id, size]);
  }
  if (needSize.length || soldOut.length) return { added, needSize, soldOut };
  for (const [id, size] of ready) if (addToBag(id, { size }).ok) added.push(id);
  return { added, needSize, soldOut };
}

/* ── "My looks": saved builder looks, ids only ── */
const KEY = 'sw_my_looks';
export function myLooks() {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || '[]');
    return (Array.isArray(raw) ? raw : []).filter(l => l && typeof l === 'object').map(l => ({ id: String(l.id), name: String(l.name || 'My look').slice(0, 40), products: lookItems(l.ids) })).filter(l => l.products.length >= 1).slice(0, 20);
  } catch { return []; }
}
export function saveMyLook(name, products) {
  const ids = lookItems(products.map(p => p.id)).map(p => p.id);
  if (!ids.length) return myLooks();
  const next = [{ id: Date.now().toString(36), name: String(name || 'My look').slice(0, 40), ids }, ...myLooks().map(l => ({ id: l.id, name: l.name, ids: l.products.map(p => p.id) }))].slice(0, 20);
  try { localStorage.setItem(KEY, JSON.stringify(next)); } catch { /* storage blocked */ }
  return myLooks();
}
export function deleteMyLook(id) {
  const next = myLooks().filter(l => l.id !== id).map(l => ({ id: l.id, name: l.name, ids: l.products.map(p => p.id) }));
  try { localStorage.setItem(KEY, JSON.stringify(next)); } catch { /* ignore */ }
  return myLooks();
}
