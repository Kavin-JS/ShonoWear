/*
  SHONOWEAR — delivery estimate from a pincode (pure).
  This is an ESTIMATE from the standard delivery window, plus extra days for areas that are usually
  slower to reach. It is not a courier serviceability check: the courier confirms the real date.
  If you later connect a courier API (Shiprocket, Delhivery) replace estimateDelivery().
*/
import { STORE } from '../data/storeConfig.js';

export const validPincode = (v) => /^[1-9]\d{5}$/.test(String(v || '').trim());
// J&K and Ladakh, the North-East, Sikkim, Andaman & Nicobar
const REMOTE_PREFIXES = ['18', '19', '78', '79', '737', '744'];

export function addBusinessDays(from, n) {
  const d = new Date(from);
  let left = n;
  while (left > 0) { d.setDate(d.getDate() + 1); const wd = d.getDay(); if (wd !== 0 && wd !== 6) left -= 1; }
  return d;
}
const fmt = (d) => d.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' });

export function estimateDelivery(pin, now = Date.now()) {
  const p = String(pin || '').trim();
  if (!validPincode(p)) return { ok: false, error: 'Enter a valid 6-digit pincode.' };
  const remote = REMOTE_PREFIXES.some(x => p.startsWith(x));
  const [min, max] = STORE.deliveryDays;
  const extra = remote ? STORE.remoteExtraDays : 0;
  const a = addBusinessDays(now, min + extra), b = addBusinessDays(now, max + extra);
  return { ok: true, remote, from: a.toISOString(), to: b.toISOString(), label: `${fmt(a)} – ${fmt(b)}`, shipping: null };
}
