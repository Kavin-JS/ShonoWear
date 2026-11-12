import { useRef } from 'react';
import { Link } from 'react-router-dom';
import ProductCard from './ProductCard.jsx';
import { Chevron } from './Icons.jsx';

export default function Rail({ title, to, items, hint }) {
  const ref = useRef(null);
  const scroll = (d) => ref.current?.scrollBy({ left: d * ref.current.clientWidth * 0.85, behavior: 'smooth' });
  if (!items.length) return null;
  return (
    <section className="container" style={{ marginTop: 40 }}>
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 12, marginBottom: 12 }}>
        <div><h2 className="section-title" style={{ fontFamily: 'var(--font-body)' }}>{title}</h2>{hint && <p style={{ fontSize: 13, color: 'var(--muted)', marginTop: 2 }}>{hint}</p>}</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <Link to={to} style={{ fontSize: 13, fontWeight: 600, color: 'var(--red)', marginRight: 6 }}>View all</Link>
          <button type="button" className="chip rail-arrow" aria-label={`Scroll ${title} left`} onClick={() => scroll(-1)} style={{ padding: 6 }}><Chevron dir="left" /></button>
          <button type="button" className="chip rail-arrow" aria-label={`Scroll ${title} right`} onClick={() => scroll(1)} style={{ padding: 6 }}><Chevron /></button>
        </div>
      </div>
      <div ref={ref} className="rail hide-scroll">
        {items.map(p => <div key={p.id} className="rail-item"><ProductCard product={p} /></div>)}
      </div>
      <style>{`
        .rail-item { width: 210px; }
        @media (max-width: 768px) { .rail-item { width: 160px; } .rail-arrow { display: none; } }
      `}</style>
    </section>
  );
}

