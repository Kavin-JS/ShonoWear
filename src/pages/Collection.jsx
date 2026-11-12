import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { catalog } from '../data/catalog.js';
import { collections } from '../data/collections.js';
import ProductCard from '../components/ProductCard.jsx';
import NotFound from './NotFound.jsx';
import { SORTS, filterProducts, parseFilters } from '../lib/shopFilters.js';

export const productsIn = (c) => c.match ? catalog.filter(c.match) : [];

export function Collections() {
  useEffect(() => { document.title = 'Collections — Shonowear'; }, []);
  const list = collections.map(c => ({ c, items: productsIn(c) })).filter(x => x.items.length);
  return (
    <main id="main" className="page">
      <div className="container">
        <h1 style={{ fontFamily: 'var(--font-body)', fontWeight: 700, fontSize: 'clamp(22px, 3vw, 30px)', marginBottom: 16 }}>Collections</h1>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 14 }}>
          {list.map(({ c, items }) => (
            <Link key={c.slug} to={`/collection/${c.slug}`} style={{ position: 'relative', aspectRatio: '4 / 3', borderRadius: 16, overflow: 'hidden', background: 'var(--bg3)', color: '#fff', display: 'block' }}>
              <img src={items[0].image} alt="" loading="lazy" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              <span style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to top, rgba(0,0,0,.75), rgba(0,0,0,.05) 65%)' }} />
              <span style={{ position: 'absolute', left: 16, bottom: 14, right: 16, fontWeight: 700, fontSize: 18 }}>{c.title}<br /><span style={{ fontSize: 12, fontWeight: 500, opacity: .85 }}>{items.length} item{items.length === 1 ? '' : 's'}</span></span>
            </Link>
          ))}
        </div>
      </div>
    </main>
  );
}

export default function Collection() {
  const { slug } = useParams();
  const c = collections.find(x => x.slug === slug);
  const [sort, setSort] = useState(c?.sort || 'relevance');
  useEffect(() => { setSort(c?.sort || 'relevance'); if (c) document.title = `${c.title} — Shonowear`; }, [slug]); // eslint-disable-line react-hooks/exhaustive-deps
  const items = useMemo(() => {
    if (!c) return [];
    const base = productsIn(c);
    const f = parseFilters(new URLSearchParams({ sort }));
    return filterProducts(base, f);
  }, [c, sort]);
  if (!c || !productsIn(c).length) return <NotFound />;
  return (
    <main id="main" className="page">
      <div className="container">
        <nav aria-label="Breadcrumb" style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 10 }}><Link to="/">Home</Link> / <Link to="/collections">Collections</Link> / <span style={{ color: 'var(--text)' }}>{c.title}</span></nav>
        <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 18 }}>
          <div>
            <h1 style={{ fontFamily: 'var(--font-body)', fontWeight: 700, fontSize: 'clamp(24px, 4vw, 36px)', letterSpacing: '-0.01em' }}>{c.title}</h1>
            <p style={{ color: 'var(--muted)', fontSize: 14, marginTop: 4, maxWidth: 560 }}>{c.blurb} · {items.length} item{items.length === 1 ? '' : 's'}</p>
          </div>
          <select aria-label="Sort" value={sort} onChange={e => setSort(e.target.value)} style={{ background: 'var(--bg)', color: 'var(--text)', border: '1px solid var(--border2)', borderRadius: 8, padding: '9px 12px', fontSize: 13, fontFamily: 'inherit' }}>
            {Object.entries(SORTS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </div>
        <div className="product-grid">{items.map((p, i) => <ProductCard key={p.id} product={p} delay={Math.min(i, 8) * 0.03} />)}</div>
        <p style={{ marginTop: 28 }}><Link to="/shop" style={{ color: 'var(--red)', fontWeight: 600, fontSize: 14 }}>Browse everything →</Link></p>
      </div>
    </main>
  );
}
