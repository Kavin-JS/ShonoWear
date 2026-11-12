// Wishlist: product ids in localStorage. Unknown ids are dropped on read, so stale or tampered data is harmless.
import { useSyncExternalStore } from 'react';
import { catalog } from '../data/catalog.js';

const KEY = 'shonowear_wishlist_v1';
const EVT = 'shonowear:wishlist';
const known = new Set(catalog.map(p => p.id));
const EMPTY = Object.freeze([]);
let cache = { raw: null, val: EMPTY };

export function getWishlist() {
  try {
    const raw = localStorage.getItem(KEY) || '[]';
    if (raw === cache.raw) return cache.val;
    const parsed = JSON.parse(raw);
    const val = Array.isArray(parsed) ? parsed.filter(id => typeof id === 'string' && known.has(id)).slice(0, 200) : EMPTY;
    cache = { raw, val: val.length ? val : EMPTY };
    return cache.val;
  } catch { return EMPTY; }
}

export function toggleWishlist(id) {
  if (!known.has(id)) return false;
  const cur = getWishlist();
  const next = cur.includes(id) ? cur.filter(x => x !== id) : [id, ...cur];
  try { localStorage.setItem(KEY, JSON.stringify(next)); } catch { /* storage blocked: nothing saved */ }
  window.dispatchEvent(new Event(EVT));
  return next.includes(id);
}

function subscribe(cb) {
  window.addEventListener(EVT, cb);
  window.addEventListener('storage', cb);
  return () => { window.removeEventListener(EVT, cb); window.removeEventListener('storage', cb); };
}
export const useWishlist = () => useSyncExternalStore(subscribe, getWishlist, () => EMPTY);
