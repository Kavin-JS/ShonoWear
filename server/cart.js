/**
 * SHONOWEAR — server/cart.js
 * Turns the client's cart into trusted lines. The client only supplies ids, sizes and quantities;
 * names, prices and stock limits always come from the catalogue.
 */
import { catalog } from '../src/data/catalog.js';
import { STORE } from '../src/data/storeConfig.js';
import { isOwn } from '../src/lib/store.js';
import { isLiveMode } from './razorpay.js';

const products = new Map(catalog.map(p => [p.id, p]));

export function parseCart(raw) {
  if (!Array.isArray(raw) || raw.length === 0) return { ok: false, error: 'Your bag is empty.' };
  if (raw.length > 20) return { ok: false, error: 'Too many items in the bag.' };

  const lines = [];
  const seen = new Set();
  for (const r of raw) {
    const p = products.get(r?.id);
    if (!p || !isOwn(p)) return { ok: false, error: 'An item in your bag is no longer available.' };
    if (p.sample && isLiveMode()) return { ok: false, error: 'This product is not for sale.' };
    const size = String(r.size ?? '');
    if (!Object.hasOwn(p.sizes || {}, size)) return { ok: false, error: `Choose a valid size for ${p.name}.` };
    const qty = Number(r.qty);
    if (!Number.isInteger(qty) || qty < 1 || qty > STORE.maxQtyPerLine) return { ok: false, error: `Quantity for ${p.name} must be 1–${STORE.maxQtyPerLine}.` };
    const key = `${p.id}:${size}`;
    if (seen.has(key)) return { ok: false, error: 'Duplicate item in the bag.' };
    seen.add(key);
    lines.push({ product: p, id: p.id, size, qty });
  }
  return { ok: true, lines };
}
