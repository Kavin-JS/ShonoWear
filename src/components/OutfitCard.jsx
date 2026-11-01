import { useState } from 'react';
import { saveOutfit, unsaveOutfit, isOutfitSaved } from '../lib/savedOutfits.js';
import { Analytics } from '../lib/analytics.js';

export default function OutfitCard({ product, animationDelay = 0 }) {
  const [saved, setSaved]       = useState(() => isOutfitSaved(product.id));
  const [imgError, setImgError] = useState(false);
  const [expanded, setExpanded] = useState(false);

  function handleSave(e) {
    e.stopPropagation();
    if (saved) { unsaveOutfit(product.id); setSaved(false); }
    else        { saveOutfit(product); setSaved(true); Analytics.outfitSaved(product.id, product.name); }
  }

  function handleBuy(url, id, platform, price, name) {
    Analytics.buyClicked(id, name, platform, price);
    window.open(url, '_blank', 'noopener,noreferrer');
  }

  // Support both single-product (Phase 1) and multi-item outfit (Phase 3)
  const items = product.items || [product];
  const totalPrice = product.price; // already summed in backend for outfits
  const hasRating = product.rating != null;

  return (
    <div
      className="card fade-up"
      style={{ animationDelay: `${animationDelay}s`, display: 'flex', flexDirection: 'column', opacity: 0 }}
    >
      {/* Image */}
      <div style={{
        position: 'relative', width: '100%', aspectRatio: '3 / 4',
        background: 'var(--bg3)', overflow: 'hidden', flexShrink: 0,
      }}>
        {imgError ? (
          <div style={{
            width: '100%', height: '100%', display: 'flex', flexDirection: 'column',
            alignItems: 'center', justifyContent: 'center', gap: '8px', color: 'var(--muted2)',
          }}>
            <span style={{ fontSize: '44px' }}>👕</span>
            <span style={{ fontSize: '11px', letterSpacing: '0.08em' }}>{product.platform}</span>
          </div>
        ) : (
          <img
            src={product.image}
            alt={product.name}
            onError={() => setImgError(true)}
            style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block', transition: 'transform 0.4s' }}
            onMouseEnter={e => e.currentTarget.style.transform = 'scale(1.04)'}
            onMouseLeave={e => e.currentTarget.style.transform = 'scale(1)'}
          />
        )}

        {/* Platform badge */}
        <div style={{
          position: 'absolute', top: '12px', left: '12px',
          background: 'var(--red)', color: '#fff',
          fontSize: '9px', fontWeight: 600, letterSpacing: '0.12em', textTransform: 'uppercase',
          padding: '4px 10px', borderRadius: '2px',
        }}>
          {product.platform}
        </div>

        {/* Rating badge */}
        {hasRating && (
          <div style={{
            position: 'absolute', bottom: '12px', left: '12px',
            background: 'rgba(7,7,15,0.82)', backdropFilter: 'blur(8px)',
            border: '1px solid rgba(255,255,255,0.1)',
            color: '#fff', fontSize: '11px', fontWeight: 600,
            padding: '4px 10px', borderRadius: '2px',
            display: 'flex', alignItems: 'center', gap: '5px',
          }}>
            <span style={{ color: '#f5c518' }}>★</span> {product.rating}/10
          </div>
        )}

        {/* Save button */}
        <button onClick={handleSave}
          aria-label={saved ? 'Remove from saved' : 'Save outfit'}
          style={{
            position: 'absolute', top: '12px', right: '12px',
            width: '34px', height: '34px', borderRadius: '50%',
            background: saved ? 'var(--red)' : 'rgba(7,7,15,0.7)',
            backdropFilter: 'blur(8px)', border: '1px solid rgba(255,255,255,0.12)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: '16px', cursor: 'pointer', transition: 'background 0.2s, transform 0.15s',
          }}
          onMouseEnter={e => e.currentTarget.style.transform = 'scale(1.1)'}
          onMouseLeave={e => e.currentTarget.style.transform = 'scale(1)'}
        >
          {saved ? '♥' : '♡'}
        </button>
      </div>

      {/* Card body */}
      <div style={{ padding: '18px 20px 20px', display: 'flex', flexDirection: 'column', gap: '10px', flex: 1 }}>

        {/* Brand + name */}
        <div>
          <div style={{ fontSize: '10px', letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--red)', marginBottom: '3px' }}>
            {product.brand}
          </div>
          <div style={{ fontSize: '14px', fontWeight: 500, color: 'var(--text)', lineHeight: 1.3 }}>
            {product.name}
          </div>
          {product.styleSummary && (
            <div style={{ fontSize: '11px', color: 'var(--muted2)', marginTop: '3px', fontStyle: 'italic' }}>
              {product.styleSummary}
            </div>
          )}
        </div>

        {/* AI Explanation */}
        <p style={{ fontSize: '12px', color: 'var(--muted)', lineHeight: 1.65, flex: 1 }}>
          {product.explanation}
        </p>

        {/* Multi-item breakdown (Phase 3 outfits) */}
        {items.length > 1 && (
          <div>
            <button
              type="button"
              onClick={() => setExpanded(v => !v)}
              style={{
                background: 'none', border: 'none', padding: '0',
                fontSize: '11px', color: 'var(--muted)', cursor: 'pointer',
                letterSpacing: '0.06em', textTransform: 'uppercase',
                display: 'flex', alignItems: 'center', gap: '5px',
              }}
            >
              {expanded ? '▾' : '▸'} {items.length} items in this outfit
            </button>
            {expanded && (
              <div style={{ marginTop: '10px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                {items.map(item => (
                  <div key={item.id} style={{
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    padding: '8px 12px', background: 'var(--bg3)',
                    borderRadius: '4px', fontSize: '12px',
                  }}>
                    <div>
                      <span style={{ fontSize: '10px', color: 'var(--muted2)', textTransform: 'uppercase', letterSpacing: '0.08em', marginRight: '6px' }}>
                        {item.category}
                      </span>
                      <span style={{ color: 'var(--text)' }}>{item.name}</span>
                    </div>
                    <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                      <span style={{ color: 'var(--muted)', fontSize: '11px' }}>₹{item.price.toLocaleString('en-IN')}</span>
                      <button
                        type="button"
                        onClick={() => handleBuy(item.affiliateUrl, item.id, item.platform, item.price, item.name)}
                        style={{
                          background: 'var(--border2)', color: 'var(--text)',
                          border: 'none', borderRadius: '2px', padding: '4px 10px',
                          fontSize: '10px', fontWeight: 600, letterSpacing: '0.06em',
                          textTransform: 'uppercase', cursor: 'pointer',
                          transition: 'background 0.15s',
                        }}
                        onMouseEnter={e => e.currentTarget.style.background = 'var(--red)'}
                        onMouseLeave={e => e.currentTarget.style.background = 'var(--border2)'}
                      >
                        Buy
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Price + main buy */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          paddingTop: '12px', borderTop: '1px solid var(--border)',
        }}>
          <div>
            <div style={{
              fontFamily: "'Bebas Neue', sans-serif", fontSize: '26px',
              letterSpacing: '0.02em', color: 'var(--text)', lineHeight: 1,
            }}>
              ₹{totalPrice.toLocaleString('en-IN')}
            </div>
            {items.length > 1 && (
              <div style={{ fontSize: '10px', color: 'var(--muted2)', marginTop: '1px' }}>full outfit</div>
            )}
          </div>

          <button
            onClick={() => handleBuy(product.affiliateUrl, product.id, product.platform, product.price, product.name)}
            style={{
              display: 'flex', alignItems: 'center', gap: '6px',
              background: 'var(--red)', color: '#fff',
              fontFamily: "'Poppins', sans-serif", fontSize: '11px', fontWeight: 600,
              letterSpacing: '0.08em', textTransform: 'uppercase',
              padding: '9px 18px', border: 'none', borderRadius: '3px',
              cursor: 'pointer', transition: 'background 0.2s, transform 0.15s',
            }}
            onMouseEnter={e => { e.currentTarget.style.background = 'var(--red-hover)'; e.currentTarget.style.transform = 'translateY(-1px)'; }}
            onMouseLeave={e => { e.currentTarget.style.background = 'var(--red)'; e.currentTarget.style.transform = 'translateY(0)'; }}
          >
            Shop
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>
              <polyline points="15,3 21,3 21,9"/>
              <line x1="10" y1="14" x2="21" y2="3"/>
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}
