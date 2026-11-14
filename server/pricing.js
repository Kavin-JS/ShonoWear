/**
 * SHONOWEAR — server/pricing.js
 * The one place that prices an order. The bag's price preview (/api/cart) and checkout both call it,
 * so what a customer is shown is what they are charged. Nothing here writes to the store.
 */
import { parseCart } from './cart.js';
import { refreshOverrides } from './overrides.js';
import { checkPromo } from './promos.js';
import { giftBalance } from './giftcards.js';
import { computeTotals } from '../src/lib/store.js';
import { saleFor, unitPrice } from '../src/lib/offers.js';
import { STORE } from '../src/data/storeConfig.js';

/** Whether cash on delivery is offered for this order, and if not, why. */
export function codEligibility({ totalBeforeCod, hasGift, hasPreorder, pincode }) {
  const c = STORE.cod;
  if (!c?.enabled) return { available: false, reason: 'Cash on delivery is not offered.' };
  if (hasGift) return { available: false, reason: 'Gift cards can be used with online payment only.' };
  if (hasPreorder) return { available: false, reason: 'Pre-orders are paid online.' };
  if (totalBeforeCod > c.maxOrder) return { available: false, reason: `Cash on delivery is available up to ₹${c.maxOrder.toLocaleString('en-IN')}.` };
  if (pincode && c.blockedPincodePrefixes.some(p => String(pincode).startsWith(p))) return { available: false, reason: 'Cash on delivery is not available at this pincode.' };
  return { available: true, fee: c.fee };
}

/**
 * @param {{cart, code?, gift?, payment?: 'online'|'cod', customer?: object, pincode?: string, strict?: boolean, now?: number}} input
 * strict (checkout): an unavailable COD choice is an error. Not strict (price preview): fall back to online and report why.
 * @returns {Promise<{ok:false,error:string}|{ok:true, lines, items, totals, promo, gift, cod, shipsBy, payment}>}
 * Problems with a promo or gift code do NOT fail the whole price: they come back in `promo.error` / `gift.error`
 * (the totals then simply leave that discount out), so the bag can show the reason next to the box.
 */
export async function priceOrder({ cart, code, gift, payment = 'online', customer = null, pincode = '', strict = true, now = Date.now() }) {
  await refreshOverrides({ force: strict });   // checkout always prices from the latest edits; the bag preview may use a few-second-old copy
  const parsed = parseCart(cart);
  if (!parsed.ok) return { ok: false, error: parsed.error };
  const lines = parsed.lines.map(l => ({ ...l, product: l.product }));

  let promoRes = null, promoError = null;
  if (code) {
    promoRes = await checkPromo(code, { now, customer });
    if (!promoRes.ok) promoError = promoRes.reason;
  }
  let giftRes = null, giftError = null;
  if (gift) {
    giftRes = await giftBalance(gift, now);
    if (!giftRes.ok) giftError = giftRes.reason;
  }

  const hasPreorder = lines.some(l => l.preorder);
  let useCod = payment === 'cod';
  const base = { now, coupon: promoRes?.ok ? promoRes.promo.coupon : null };
  // Price once without COD or gift card to test COD limits, then for real.
  const plain = computeTotals(lines, base);
  const cod = codEligibility({ totalBeforeCod: plain.total, hasGift: Boolean(giftRes?.ok), hasPreorder, pincode: pincode || customer?.pincode });
  if (useCod && !cod.available) { if (strict) return { ok: false, error: cod.reason }; useCod = false; }

  const totals = computeTotals(lines, { ...base, cod: useCod, giftBalance: giftRes?.ok && !useCod ? giftRes.balance : 0 });
  let promo = null;
  if (code) {
    if (promoRes?.ok && totals.couponError) promo = { ok: false, code: promoRes.promo.code, error: totals.couponError };
    else if (promoRes?.ok) promo = { ok: true, code: promoRes.promo.code, kind: promoRes.promo.kind, label: promoRes.promo.label, applied: totals.couponDiscount, beaten: totals.couponBeaten, referrerEmail: promoRes.promo.referrerEmail, coupon: promoRes.promo.coupon };
    else promo = { ok: false, code: String(code).slice(0, 24), error: promoError };
  }
  const giftOut = gift ? (giftRes?.ok
    ? (useCod ? { ok: false, error: 'Gift cards can be used with online payment only.' } : { ok: true, code: giftRes.code, balance: giftRes.balance, applied: totals.giftApplied })
    : { ok: false, error: giftError }) : null;

  const items = lines.map(l => {
    const price = unitPrice(l.product, now);
    return { id: l.id, name: l.product.name, size: l.size, qty: l.qty, price, ...(price < l.product.price ? { listPrice: l.product.price, sale: saleFor(l.product, now)?.id } : {}), ...(l.preorder ? { preorder: l.preorder } : {}) };
  });
  const dates = lines.map(l => l.preorder).filter(Boolean).sort();
  return { ok: true, lines, items, totals, promo, gift: giftOut, cod: { ...cod, selected: useCod }, shipsBy: dates.length ? dates[dates.length - 1] : null, payment: useCod ? 'cod' : 'online' };
}
