import { Link, useParams } from 'react-router-dom';
import LookBoard from '../components/LookBoard.jsx';
import { activeLooks, lookBySlug } from '../lib/looks.js';
import { inr } from '../lib/store.js';
import { unitPrice } from '../lib/offers.js';
import Tilt from '../components/Tilt.jsx';
import Reveal from '../components/Reveal.jsx';
import NotFound from './NotFound.jsx';
import Img from '../components/Img.jsx';

export function Collage({ products, height = 220 }) {
  const shown = products.slice(0, 4);
  return (
    <div style={{ display: 'grid', gridTemplateColumns: `repeat(${Math.min(shown.length, 4)}, 1fr)`, gap: 2, height, background: 'var(--bg3)', overflow: 'hidden' }}>
      {shown.map(p => <Img key={p.id} src={p.image} sizes="(max-width: 600px) 25vw, 120px" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />)}
    </div>
  );
}
export const lookPrice = (l) => l.products.reduce((n, p) => n + unitPrice(p), 0);

export function LookCard({ look }) {
  return (
    <Tilt><Link to={`/looks/${look.slug}`} className="card" style={{ display: 'block', overflow: 'hidden', borderRadius: 14, background: 'var(--bg2)', border: '1px solid var(--border)' }}>
      <Collage products={look.products} />
      <div style={{ padding: '12px 14px' }}>
        <div style={{ fontSize: 11, letterSpacing: '.1em', textTransform: 'uppercase', color: 'var(--muted)' }}>{look.occasion}</div>
        <div style={{ fontWeight: 600, margin: '2px 0' }}>{look.title}</div>
        <div style={{ fontSize: 13, color: 'var(--muted)' }}>{look.products.length} pieces · {inr(lookPrice(look))}</div>
      </div>
    </Link></Tilt>
  );
}

export function LooksIndex() {
  const looks = activeLooks();
  return (
    <main id="main" className="page" style={{ paddingTop: 100 }}>
      <div className="container" style={{ maxWidth: 980 }}>
        <Link to="/" style={{ fontSize: 12 }}>← Back to Home</Link>
        <h1 style={{ fontSize: 'clamp(34px, 6vw, 56px)', margin: '16px 0 8px' }}>Shop the look</h1>
        <p style={{ color: 'var(--muted)', marginBottom: 22 }}>Complete outfits, ready to wear. Or <Link to="/build" style={{ textDecoration: 'underline' }}>build your own</Link>.</p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 16 }}>
          {looks.map((l, i) => <Reveal key={l.slug} delay={(i % 3) * 0.08}><LookCard look={l} /></Reveal>)}
        </div>
        {looks.length === 0 && <p>No looks yet.</p>}
      </div>
    </main>
  );
}

export function LookPage() {
  const { slug } = useParams();
  const look = lookBySlug(slug);
  if (!look) return <NotFound />;
  return (
    <main id="main" className="page" style={{ paddingTop: 100 }}>
      <div className="container" style={{ maxWidth: 720 }}>
        <Link to="/looks" style={{ fontSize: 12 }}>← All looks</Link>
        <div style={{ fontSize: 11, letterSpacing: '.1em', textTransform: 'uppercase', color: 'var(--muted)', marginTop: 14 }}>{look.occasion}</div>
        <h1 style={{ fontSize: 'clamp(32px, 6vw, 52px)', margin: '4px 0 10px' }}>{look.title}</h1>
        <p style={{ color: 'var(--muted)', marginBottom: 16 }}>{look.blurb}</p>
        <div style={{ borderRadius: 14, overflow: 'hidden', marginBottom: 16 }}><Collage products={look.products} height={260} /></div>
        <LookBoard products={look.products} />
        <p style={{ marginTop: 16, fontSize: 13 }}>Want to swap a piece? <Link to={`/build?${new URLSearchParams(Object.fromEntries(look.products.map(p => [p.category, p.id]))).toString()}`} style={{ textDecoration: 'underline' }}>Open this look in the builder</Link>.</p>
      </div>
    </main>
  );
}
