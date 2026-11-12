import { NavLink, useLocation } from 'react-router-dom';
import { useBag, bagCount } from '../lib/bag.js';
import { useWishlist } from '../lib/wishlist.js';
import { Home, Grid, Sparkle, Heart, Bag } from './Icons.jsx';

function Tab({ to, label, icon, badge, end, primary }) {
  return (
    <NavLink to={to} end={end} aria-label={badge ? `${label}, ${badge} items` : label}
      style={({ isActive }) => ({
        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '2px', fontSize: '10px', fontWeight: 500, position: 'relative',
        color: isActive ? 'var(--red)' : 'var(--muted)', padding: '4px 0',
      })}>
      {primary
        ? <span style={{ width: 44, height: 44, marginTop: -18, borderRadius: '50%', background: 'var(--red)', color: '#fff', display: 'grid', placeItems: 'center', boxShadow: '0 6px 16px var(--red-glow)' }}>{icon}</span>
        : <span style={{ position: 'relative', display: 'grid' }}>{icon}{badge > 0 && <span style={{ position: 'absolute', top: -4, right: -8, minWidth: 16, height: 16, borderRadius: 8, background: 'var(--red)', color: '#fff', fontSize: 10, fontWeight: 700, display: 'grid', placeItems: 'center', padding: '0 4px' }}>{badge}</span>}</span>}
      {label}
    </NavLink>
  );
}

export default function TabBar() {
  const { pathname } = useLocation();
  const count = bagCount(useBag());
  const wished = useWishlist().length;
  if (pathname.startsWith('/admin') || pathname === '/checkout') return null;
  return (
    <nav className="tabbar" aria-label="Main">
      <Tab to="/" end label="Home" icon={<Home />} />
      <Tab to="/shop" label="Shop" icon={<Grid />} />
      <Tab to="/upload" label="Stylist" icon={<Sparkle />} primary />
      <Tab to="/wishlist" label="Wishlist" icon={<Heart />} badge={wished} />
      <Tab to="/bag" label="Bag" icon={<Bag />} badge={count} />
    </nav>
  );
}
