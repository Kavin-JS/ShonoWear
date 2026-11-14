/* SHONOWEAR — applies price edits made in /admin on top of the catalogue file, in the browser.
 * The server prices every order itself, so this only changes what is DISPLAYED; a stale tab gets a "prices changed" notice at checkout. */
import { useEffect, useState } from 'react';
import { catalog } from '../data/catalog.js';

const base = new Map(catalog.filter(p => p.fulfilment === 'own').map(p => [p.id, { price: p.price, mrp: p.mrp }]));
export function patchCatalog(overrides = {}) {
  let changed = false;
  for (const p of catalog) {
    const b = base.get(p.id); if (!b) continue;
    const o = overrides[p.id] || {};
    const price = Number.isInteger(o.price) ? o.price : b.price;
    const mrp = Number.isInteger(o.mrp) ? o.mrp : b.mrp;
    if (p.price !== price || p.mrp !== mrp) { changed = true; p.price = price; if (mrp === undefined) delete p.mrp; else p.mrp = mrp; }
  }
  return changed;
}
/** Returns a number that changes when prices were patched; use it as a React key to redraw the page once. */
export function useLivePrices() {
  const [v, setV] = useState(0);
  useEffect(() => {
    const c = new AbortController();
    fetch('/api/config', { signal: c.signal }).then(r => (r.ok ? r.json() : null)).then(j => { if (j?.overrides && patchCatalog(j.overrides)) setV(n => n + 1); }).catch(() => {});
    return () => c.abort();
  }, []);
  return v;
}
