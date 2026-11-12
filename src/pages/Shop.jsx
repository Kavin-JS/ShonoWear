import { useEffect, useMemo, useState } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { catalog } from '../data/catalog.js';
import ProductCard from '../components/ProductCard.jsx';
import FilterPanel from '../components/FilterPanel.jsx';
import { Filter, Close } from '../components/Icons.jsx';
import {
  parseFilters, filtersToParams, filterProducts, activeFilterCount, CATEGORY_LABELS, SORTS,
} from '../lib/shopFilters.js';

const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

function chipsFor(f) {
  const out = [];
  if (f.q) out.push(['q', `“${f.q}”`]);
  if (f.cat) out.push(['cat', CATEGORY_LABELS[f.cat]]);
  if (f.max) out.push(['max', `Under ₹${f.max.toLocaleString('en-IN')}`]);
  if (f.platform) out.push(['platform', f.platform === 'Shonowear' ? 'Ships from us' : f.platform]);
  if (f.style) out.push(['style', cap(f.style)]);
  if (f.occasion) out.push(['occasion', f.occasion === 'datenight' ? 'Date night' : cap(f.occasion)]);
  if (f.color) out.push(['color', cap(f.color)]);
  if (f.brand) out.push(['brand', f.brand]);
  if (f.size) out.push(['size', `Size ${f.size}`]);
  if (f.instock) out.push(['instock', 'In stock']);
  return out;
}

export default function Shop() {
  const [params, setParams] = useSearchParams();
  const [sheet, setSheet] = useState(false);
  const f = useMemo(() => parseFilters(params), [params]);
  const list = useMemo(() => filterProducts(catalog, f), [f]);
  const n = activeFilterCount(f);
  const set = (patch) => setParams(filtersToParams({ ...f, ...patch }), { replace: true });
  const title = f.cat ? CATEGORY_LABELS[f.cat] : f.q ? `Results for “${f.q}”` : 'All products';

  useEffect(() => {
    document.title = `${title} — Shonowear`;
    return () => { document.title = 'Shonowear — Outfit Stylist for India'; };
  }, [title]);
  useEffect(() => {
    if (!sheet) return undefined;
    const prev = document.body.style.overflow; document.body.style.overflow = 'hidden';
    const onKey = (e) => { if (e.key === 'Escape') setSheet(false); };
    window.addEventListener('keydown', onKey);
    return () => { document.body.style.overflow = prev; window.removeEventListener('keydown', onKey); };
  }, [sheet]);

  const sort = (
    <select aria-label="Sort" value={f.sort} onChange={e => set({ sort: e.target.value })}
      style={{ background: 'var(--bg)', color: 'var(--text)', border: '1px solid var(--border2)', borderRadius: 8, padding: '9px 12px', fontSize: 13, fontFamily: 'inherit' }}>
      {Object.entries(SORTS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
    </select>
  );

  return (
    <main id="main" className="page">
      <div className="container">
        <nav aria-label="Breadcrumb" style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 10 }}>
          <Link to="/">Home</Link> / <span style={{ color: 'var(--text)' }}>{f.cat ? CATEGORY_LABELS[f.cat] : 'Shop'}</span>
        </nav>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 14 }}>
          <h1 style={{ fontFamily: 'var(--font-body)', fontWeight: 700, fontSize: 'clamp(22px, 3vw, 30px)', letterSpacing: '-0.01em' }}>
            {title} <span aria-live="polite" style={{ fontSize: 14, fontWeight: 400, color: 'var(--muted)' }}>· {list.length} item{list.length === 1 ? '' : 's'}</span>
          </h1>
          <div className="shop-sort-desktop">{sort}</div>
        </div>

        {/* mobile bar */}
        <div className="shop-mobile-bar" style={{ gap: 10, marginBottom: 12 }}>
          <button type="button" className="btn-ghost" style={{ flex: 1, padding: '10px 14px' }} onClick={() => setSheet(true)}><Filter /> Filter{n ? ` (${n})` : ''}</button>
          <div style={{ flex: 1, display: 'grid' }}>{sort}</div>
        </div>

        {n > 0 && (
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 14 }}>
            {chipsFor(f).map(([k, label]) => (
              <button key={k} type="button" className="chip" onClick={() => set({ [k]: '' })} aria-label={`Remove filter ${label}`} style={{ display: 'inline-flex', gap: 6, alignItems: 'center', background: 'var(--bg2)' }}>{label} <Close size={12} /></button>
            ))}
            <button type="button" onClick={() => setParams({}, { replace: true })} style={{ background: 'none', border: 'none', color: 'var(--red)', cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>Clear all</button>
          </div>
        )}

        <div className="shop-layout">
          <aside className="shop-sidebar" aria-label="Filters"><FilterPanel f={f} set={set} /></aside>
          <div>
            {list.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '64px 0', color: 'var(--muted)' }}>
                <p style={{ fontSize: 40, marginBottom: 8 }}>🔍</p>
                <p style={{ marginBottom: 20 }}>Nothing matches those filters yet.</p>
                <button type="button" className="btn-primary" onClick={() => setParams({}, { replace: true })}>Show everything</button>
              </div>
            ) : (
              <div className="product-grid">
                {list.map((p, i) => <ProductCard key={p.id} product={p} delay={Math.min(i, 8) * 0.03} />)}
              </div>
            )}
          </div>
        </div>

        <p style={{ fontSize: 11, color: 'var(--muted2)', maxWidth: 640, margin: '40px 0 0' }}>
          Items marked “on Amazon” or “on Myntra” are sold by those stores: price and availability are theirs and can change. Those links are affiliate links, so we may earn a commission at no extra cost to you.
          Not sure what to pick? <Link to="/upload" style={{ color: 'var(--red)' }}>Get outfits matched to you</Link>.
        </p>
      </div>

      {sheet && (
        <div role="dialog" aria-modal="true" aria-label="Filters" style={{ position: 'fixed', inset: 0, zIndex: 200 }}>
          <div onClick={() => setSheet(false)} style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,.5)' }} />
          <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, maxHeight: '86vh', background: 'var(--bg)', borderRadius: '18px 18px 0 0', display: 'flex', flexDirection: 'column', animation: 'fadeUp .25s ease' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 18px', borderBottom: '1px solid var(--border)' }}>
              <strong>Filters</strong>
              <button type="button" aria-label="Close filters" onClick={() => setSheet(false)} style={{ background: 'none', border: 'none', color: 'var(--text)', cursor: 'pointer' }}><Close /></button>
            </div>
            <div style={{ overflowY: 'auto', padding: '0 18px' }}><FilterPanel f={f} set={set} /></div>
            <div style={{ display: 'flex', gap: 10, padding: '12px 18px calc(12px + env(safe-area-inset-bottom))', borderTop: '1px solid var(--border)' }}>
              <button type="button" className="btn-ghost" style={{ flex: 1 }} onClick={() => setParams({}, { replace: true })}>Clear</button>
              <button type="button" className="btn-primary" style={{ flex: 2 }} onClick={() => setSheet(false)}>Show {list.length} item{list.length === 1 ? '' : 's'}</button>
            </div>
          </div>
        </div>
      )}
      <style>{`
        .shop-layout { display: grid; grid-template-columns: 250px 1fr; gap: 32px; align-items: start; }
        .shop-sidebar { position: sticky; top: 130px; max-height: calc(100vh - 150px); overflow-y: auto; padding-right: 8px; }
        .shop-mobile-bar { display: none; }
        @media (max-width: 900px) {
          .shop-layout { grid-template-columns: 1fr; }
          .shop-sidebar, .shop-sort-desktop { display: none; }
          .shop-mobile-bar { display: flex; }
        }
      `}</style>
    </main>
  );
}
