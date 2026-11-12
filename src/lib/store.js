/* SHONOWEAR — store helpers shared by website and server (pure, no I/O) */
import { STORE } from '../data/storeConfig.js';

export const isOwn = (p) => p?.fulfilment === 'own';

const SIZE_ORDER = ['XS', 'S', 'M', 'L', 'XL', 'XXL', 'One size'];
export function sizesOf(p) {
  const names = Object.keys(p?.sizes || {});
  return names.sort((a, b) => {
    const ia = SIZE_ORDER.indexOf(a), ib = SIZE_ORDER.indexOf(b);
    if (ia >= 0 && ib >= 0) return ia - ib;
    if (ia >= 0) return -1;
    if (ib >= 0) return 1;
    return Number(a) - Number(b) || a.localeCompare(b);
  });
}

export const skuKey = (id, size) => `${id}:${size}`;
export const inr = (n) => `₹${Number(n).toLocaleString('en-IN')}`;

/** Bundle discount in whole rupees (rounded down), from the shared config. 0 when off or not enough items. */
export function bundleDiscount(subtotal, qty) {
  const b = STORE.bundleDiscount;
  if (!b || !(b.percent > 0) || qty < b.minQty) return 0;
  return Math.floor((subtotal * b.percent) / 100);
}

/** Items still needed to unlock the bundle discount (0 if already unlocked or the offer is off). */
export function bundleGap(qty) {
  const b = STORE.bundleDiscount;
  if (!b || !(b.percent > 0) || qty <= 0) return 0;
  return Math.max(0, b.minQty - qty);
}

/** Totals in whole rupees. `lines` = [{ product, qty }] for OWN products only. Used by the site AND the server. */
export function computeTotals(lines) {
  const subtotal = lines.reduce((n, l) => n + l.product.price * l.qty, 0);
  const qty = lines.reduce((n, l) => n + l.qty, 0);
  const discount = bundleDiscount(subtotal, qty);
  const net = subtotal - discount;
  const shipping = net === 0 ? 0 : net >= STORE.freeShippingOver ? 0 : STORE.shippingFee;
  return { subtotal, discount, shipping, total: net + shipping };
}

/** Percentage off, only when the catalogue gives a real printed price (`mrp`) above the selling price. */
export function discountPct(p) {
  if (!p || !Number.isInteger(p.mrp) || p.mrp <= p.price) return 0;
  const pct = Math.round((1 - p.price / p.mrp) * 100);
  return pct >= 5 ? pct : 0;
}

/** True for 30 days after `addedAt` (a catalogue date, YYYY-MM-DD). */
export function isNew(p, now = Date.now()) {
  const t = p?.addedAt ? Date.parse(p.addedAt) : NaN;
  return Number.isFinite(t) && now - t >= 0 && now - t < 30 * 86400_000;
}
