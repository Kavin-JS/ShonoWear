/* SHONOWEAR — saved delivery addresses. They live in THIS browser only (localStorage); nothing is sent to us until an order is placed. */
const KEY = 'shonowear_addresses_v1';
const MAX = 5;
const FIELDS = ['name', 'phone', 'email', 'line1', 'line2', 'city', 'state', 'pincode'];

export function listAddresses() {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || '[]');
    return (Array.isArray(raw) ? raw : []).filter(a => a && typeof a === 'object' && a.line1 && a.pincode).slice(0, MAX)
      .map(a => Object.fromEntries(FIELDS.map(k => [k, String(a[k] ?? '').slice(0, 120)])));
  } catch { return []; }
}

/** Newest first; the same street and pincode replaces the older copy. */
export function saveAddress(addr) {
  try {
    const clean = Object.fromEntries(FIELDS.map(k => [k, String(addr?.[k] ?? '').slice(0, 120)]));
    if (!clean.line1 || !clean.pincode) return listAddresses();
    const same = (a) => a.line1.trim().toLowerCase() === clean.line1.trim().toLowerCase() && a.pincode === clean.pincode;
    const next = [clean, ...listAddresses().filter(a => !same(a))].slice(0, MAX);
    localStorage.setItem(KEY, JSON.stringify(next));
    return next;
  } catch { return []; }
}

export function removeAddress(index) {
  try {
    const next = listAddresses().filter((_, i) => i !== index);
    localStorage.setItem(KEY, JSON.stringify(next));
    return next;
  } catch { return []; }
}
