import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom';
import { useBag, bagCount } from '../lib/bag.js';
import { useWishlist } from '../lib/wishlist.js';
import { catalog } from '../data/catalog.js';
import { STORE } from '../data/storeConfig.js';
import { parseFilters, filterProducts, CATEGORY_LABELS } from '../lib/shopFilters.js';
import { inr } from '../lib/store.js';
import { Heart, Bag, Search } from './Icons.jsx';
import Logo from './Logo.jsx';
import { LangToggle, useT } from '../i18n/index.jsx';

function SearchBox() {
  const t = useT();
  const navigate = useNavigate();
  const { pathname, search } = useLocation();
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const box = useRef(null);

  // keep the box in sync with the URL on the shop page
  useEffect(() => { setQ(pathname === '/shop' ? new URLSearchParams(search).get('q') || '' : ''); }, [pathname, search]);
  useEffect(() => {
    const off = (e) => { if (box.current && !box.current.contains(e.target)) setOpen(false); };
    document.addEventListener('pointerdown', off);
    return () => document.removeEventListener('pointerdown', off);
  }, []);

  const results = useMemo(() => {
    const term = q.trim();
    if (term.length < 2) return [];
    return filterProducts(catalog, parseFilters(new URLSearchParams({ q: term }))).slice(0, 6);
  }, [q]);

  const go = (path) => { setOpen(false); setActive(-1); navigate(path); };
  const submit = (e) => {
    e.preventDefault();
    if (active >= 0 && results[active]) return go(`/product/${results[active].id}`);
    const term = q.trim();
    go(term ? `/shop?q=${encodeURIComponent(term)}` : '/shop');
  };
  const onKey = (e) => {
    if (e.key === 'Escape') setOpen(false);
    else if (e.key === 'ArrowDown') { e.preventDefault(); setOpen(true); setActive(i => Math.min(results.length - 1, i + 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive(i => Math.max(-1, i - 1)); }
  };

  return (
    <form ref={box} role="search" onSubmit={submit} style={{ position: 'relative', flex: 1, minWidth: 0, maxWidth: '620px' }}>
      <label htmlFor="site-search" className="sr-only" style={{ position: 'absolute', left: '-9999px' }}>{t('Search products')}</label>
      <span style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', color: 'var(--muted)', display: 'grid' }}><Search /></span>
      <input id="site-search" type="search" value={q} autoComplete="off" placeholder={t('Search for tees, sneakers, brands…')}
        role="combobox" aria-expanded={open && results.length > 0} aria-controls="search-list" aria-autocomplete="list"
        aria-activedescendant={active >= 0 ? `sr-${active}` : undefined}
        onChange={e => { setQ(e.target.value); setOpen(true); setActive(-1); }} onFocus={() => setOpen(true)} onKeyDown={onKey}
        style={{ width: '100%', height: 44, borderRadius: 10, border: '1px solid var(--border)', background: 'var(--bg2)', color: 'var(--text)', padding: '0 14px 0 44px', fontSize: 14, fontFamily: 'inherit' }} />
      {open && results.length > 0 && (
        <ul id="search-list" role="listbox" style={{ position: 'absolute', top: 50, left: 0, right: 0, listStyle: 'none', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 12, boxShadow: 'var(--shadow-lg)', overflow: 'hidden', zIndex: 130 }}>
          {results.map((p, i) => (
            <li key={p.id} id={`sr-${i}`} role="option" aria-selected={i === active}>
              <button type="button" onClick={() => go(`/product/${p.id}`)} onMouseEnter={() => setActive(i)}
                style={{ display: 'flex', alignItems: 'center', gap: 12, width: '100%', textAlign: 'left', padding: '8px 12px', border: 'none', cursor: 'pointer', color: 'var(--text)', background: i === active ? 'var(--bg2)' : 'transparent', fontFamily: 'inherit' }}>
                <img src={p.image} alt="" width="36" height="46" loading="lazy" style={{ objectFit: 'cover', borderRadius: 4, background: 'var(--bg3)' }} />
                <span style={{ flex: 1, minWidth: 0, fontSize: 13, lineHeight: 1.3 }}>{p.name}<br /><span style={{ color: 'var(--muted)', fontSize: 11 }}>{p.brand}</span></span>
                <span style={{ fontSize: 13, fontWeight: 600 }}>{inr(p.price)}</span>
              </button>
            </li>
          ))}
          <li><button type="submit" style={{ width: '100%', padding: '11px 12px', border: 'none', borderTop: '1px solid var(--border)', background: 'transparent', color: 'var(--red-text)', fontWeight: 600, fontSize: 13, cursor: 'pointer', fontFamily: 'inherit' }}>See all results for “{q.trim()}”</button></li>
        </ul>
      )}
    </form>
  );
}

function IconLink({ to, label, count, children, hideOnMobile }) {
  const t = useT(); label = t(label);
  return (
    <Link to={to} aria-label={count ? `${label}, ${count} items` : label} className={hideOnMobile ? 'hdr-hide-mobile' : undefined}
      style={{ position: 'relative', display: 'grid', placeItems: 'center', width: 42, height: 42, borderRadius: 10, color: 'var(--text)' }}>
      {children}
      {count > 0 && <span key={count} className="bump" style={{ position: 'absolute', top: 3, right: 2, minWidth: 17, height: 17, borderRadius: 9, background: 'var(--red)', color: '#fff', fontSize: 10, fontWeight: 700, display: 'grid', placeItems: 'center', padding: '0 4px' }}>{count}</span>}
    </Link>
  );
}

export default function Navbar() {
  const t = useT();
  const bag = bagCount(useBag());
  const wished = useWishlist().length;
  const { pathname } = useLocation();
  if (pathname.startsWith('/admin')) return null;
  const catLink = (to, label, extra) => (
    <NavLink key={to} to={to} className="cat-link"
      style={({ isActive }) => ({ flexShrink: 0, fontSize: 13, fontWeight: 500, padding: '12px 2px', whiteSpace: 'nowrap', color: extra?.color || (isActive ? 'var(--text)' : 'var(--muted)'), borderBottom: `2px solid ${isActive ? 'var(--red)' : 'transparent'}` })}>
      {label}
    </NavLink>
  );
  return (
    <>
      <a href="#main" className="skip-link" onClick={e => { const m = document.getElementById("main"); if (m) { e.preventDefault(); if (!m.hasAttribute("tabindex")) m.setAttribute("tabindex", "-1"); m.focus({ preventScroll: true }); m.scrollIntoView(); } }}>{t('Skip to content')}</a>
      <div style={{ background: 'var(--text)', color: 'var(--bg)', fontSize: 12, textAlign: 'center', padding: '7px 16px', letterSpacing: '0.02em' }}>
        {t('Free shipping over {amount} on items we ship', { amount: inr(STORE.freeShippingOver) })}<span className="hdr-hide-mobile"> · {t('{days}-day returns', { days: STORE.returnDays })} · {t('Secure payments')}</span>
      </div>
      <header style={{ position: 'sticky', top: 0, zIndex: 100, background: 'var(--bg)', borderBottom: '1px solid var(--border)' }}>
        <div className="container" style={{ display: 'flex', alignItems: 'center', gap: 16, height: 64, flexWrap: 'wrap' }}>
          <Link to="/" aria-label="Shonowear home" style={{ flexShrink: 0, lineHeight: 1 }}>
            <Logo height={30} />
          </Link>
          <div className="hdr-search" style={{ display: 'flex', flex: 1, minWidth: 0, justifyContent: 'center' }}><SearchBox /></div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 2, marginLeft: 'auto' }}>
            <Link to="/upload" className="hdr-hide-mobile" style={{ fontSize: 13, fontWeight: 600, color: 'var(--red-text)', padding: '0 12px' }}>{t('✦ AI Stylist')}</Link>
            <LangToggle />
            <IconLink to="/wishlist" label="Wishlist" count={wished} hideOnMobile><Heart /></IconLink>
            <IconLink to="/bag" label="Bag" count={bag}><Bag /></IconLink>
          </div>
        </div>
        <nav aria-label="Categories" className="container hide-scroll" style={{ display: 'flex', gap: 22, overflowX: 'auto', alignItems: 'center' }}>
          {catLink('/shop', t('All'))}
          {Object.entries(CATEGORY_LABELS).map(([k, label]) => (
            <Link key={k} to={`/shop?cat=${k}`} style={{ flexShrink: 0, fontSize: 13, fontWeight: 500, padding: '12px 2px', whiteSpace: 'nowrap', color: 'var(--muted)', borderBottom: '2px solid transparent' }}>{t(label)}</Link>
          ))}
          <Link to="/collections" style={{ flexShrink: 0, fontSize: 13, fontWeight: 500, padding: '12px 2px', whiteSpace: 'nowrap', color: 'var(--muted)' }}>{t('Collections')}</Link>
          <Link to="/shop?max=1000" style={{ flexShrink: 0, fontSize: 13, fontWeight: 600, padding: '12px 2px', color: 'var(--red-text)', whiteSpace: 'nowrap' }}>{t('Under ₹1,000')}</Link>
          <Link to="/account" className="hdr-hide-mobile" style={{ marginLeft: 'auto', flexShrink: 0, fontSize: 13, padding: '12px 8px', color: 'var(--muted)' }}>{t('My account')}</Link>
          <Link to="/track" className="hdr-hide-mobile" style={{ flexShrink: 0, fontSize: 13, padding: '12px 2px', color: 'var(--muted)' }}>{t('Track order')}</Link>
        </nav>
      </header>
      <style>{`
        @media (max-width: 768px) {
          .hdr-hide-mobile { display: none !important; }
          header .container:first-child { height: auto !important; padding-top: 10px; padding-bottom: 6px; row-gap: 8px; }
          .hdr-search { order: 3; flex: 0 0 100% !important; }
        }
      `}</style>
    </>
  );
}
