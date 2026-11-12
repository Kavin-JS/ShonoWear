import { useState } from 'react';
import { inr } from '../lib/store.js';

export default function Admin() {
  const [token, setToken] = useState('');          // kept in memory only, never stored
  const [orders, setOrders] = useState(null);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [wait, setWait] = useState([]);
  const [note, setNote] = useState('');

  async function call(method, body, q = '') {
    const r = await fetch('/api/admin/orders' + q, {
      method, headers: { Authorization: `Bearer ${token}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(d.error || `Error ${r.status}`);
    return d;
  }
  async function load(e) {
    e?.preventDefault(); setBusy(true); setErr('');
    try { setOrders((await call('GET')).orders); setWait((await call('GET', null, '?view=waitlist')).waitlist || []); } catch (x) { setErr(x.message); setOrders(null); }
    setBusy(false);
  }
  async function notifyWait(w) {
    if (!window.confirm(`Email up to 50 people waiting for ${w.name} (${w.size})? Only works once it is restocked.`)) return;
    setNote(''); setErr('');
    try { const r = await call('POST', { action: 'notify-waitlist', productId: w.id, size: w.size }); setNote(`Sent ${r.sent}, failed ${r.failed}, still waiting ${r.remaining}.`); await load(); }
    catch (x) { setErr(x.message); }
  }
  async function act(o, action) {
    let extra = {};
    if (action === 'shipped') {
      const courier = window.prompt('Courier name'); if (courier === null) return;
      const tracking = window.prompt('Tracking number'); if (tracking === null) return;
      extra = { courier, tracking };
    } else if (!window.confirm(`Mark ${o.number} as ${action}?${action === 'cancelled' && o.status !== 'pending_payment' ? ' This does NOT refund the customer: refund in the Razorpay dashboard.' : ''}`)) return;
    try { await call('POST', { id: o.id, action, ...extra }); await load(); } catch (x) { setErr(x.message); }
  }

  return (
    <main id="main" className="page" style={{ paddingTop: '100px' }}>
      <meta name="robots" content="noindex" />
      <div className="container" style={{ maxWidth: '1000px' }}>
        <h1 style={{ fontSize: '48px', marginBottom: '16px' }}>ORDERS</h1>
        <form onSubmit={load} style={{ display: 'flex', gap: '10px', marginBottom: '16px' }}>
          <input type="password" autoComplete="off" aria-label="Admin token" placeholder="Admin token" value={token} onChange={e => setToken(e.target.value)} style={{ flex: 1, background: 'var(--bg3)', color: 'var(--text)', border: '1px solid var(--border2)', borderRadius: '4px', padding: '10px' }} />
          <button className="btn-primary" disabled={busy || !token}>Load</button>
        </form>
        {err && <p role="alert" style={{ color: 'var(--red)' }}>{err}</p>}
        {note && <p role="status" style={{ color: 'var(--good)' }}>{note}</p>}
        {wait.length > 0 && (
          <section aria-label="Back-in-stock waitlist" style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 12, padding: 14, marginBottom: 14, fontSize: 13 }}>
            <strong>Waiting for a restock</strong>
            {wait.map(w => (
              <div key={`${w.id}|${w.size}`} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, padding: '6px 0' }}>
                <span>{w.name} · size {w.size}: {w.count} waiting</span>
                <button className="btn-ghost" style={{ padding: '6px 12px' }} onClick={() => notifyWait(w)}>Send alerts</button>
              </div>
            ))}
          </section>
        )}
        {orders && !orders.length && <p style={{ color: 'var(--muted)' }}>No orders yet.</p>}
        <div style={{ display: 'grid', gap: '10px' }}>
          {orders?.map(o => (
            <article key={o.id} style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: '8px', padding: '14px', fontSize: '13px', display: 'grid', gap: '6px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: '8px', flexWrap: 'wrap' }}>
                <strong>{o.number} · {o.status}</strong><span>{inr(o.totals.total)} · {new Date(o.createdAt).toLocaleString('en-IN')}</span>
              </div>
              {o.flags?.length > 0 && <div style={{ color: 'var(--red)' }}>⚠ {o.flags.join(', ')}: needs your attention</div>}
              <div>{o.items.map(i => `${i.name} (${i.size}) ×${i.qty}`).join(' · ')}</div>
              <div style={{ color: 'var(--muted)' }}>{o.customer.name}, {o.customer.phone}, {o.customer.email}<br />{o.customer.line1}{o.customer.line2 ? `, ${o.customer.line2}` : ''}, {o.customer.city}, {o.customer.state} {o.customer.pincode}</div>
              {o.razorpay?.paymentId && <div style={{ color: 'var(--muted2)' }}>Razorpay payment {o.razorpay.paymentId}</div>}
              {o.shipment && <div>Shipped: {o.shipment.courier} {o.shipment.tracking}</div>}
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                {o.status === 'paid' && <button className="btn-ghost" onClick={() => act(o, 'shipped')}>Mark shipped</button>}
                {['paid', 'shipped'].includes(o.status) && <button className="btn-ghost" onClick={() => act(o, 'delivered')}>Mark delivered</button>}
                {['paid', 'pending_payment', 'expired'].includes(o.status) && <button className="btn-ghost" onClick={() => act(o, 'cancelled')}>Cancel</button>}
              </div>
            </article>
          ))}
        </div>
      </div>
    </main>
  );
}
