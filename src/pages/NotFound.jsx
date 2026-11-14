import { Link } from 'react-router-dom';
import Mark3D from '../components/Mark3D.jsx';

export default function NotFound() {
  return (
    <main id="main" className="page" style={{ paddingTop: '120px', textAlign: 'center' }}>
      <div className="container" style={{ maxWidth: '480px' }}>
        <Mark3D height={170} />
        <div style={{
          fontFamily: "'Bebas Neue', sans-serif",
          fontSize: '120px', lineHeight: 1, color: 'var(--border2)',
          marginBottom: '8px', letterSpacing: '0.02em',
        }}>
          404
        </div>
        <h1 style={{
          fontFamily: "'Bebas Neue', sans-serif",
          fontSize: 'clamp(36px, 6vw, 56px)',
          marginBottom: '16px', lineHeight: 1,
        }}>
          PAGE NOT{' '}
          <em style={{ fontFamily: "'DM Serif Display', serif", color: 'var(--red-text)', fontStyle: 'italic' }}>
            Found.
          </em>
        </h1>
        <p style={{ color: 'var(--muted)', fontSize: '14px', marginBottom: '40px', lineHeight: 1.7 }}>
          This page doesn't exist. The outfit you're looking for might have been saved somewhere else.
        </p>
        <div style={{ display: 'flex', gap: '16px', justifyContent: 'center', flexWrap: 'wrap' }}>
          <Link to="/" className="btn-primary">Back to Home</Link>
          <Link to="/upload" className="btn-ghost">Get Outfit Recommendations</Link>
        </div>
      </div>
    </main>
  );
}
