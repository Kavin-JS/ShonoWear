import { useState } from 'react';

/** Sign-up for sold-out sizes. `soldOut` is the list of sizes with no stock. */
export default function NotifyMe({ productId, soldOut }) {
  const [size, setSize] = useState(soldOut[0] || '');
  const [email, setEmail] = useState('');
  const [state, setState] = useState({ busy: false, msg: '', ok: false });
  if (!soldOut.length) return null;
  const chosen = soldOut.includes(size) ? size : soldOut[0];
  async function submit(e) {
    e.preventDefault();
    if (state.busy) return;
    setState({ busy: true, msg: '', ok: false });
    try {
      const r = await fetch('/api/notify-me', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: productId, size: chosen, email, website: '' }) });
      const d = await r.json().catch(() => ({}));
      if (r.ok && d.ok) setState({ busy: false, ok: true, msg: `Done. We'll email you once when ${chosen} is back.` });
      else setState({ busy: false, ok: false, msg: d.error || 'Could not save that. Please try again.' });
    } catch { setState({ busy: false, ok: false, msg: 'Network problem. Please try again.' }); }
  }
  return (
    <form onSubmit={submit} aria-label="Back in stock alert" style={{ display: 'grid', gap: 8, border: '1px dashed var(--border2)', borderRadius: 12, padding: 14 }}>
      <strong style={{ fontSize: 13 }}>Sold out in {soldOut.join(', ')}? Get an email when it's back.</strong>
      {state.ok ? <div role="status" style={{ color: 'var(--good)', fontSize: 13 }}>{state.msg}</div> : (
        <>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {soldOut.length > 1 && (
              <select aria-label="Size" value={chosen} onChange={e => setSize(e.target.value)} style={{ background: 'var(--bg2)', color: 'var(--text)', border: '1px solid var(--border2)', borderRadius: 8, padding: '10px' }}>
                {soldOut.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            )}
            <input type="email" required autoComplete="email" placeholder="you@example.com" aria-label="Email" value={email} onChange={e => setEmail(e.target.value)}
              style={{ flex: 1, minWidth: 160, background: 'var(--bg2)', color: 'var(--text)', border: '1px solid var(--border2)', borderRadius: 8, padding: '10px 12px', fontFamily: 'inherit' }} />
            <input name="website" tabIndex={-1} autoComplete="off" aria-hidden="true" style={{ position: 'absolute', left: '-9999px' }} />
            <button type="submit" className="btn-ghost" disabled={state.busy}>{state.busy ? '…' : 'Notify me'}</button>
          </div>
          {state.msg && <div role="alert" style={{ color: 'var(--red)', fontSize: 12 }}>{state.msg}</div>}
          <div style={{ fontSize: 11, color: 'var(--muted2)' }}>One email about this item, then we delete your address from the list.</div>
        </>
      )}
    </form>
  );
}
