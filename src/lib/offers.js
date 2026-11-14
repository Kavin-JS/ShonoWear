/* SHONOWEAR — flash sales and pre-orders (pure; shared by the website and the server) */
import { FLASH_SALES } from '../data/offers.js';

const ms = (iso) => { const t = Date.parse(iso); return Number.isFinite(t) ? t : NaN; };

/** The sale running right now for this product, or null. Own products only. */
export function saleFor(p, now = Date.now(), sales = FLASH_SALES) {
  if (!p || p.fulfilment !== 'own') return null;
  for (const s of sales) {
    const a = ms(s.startsAt), b = ms(s.endsAt);
    if (!(a <= now && now < b)) continue;
    if (!(s.percent >= 5 && s.percent <= 80)) continue;
    if (Array.isArray(s.productIds) && !s.productIds.includes(p.id)) continue;
    return s;
  }
  return null;
}

/** Whole-rupee price a customer pays per unit right now. */
export function unitPrice(p, now = Date.now(), sales = FLASH_SALES) {
  const s = saleFor(p, now, sales);
  if (!s) return p.price;
  return Math.max(1, Math.floor((p.price * (100 - s.percent)) / 100));
}

/** Pre-order: a product with `preorder: { shipsOn: 'YYYY-MM-DD' }` whose date is today or later (India time). Returns the date or null. */
export function preorderDate(p, now = Date.now()) {
  const d = p?.preorder?.shipsOn;
  if (typeof d !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(d)) return null;
  const end = Date.parse(`${d}T23:59:59+05:30`);
  return Number.isFinite(end) && now <= end ? d : null;
}

export const prettyDate = (d) => new Date(`${d}T12:00:00+05:30`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' });

/** "2d 4h 10m" / "3h 05m" / "4m 12s" until a moment, or '' when it has passed. */
export function countdown(endsAt, now = Date.now()) {
  let s = Math.floor((ms(endsAt) - now) / 1000);
  if (!(s > 0)) return '';
  const d = Math.floor(s / 86400); s -= d * 86400;
  const h = Math.floor(s / 3600); s -= h * 3600;
  const m = Math.floor(s / 60); s -= m * 60;
  if (d) return `${d}d ${h}h ${m}m`;
  if (h) return `${h}h ${String(m).padStart(2, '0')}m`;
  return `${m}m ${String(s).padStart(2, '0')}s`;
}
