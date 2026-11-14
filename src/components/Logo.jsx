import { BRAND, markInner } from '../brand/mark.js';

/** The Shonowear logo: the mark, plus the wordmark unless `markOnly`. Text uses the page's display font, so it stays crisp and selectable. */
export default function Logo({ height = 30, markOnly = false }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: Math.round(height * 0.28), lineHeight: 1 }}>
      <svg width={height} height={height} viewBox="0 0 100 100" role="img" aria-label={markOnly ? 'Shonowear' : undefined} aria-hidden={markOnly ? undefined : true} focusable="false" style={{ flexShrink: 0 }}>
        <rect width="100" height="100" rx="22" fill={BRAND.dark} stroke="rgba(255,255,255,.14)" strokeWidth="2" />
        <g dangerouslySetInnerHTML={{ __html: markInner() }} />
      </svg>
      {!markOnly && <span style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: Math.round(height * 0.93), letterSpacing: '0.05em' }}>SHONO<span style={{ color: 'var(--red-text)' }}>WEAR</span></span>}
    </span>
  );
}
