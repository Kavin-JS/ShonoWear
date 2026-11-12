import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { catalog } from '../data/catalog.js';
import { useWishlist } from '../lib/wishlist.js';
import ProductCard from '../components/ProductCard.jsx';

export default function Wishlist() {
  const ids = useWishlist();
  useEffect(() => { document.title = 'Wishlist — Shonowear'; }, []);
  const byId = new Map(catalog.map(p => [p.id, p]));
  const items = ids.map(id => byId.get(id)).filter(Boolean);
  return (
    <main id="main" className="page">
      <div className="container">
        <h1 style={{ fontFamily: 'var(--font-body)', fontWeight: 700, fontSize: 'clamp(22px, 3vw, 30px)', marginBottom: 16 }}>
          Wishlist <span style={{ fontSize: 14, fontWeight: 400, color: 'var(--muted)' }}>· {items.length} item{items.length === 1 ? '' : 's'}</span>
        </h1>
        {items.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '56px 0' }}>
            <p style={{ fontSize: 44, marginBottom: 8 }}>♡</p>
            <p style={{ color: 'var(--muted)', marginBottom: 20 }}>Tap the heart on anything you like and it will wait for you here.</p>
            <Link to="/shop" className="btn-primary">Start shopping</Link>
          </div>
        ) : (
          <div className="product-grid">{items.map(p => <ProductCard key={p.id} product={p} />)}</div>
        )}
        <p style={{ fontSize: 11, color: 'var(--muted2)', marginTop: 24 }}>Your wishlist is saved in this browser only.</p>
      </div>
    </main>
  );
}
