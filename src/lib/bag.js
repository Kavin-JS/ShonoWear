/*
  SHONOWEAR — shopping bag v2 (browser only)
  Lines: { id, size, qty }.
    - own-stock products need a valid size and qty 1..maxQtyPerLine (paid for on our checkout)
    - affiliate products are qty 1, size null (bought on Amazon/Myntra)
  Names, prices and links are always read from the catalogue, never from storage.
  Stock is enforced by the server at checkout; this file only keeps the bag well-formed.
*/
import { useSyncExternalStore } from 'react';
import { catalog } from '../data/catalog.js';
import { STORE } from '../data/storeConfig.js';
import { isOwn } from './store.js';

const KEY = 'shonowear_bag_v2';
const OLD_KEY = 'shonowear_bag'; // v1: array of product ids (affiliate only)
const EVENT = 'shonowear-bag';
const MAX_LINES = 30;
const index = new Map(catalog.map(p => [p.id, p]));

let cacheRaw = null;
let cacheLines = [];

function sanitise(list) {
  const out = [];
  const seen = new Set();
  for (const l of Array.isArray(list) ? list : []) {
    const p = index.get(l?.id);
    if (!p) continue;
    if (isOwn(p)) {
      const size = String(l.size ?? '');
      if (!Object.hasOwn(p.sizes || {}, size)) continue;
      const qty = Math.min(STORE.maxQtyPerLine, Math.max(1, Math.floor(Number(l.qty) || 1)));
      const k = `${p.id}:${size}`;
      if (seen.has(k)) continue;
      seen.add(k);
      out.push({ id: p.id, size, qty });
    } else {
      if (seen.has(p.id)) continue;
      seen.add(p.id);
      out.push({ id: p.id, size: null, qty: 1 });
    }
    if (out.length >= MAX_LINES) break;
  }
  return out;
}

function read() {
  let raw = null;
  try {
    raw = localStorage.getItem(KEY);
    if (raw === null) {                       // one-time migration from v1
      const old = JSON.parse(localStorage.getItem(OLD_KEY) || '[]');
      if (Array.isArray(old) && old.length) {
        raw = JSON.stringify(sanitise(old.map(id => ({ id }))));
        localStorage.setItem(KEY, raw);
      }
      localStorage.removeItem(OLD_KEY);
    }
  } catch { /* storage blocked */ }
  raw = raw || '[]';
  if (raw === cacheRaw) return cacheLines;
  let lines = [];
  try { lines = sanitise(JSON.parse(raw)); } catch { /* corrupt → empty */ }
  cacheRaw = raw;
  cacheLines = lines;
  return lines;
}

function write(lines) {
  try { localStorage.setItem(KEY, JSON.stringify(sanitise(lines))); } catch { /* full or blocked */ }
  window.dispatchEvent(new Event(EVENT));
}

export const getLines = () => read();
export const getBagIds = () => [...new Set(read().map(l => l.id))];
export const isInBag = (id) => read().some(l => l.id === id);

/** @returns {{ ok: boolean, reason?: string }} */
export function addToBag(id, { size = null, qty = 1 } = {}) {
  const p = index.get(id);
  if (!p) return { ok: false, reason: 'unknown' };
  const lines = read();
  if (isOwn(p)) {
    if (!size || !Object.hasOwn(p.sizes, size)) return { ok: false, reason: 'size' };
    const existing = lines.find(l => l.id === id && l.size === size);
    if (existing) write(lines.map(l => (l === existing ? { ...l, qty: l.qty + qty } : l)));
    else write([...lines, { id, size, qty }]);
    return { ok: true };
  }
  if (lines.some(l => l.id === id)) return { ok: true };
  write([...lines, { id, size: null, qty: 1 }]);
  return { ok: true };
}

export function setQty(id, size, qty) {
  write(read().map(l => (l.id === id && l.size === size ? { ...l, qty } : l)));
}

export function setSize(id, oldSize, newSize) {
  const lines = read();
  const target = lines.find(l => l.id === id && l.size === oldSize);
  if (!target) return;
  const clash = lines.find(l => l.id === id && l.size === newSize && l !== target);
  if (clash) write(lines.filter(l => l !== target).map(l => (l === clash ? { ...l, qty: l.qty + target.qty } : l)));
  else write(lines.map(l => (l === target ? { ...l, size: newSize } : l)));
}

export function removeLine(id, size) { write(read().filter(l => !(l.id === id && l.size === size))); }
/** Remove every line of a product (used by the affiliate "In bag" toggle). */
export function removeFromBag(id) { write(read().filter(l => l.id !== id)); }
export function clearBag() { write([]); }
export function clearOwnLines() { write(read().filter(l => !isOwn(index.get(l.id)))); }

function subscribe(cb) {
  window.addEventListener(EVENT, cb);
  window.addEventListener('storage', cb);
  return () => { window.removeEventListener(EVENT, cb); window.removeEventListener('storage', cb); };
}

/** React hook: the bag's lines, re-rendering on any change (also across tabs). */
export function useBag() { return useSyncExternalStore(subscribe, read, () => []); }

/** Join lines with their catalogue products. */
export function bagEntries(lines = read()) {
  return lines.map(l => ({ ...l, product: index.get(l.id) })).filter(e => e.product);
}

export const bagCount = (lines) => lines.reduce((n, l) => n + l.qty, 0);
