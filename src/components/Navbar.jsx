import { useState, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';

export default function Navbar() {
  const [scrolled,     setScrolled]     = useState(false);
  const [menuOpen,     setMenuOpen]     = useState(false);
  const location = useLocation();

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 40);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  // Close menu on route change
  useEffect(() => { setMenuOpen(false); }, [location.pathname]);

  return (
    <>
      <nav style={{
        position: 'fixed', top: 0, left: 0, right: 0, zIndex: 100,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '0 40px', height: '64px',
        borderBottom: scrolled ? '1px solid rgba(255,255,255,0.07)' : '1px solid transparent',
        background: scrolled || menuOpen ? 'rgba(7,7,15,0.95)' : 'transparent',
        backdropFilter: scrolled || menuOpen ? 'blur(16px)' : 'none',
        transition: 'background 0.35s, border-color 0.35s',
      }}>
        {/* Logo */}
        <Link to="/" style={{
          fontFamily: "'Bebas Neue', sans-serif",
          fontSize: '24px', letterSpacing: '0.06em',
          color: 'var(--text)', textDecoration: 'none', flexShrink: 0,
        }}>
          SHONO<span style={{ color: 'var(--red)' }}>WEAR</span>
        </Link>

        {/* Desktop nav */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '32px' }}
          className="nav-desktop">
          <Link to="/saved" style={{
            fontSize: '12px', letterSpacing: '0.1em', textTransform: 'uppercase',
            color: location.pathname === '/saved' ? 'var(--text)' : 'var(--muted)',
            transition: 'color 0.2s',
          }}>
            Saved
          </Link>
          <Link to="/upload" style={{
            background: 'var(--red)', color: '#fff',
            fontFamily: "'Poppins', sans-serif",
            fontSize: '12px', fontWeight: 600,
            letterSpacing: '0.1em', textTransform: 'uppercase',
            padding: '9px 22px', borderRadius: '3px',
            transition: 'background 0.2s',
          }}
            onMouseEnter={e => e.currentTarget.style.background = 'var(--red-hover)'}
            onMouseLeave={e => e.currentTarget.style.background = 'var(--red)'}
          >
            Try AI Stylist
          </Link>
        </div>

        {/* Mobile hamburger */}
        <button
          onClick={() => setMenuOpen(v => !v)}
          className="nav-mobile"
          aria-label="Toggle menu"
          style={{
            background: 'none', border: 'none', cursor: 'pointer',
            padding: '8px', display: 'flex', flexDirection: 'column',
            gap: '5px', alignItems: 'flex-end',
          }}
        >
          <span style={{
            display: 'block', height: '2px', background: 'var(--text)',
            borderRadius: '1px', transition: 'all 0.2s',
            width: menuOpen ? '20px' : '22px',
            transform: menuOpen ? 'translateY(7px) rotate(45deg)' : 'none',
          }} />
          <span style={{
            display: 'block', height: '2px', background: 'var(--text)',
            borderRadius: '1px', transition: 'all 0.2s',
            width: '16px', opacity: menuOpen ? 0 : 1,
          }} />
          <span style={{
            display: 'block', height: '2px', background: 'var(--text)',
            borderRadius: '1px', transition: 'all 0.2s',
            width: menuOpen ? '20px' : '14px',
            transform: menuOpen ? 'translateY(-7px) rotate(-45deg)' : 'none',
          }} />
        </button>
      </nav>

      {/* Mobile dropdown menu */}
      {menuOpen && (
        <div style={{
          position: 'fixed', top: '64px', left: 0, right: 0, zIndex: 99,
          background: 'rgba(7,7,15,0.97)', backdropFilter: 'blur(16px)',
          borderBottom: '1px solid var(--border)',
          padding: '24px 40px 32px',
          display: 'flex', flexDirection: 'column', gap: '24px',
        }}
          className="nav-mobile"
        >
          <Link to="/saved" style={{
            fontSize: '18px', letterSpacing: '0.08em', textTransform: 'uppercase',
            fontFamily: "'Bebas Neue', sans-serif",
            color: location.pathname === '/saved' ? 'var(--red)' : 'var(--text)',
          }}>
            Saved Outfits
          </Link>
          <Link to="/upload" className="btn-primary" style={{ justifyContent: 'center' }}>
            Try AI Stylist — Free
          </Link>
        </div>
      )}

      {/* Responsive styles */}
      <style>{`
        .nav-desktop { }
        .nav-mobile  { display: none !important; }
        @media (max-width: 600px) {
          nav { padding: 0 20px !important; }
          .nav-desktop { display: none !important; }
          .nav-mobile  { display: flex !important; }
        }
      `}</style>
    </>
  );
}
