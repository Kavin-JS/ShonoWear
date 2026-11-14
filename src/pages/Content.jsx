import { Link } from 'react-router-dom';
import { PAGES } from '../data/pages.js';
import { POSTS, postBySlug } from '../data/posts.js';
import Mark3D from '../components/Mark3D.jsx';
import { MiniMd } from '../lib/miniMd.jsx';
import InstagramStrip from '../components/InstagramStrip.jsx';
import NotFound from './NotFound.jsx';
import { STORE } from '../data/storeConfig.js';

const shell = (title, children, extra = null) => (
  <main id="main" className="page" style={{ paddingTop: 100 }}>
    <div className="container" style={{ maxWidth: 720 }}>
      <Link to="/" style={{ fontSize: 12 }}>← Back to Home</Link>
      <h1 style={{ fontSize: 'clamp(34px, 6vw, 56px)', margin: '16px 0 22px' }}>{title}</h1>
      {children}
    </div>
    {extra}
  </main>
);

export function About() {
  return shell(PAGES.about.title, <><Mark3D height={220} /><MiniMd source={PAGES.about.body} /><p style={{ marginTop: 18 }}>Email <a href={`mailto:${STORE.supportEmail}`} style={{ textDecoration: 'underline' }}>{STORE.supportEmail}</a>, or see <Link to="/faq" style={{ textDecoration: 'underline' }}>Help and FAQ</Link>.</p></>, <InstagramStrip />);
}
export function Care() { return shell(PAGES.care.title, <MiniMd source={PAGES.care.body} />); }
export function Faq() {
  return shell(PAGES.faq.title, (
    <div style={{ display: 'grid', gap: 10 }}>
      {PAGES.faq.faq.map(([q, a]) => (
        <details key={q} style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 12, padding: '12px 14px' }}>
          <summary style={{ cursor: 'pointer', fontWeight: 600 }}>{q}</summary>
          <p style={{ marginTop: 8, color: 'var(--muted)', lineHeight: 1.7 }}>{a}</p>
        </details>
      ))}
      <p style={{ color: 'var(--muted)', marginTop: 8 }}>Still stuck? <Link to="/contact" style={{ textDecoration: 'underline' }}>Contact us</Link>.</p>
    </div>
  ));
}

const fmt = (d) => new Date(d + 'T00:00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' });
export function BlogIndex() {
  return shell('Journal', (
    <div style={{ display: 'grid', gap: 16 }}>
      {POSTS.map(p => (
        <Link key={p.slug} to={`/blog/${p.slug}`} style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 140px) 1fr', gap: 14, background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 14, overflow: 'hidden', color: 'var(--text)' }}>
          <img src={p.image} alt="" loading="lazy" style={{ width: '100%', height: '100%', objectFit: 'cover', minHeight: 110 }} />
          <div style={{ padding: '12px 12px 12px 0' }}>
            <div style={{ fontSize: 12, color: 'var(--muted2)' }}>{fmt(p.date)}</div>
            <strong style={{ display: 'block', margin: '4px 0', fontSize: 17 }}>{p.title}</strong>
            <span style={{ fontSize: 13, color: 'var(--muted)' }}>{p.description}</span>
          </div>
        </Link>
      ))}
    </div>
  ));
}
export function BlogPost({ slug }) {
  const p = postBySlug(slug);
  if (!p) return <NotFound />;
  return (
    <main id="main" className="page" style={{ paddingTop: 100 }}>
      <article className="container" style={{ maxWidth: 720 }}>
        <Link to="/blog" style={{ fontSize: 12 }}>← Journal</Link>
        <h1 style={{ fontSize: 'clamp(30px, 5vw, 48px)', margin: '14px 0 6px', lineHeight: 1.15 }}>{p.title}</h1>
        <div style={{ fontSize: 13, color: 'var(--muted2)', marginBottom: 18 }}>{fmt(p.date)} · {STORE.name}</div>
        <img src={p.image} alt="" style={{ width: '100%', borderRadius: 14, marginBottom: 20, aspectRatio: '16 / 9', objectFit: 'cover' }} />
        <MiniMd source={p.body} />
        <p style={{ marginTop: 26 }}><Link to="/shop" className="btn-primary">Shop the collection</Link></p>
      </article>
    </main>
  );
}
