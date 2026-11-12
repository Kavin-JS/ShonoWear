import { useEffect, useMemo, useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { catalog } from '../data/catalog.js';
import { STORE } from '../data/storeConfig.js';
import { looksContaining, totalOf, byId } from '../lib/outfitRules.js';
import { BagButton, BuyLink, inr } from '../components/ProductCard.jsx';
import ProductCard from '../components/ProductCard.jsx';
import { Analytics } from '../lib/analytics.js';
import { addToBag } from '../lib/bag.js';
import { isOwn, sizesOf } from '../lib/store.js';
import { useStock } from '../lib/useStock.js';
import { showToast } from '../lib/toast.js';
import { WishButton } from '../components/ProductCard.jsx';
import { discountPct } from '../lib/store.js';
import Gallery from '../components/Gallery.jsx';
import SizeGuide from '../components/SizeGuide.jsx';
import { chartFor } from '../lib/sizeGuide.js';
import { variantsOf, colorOf, SWATCH } from '../lib/colors.js';
import { pushRecent } from '../lib/recent.js';
import RecentlyViewed from '../components/RecentlyViewed.jsx';
import PincodeCheck from '../components/PincodeCheck.jsx';
import NotifyMe from '../components/NotifyMe.jsx';
import NotFound from './NotFound.jsx';

const index = byId(catalog);

export default function Product() {
  const { id } = useParams();
  const product = index.get(id);
  const navigate = useNavigate();
  const [imgError, setImgError] = useState(false);
  const [size, setSize] = useState('');
  const [qty, setQty] = useState(1);
  const [sizeError, setSizeError] = useState(false);
  const [guide, setGuide] = useState(false);
  const own = isOwn(product);
  const { stock, failed } = useStock(own ? [id] : []);

  useEffect(() => {
    if (product) { pushRecent(product.id); Analytics.productViewed(product.id, product.name); document.title = `${product.name} — Shonowear`; }
    setImgError(false); setSize(''); setQty(1); setSizeError(false);
    window.scrollTo(0, 0);
    return () => { document.title = 'Shonowear — Outfit Stylist for India'; };
  }, [product]);

  const variants = useMemo(() => variantsOf(product, catalog), [product]);
  const hasGuide = Boolean(chartFor(product));
  const looks = useMemo(() => (product ? looksContaining(product, { count: 2 }) : []), [product]);
  const similar = useMemo(() => {
    if (!product) return [];
    const shared = (p) => p.tags.filter(t => product.tags.includes(t)).length;
    return catalog.filter(p => p.id !== product.id && p.category === product.category)
      .sort((a, b) => shared(b) - shared(a)).slice(0, 4);
  }, [product]);

  if (!product) return <NotFound />;

  // Live stock when the server answers; otherwise the catalogue total (the server still decides at checkout).
  const left = (s) => (stock?.[id]?.[s] ?? (failed || !stock ? product.sizes?.[s] : 0) ?? 0);
  const maxQty = size ? Math.min(STORE.maxQtyPerLine, Math.max(1, left(size))) : 1;
  const allSoldOut = own && sizesOf(product).every(s => left(s) <= 0) && !!stock;

  function add(goToCheckout) {
    if (!size) { setSizeError(true); return; }
    addToBag(id, { size, qty: Math.min(qty, maxQty) });
    Analytics.addedToBag(id, product.name);
    if (goToCheckout) navigate('/bag');
    else showToast(`Added ${product.name} (${size})`, { href: '/bag', label: 'View bag' });
  }

  return (
    <main id="main" className="page">
      <div className="container">
        <nav aria-label="Breadcrumb" style={{ fontSize: 12, color: 'var(--muted)' }}>
          <Link to="/">Home</Link> / <Link to={`/shop?cat=${product.category}`}>{product.category}</Link> / <span style={{ color: 'var(--text)' }}>{product.name}</span>
        </nav>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '40px', margin: '24px 0 56px' }}>
          <Gallery images={product.images?.length ? product.images : [product.image]} alt={product.name}
            overlay={<WishButton product={product} style={{ position: 'absolute', top: 14, right: 14, zIndex: 1 }} />} />

          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', alignSelf: 'start' }}>
            <div style={{ fontSize: '11px', letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--red)' }}>{product.brand}</div>
            <h1 style={{ fontFamily: 'var(--font-body)', fontWeight: 700, fontSize: 'clamp(22px, 3.4vw, 32px)', lineHeight: 1.2, letterSpacing: '-0.01em' }}>{product.name}</h1>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 30, fontWeight: 700 }}>{inr(product.price)}</span>
              {discountPct(product) > 0 && <><s style={{ color: 'var(--muted2)' }}>{inr(product.mrp)}</s><span style={{ color: 'var(--good)', fontWeight: 600 }}>{discountPct(product)}% off</span></>}
            </div>
            {variants.length > 1 && (
              <div role="group" aria-label="Colour">
                <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 8 }}>Colour: <strong style={{ color: 'var(--text)', textTransform: 'capitalize' }}>{colorOf(product)}</strong></div>
                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                  {variants.map(v => (
                    <Link key={v.id} to={`/product/${v.id}`} replace aria-label={`${colorOf(v) || 'Other colour'}${v.id === product.id ? ' (selected)' : ''}`} aria-current={v.id === product.id ? 'page' : undefined}
                      style={{ width: 34, height: 34, borderRadius: '50%', background: SWATCH[colorOf(v)] || '#ccc', border: '1px solid var(--border2)', outline: v.id === product.id ? '2px solid var(--red)' : 'none', outlineOffset: 2 }} />
                  ))}
                </div>
              </div>
            )}
            <p style={{ color: 'var(--muted)', fontSize: '14px', lineHeight: 1.7 }}>{product.explanation}</p>

            {own ? (
              <>
                <fieldset style={{ border: 'none', padding: 0 }}>
                  <legend style={{ fontSize: '11px', letterSpacing: '0.12em', textTransform: 'uppercase', color: sizeError ? 'var(--red)' : 'var(--muted)', marginBottom: '8px', width: '100%' }}>
                    <span style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span>{sizeError ? 'Please choose a size' : 'Size'}</span>
                      {hasGuide && <button type="button" onClick={() => setGuide(true)} style={{ background: 'none', border: 'none', color: 'var(--red)', cursor: 'pointer', fontSize: 12, fontWeight: 600, textTransform: 'none', letterSpacing: 0, fontFamily: 'inherit' }}>📏 Size guide</button>}
                    </span>
                  </legend>
                  <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                    {sizesOf(product).map(s => {
                      const n = left(s);
                      const out = !!stock && n <= 0;
                      return (
                        <button key={s} type="button" disabled={out} aria-pressed={size === s}
                          onClick={() => { setSize(s); setSizeError(false); setQty(q => Math.min(q, Math.max(1, left(s)))); }}
                          style={{
                            minWidth: '52px', padding: '10px 14px', borderRadius: '4px', cursor: out ? 'not-allowed' : 'pointer', fontSize: '13px',
                            border: `1px solid ${size === s ? 'var(--red)' : 'var(--border2)'}`,
                            background: size === s ? 'var(--red-dim)' : 'transparent',
                            color: out ? 'var(--muted2)' : 'var(--text)', textDecoration: out ? 'line-through' : 'none',
                          }}>{s}</button>
                      );
                    })}
                  </div>
                  {size && stock && left(size) > 0 && left(size) <= 3 && (
                    <p style={{ fontSize: '12px', color: 'var(--warn)', marginTop: '8px' }}>Only {left(size)} left in {size}</p>
                  )}
                </fieldset>

                {!allSoldOut && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <span style={{ fontSize: '11px', letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--muted)' }}>Qty</span>
                    <button type="button" aria-label="Decrease quantity" className="btn-ghost" style={{ padding: '6px 12px' }} onClick={() => setQty(q => Math.max(1, q - 1))}>−</button>
                    <span aria-live="polite" style={{ minWidth: '20px', textAlign: 'center' }}>{qty}</span>
                    <button type="button" aria-label="Increase quantity" className="btn-ghost" style={{ padding: '6px 12px' }} onClick={() => setQty(q => Math.min(maxQty, q + 1))}>+</button>
                  </div>
                )}

                <div style={{ display: 'grid', gap: '10px', marginTop: '8px', maxWidth: '360px' }}>
                  {allSoldOut ? (
                    <button type="button" className="btn-ghost" disabled style={{ justifyContent: 'center' }}>Sold out</button>
                  ) : (
                    <>
                      <button type="button" className="btn-primary" style={{ justifyContent: 'center' }} onClick={() => add(false)}>Add to bag</button>
                      <button type="button" className="btn-ghost" style={{ justifyContent: 'center' }} onClick={() => add(true)}>Buy now</button>
                    </>
                  )}
                </div>
                {stock && <NotifyMe productId={product.id} soldOut={sizesOf(product).filter(sz => left(sz) <= 0)} />}
                <PincodeCheck />
                <ul style={{ listStyle: 'none', fontSize: '12px', color: 'var(--muted)', display: 'grid', gap: '4px' }}>
                  <li>Ships from Shonowear in {STORE.deliveryEstimate}</li>
                  <li>{STORE.shippingFee ? `Free shipping over ${inr(STORE.freeShippingOver)}` : 'Free shipping'}</li>
                  <li>{STORE.returnDays}-day returns · <Link to="/policies/returns" style={{ color: 'var(--red)' }}>policy</Link></li>
                </ul>
              </>
            ) : (
              <>
                <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                  {product.tags.map(t => (
                    <Link key={t} to={`/shop?q=${encodeURIComponent(t)}`} style={{ fontSize: '11px', color: 'var(--muted)', border: '1px solid var(--border2)', padding: '4px 10px', borderRadius: '999px' }}>{t}</Link>
                  ))}
                </div>
                <div style={{ display: 'grid', gap: '10px', marginTop: '8px', maxWidth: '360px' }}>
                  <BagButton product={product} />
                  <BuyLink product={product} style={{ justifyContent: 'center' }} />
                </div>
                <p style={{ fontSize: '11px', color: 'var(--muted2)', maxWidth: '420px' }}>
                  You'll buy on {product.platform}. Price and stock are theirs and may differ by the time you check out.
                  This is an affiliate link: we may earn a commission at no extra cost to you.
                </p>
              </>
            )}
            {failed && own && <p style={{ fontSize: '11px', color: 'var(--muted2)' }}>Live stock is unavailable right now; we'll confirm availability at checkout.</p>}
          </div>
        </div>

        {own && !allSoldOut && (
          <div className="buybar" style={{ alignItems: 'center', gap: 12 }}>
            <div style={{ lineHeight: 1.2 }}><strong style={{ fontSize: 18 }}>{inr(product.price)}</strong><div style={{ fontSize: 11, color: 'var(--muted)' }}>{size ? `Size ${size}` : 'Select a size'}</div></div>
            <button type="button" className="btn-primary" style={{ flex: 1 }} onClick={() => { if (!size) { setSizeError(true); window.scrollTo({ top: 200, behavior: 'smooth' }); } else add(false); }}>Add to bag</button>
          </div>
        )}

        {looks.length > 0 && (
          <section style={{ marginBottom: '56px' }}>
            <div className="eyebrow" style={{ marginBottom: '16px' }}>Complete the look</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '16px' }}>
              {looks.map((look, i) => (
                <div key={i} style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: '8px', padding: '16px' }}>
                  <div style={{ display: 'flex', gap: '8px', marginBottom: '12px' }}>
                    {look.map(it => (
                      <Link key={it.id} to={`/product/${it.id}`} title={it.name}
                        style={{ flex: 1, aspectRatio: '3 / 4', borderRadius: '4px', overflow: 'hidden', background: 'var(--bg3)', outline: it.id === product.id ? '2px solid var(--red)' : 'none' }}>
                        <img src={it.image} alt={it.name} loading="lazy" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                      </Link>
                    ))}
                  </div>
                  <div style={{ fontSize: '12px', color: 'var(--muted)', marginBottom: '10px' }}>{look.map(i => i.name).join(' · ')}</div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <strong style={{ fontSize: '16px' }}>{inr(totalOf(look))}</strong>
                    <AddAll items={look} />
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {similar.length > 0 && (
          <section style={{ marginBottom: '64px' }}>
            <div className="eyebrow" style={{ marginBottom: '16px' }}>You may also like</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '16px' }}>
              {similar.map(p => <ProductCard key={p.id} product={p} />)}
            </div>
          </section>
        )}
        <RecentlyViewed exclude={product.id} />
      </div>
      {guide && <SizeGuide product={product} onClose={() => setGuide(false)} onPick={(sz) => { setSize(sz); setSizeError(false); setQty(q => Math.min(q, Math.max(1, left(sz)))); }} />}
      <style>{`
        .buybar { display: none; }
        @media (max-width: 768px) { .buybar { display: flex; position: fixed; left: 0; right: 0; bottom: 64px; z-index: 110; background: var(--bg); border-top: 1px solid var(--border); padding: 10px 16px; } }
      `}</style>
    </main>
  );
}

/** Adds what can be added in one tap. Items that need a size are listed so the shopper can pick them. */
function AddAll({ items }) {
  const [done, setDone] = useState(false);
  return (
    <button type="button" className="btn-ghost" style={{ fontSize: '11px', padding: '8px 14px' }}
      onClick={() => {
        const needSize = [];
        for (const i of items) {
          const p = index.get(i.id);
          if (!isOwn(p)) { addToBag(i.id); continue; }
          const sizes = sizesOf(p);
          if (sizes.length === 1) addToBag(i.id, { size: sizes[0] });
          else needSize.push(p.name);
        }
        setDone(true);
        showToast(needSize.length ? `Pick a size for: ${needSize.join(', ')}` : 'Added to bag', needSize.length ? {} : { href: '/bag', label: 'View bag' });
      }}>
      {done ? '✓ Added' : 'Add all to bag'}
    </button>
  );
}
