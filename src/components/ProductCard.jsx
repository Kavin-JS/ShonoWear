import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useBag, addToBag, removeFromBag } from '../lib/bag.js';
import { useWishlist, toggleWishlist } from '../lib/wishlist.js';
import { Analytics } from '../lib/analytics.js';
import { showToast } from '../lib/toast.js';
import { isOwn, inr, discountPct, isNew } from '../lib/store.js';
import { saleFor, preorderDate, prettyDate } from '../lib/offers.js';
import { Price } from './Price.jsx';
import { Heart } from './Icons.jsx';
import QuickView from './QuickView.jsx';
import Img from './Img.jsx';

export { inr };

/** Affiliate link: marked sponsored for search engines and tracked. */
export function BuyLink({ product, children, className = 'btn-ghost', style }) {
  if (!product.affiliateUrl) return null;
  return (
    <a href={product.affiliateUrl} target="_blank" rel="sponsored noopener noreferrer" className={className} style={style}
      onClick={() => Analytics.buyClicked(product.id, product.name, product.platform, product.price)}>
      {children || `Buy on ${product.platform}`}
    </a>
  );
}

/** Add-to-bag for AFFILIATE products. Own-stock products need a size, so they go through the product page. */
export function BagButton({ product, style }) {
  const bag = useBag();
  if (isOwn(product)) {
    return <Link to={`/product/${product.id}`} className="btn-primary" style={style}>Choose size</Link>;
  }
  const inBag = bag.some(l => l.id === product.id);
  return (
    <button type="button" aria-pressed={inBag} className={inBag ? 'btn-ghost' : 'btn-primary'} style={style}
      onClick={() => {
        if (inBag) removeFromBag(product.id);
        else { addToBag(product.id); Analytics.addedToBag(product.id, product.name); showToast('Added to bag', { href: '/bag', label: 'View bag' }); }
      }}>
      {inBag ? '✓ In bag' : 'Add to bag'}
    </button>
  );
}

export function WishButton({ product, style }) {
  const wished = useWishlist().includes(product.id);
  return (
    <button type="button" aria-pressed={wished} aria-label={wished ? `Remove ${product.name} from wishlist` : `Save ${product.name} to wishlist`}
      onClick={(e) => { e.preventDefault(); e.stopPropagation(); const on = toggleWishlist(product.id); if (on) showToast('Saved to wishlist', { href: '/wishlist', label: 'View' }); }}
      style={{
        width: 36, height: 36, borderRadius: '50%', border: 'none', cursor: 'pointer', display: 'grid', placeItems: 'center',
        background: 'rgba(255,255,255,0.92)', color: wished ? 'var(--red-text)' : '#14141f', boxShadow: '0 2px 8px rgba(0,0,0,.18)', ...style,
      }}>
      <Heart filled={wished} size={19} />
    </button>
  );
}

export default function ProductCard({ product, delay = 0, width }) {
  const [imgError, setImgError] = useState(false);
  const [quick, setQuick] = useState(false);
  const own = isOwn(product);
  const fresh = isNew(product);
  const off = discountPct(product);
  return (
    <article className="card fade-up" style={{ animationDelay: `${delay}s`, display: 'flex', flexDirection: 'column', opacity: 0, width, background: 'var(--surface)' }}>
      <div style={{ position: 'relative' }}>
        <Link to={`/product/${product.id}`} aria-label={product.name} style={{ display: 'block', aspectRatio: '3 / 4', background: 'var(--bg3)', overflow: 'hidden' }}>
          {imgError ? (
            <div style={{ height: '100%', display: 'grid', placeItems: 'center', color: 'var(--muted2)', fontSize: '40px' }}>👕</div>
          ) : (
            <Img src={product.image} sizes="(max-width: 600px) 50vw, 280px" onError={() => setImgError(true)}
              style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block', transition: 'transform .4s' }}
              onMouseEnter={e => { e.currentTarget.style.transform = 'scale(1.05)'; }} onMouseLeave={e => { e.currentTarget.style.transform = 'none'; }} />
          )}
        </Link>
        <WishButton product={product} style={{ position: 'absolute', top: 10, right: 10 }} />
        {saleFor(product) && <span style={{ position: 'absolute', top: fresh ? 38 : 10, left: 10, background: '#14141f', color: '#fff', fontSize: 10, fontWeight: 700, letterSpacing: '0.06em', padding: '4px 9px', borderRadius: 999 }}>SALE</span>}
        {preorderDate(product) && <span style={{ position: 'absolute', top: 10, right: 52, background: 'var(--surface)', color: 'var(--text)', border: '1px solid var(--border2)', fontSize: 10, fontWeight: 700, letterSpacing: '0.06em', padding: '3px 8px', borderRadius: 999 }}>PRE-ORDER</span>}
        {fresh && <span style={{ position: 'absolute', top: 10, left: 10, background: 'var(--red)', color: '#fff', fontSize: 10, fontWeight: 700, letterSpacing: '0.06em', padding: '4px 9px', borderRadius: 999 }}>NEW</span>}
        <button type="button" className="qv-btn" onClick={() => setQuick(true)} aria-label={`Quick view ${product.name}`}>Quick view</button>
        <span style={{
          position: 'absolute', left: 10, bottom: 10, background: own ? 'var(--text)' : 'rgba(255,255,255,.94)', color: own ? 'var(--bg)' : '#14141f',
          fontSize: '10px', fontWeight: 600, letterSpacing: '0.04em', padding: '4px 9px', borderRadius: '999px', boxShadow: '0 1px 4px rgba(0,0,0,.15)',
        }}>{own ? 'Ships from us' : `on ${product.platform}`}</span>
      </div>

      <div style={{ padding: '12px 12px 14px', display: 'flex', flexDirection: 'column', gap: '4px', flex: 1 }}>
        <div style={{ fontSize: '11px', fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--muted)' }}>{product.brand}</div>
        <Link to={`/product/${product.id}`} style={{ fontSize: '14px', lineHeight: 1.35, color: 'var(--text)', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden', minHeight: '2.7em' }}>{product.name}</Link>
        <div style={{ marginTop: '2px' }}><Price product={product} /></div>
        {preorderDate(product) && <div style={{ fontSize: 11, color: 'var(--muted)' }}>Pre-order · ships by {prettyDate(preorderDate(product))}</div>}
        <div style={{ display: 'grid', gap: '8px', marginTop: 'auto', paddingTop: '10px' }}>
          <BagButton product={product} style={{ padding: '10px 12px', fontSize: '12px' }} />
        </div>
      </div>
      {quick && <QuickView product={product} onClose={() => setQuick(false)} />}
    </article>
  );
}
