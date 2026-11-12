import { useEffect, useRef, useState } from 'react';
import { chartFor, suggestSize } from '../lib/sizeGuide.js';
import { sizesOf } from '../lib/store.js';
import { Close } from './Icons.jsx';

const inp = { width: '100%', background: 'var(--bg2)', color: 'var(--text)', border: '1px solid var(--border2)', borderRadius: 8, padding: '10px 12px', fontSize: 14, fontFamily: 'inherit' };

function savedBody() {
  try { const p = JSON.parse(sessionStorage.getItem('shonowear_profile') || 'null'); return p ? { height: p.height || '', weight: p.weight || '' } : {}; } catch { return {}; }
}

/** Modal with the size chart and a "find my size" helper. `onPick(size)` selects it on the product page. */
export default function SizeGuide({ product, onPick, onClose }) {
  const chart = chartFor(product);
  const [f, setF] = useState(() => ({ fit: 'regular', ...savedBody() }));
  const [res, setRes] = useState(null);
  const closeRef = useRef(null);
  useEffect(() => {
    const prev = document.body.style.overflow; document.body.style.overflow = 'hidden';
    closeRef.current?.focus();
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => { document.body.style.overflow = prev; window.removeEventListener('keydown', onKey); };
  }, [onClose]);
  if (!chart) return null;
  const have = new Set(sizesOf(product));
  const kind = chart.kind;
  const set = (k) => (e) => setF(v => ({ ...v, [k]: e.target.value }));
  const run = (e) => { e.preventDefault(); setRes(suggestSize(product, f)); };

  return (
    <div role="dialog" aria-modal="true" aria-label="Size guide" style={{ position: 'fixed', inset: 0, zIndex: 250, display: 'grid', placeItems: 'center', padding: 12 }}>
      <div onClick={onClose} style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,.55)' }} />
      <div style={{ position: 'relative', background: 'var(--bg)', color: 'var(--text)', borderRadius: 16, width: 'min(520px, 100%)', maxHeight: '90vh', overflowY: 'auto', padding: 22, boxShadow: 'var(--shadow-lg)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <h2 style={{ fontFamily: 'var(--font-body)', fontWeight: 700, fontSize: 20 }}>Size guide</h2>
          <button ref={closeRef} type="button" aria-label="Close size guide" onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--text)', cursor: 'pointer' }}><Close /></button>
        </div>
        <p style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 10 }}>{chart.title || 'Size chart'}{chart.custom ? '' : '. A general guide: fits vary slightly by brand.'}</p>
        <div style={{ overflowX: 'auto', marginBottom: 18 }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead><tr><th style={th}>Size</th>{chart.columns.map(c => <th key={c} style={th}>{c}</th>)}</tr></thead>
            <tbody>
              {Object.entries(chart.rows).map(([s, vals]) => (
                <tr key={s} style={{ opacity: have.has(s) ? 1 : 0.4 }}>
                  <td style={{ ...td, fontWeight: 600 }}>{s}{have.has(s) ? '' : ' (not offered)'}</td>
                  {vals.map((v, k) => <td key={k} style={td}>{v}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {!chart.custom && (
          <form onSubmit={run} style={{ display: 'grid', gap: 10, borderTop: '1px solid var(--border)', paddingTop: 16 }}>
            <strong style={{ fontSize: 14 }}>Find my size</strong>
            {kind === 'tops' && (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <label style={lab}>Height (cm)<input style={inp} inputMode="numeric" value={f.height || ''} onChange={set('height')} /></label>
                <label style={lab}>Weight (kg)<input style={inp} inputMode="numeric" value={f.weight || ''} onChange={set('weight')} /></label>
                <label style={{ ...lab, gridColumn: '1 / -1' }}>…or your chest (cm), if you know it<input style={inp} inputMode="numeric" value={f.chest || ''} onChange={set('chest')} /></label>
              </div>
            )}
            {kind === 'bottoms' && <label style={lab}>Waist (cm)<input style={inp} inputMode="numeric" value={f.waist || ''} onChange={set('waist')} /></label>}
            {kind === 'footwear' && <label style={lab}>Foot length (cm), heel to longest toe<input style={inp} inputMode="decimal" value={f.foot || ''} onChange={set('foot')} /></label>}
            <label style={lab}>Preferred fit
              <select style={inp} value={f.fit} onChange={set('fit')}><option value="snug">Snug</option><option value="regular">Regular</option><option value="relaxed">Relaxed</option></select>
            </label>
            <button type="submit" className="btn-primary">Suggest a size</button>
            {res?.error && <p role="alert" style={{ color: 'var(--red)', fontSize: 13 }}>{res.error}</p>}
            {res?.size && (
              <div role="status" style={{ background: 'var(--red-dim)', borderRadius: 10, padding: 14, fontSize: 14 }}>
                We'd suggest <strong>{res.size}</strong> <span style={{ color: 'var(--muted)' }}>(based on {res.basis})</span>.
                {res.note && <div style={{ fontSize: 12, marginTop: 4 }}>{res.note}</div>}
                <div style={{ marginTop: 10 }}><button type="button" className="btn-ghost" onClick={() => { onPick(res.size); onClose(); }}>Select size {res.size}</button></div>
                <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 8 }}>This is an estimate. Between sizes? Go up for a looser fit. {chart.kind === 'tops' ? 'Height and weight estimates ignore build, so a chest measurement is more accurate.' : ''}</div>
              </div>
            )}
          </form>
        )}
      </div>
    </div>
  );
}
const th = { textAlign: 'left', padding: '8px 10px', borderBottom: '1px solid var(--border2)', fontSize: 12, color: 'var(--muted)' };
const td = { padding: '8px 10px', borderBottom: '1px solid var(--border)' };
const lab = { display: 'grid', gap: 4, fontSize: 12, color: 'var(--muted)' };
