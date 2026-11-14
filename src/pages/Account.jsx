import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { STORE } from '../data/storeConfig.js';
import { inr } from '../lib/store.js';
import { acctGet, acctPost, useAccount } from '../lib/account.js';
import { catalog } from '../data/catalog.js';

const input = { width: '100%', background: 'var(--bg3)', color: 'var(--text)', border: '1px solid var(--border2)', borderRadius: 4, padding: 12, fontSize: 15, fontFamily: 'inherit' };
const card = { background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 12, padding: 14, display: 'grid', gap: 10 };
const byId = new Map(catalog.map(p => [p.id, p]));
const STATUS = { paid: 'Paid', cod_placed: 'Placed · pay on delivery', shipped: 'Shipped', delivered: 'Delivered' };
const RET = { requested: 'Waiting for us', approved: 'Approved: send it back', rejected: 'Not approved', received: 'Item received', refunded: 'Refunded', exchanged: 'Exchange sent' };

function SignIn({ onDone }) {
  const [email, setEmail] = useState(''); const [msg, setMsg] = useState(''); const [busy, setBusy] = useState(false); const [sent, setSent] = useState(false);
  const [dev, setDev] = useState('');
  async function go(e) {
    e.preventDefault(); setBusy(true); setMsg('');
    const r = await acctPost({ action: 'login', email }).catch(() => null);
    setBusy(false);
    if (!r?.ok) return setMsg(r?.data?.error || 'Could not send the link. Please try again.');
    setSent(true); if (r.data.devToken) setDev(r.data.devToken); if (r.data.warning) setMsg(r.data.warning);
  }
  if (sent) return (
    <div style={card} role="status">
      <strong>Check your email</strong>
      <span style={{ color: 'var(--muted)', fontSize: 14 }}>If that address can receive email, a sign-in link is on its way. It works once and lasts {STORE.accounts?.loginMinutes || 15} minutes. Check spam too.</span>
      {msg && <span role="alert" style={{ color: 'var(--red-text)', fontSize: 13 }}>{msg}</span>}
      {dev && <Link to={`/account?token=${dev}`} onClick={onDone} style={{ fontSize: 12, textDecoration: 'underline' }}>Local test mode: open the link</Link>}
    </div>
  );
  return (
    <form onSubmit={go} noValidate style={card} aria-label="Sign in">
      <label htmlFor="acct-email" style={{ fontSize: 13, color: 'var(--muted)' }}>Your email. We send a one-time sign-in link: no password to remember.</label>
      <input id="acct-email" type="email" autoComplete="email" value={email} onChange={e => setEmail(e.target.value)} style={input} />
      {msg && <div role="alert" style={{ color: 'var(--red-text)', fontSize: 13 }}>{msg}</div>}
      <button className="btn-primary" disabled={busy} style={{ justifyContent: 'center' }}>{busy ? 'Sending…' : 'Email me a link'}</button>
    </form>
  );
}

function Stars({ value, onChange }) {
  return (
    <div role="radiogroup" aria-label="Rating" style={{ display: 'flex', gap: 4 }}>
      {[1, 2, 3, 4, 5].map(n => (
        <button key={n} type="button" role="radio" aria-checked={value === n} aria-label={`${n} star${n > 1 ? 's' : ''}`} onClick={() => onChange(n)}
          style={{ fontSize: 26, background: 'none', border: 'none', cursor: 'pointer', color: n <= value ? 'var(--gold, #f5b301)' : 'var(--muted2)', padding: 2 }}>★</button>
      ))}
    </div>
  );
}

function ReviewForm({ item, name, onClose, onDone }) {
  const [rating, setRating] = useState(0); const [title, setTitle] = useState(''); const [body, setBody] = useState(''); const [msg, setMsg] = useState(''); const [busy, setBusy] = useState(false);
  async function send(e) {
    e.preventDefault(); if (!rating) return setMsg('Choose a star rating.');
    setBusy(true); const r = await acctPost({ action: 'review', productId: item.id, rating, title, body, name }).catch(() => null); setBusy(false);
    if (!r?.ok) return setMsg(r?.data?.error || 'Could not send your review.');
    onDone(r.data.pending);
  }
  return (
    <form onSubmit={send} noValidate aria-label={`Review ${item.name}`} style={{ ...card, background: 'var(--bg3)' }}>
      <strong style={{ fontSize: 14 }}>Review: {item.name}</strong>
      <Stars value={rating} onChange={setRating} />
      <input aria-label="Review title (optional)" placeholder="Title (optional)" maxLength={80} value={title} onChange={e => setTitle(e.target.value)} style={input} />
      <textarea aria-label="Your review" placeholder="How is the fit, fabric and quality?" maxLength={1000} value={body} onChange={e => setBody(e.target.value)} style={{ ...input, minHeight: 90 }} />
      {msg && <div role="alert" style={{ color: 'var(--red-text)', fontSize: 13 }}>{msg}</div>}
      <div style={{ display: 'flex', gap: 8 }}><button className="btn-primary" disabled={busy}>Send review</button><button type="button" className="btn-ghost" onClick={onClose}>Cancel</button></div>
    </form>
  );
}

function ReturnForm({ order, onClose, onDone }) {
  const [kind, setKind] = useState('return');
  const [pick, setPick] = useState({});           // "id|size" -> qty
  const [reason, setReason] = useState(''); const [note, setNote] = useState(''); const [newSize, setNewSize] = useState(''); const [msg, setMsg] = useState(''); const [busy, setBusy] = useState(false);
  const items = order.items;
  const chosen = items.filter(i => pick[`${i.id}|${i.size}`]);
  const one = chosen.length === 1 ? chosen[0] : null;
  const sizes = one ? Object.keys(byId.get(one.id)?.sizes || {}).filter(s => s !== one.size) : [];
  async function send(e) {
    e.preventDefault();
    if (!chosen.length) return setMsg('Choose the item you want to send back.');
    if (!reason) return setMsg('Choose a reason.');
    if (kind === 'exchange' && (!one || !newSize)) return setMsg('Choose one item and the size you want instead.');
    setBusy(true);
    const r = await acctPost({ action: 'return', orderId: order.id, kind, reason, note, ...(kind === 'exchange' ? { newSize } : {}),
      items: chosen.map(i => ({ id: i.id, size: i.size, qty: pick[`${i.id}|${i.size}`] })) }).catch(() => null);
    setBusy(false);
    if (!r?.ok) return setMsg(r?.data?.error || 'Could not send your request.');
    onDone();
  }
  return (
    <form onSubmit={send} noValidate aria-label="Return or exchange" style={{ ...card, background: 'var(--bg3)' }}>
      <strong style={{ fontSize: 14 }}>Return or exchange · order {order.number}</strong>
      <div role="radiogroup" aria-label="Type" style={{ display: 'flex', gap: 14, fontSize: 14 }}>
        <label><input type="radio" name="rk" checked={kind === 'return'} onChange={() => setKind('return')} /> Return for a refund</label>
        {STORE.returns?.allowExchange && <label><input type="radio" name="rk" checked={kind === 'exchange'} onChange={() => setKind('exchange')} /> Exchange for another size</label>}
      </div>
      <fieldset style={{ border: 'none', padding: 0, display: 'grid', gap: 6 }}>
        <legend style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 4 }}>Which items?</legend>
        {items.map(i => {
          const k = `${i.id}|${i.size}`;
          return (
            <label key={k} style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 14 }}>
              <input type="checkbox" checked={Boolean(pick[k])} onChange={e => setPick(p => ({ ...p, [k]: e.target.checked ? 1 : 0 }))} />
              <span style={{ flex: 1 }}>{i.name} · {i.size}</span>
              {pick[k] > 0 && i.qty > 1 && (
                <select aria-label={`Quantity for ${i.name}`} value={pick[k]} onChange={e => setPick(p => ({ ...p, [k]: Number(e.target.value) }))} style={{ ...input, width: 70, padding: 6 }}>
                  {Array.from({ length: i.qty }, (_, n) => <option key={n + 1} value={n + 1}>{n + 1}</option>)}
                </select>
              )}
            </label>
          );
        })}
      </fieldset>
      {kind === 'exchange' && one && (
        <label style={{ fontSize: 13, color: 'var(--muted)', display: 'grid', gap: 4 }}>New size
          <select value={newSize} onChange={e => setNewSize(e.target.value)} style={input}><option value="">Choose…</option>{sizes.map(s => <option key={s}>{s}</option>)}</select>
        </label>
      )}
      <label style={{ fontSize: 13, color: 'var(--muted)', display: 'grid', gap: 4 }}>Reason
        <select value={reason} onChange={e => setReason(e.target.value)} style={input}><option value="">Choose…</option>{STORE.returns.reasons.map(r => <option key={r}>{r}</option>)}</select>
      </label>
      <textarea aria-label="Details (optional)" placeholder="Details (optional)" maxLength={300} value={note} onChange={e => setNote(e.target.value)} style={{ ...input, minHeight: 60 }} />
      <span style={{ fontSize: 12, color: 'var(--muted)' }}>Items must be unused, unwashed, with tags. Refunds go to your original payment method (or to your UPI/bank for cash on delivery) after we receive the item.</span>
      {msg && <div role="alert" style={{ color: 'var(--red-text)', fontSize: 13 }}>{msg}</div>}
      <div style={{ display: 'flex', gap: 8 }}><button className="btn-primary" disabled={busy}>Send request</button><button type="button" className="btn-ghost" onClick={onClose}>Cancel</button></div>
    </form>
  );
}

function OrderCard({ o, reviewable, name, reload }) {
  const [form, setForm] = useState(null);          // 'return' | product id
  const [note, setNote] = useState('');
  const canReview = (id) => reviewable.find(x => x.id === id && !x.reviewed);
  return (
    <article style={card} aria-label={`Order ${o.number}`}>
      <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 6 }}>
        <Link to={`/order/${o.id}`} style={{ fontWeight: 600 }}>Order {o.number}</Link>
        <span style={{ fontSize: 13, color: 'var(--muted)' }}>{STATUS[o.status] || o.status} · {new Date(o.createdAt).toLocaleDateString('en-IN')}</span>
      </div>
      {o.items.map((i, k) => (
        <div key={k} style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: 14, alignItems: 'center', flexWrap: 'wrap' }}>
          <span>{i.name} <span style={{ color: 'var(--muted)' }}>· {i.size} × {i.qty}</span></span>
          <span style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            {inr(i.price * i.qty)}
            {o.status === 'delivered' && canReview(i.id) && form !== i.id && <button type="button" className="btn-ghost" style={{ padding: '4px 10px', fontSize: 12 }} onClick={() => setForm(i.id)}>Write a review</button>}
          </span>
        </div>
      ))}
      {form && form !== 'return' && <ReviewForm item={o.items.find(i => i.id === form)} name={name} onClose={() => setForm(null)} onDone={(pending) => { setForm(null); setNote(pending ? 'Thank you! Your review will appear after we check it.' : 'Thank you for your review!'); reload(); }} />}
      {note && <div role="status" style={{ fontSize: 13, color: 'var(--good)' }}>{note}</div>}
      {o.shipment?.tracking && <div style={{ fontSize: 13, color: 'var(--muted)' }}>Tracking: {o.shipment.courier} {o.shipment.tracking}</div>}
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14, borderTop: '1px solid var(--border)', paddingTop: 8, flexWrap: 'wrap', gap: 8 }}>
        <strong>{inr(o.totals.total)}</strong>
        {o.openReturn ? <span style={{ fontSize: 13 }}>{o.openReturn.kind === 'exchange' ? 'Exchange' : 'Return'}: {RET[o.openReturn.status]}</span>
          : o.returnable?.ok ? (form === 'return' ? null : <button type="button" className="btn-ghost" style={{ padding: '4px 12px', fontSize: 13 }} onClick={() => setForm('return')}>Return or exchange ({o.returnable.daysLeft} days left)</button>)
          : o.status === 'delivered' ? <span style={{ fontSize: 12, color: 'var(--muted)' }}>{o.returnable?.reason}</span> : null}
      </div>
      {form === 'return' && <ReturnForm order={o} onClose={() => setForm(null)} onDone={() => { setForm(null); setNote('Request sent. We will email you within 2 business days.'); reload(); }} />}
    </article>
  );
}

function Dashboard({ email, signOut }) {
  const [orders, setOrders] = useState(null); const [rev, setRev] = useState([]); const [rets, setRets] = useState([]); const [err, setErr] = useState('');
  async function load() {
    try {
      const [a, b, c] = await Promise.all([acctGet({ action: 'orders' }), acctGet({ action: 'reviewable' }), acctGet({ action: 'returns' })]);
      if (a.status === 401) return signOut(true);
      setOrders(a.data.orders || []); setRev(b.data.products || []); setRets(c.data.returns || []);
    } catch { setErr('Could not load your orders. Please refresh.'); }
  }
  useEffect(() => { load(); /* eslint-disable-next-line */ }, []);
  const name = orders?.[0] ? '' : '';
  return (
    <div style={{ display: 'grid', gap: 14 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
        <span style={{ fontSize: 14, color: 'var(--muted)' }}>Signed in as {email}</span>
        <button type="button" className="btn-ghost" onClick={() => signOut(false)}>Sign out</button>
      </div>
      <h2 style={{ fontFamily: 'var(--font-body)', fontSize: 18 }}>My orders</h2>
      {err && <div role="alert" style={{ color: 'var(--red-text)' }}>{err}</div>}
      {orders === null && !err && <div style={{ color: 'var(--muted)' }}>Loading…</div>}
      {orders?.length === 0 && <div style={card}>No orders yet for this email. <Link to="/shop" style={{ textDecoration: 'underline' }}>Start shopping</Link>. Orders placed with a different email show up under that email.</div>}
      {orders?.map(o => <OrderCard key={o.id} o={o} reviewable={rev} name={name || email.split('@')[0]} reload={load} />)}
      {rets.length > 0 && (<>
        <h2 style={{ fontFamily: 'var(--font-body)', fontSize: 18 }}>Returns and exchanges</h2>
        {rets.map(r => (
          <div key={r.id} style={card}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}><strong>{r.kind === 'exchange' ? 'Exchange' : 'Return'} · order {r.number}</strong><span>{RET[r.status]}</span></div>
            <span style={{ fontSize: 13, color: 'var(--muted)' }}>{r.items.map(i => `${i.name} (${i.size}) × ${i.qty}`).join(', ')}{r.exchangeSize ? ` → size ${r.exchangeSize}` : ''}</span>
            {r.adminNote && <span style={{ fontSize: 13 }}>Note from us: {r.adminNote}</span>}
            {r.refundAmount != null && <span style={{ fontSize: 13, color: 'var(--good)' }}>Refunded {inr(r.refundAmount)}</span>}
          </div>
        ))}
      </>)}
      <p style={{ fontSize: 12, color: 'var(--muted2)' }}>Questions? <a href={`mailto:${STORE.supportEmail}`} style={{ textDecoration: 'underline' }}>{STORE.supportEmail}</a></p>
    </div>
  );
}

export default function Account() {
  const { email, loading, refresh } = useAccount();
  const [sp] = useSearchParams(); const nav = useNavigate();
  const [verifying, setVerifying] = useState(Boolean(sp.get('token'))); const [err, setErr] = useState('');
  useEffect(() => { document.title = `My account · ${STORE.name}`; }, []);
  const token = sp.get('token'); const used = useRef('');
  useEffect(() => {
    if (!token || used.current === token) return;
    used.current = token;                                // a link works once: never send it twice (React may run effects twice)
    setVerifying(true); setErr('');
    (async () => {
      const r = await acctPost({ action: 'verify', token }).catch(() => null);
      if (r?.ok) { await refresh(); nav('/account', { replace: true }); } else setErr(r?.data?.error || 'This link did not work. Ask for a new one.');
      setVerifying(false);
    })();
  }, [token]); // eslint-disable-line react-hooks/exhaustive-deps
  async function signOut(expired) { if (!expired) await acctPost({ action: 'logout' }).catch(() => {}); await refresh(); }
  return (
    <main id="main" className="page">
      <div className="container" style={{ maxWidth: 680 }}>
        <h1 style={{ fontFamily: 'var(--font-body)', fontWeight: 700, fontSize: 'clamp(22px, 3vw, 30px)', marginBottom: 16 }}>My account</h1>
        {verifying || loading ? <div style={{ color: 'var(--muted)' }} role="status">Signing you in…</div>
          : email ? <Dashboard email={email} signOut={signOut} />
          : <>{err && <div role="alert" style={{ ...card, color: 'var(--red-text)', marginBottom: 12 }}>{err}</div>}<SignIn onDone={() => setErr('')} /></>}
      </div>
    </main>
  );
}
