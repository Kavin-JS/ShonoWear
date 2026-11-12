// Recently viewed products: ids in localStorage, newest first, validated against the catalogue.
import { useSyncExternalStore } from 'react';
import { catalog } from '../data/catalog.js';

const KEY = 'shonowear_recent_v1', EVT = 'shonowear:recent', MAX = 12;
const known = new Set(catalog.map(p => p.id));
const EMPTY = Object.freeze([]);
let cache = { raw: null, val: EMPTY };

export function getRecent() {
  try {
    const raw = localStorage.getItem(KEY) || '[]';
    if (raw === cache.raw) return cache.val;
    const p = JSON.parse(raw);
    const val = Array.isArray(p) ? p.filter(id => typeof id === 'string' && known.has(id)).slice(0, MAX) : [];
    cache = { raw, val: val.length ? val : EMPTY };
    return cache.val;
  } catch { return EMPTY; }
}
export function pushRecent(id) {
  if (!known.has(id)) return;
  const next = [id, ...getRecent().filter(x => x !== id)].slice(0, MAX);
  try { localStorage.setItem(KEY, JSON.stringify(next)); } catch { return; }
  window.dispatchEvent(new Event(EVT));
}
export function clearRecent() { try { localStorage.removeItem(KEY); } catch { /* ignore */ } window.dispatchEvent(new Event(EVT)); }
const sub = (cb) => { window.addEventListener(EVT, cb); window.addEventListener('storage', cb); return () => { window.removeEventListener(EVT, cb); window.removeEventListener('storage', cb); }; };
export const useRecent = () => useSyncExternalStore(sub, getRecent, () => EMPTY);
