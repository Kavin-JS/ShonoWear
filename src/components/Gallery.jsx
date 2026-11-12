import { useEffect, useRef, useState } from 'react';
import { Chevron, Close } from './Icons.jsx';

/** Product photo gallery: thumbnails, swipe on phones, hover-zoom on desktop, full-screen lightbox. */
export default function Gallery({ images, alt, overlay }) {
  const list = images.length ? images : [];
  const [i, setI] = useState(0);
  const [box, setBox] = useState(false);
  const [zoom, setZoom] = useState({ on: false, x: 50, y: 50 });
  const [bad, setBad] = useState({});
  const track = useRef(null);
  const n = list.length;

  useEffect(() => { setI(0); setBad({}); }, [images.join('|')]);

  const go = (k) => {
    const next = (k + n) % n; setI(next);
    const el = track.current; if (el) el.scrollTo({ left: next * el.clientWidth, behavior: 'smooth' });
  };
  const onScroll = () => { const el = track.current; if (el) setI(Math.round(el.scrollLeft / Math.max(1, el.clientWidth))); };
  const move = (e) => {
    const r = e.currentTarget.getBoundingClientRect();
    setZoom({ on: true, x: ((e.clientX - r.left) / r.width) * 100, y: ((e.clientY - r.top) / r.height) * 100 });
  };

  return (
    <div style={{ display: 'grid', gap: 10, width: '100%', maxWidth: 560 }}>
      <div style={{ position: 'relative', borderRadius: 16, overflow: 'hidden', background: 'var(--bg3)', aspectRatio: '3 / 4' }}>
        <div ref={track} onScroll={onScroll} className="hide-scroll" style={{ display: 'flex', height: '100%', overflowX: 'auto', scrollSnapType: 'x mandatory' }}>
          {list.map((src, k) => (
            <button key={src + k} type="button" aria-label={`Open photo ${k + 1} of ${n} full screen`} onClick={() => setBox(true)}
              onMouseMove={k === i ? move : undefined} onMouseLeave={() => setZoom(z => ({ ...z, on: false }))}
              style={{ flex: '0 0 100%', scrollSnapAlign: 'start', border: 'none', padding: 0, background: 'none', cursor: 'zoom-in', overflow: 'hidden' }}>
              {bad[k]
                ? <span style={{ display: 'grid', placeItems: 'center', height: '100%', fontSize: 56 }}>👕</span>
                : <img src={src} alt={k === 0 ? alt : `${alt}, photo ${k + 1}`} loading={k ? 'lazy' : 'eager'} onError={() => setBad(b => ({ ...b, [k]: 1 }))}
                    style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block', transition: 'transform .15s',
                      transform: zoom.on && k === i ? 'scale(1.8)' : 'none', transformOrigin: `${zoom.x}% ${zoom.y}%` }} />}
            </button>
          ))}
        </div>
        {overlay}
        {n > 1 && (
          <>
            <button type="button" aria-label="Previous photo" className="gal-arrow" onClick={() => go(i - 1)} style={{ left: 10 }}><Chevron dir="left" /></button>
            <button type="button" aria-label="Next photo" className="gal-arrow" onClick={() => go(i + 1)} style={{ right: 10 }}><Chevron /></button>
            <div style={{ position: 'absolute', bottom: 10, left: 0, right: 0, display: 'flex', justifyContent: 'center', gap: 6, pointerEvents: 'none' }}>
              {list.map((_, k) => <span key={k} style={{ width: k === i ? 18 : 6, height: 6, borderRadius: 3, background: k === i ? '#fff' : 'rgba(255,255,255,.6)', boxShadow: '0 0 3px rgba(0,0,0,.4)', transition: 'width .2s' }} />)}
            </div>
          </>
        )}
      </div>
      {n > 1 && (
        <div style={{ display: 'flex', gap: 8, overflowX: 'auto' }} className="hide-scroll" role="group" aria-label="Photo thumbnails">
          {list.map((src, k) => (
            <button key={src + k} type="button" aria-label={`Show photo ${k + 1}`} aria-current={k === i} onClick={() => go(k)}
              style={{ flex: '0 0 64px', aspectRatio: '3 / 4', borderRadius: 8, overflow: 'hidden', padding: 0, cursor: 'pointer', background: 'var(--bg3)', border: `2px solid ${k === i ? 'var(--red)' : 'transparent'}` }}>
              <img src={src} alt="" loading="lazy" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            </button>
          ))}
        </div>
      )}
      {box && <Lightbox list={list} start={i} alt={alt} onClose={(k) => { setBox(false); if (k !== i) go(k); }} />}
      <style>{`
        .gal-arrow { position: absolute; top: 50%; transform: translateY(-50%); width: 38px; height: 38px; border-radius: 50%; border: none; cursor: pointer; display: grid; place-items: center; background: rgba(255,255,255,.92); color: #14141f; box-shadow: 0 2px 8px rgba(0,0,0,.2); }
        @media (hover: none) { .gal-arrow { display: none; } }
      `}</style>
    </div>
  );
}

function Lightbox({ list, start, alt, onClose }) {
  const [k, setK] = useState(start);
  const [z, setZ] = useState(null);                 // null = fit, {x,y} = zoomed at that point
  const close = useRef(null);
  const n = list.length;
  useEffect(() => {
    const prev = document.body.style.overflow; document.body.style.overflow = 'hidden';
    close.current?.focus();
    const onKey = (e) => {
      if (e.key === 'Escape') onClose(k);
      else if (e.key === 'ArrowRight') { setZ(null); setK(v => (v + 1) % n); }
      else if (e.key === 'ArrowLeft') { setZ(null); setK(v => (v - 1 + n) % n); }
    };
    window.addEventListener('keydown', onKey);
    return () => { document.body.style.overflow = prev; window.removeEventListener('keydown', onKey); };
  }, [k, n, onClose]);
  const pt = (e) => { const r = e.currentTarget.getBoundingClientRect(); return { x: ((e.clientX - r.left) / r.width) * 100, y: ((e.clientY - r.top) / r.height) * 100 }; };
  return (
    <div role="dialog" aria-modal="true" aria-label={`${alt}, photo ${k + 1} of ${n}`} style={{ position: 'fixed', inset: 0, zIndex: 300, background: 'rgba(0,0,0,.92)', display: 'grid', placeItems: 'center' }}>
      <button ref={close} type="button" aria-label="Close" onClick={() => onClose(k)} style={{ position: 'absolute', top: 14, right: 14, width: 44, height: 44, borderRadius: '50%', border: 'none', cursor: 'pointer', background: 'rgba(255,255,255,.15)', color: '#fff', display: 'grid', placeItems: 'center' }}><Close /></button>
      <div onClick={(e) => setZ(z ? null : pt(e))} onMouseMove={(e) => z && setZ(pt(e))} style={{ width: 'min(92vw, 70vh * 0.75)', maxHeight: '88vh', aspectRatio: '3 / 4', overflow: 'hidden', cursor: z ? 'zoom-out' : 'zoom-in', borderRadius: 8 }}>
        <img src={list[k]} alt={`${alt}, photo ${k + 1}`} style={{ width: '100%', height: '100%', objectFit: 'contain', transform: z ? 'scale(2.4)' : 'none', transformOrigin: z ? `${z.x}% ${z.y}%` : '50% 50%', transition: z ? 'none' : 'transform .2s' }} />
      </div>
      {n > 1 && <>
        <button type="button" aria-label="Previous photo" onClick={() => { setZ(null); setK((k - 1 + n) % n); }} style={{ position: 'absolute', left: 14, top: '50%', width: 44, height: 44, borderRadius: '50%', border: 'none', cursor: 'pointer', background: 'rgba(255,255,255,.15)', color: '#fff' }}><Chevron dir="left" /></button>
        <button type="button" aria-label="Next photo" onClick={() => { setZ(null); setK((k + 1) % n); }} style={{ position: 'absolute', right: 14, top: '50%', width: 44, height: 44, borderRadius: '50%', border: 'none', cursor: 'pointer', background: 'rgba(255,255,255,.15)', color: '#fff' }}><Chevron /></button>
      </>}
    </div>
  );
}
