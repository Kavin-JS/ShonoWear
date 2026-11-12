import { useState } from 'react';
import { useNavigate } from 'react-router-dom';

export default function Track() {
  const [v, setV] = useState('');
  const nav = useNavigate();
  function go(e) {
    e.preventDefault();
    // accept the full link from the email or just the code at the end of it
    const code = v.trim().split('/').filter(Boolean).pop() || '';
    if (/^[A-Za-z0-9_-]{16}$/.test(code)) nav(`/order/${code}`);
    else setV('');
  }
  return (
    <main id="main" className="page" style={{ paddingTop: '100px' }}>
      <div className="container" style={{ maxWidth: '520px' }}>
        <h1 style={{ fontSize: 'clamp(36px, 6vw, 56px)', marginBottom: '12px' }}>TRACK ORDER</h1>
        <p style={{ color: 'var(--muted)', fontSize: '14px', marginBottom: '16px' }}>Paste the order link from your confirmation email. For your privacy, order numbers alone can't be looked up. Lost the link? Contact us with your order number and phone number.</p>
        <form onSubmit={go} style={{ display: 'flex', gap: '10px' }}>
          <label htmlFor="ol" className="sr-only" style={{ position: 'absolute', left: '-9999px' }}>Order link</label>
          <input id="ol" value={v} onChange={e => setV(e.target.value)} placeholder="Order link" style={{ flex: 1, background: 'var(--bg3)', color: 'var(--text)', border: '1px solid var(--border2)', borderRadius: '4px', padding: '12px' }} />
          <button className="btn-primary" type="submit">Track</button>
        </form>
      </div>
    </main>
  );
}
