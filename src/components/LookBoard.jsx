import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { isOwn, sizesOf, inr } from '../lib/store.js';
import { unitPrice, preorderDate, prettyDate } from '../lib/offers.js';
import { useStock } from '../lib/useStock.js';
import { lookSummary, addLookToBag } from '../lib/looks.js';
import { showToast } from '../lib/toast.js';
import { Analytics } from '../lib/analytics.js';
import Img from './Img.jsx';

/** The items of a look with size pickers, the honest total, and "Add to bag". Used by /looks/:slug and /build. */
export default function LookBoard({ products, onRemove }) {
  const [sizes, setSizes] = useState({});
  const [msg, setMsg] = useState('');
  const ownIds = useMemo(() => products.filter(isOwn).map(p => p.id), [products]);
  const { stock, failed } = useStock(ownIds);
  const left = (id, s) => stock?.[id]?.[s] ?? (failed || !stock ? products.find(p => p.id === id)?.sizes?.[s] : 0) ?? 0;

  // Keep only choices that still apply; one-size items pick themselves.
  useEffect(() => {
    setSizes(prev => {
      const next = {};
      for (const p of products) if (isOwn(p)) { const all = sizesOf(p); next[p.id] = prev[p.id] && all.includes(prev[p.id]) ? prev[p.id] : (all.length === 1 ? all[0] : ''); }
      return next;
    });
  }, [products]);

  const sum = lookSummary(products, sizes);
  const t = sum.totals;

  function addAll() {
    const r = addLookToBag(products, sizes, left);
    if (r.added.length) { r.added.forEach(id => Analytics.addedToBag(id, products.find(p => p.id === id)?.name)); showToast(`${r.added.length} item${r.added.length > 1 ? 's' : ''} added to your bag`, { href: '/bag', label: 'View bag' }); }
    const name = (id) => products.find(p => p.id === id)?.name.replace('[SAMPLE] ', '');
    const bits = [];
    if (r.needSize.length) bits.push(`Choose a size for ${r.needSize.map(name).join(', ')}.`);
    if (r.soldOut.length) bits.push(`${r.soldOut.map(name).join(', ')} ${r.soldOut.length > 1 ? 'are' : 'is'} sold out in that size.`);
    setMsg(bits.join(' '));
  }

  return (
    <div style={{ display: 'grid', gap: 12 }}>
      {products.map(p => {
        const own = isOwn(p), pre = preorderDate(p);
        return (
          <article key={p.id} style={{ display: 'grid', gridTemplateColumns: '84px 1fr', gap: 12, background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 12, padding: 10 }}>
            <Link to={`/product/${p.id}`} aria-label={p.name}><Img src={p.image} sizes="84px" widths={[168, 252]} style={{ width: 84, height: 112, objectFit: 'cover', borderRadius: 8, display: 'block', background: 'var(--bg3)' }} /></Link>
            <div style={{ minWidth: 0 }}>
              <Link to={`/product/${p.id}`} style={{ fontWeight: 600, fontSize: 14 }}>{p.name}</Link>
              <div style={{ fontSize: 13, margin: '2px 0 6px' }}>{inr(unitPrice(p))}{unitPrice(p) < p.price && <s style={{ color: 'var(--muted2)', marginLeft: 6 }}>{inr(p.price)}</s>} <span style={{ color: 'var(--muted2)' }}>· {own ? 'ships from us' : `on ${p.platform}`}</span></div>
              {pre && <div style={{ fontSize: 12, color: 'var(--muted)' }}>Pre-order · ships by {prettyDate(pre)}</div>}
              {own ? (
                <div role="group" aria-label={`Size for ${p.name}`} style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 4 }}>
                  {sizesOf(p).map(s => {
                    const out = !!stock && left(p.id, s) <= 0;
                    return <button key={s} type="button" disabled={out} aria-pressed={sizes[p.id] === s} onClick={() => setSizes(v => ({ ...v, [p.id]: s }))}
                      style={{ minWidth: 44, minHeight: 36, borderRadius: 6, cursor: out ? 'not-allowed' : 'pointer', fontSize: 13, border: `1px solid ${sizes[p.id] === s ? 'var(--red)' : 'var(--border2)'}`, background: sizes[p.id] === s ? 'var(--red-dim)' : 'transparent', color: out ? 'var(--muted2)' : 'var(--text)', textDecoration: out ? 'line-through' : 'none' }}>{s}</button>;
                  })}
                </div>
              ) : (
                <a href={p.affiliateUrl} target="_blank" rel="noopener noreferrer sponsored" onClick={() => Analytics.buyClicked(p.id, p.name, p.platform, p.price)} className="btn" style={{ display: 'inline-block', marginTop: 4, minHeight: 36, fontSize: 13 }}>Buy on {p.platform} ↗</a>
              )}
              {onRemove && <button type="button" onClick={() => onRemove(p)} style={{ marginLeft: 10, background: 'none', border: 0, color: 'var(--muted)', textDecoration: 'underline', cursor: 'pointer', fontSize: 12 }}>Remove</button>}
            </div>
          </article>
        );
      })}

      {products.length > 0 && (
        <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 12, padding: 14, display: 'grid', gap: 6, fontSize: 14 }} aria-live="polite">
          {sum.ownCount > 0 && (<>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>Ships from us ({sum.ownCount})</span><span>{inr(sum.ownItemsSubtotal)}</span></div>
            {t.discount > 0 && <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--ok, #3ddc84)' }}><span>Bundle discount</span><span>−{inr(t.discount)}</span></div>}
            {sum.sized > 0 && sum.sized < sum.ownCount && <div style={{ fontSize: 12, color: 'var(--muted)' }}>Pick a size for every item to see the final price with any bundle discount.</div>}
            {sum.sized === sum.ownCount && <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 600 }}><span>You pay us</span><span>{inr(t.subtotal - t.discount)}</span></div>}
            <div style={{ fontSize: 12, color: 'var(--muted2)' }}>Delivery and cash-on-delivery fees are worked out at checkout.</div>
          </>)}
          {sum.partnerCount > 0 && <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--muted)' }}><span>Partner items ({sum.partnerCount}), paid on their site</span><span>{inr(sum.partnerTotal)}</span></div>}
          {sum.ownCount > 0 && <button type="button" className="btn" onClick={addAll} style={{ minHeight: 48, marginTop: 6 }}>Add {sum.ownCount > 1 ? `${sum.ownCount} items` : 'item'} to bag</button>}
          {msg && <div role="alert" style={{ color: 'var(--red-text)', fontSize: 13 }}>{msg}</div>}
          {sum.ownCount === 0 && <div style={{ fontSize: 12, color: 'var(--muted)' }}>These pieces are sold by our partners. Prices and stock are theirs and may differ when you check out.</div>}
        </div>
      )}
    </div>
  );
}
