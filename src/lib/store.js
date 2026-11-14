/* SHONOWEAR — store helpers shared by website and server (pure, no I/O) */
import { STORE } from '../data/storeConfig.js';
import { unitPrice } from './offers.js';

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

/** What a coupon is worth on `base` rupees (whole rupees, rounded down). */
export function couponAmount(c, base) {
  if (!c || !(base > 0)) return 0;
  const raw = c.kind === 'percent' ? Math.floor((base * c.value) / 100) : Math.min(c.value, base);
  return Math.max(0, c.maxDiscount ? Math.min(raw, c.maxDiscount) : raw);
}

/** Whether a coupon can apply to this much eligible spend (sale items are not eligible unless STORE.stackOnSale). */
export function couponCheck(c, eligible) {
  if (!(eligible > 0)) return { ok: false, reason: 'This code does not apply to sale items.' };
  if (c.minSubtotal && eligible < c.minSubtotal) return { ok: false, reason: `Add ${inr(c.minSubtotal - eligible)} more to use this code.` };
  return { ok: true };
}

/**
 * Totals in whole rupees. `lines` = [{ product, qty }] for OWN products only. Used by the site AND the server.
 *   coupon       a resolved coupon { kind:'percent'|'flat', value, minSubtotal?, maxDiscount?, stackWithBundle? } (server only)
 *   cod          add the cash-on-delivery fee
 *   giftBalance  gift-card rupees available; `giftApplied` is what this order uses
 * Without a coupon, cod or gift card the result is exactly the bundle-only totals.
 */
export function computeTotals(lines, { now = Date.now(), sales, coupon = null, cod = false, giftBalance = 0 } = {}) {
  let subtotal = 0, saleSavings = 0, eligible = 0, eligibleQty = 0, anySale = false;
  for (const l of lines) {
    const unit = unitPrice(l.product, now, sales);
    const line = unit * l.qty;
    subtotal += line;
    if (unit < l.product.price) { saleSavings += (l.product.price - unit) * l.qty; anySale = true; }
    if (unit === l.product.price || STORE.stackOnSale) { eligible += line; eligibleQty += l.qty; }
  }
  const bundle = bundleDiscount(eligible, eligibleQty);

  let couponApplied = 0, couponError = null, couponBeaten = false, bundleApplied = bundle;
  if (coupon) {
    const chk = couponCheck(coupon, eligible);
    if (!chk.ok) couponError = chk.reason;
    else {
      const raw = couponAmount(coupon, eligible - (coupon.stackWithBundle ? bundle : 0));
      if (coupon.stackWithBundle) couponApplied = raw;
      else if (raw > bundle) { couponApplied = raw; bundleApplied = 0; }
      else couponBeaten = true;                 // the bundle discount is already better: keep it, do not stack
    }
  }
  const discount = bundleApplied + couponApplied;
  const net = subtotal - discount;
  const shipping = net === 0 ? 0 : net >= STORE.freeShippingOver ? 0 : STORE.shippingFee;
  const codFee = cod && net > 0 ? STORE.cod.fee : 0;
  const gross = net + shipping + codFee;
  const giftApplied = Math.max(0, Math.min(Math.floor(giftBalance) || 0, gross));
  return { subtotal, discount, bundleDiscount: bundleApplied, couponDiscount: couponApplied, couponError, couponBeaten, saleSavings, onSale: anySale, shipping, codFee, giftApplied, total: gross - giftApplied };
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
