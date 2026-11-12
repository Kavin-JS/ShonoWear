import { Link, useLocation } from 'react-router-dom';
import { STORE } from '../data/storeConfig.js';
import { CATEGORY_LABELS } from '../lib/shopFilters.js';

const h = { fontSize: 12, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 12, color: 'var(--text)' };
const a = { display: 'block', color: 'var(--muted)', fontSize: 13, padding: '4px 0' };

export default function Footer() {
  const { pathname } = useLocation();
  if (pathname.startsWith('/admin')) return null;
  return (
    <footer style={{ borderTop: '1px solid var(--border)', marginTop: 40, background: 'var(--bg2)' }}>
      <div className="container" style={{ padding: '40px 0 28px', display: 'grid', gap: 28, gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))' }}>
        <div style={{ gridColumn: 'span 2', minWidth: 200 }}>
          <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 26, letterSpacing: '0.05em' }}>SHONO<span style={{ color: 'var(--red)' }}>WEAR</span></div>
          <p style={{ color: 'var(--muted)', fontSize: 13, maxWidth: 300, marginTop: 8 }}>Outfits matched to you. Shop what we ship, or buy from Amazon and Myntra through our links.</p>
        </div>
        <nav aria-label="Shop"><div style={h}>Shop</div>
          {Object.entries(CATEGORY_LABELS).map(([k, l]) => <Link key={k} style={a} to={`/shop?cat=${k}`}>{l}</Link>)}
        </nav>
        <nav aria-label="Help"><div style={h}>Help</div>
          <Link style={a} to="/track">Track order</Link>
          <Link style={a} to="/policies/shipping">Shipping</Link>
          <Link style={a} to="/policies/returns">Returns & refunds</Link>
          <Link style={a} to="/contact">Contact us</Link>
        </nav>
        <nav aria-label="Company"><div style={h}>More</div>
          <Link style={a} to="/collections">Collections</Link>
          <Link style={a} to="/upload">AI Stylist</Link>
          <Link style={a} to="/saved">Saved outfits</Link>
          <Link style={a} to="/privacy">Privacy</Link>
          <Link style={a} to="/terms">Terms</Link>
        </nav>
      </div>
      <div style={{ borderTop: '1px solid var(--border)' }}>
        <div className="container" style={{ padding: '14px 0 20px', display: 'flex', flexWrap: 'wrap', gap: 8, justifyContent: 'space-between', fontSize: 12, color: 'var(--muted)' }}>
          <span>© {new Date().getFullYear()} {STORE.legalName}</span>
          <span>Amazon and Myntra links are affiliate links.</span>
        </div>
      </div>
    </footer>
  );
}
