import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { BagButton, BuyLink, inr } from './ProductCard.jsx';
import { addToBag } from '../lib/bag.js';
import { isOwn, sizesOf, discountPct } from '../lib/store.js';
import { useStock } from '../lib/useStock.js';
import { showToast } from '../lib/toast.js';
import { Close } from './Icons.jsx';
import { Price } from './Price.jsx';
import Img from './Img.jsx';

/** Quick look at a product without leaving the list. Own items: pick a size and add. Partner items: add or buy. */
export default function QuickView({ product, onClose }) {
  const own = isOwn(product);
  const { stock, failed } = useStock(own ? [product.id] : []);
  const [size, setSize] = useState('');
  const [err, setErr] = useState(false);
  const closeRef = useRef(null);
  const navigate = useNavigate();
  const off = discountPct(product);
  useEffect(() => {
    const prev = document.body.style.overflow; document.body.style.overflow = 'hidden';
    closeRef.current?.focus();
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => { document.body.style.overflow = prev; window.removeEventListener('keydown', onKey); };
  }, [onClose]);
  const left = (s) => (stock?.[product.id]?.[s] ?? (failed || !stock ? product.sizes?.[s] : 0) ?? 0);

  return (
    <div role="dialog" aria-modal="true" aria-label={`Quick view: ${product.name}`} style={{ position: 'fixed', inset: 0, zIndex: 250, display: 'grid', placeItems: 'center', padding: 12 }}>
      <div onClick={onClose} style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,.55)' }} />
      <div style={{ position: 'relative', background: 'var(--bg)', color: 'var(--text)', borderRadius: 16, width: 'min(760px, 100%)', maxHeight: '92vh', overflowY: 'auto', boxShadow: 'var(--shadow-lg)', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))' }}>
        <button ref={closeRef} type="button" aria-label="Close quick view" onClick={onClose} style={{ position: 'absolute', top: 10, right: 10, zIndex: 2, width: 36, height: 36, borderRadius: '50%', border: 'none', cursor: 'pointer', background: 'rgba(255,255,255,.92)', color: '#14141f', display: 'grid', placeItems: 'center' }}><Close size={18} /></button>
        <Img src={product.image} alt={product.name} sizes="(max-width: 700px) 90vw, 460px" style={{ width: '100%', height: '100%', maxHeight: 460, objectFit: 'cover', background: 'var(--bg3)' }} />
        <div style={{ padding: 22, display: 'grid', gap: 12, alignContent: 'start' }}>
          <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--muted)' }}>{product.brand}</div>
          <h2 style={{ fontFamily: 'var(--font-body)', fontWeight: 700, fontSize: 20, lineHeight: 1.25 }}>{product.name}</h2>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
            <Price product={product} size={24} small={13} />
          </div>
          <p style={{ color: 'var(--muted)', fontSize: 13, lineHeight: 1.6 }}>{product.explanation}</p>
          {own ? (
            <>
              <div role="group" aria-label="Size">
                <div style={{ fontSize: 12, color: err ? 'var(--red-text)' : 'var(--muted)', marginBottom: 6 }}>{err ? 'Please choose a size' : 'Size'}</div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {sizesOf(product).map(s => {
                    const out = !!stock && left(s) <= 0;
                    return <button key={s} type="button" className="chip" disabled={out} aria-pressed={size === s} onClick={() => { setSize(s); setErr(false); }} style={out ? { textDecoration: 'line-through', opacity: .5, cursor: 'not-allowed' } : undefined}>{s}</button>;
                  })}
                </div>
              </div>
              <button type="button" className="btn-primary" onClick={() => {
                if (!size) { setErr(true); return; }
                addToBag(product.id, { size, qty: 1 }); showToast(`Added ${product.name} (${size})`, { href: '/bag', label: 'View bag' }); onClose();
              }}>Add to bag</button>
            </>
          ) : (
            <div style={{ display: 'grid', gap: 8 }}>
              <BagButton product={product} />
              <BuyLink product={product} style={{ justifyContent: 'center' }} />
            </div>
          )}
          <Link to={`/product/${product.id}`} onClick={() => { onClose(); navigate(`/product/${product.id}`); }} style={{ fontSize: 13, color: 'var(--red-text)', fontWeight: 600 }}>View full details →</Link>
        </div>
      </div>
    </div>
  );
}
