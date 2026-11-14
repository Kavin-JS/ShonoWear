import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import LookBoard from '../components/LookBoard.jsx';
import { SLOTS, SLOT_LABEL, pickables, parseBuild, buildQuery, saveMyLook, deleteMyLook, myLooks } from '../lib/looks.js';
import { inr } from '../lib/store.js';
import { unitPrice } from '../lib/offers.js';
import { showToast } from '../lib/toast.js';
import Img from '../components/Img.jsx';

export default function Builder() {
  const [params, setParams] = useSearchParams();
  const sel = useMemo(() => parseBuild(params.toString()), [params]);
  const [slot, setSlot] = useState('top');
  const [mine, setMine] = useState(() => myLooks());
  const [name, setName] = useState('');
  const chosen = SLOTS.map(s => sel[s]).filter(Boolean);
  const options = pickables(slot);

  const set = (s, p) => { const next = { ...sel }; if (p) next[s] = p; else delete next[s]; setParams(buildQuery(next), { replace: true }); };
  async function share() {
    const url = `${window.location.origin}/build?${buildQuery(sel)}`;
    try { await navigator.clipboard.writeText(url); showToast('Link copied'); } catch { showToast('Copy the address bar link to share'); }
  }
  function save() { setMine(saveMyLook(name || 'My look', chosen)); setName(''); showToast('Look saved on this device'); }
  const open = (l) => setParams(buildQuery(Object.fromEntries(l.products.map(p => [p.category, p]))), { replace: true });

  return (
    <main id="main" className="page" style={{ paddingTop: 100 }}>
      <div className="container" style={{ maxWidth: 820 }}>
        <Link to="/looks" style={{ fontSize: 12 }}>← Ready-made looks</Link>
        <h1 style={{ fontSize: 'clamp(34px, 6vw, 56px)', margin: '16px 0 8px' }}>Build your look</h1>
        <p style={{ color: 'var(--muted)', marginBottom: 16 }}>Pick one piece per row. We add up the price as you go.</p>

        <div role="tablist" aria-label="Part of the outfit" style={{ display: 'flex', gap: 6, overflowX: 'auto', paddingBottom: 6 }}>
          {SLOTS.map(s => (
            <button key={s} role="tab" type="button" aria-selected={slot === s} onClick={() => setSlot(s)}
              style={{ flex: '0 0 auto', minHeight: 40, padding: '0 14px', borderRadius: 20, cursor: 'pointer', fontFamily: 'inherit', border: `1px solid ${slot === s ? 'var(--red)' : 'var(--border2)'}`, background: slot === s ? 'var(--red-dim)' : 'transparent', color: 'var(--text)' }}>
              {SLOT_LABEL[s]}{sel[s] ? ' ✓' : ''}
            </button>
          ))}
        </div>

        <div role="listbox" aria-label={`Choose ${SLOT_LABEL[slot]}`} style={{ display: 'flex', gap: 10, overflowX: 'auto', padding: '10px 0 14px' }}>
          {options.map(p => {
            const on = sel[slot]?.id === p.id;
            return (
              <button key={p.id} role="option" aria-selected={on} type="button" onClick={() => set(slot, on ? null : p)} aria-label={`${p.name}, ${inr(unitPrice(p))}${on ? ', selected' : ''}`}
                style={{ flex: '0 0 120px', textAlign: 'left', padding: 0, cursor: 'pointer', fontFamily: 'inherit', background: 'var(--bg2)', color: 'var(--text)', borderRadius: 10, overflow: 'hidden', border: `2px solid ${on ? 'var(--red)' : 'var(--border)'}` }}>
                <Img src={p.image} sizes="120px" widths={[240, 360]} style={{ width: '100%', height: 150, objectFit: 'cover', display: 'block' }} />
                <div style={{ padding: '6px 8px', fontSize: 12 }}><div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.name.replace('[SAMPLE] ', '')}</div><div style={{ color: 'var(--muted)' }}>{inr(unitPrice(p))}</div></div>
              </button>
            );
          })}
          {options.length === 0 && <p style={{ color: 'var(--muted)' }}>Nothing here yet.</p>}
        </div>

        {chosen.length === 0 ? <p style={{ color: 'var(--muted)' }}>Choose a piece above to start your look.</p> : (
          <>
            <LookBoard products={chosen} onRemove={(p) => set(p.category, null)} />
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 14, alignItems: 'center' }}>
              <input aria-label="Name this look" value={name} maxLength={40} onChange={e => setName(e.target.value)} placeholder="Name this look" style={{ flex: '1 1 160px', minHeight: 42 }} />
              <button type="button" className="btn" onClick={save} style={{ minHeight: 42 }}>Save look</button>
              <button type="button" className="btn" onClick={share} style={{ minHeight: 42 }}>Copy link</button>
            </div>
          </>
        )}

        {mine.length > 0 && (
          <section aria-label="My saved looks" style={{ marginTop: 28 }}>
            <h2 style={{ fontSize: 20, marginBottom: 10 }}>My looks</h2>
            {mine.map(l => (
              <div key={l.id} style={{ display: 'flex', gap: 10, alignItems: 'center', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
                <span>{l.name} <span style={{ color: 'var(--muted)', fontSize: 12 }}>· {l.products.length} pieces</span></span>
                <span><button type="button" onClick={() => open(l)} style={{ background: 'none', border: 0, textDecoration: 'underline', color: 'var(--text)', cursor: 'pointer' }}>Open</button>
                  <button type="button" aria-label={`Delete ${l.name}`} onClick={() => setMine(deleteMyLook(l.id))} style={{ background: 'none', border: 0, color: 'var(--muted)', cursor: 'pointer', marginLeft: 8 }}>Delete</button></span>
              </div>
            ))}
          </section>
        )}
      </div>
    </main>
  );
}
