import { INSTAGRAM } from '../data/instagram.js';

/** A grid you curate yourself (src/data/instagram.js). No Instagram script is loaded, so nothing tracks your visitors. */
export default function InstagramStrip() {
  const { handle, posts } = INSTAGRAM;
  if (!handle) return null;
  const profile = `https://www.instagram.com/${encodeURIComponent(handle)}/`;
  const safe = posts.filter(p => /^https:\/\//.test(p.image) && /^https:\/\/(www\.)?instagram\.com\//.test(p.url)).slice(0, 6);
  return (
    <section className="container" style={{ marginTop: 44 }} aria-label="Instagram">
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: 14, gap: 8, flexWrap: 'wrap' }}>
        <h2 className="section-title" style={{ fontFamily: 'var(--font-body)' }}>On Instagram</h2>
        <a href={profile} target="_blank" rel="noopener noreferrer" style={{ fontSize: 13, fontWeight: 600, color: 'var(--red-text)' }}>Follow @{handle}</a>
      </div>
      {safe.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 8 }}>
          {safe.map((p, i) => (
            <a key={i} href={p.url} target="_blank" rel="noopener noreferrer" style={{ aspectRatio: '1', borderRadius: 12, overflow: 'hidden', background: 'var(--bg3)', display: 'block' }}>
              <img src={p.image} alt={p.alt || 'Instagram post'} loading="lazy" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            </a>
          ))}
        </div>
      )}
    </section>
  );
}
