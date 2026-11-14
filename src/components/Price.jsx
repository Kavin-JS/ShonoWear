import { useEffect, useState } from 'react';
import { inr, discountPct } from '../lib/store.js';
import { saleFor, unitPrice, countdown } from '../lib/offers.js';

/** The price a customer pays right now: the flash-sale price (with the usual price struck through) or the catalogue price with its real MRP. */
export function Price({ product, size = 17, small = 12, gap = 8 }) {
  const sale = saleFor(product);
  const off = discountPct(product);
  return (
    <div style={{ display: 'flex', alignItems: 'baseline', gap, flexWrap: 'wrap' }}>
      <span style={{ fontSize: size, fontWeight: 700 }}>{inr(unitPrice(product))}</span>
      {sale ? (
        <>
          <s style={{ fontSize: small, color: 'var(--muted2)' }}>{inr(product.price)}</s>
          <span style={{ fontSize: small, fontWeight: 600, color: 'var(--red-text)' }}>{sale.percent}% off · sale</span>
        </>
      ) : off > 0 && (
        <>
          <s style={{ fontSize: small, color: 'var(--muted2)' }}>{inr(product.mrp)}</s>
          <span style={{ fontSize: small, fontWeight: 600, color: 'var(--good)' }}>{off}% off</span>
        </>
      )}
    </div>
  );
}

/** Live "ends in 2h 05m" text. Renders nothing once the moment has passed. */
export function Countdown({ endsAt, prefix = 'Ends in ', style }) {
  const [, tick] = useState(0);
  useEffect(() => { const t = setInterval(() => tick(n => n + 1), 1000); return () => clearInterval(t); }, []);
  const left = countdown(endsAt);
  return left ? <span style={style}>{prefix}{left}</span> : null;
}

export function SaleBanner({ product }) {
  const sale = saleFor(product);
  if (!sale) return null;
  return (
    <div role="status" style={{ background: 'var(--red-dim)', border: '1px solid var(--red)', borderRadius: 10, padding: '8px 12px', fontSize: 13, display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
      <strong>⚡ {sale.title}</strong>
      <Countdown endsAt={sale.endsAt} style={{ fontVariantNumeric: 'tabular-nums' }} />
    </div>
  );
}
