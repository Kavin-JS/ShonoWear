import { Link, useLocation } from 'react-router-dom';
import { STORE } from '../data/storeConfig.js';
import Logo from './Logo.jsx';
import InstallButton from './InstallButton.jsx';
import { CATEGORY_LABELS } from '../lib/shopFilters.js';
import { useT } from '../i18n/index.jsx';

const h = { fontSize: 12, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 12, color: 'var(--text)' };
const a = { display: 'block', color: 'var(--muted)', fontSize: 13, padding: '4px 0' };

export default function Footer() {
  const t = useT();
  const { pathname } = useLocation();
  if (pathname.startsWith('/admin')) return null;
  return (
    <footer style={{ borderTop: '1px solid var(--border)', marginTop: 40, background: 'var(--bg2)' }}>
      <div className="container" style={{ padding: '40px 0 28px', display: 'grid', gap: 28, gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))' }}>
        <div style={{ gridColumn: 'span 2', minWidth: 200 }}>
          <Logo height={28} />
          <p style={{ color: 'var(--muted)', fontSize: 13, maxWidth: 300, marginTop: 8 }}>Outfits matched to you. Shop what we ship, or buy from Amazon and Myntra through our links.</p>
          <InstallButton />
        </div>
        <nav aria-label="Shop"><div style={h}>{t('Shop')}</div>
          {Object.entries(CATEGORY_LABELS).map(([k, l]) => <Link key={k} style={a} to={`/shop?cat=${k}`}>{t(l)}</Link>)}
        </nav>
        <nav aria-label="Help"><div style={h}>{t('Help')}</div>
          <Link style={a} to="/account">{t('My account')}</Link>
          <Link style={a} to="/faq">{t('Help and FAQ')}</Link>
          <Link style={a} to="/about">{t('About us')}</Link>
          <Link style={a} to="/blog">{t('Journal')}</Link>
          <Link style={a} to="/care">{t('Care guide')}</Link>
          <Link style={a} to="/track">{t('Track order')}</Link>
          <Link style={a} to="/policies/shipping">{t('Shipping')}</Link>
          <Link style={a} to="/policies/returns">{t('Returns & refunds')}</Link>
          <Link style={a} to="/contact">{t('Contact us')}</Link>
        </nav>
        <nav aria-label="Company"><div style={h}>{t('More')}</div>
          <Link style={a} to="/collections">{t('Collections')}</Link>
          <Link style={a} to="/looks">Shop the look</Link>
          <Link style={a} to="/build">Build your look</Link>
          <Link style={a} to="/gift-cards">{t('Gift cards')}</Link>
          <Link style={a} to="/upload">{t('AI Stylist')}</Link>
          <Link style={a} to="/saved">{t('Saved outfits')}</Link>
          <Link style={a} to="/privacy">{t('Privacy')}</Link>
          <Link style={a} to="/terms">{t('Terms')}</Link>
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
