import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useBag, bagEntries, removeLine, removeFromBag, clearBag, setQty, setSize } from '../lib/bag.js';
import { BuyLink, inr } from '../components/ProductCard.jsx';
import { validateItems, toCard } from '../lib/outfitRules.js';
import { saveOutfit } from '../lib/savedOutfits.js';
import { isOwn, sizesOf, computeTotals, bundleGap } from '../lib/store.js';
import { STORE } from '../data/storeConfig.js';
import { useStock } from '../lib/useStock.js';
import { useCheckoutConfig } from '../lib/checkoutConfig.js';

function missingPieces(items) {
  const has = (c) => items.some(i => i.category === c);
  const missing = [];
  if (!has('set')) { if (!has('top')) missing.push('top'); if (!has('bottom')) missing.push('bottom'); }
  if (!has('footwear')) missing.push('footwear');
  return missing;
}

export default function Bag() {
  const lines = useBag();
  const entries = useMemo(() => bagEntries(lines), [lines]);
  const own = entries.filter(e => isOwn(e.product));
  const partner = entries.filter(e => !isOwn(e.product));
  const [saved, setSaved] = useState(false);
  const cfg = useCheckoutConfig();
  const { stock } = useStock(own.map(e => e.id));

  const products = [...new Map(entries.map(e => [e.id, e.product])).values()];
  const missing = missingPieces(products);
  const complete = products.length > 0 && validateItems(products, 'high').ok;
  const totals = computeTotals(own.map(e => ({ product: e.product, qty: e.qty })));
  const left = (e) => stock?.[e.id]?.[e.size];
  const problems = own.filter(e => stock && (left(e) ?? 0) < e.qty);
  const ownQty = own.reduce((n, e) => n + e.qty, 0);
  const net = totals.subtotal - totals.discount;
  const toFree = Math.max(0, STORE.freeShippingOver - net);
  const gap = bundleGap(ownQty);

  if (!entries.length) {
    return (
      <main id="main" className="page" style={{ paddingTop: '110px', textAlign: 'center' }}>
        <div className="container" style={{ maxWidth: '460px' }}>
          <div style={{ fontSize: '48px', marginBottom: '16px' }}>🛍️</div>
          <h1 style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: '44px', marginBottom: '12px' }}>YOUR BAG IS EMPTY</h1>
          <p style={{ color: 'var(--muted)', marginBottom: '28px' }}>Browse the shop, or let Shono put a look together for you.</p>
          <div style={{ display: 'flex', gap: '12px', justifyContent: 'center', flexWrap: 'wrap' }}>
            <Link to="/shop" className="btn-primary">Shop now</Link>
            <Link to="/upload" className="btn-ghost">Get my outfits</Link>
          </div>
        </div>
      </main>
    );
  }

  const row = { display: 'grid', gridTemplateColumns: '72px 1fr', gap: '14px', background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: '8px', padding: '12px' };

  return (
    <main id="main" className="page" style={{ paddingTop: '100px' }}>
      <div className="container" style={{ maxWidth: '860px' }}>
        <div className="eyebrow">Your bag</div>
        <h1 style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 'clamp(40px, 6vw, 64px)', marginBottom: '20px' }}>
          {entries.length} ITEM{entries.length > 1 ? 'S' : ''}
        </h1>

        {missing.length > 0 && (
          <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: '6px', padding: '12px 16px', fontSize: '13px', marginBottom: '20px', color: 'var(--muted)' }}>
            Your bag has no {missing.join(' or ')} yet, so it isn't a full outfit.{' '}
            {missing.map(m => <Link key={m} to={`/shop?cat=${m}`} style={{ color: 'var(--red)', marginRight: '10px' }}>Browse {m}</Link>)}
          </div>
        )}

        {own.length > 0 && (
          <section aria-label="Items we ship" style={{ marginBottom: '32px' }}>
            <h2 style={{ fontSize: '12px', letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--muted)', marginBottom: '12px' }}>Ships from Shonowear · pay here</h2>
            <ul style={{ listStyle: 'none', display: 'grid', gap: '12px', marginBottom: '16px' }}>
              {own.map(e => {
                const p = e.product;
                const n = left(e);
                const short = stock && (n ?? 0) < e.qty;
                return (
                  <li key={`${e.id}:${e.size}`} style={row}>
                    <Link to={`/product/${p.id}`}><img src={p.image} alt={p.name} loading="lazy" style={{ width: '72px', height: '96px', objectFit: 'cover', borderRadius: '4px', background: 'var(--bg3)' }} /></Link>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', minWidth: 0 }}>
                      <Link to={`/product/${p.id}`} style={{ fontSize: '14px', color: 'var(--text)' }}>{p.name}</Link>
                      <div style={{ display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap', fontSize: '12px' }}>
                        <label style={{ color: 'var(--muted)' }}>Size{' '}
                          <select value={e.size} onChange={ev => setSize(e.id, e.size, ev.target.value)}
                            style={{ background: 'var(--bg3)', color: 'var(--text)', border: '1px solid var(--border2)', borderRadius: '4px', padding: '4px 8px' }}>
                            {sizesOf(p).map(s => <option key={s} value={s}>{s}</option>)}
                          </select>
                        </label>
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}>
                          <button type="button" aria-label="Decrease quantity" className="btn-ghost" style={{ padding: '2px 10px' }} onClick={() => (e.qty > 1 ? setQty(e.id, e.size, e.qty - 1) : removeLine(e.id, e.size))}>−</button>
                          <span aria-live="polite">{e.qty}</span>
                          <button type="button" aria-label="Increase quantity" className="btn-ghost" style={{ padding: '2px 10px' }} disabled={e.qty >= STORE.maxQtyPerLine} onClick={() => setQty(e.id, e.size, e.qty + 1)}>+</button>
                        </span>
                        <strong style={{ marginLeft: 'auto' }}>{inr(p.price * e.qty)}</strong>
                      </div>
                      {short && <div role="alert" style={{ fontSize: '12px', color: 'var(--red)' }}>{(n ?? 0) === 0 ? 'Sold out in this size.' : `Only ${n} left in this size.`}</div>}
                      <button type="button" onClick={() => removeLine(e.id, e.size)} style={{ alignSelf: 'flex-start', background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer', fontSize: '12px', textDecoration: 'underline', padding: 0 }}>Remove</button>
                    </div>
                  </li>
                );
              })}
            </ul>

            <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: '14px', padding: '16px', display: 'grid', gap: '8px', fontSize: '14px' }}>
              {STORE.shippingFee > 0 && (
                <div style={{ marginBottom: 6 }}>
                  <div style={{ fontSize: 12, color: toFree ? 'var(--muted)' : 'var(--good)', marginBottom: 6 }}>
                    {toFree ? `Add ${inr(toFree)} more for free shipping` : '🎉 You get free shipping'}
                  </div>
                  <div role="progressbar" aria-valuemin={0} aria-valuemax={STORE.freeShippingOver} aria-valuenow={Math.min(net, STORE.freeShippingOver)} aria-label="Progress to free shipping" style={{ height: 6, borderRadius: 3, background: 'var(--bg3)', overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${Math.min(100, (net / STORE.freeShippingOver) * 100)}%`, background: toFree ? 'var(--red)' : 'var(--good)', transition: 'width .3s' }} />
                  </div>
                </div>
              )}
              {gap > 0 && <div role="status" style={{ fontSize: 12, color: 'var(--good)' }}>Add {gap} more item{gap === 1 ? '' : 's'} we ship and save {STORE.bundleDiscount.percent}%.</div>}
              <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>Subtotal</span><span>{inr(totals.subtotal)}</span></div>
              {totals.discount > 0 && <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--good)' }}><span>Bundle discount</span><span>−{inr(totals.discount)}</span></div>}
                            <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>Shipping</span><span>{totals.shipping ? inr(totals.shipping) : 'Free'}</span></div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '18px', fontWeight: 600, borderTop: '1px solid var(--border)', paddingTop: '10px' }}><span>Total</span><span>{inr(totals.total)}</span></div>
              <div style={{ fontSize: '11px', color: 'var(--muted2)' }}>Prices in INR. Delivery {STORE.deliveryEstimate}.</div>
              {cfg && !cfg.checkoutEnabled ? (
                <div role="alert" style={{ fontSize: '13px', color: 'var(--muted)' }}>Checkout is not available right now. Please come back soon.</div>
              ) : problems.length > 0 ? (
                <div role="alert" style={{ fontSize: '13px', color: 'var(--red)' }}>Fix the items marked above to continue.</div>
              ) : (
                <Link to="/checkout" className="btn-primary" style={{ justifyContent: 'center', marginTop: '6px' }}>Checkout · {inr(totals.total)}</Link>
              )}
            </div>
          </section>
        )}

        {partner.length > 0 && (
          <section aria-label="Items on partner stores" style={{ marginBottom: '32px' }}>
            <h2 style={{ fontSize: '12px', letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--muted)', marginBottom: '8px' }}>Buy on partner stores</h2>
            <p style={{ fontSize: '12px', color: 'var(--muted)', marginBottom: '12px', lineHeight: 1.6 }}>
              These are sold by Amazon or Myntra, not by us. Each is bought on that store with its own checkout. Prices are theirs and may have changed. Affiliate links: we may earn a commission at no extra cost to you.
            </p>
            <ul style={{ listStyle: 'none', display: 'grid', gap: '12px' }}>
              {partner.map(({ product: p }) => (
                <li key={p.id} style={row}>
                  <Link to={`/product/${p.id}`}><img src={p.image} alt={p.name} loading="lazy" style={{ width: '72px', height: '96px', objectFit: 'cover', borderRadius: '4px', background: 'var(--bg3)' }} /></Link>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', minWidth: 0 }}>
                    <div style={{ fontSize: '10px', letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--red)' }}>{p.brand} · {p.platform}</div>
                    <Link to={`/product/${p.id}`} style={{ fontSize: '14px', color: 'var(--text)' }}>{p.name}</Link>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap', marginTop: 'auto' }}>
                      <strong>{inr(p.price)}</strong>
                      <BuyLink product={p} className="btn-primary" style={{ fontSize: '11px', padding: '8px 14px' }} />
                      <button type="button" onClick={() => removeFromBag(p.id)} style={{ background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer', fontSize: '12px', textDecoration: 'underline' }}>Remove</button>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        )}

        <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', marginBottom: '64px' }}>
          {complete && (
            <button type="button" className="btn-ghost" disabled={saved} onClick={() => { saveOutfit(toCard(products)); setSaved(true); }}>
              {saved ? '✓ Saved to outfits' : 'Save as an outfit'}
            </button>
          )}
          <Link to="/shop" className="btn-ghost">Keep shopping</Link>
          <button type="button" className="btn-ghost" onClick={clearBag}>Empty bag</button>
        </div>
      </div>
    </main>
  );
}
