import { useState } from 'react';
import { inr } from '../lib/store.js';
import { Dashboard, Products, Customers, openPrintable } from './AdminTools.jsx';

export default function Admin() {
  const [token, setToken] = useState('');          // kept in memory only, never stored
  const [orders, setOrders] = useState(null);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [wait, setWait] = useState([]);
  const [note, setNote] = useState('');
  const [offers, setOffers] = useState(null);
  const [social, setSocial] = useState(null);
  const [rets, setRets] = useState([]);
  const [answers, setAnswers] = useState({});
  const [gc, setGc] = useState({ amount: '', email: '', note: '' });

  async function call(method, body, q = '') {
    const r = await fetch('/api/admin/orders' + q, {
      method, headers: { Authorization: `Bearer ${token}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(d.error || (Array.isArray(d.errors) ? d.errors.join(' · ') : '') || `Error ${r.status}`);
    return d;
  }
  async function load(e) {
    e?.preventDefault(); setBusy(true); setErr('');
    try { setOrders((await call('GET')).orders); setWait((await call('GET', null, '?view=waitlist')).waitlist || []); setOffers(await call('GET', null, '?view=offers')); setSocial(await call('GET', null, '?view=reviews')); setRets((await call('GET', null, '?view=returns')).returns || []); } catch (x) { setErr(x.message); setOrders(null); }
    setBusy(false);
  }
  async function notifyWait(w) {
    if (!window.confirm(`Email up to 50 people waiting for ${w.name} (${w.size})? Only works once it is restocked.`)) return;
    setNote(''); setErr('');
    try { const r = await call('POST', { action: 'notify-waitlist', productId: w.id, size: w.size }); setNote(`Sent ${r.sent}, failed ${r.failed}, still waiting ${r.remaining}.`); await load(); }
    catch (x) { setErr(x.message); }
  }
  async function issueCard(e) {
    e.preventDefault(); setNote(''); setErr('');
    try {
      const r = await call('POST', { action: 'issue-giftcard', amount: Number(gc.amount), email: gc.email, note: gc.note });
      setNote(`Gift card ${r.card.code} created for ${inr(r.card.amount)}${gc.email ? (r.emailed ? ' and emailed.' : '. The email could not be sent: copy the code and send it yourself.') : '. Copy the code and send it yourself.'}`);
      setGc({ amount: '', email: '', note: '' }); await load();
    } catch (x) { setErr(x.message); }
  }
  async function printOrder(o, view) {
    setNote(''); setErr('');
    try {
      const r = await call('GET', null, `?view=${view}&id=${encodeURIComponent(o.id)}`);
      if (!openPrintable(r.html)) setErr('Your browser blocked the new window. Allow pop-ups for this page.');
    } catch (x) { setErr(x.message); }
  }
  async function refund(o) {
    const charged = o.totals.total;
    const v = window.prompt(`Refund how many rupees to the customer's card/UPI? (charged online: ₹${charged}${o.refunds?.length ? `, already refunded ₹${o.refunds.reduce((n, r) => n + r.amount, 0)}` : ''})`, '');
    if (!v) return;
    setNote(''); setErr('');
    try { const r = await call('POST', { action: 'refund', id: o.id, amount: Number(v), reason: 'Admin refund' }); setNote(`Refunded ₹${r.refund.amount} (Razorpay ${r.refund.id}).`); await load(); } catch (x) { setErr(x.message); }
  }
  async function refundReturn(r) {
    const v = window.prompt(`Refund how many rupees? (suggested ₹${r.suggestedRefund})`, String(r.suggestedRefund || ''));
    if (!v) return;
    setNote(''); setErr('');
    try { await call('POST', { action: 'refund', id: r.orderId, amount: Number(v), reason: `Return ${r.id}`, rid: r.id }); setNote('Refunded through Razorpay and the return is marked refunded.'); await load(); } catch (x) { setErr(x.message); }
  }
  async function moderate(r, decision) {
    if (decision === 'delete' && !window.confirm('Delete this review for good?')) return;
    setNote(''); setErr('');
    try { await call('POST', { action: 'review-moderate', productId: r.productId, key: r.key, decision }); await load(); } catch (x) { setErr(x.message); }
  }
  async function answerQ(x, text) {
    setNote(''); setErr('');
    try { await call('POST', { action: 'qa-answer', productId: x.productId, qid: x.id, answer: text }); setAnswers(a => ({ ...a, [x.id]: '' })); await load(); } catch (e) { setErr(e.message); }
  }
  async function retUpdate(r, status) {
    let extra = {};
    if (status === 'refunded') {
      const v = window.prompt(`Refund amount in rupees (suggested ${r.suggestedRefund}). Make the refund yourself in the Razorpay dashboard${r.cod ? ' or by UPI/bank (cash on delivery)' : ''} first.`, String(r.suggestedRefund || ''));
      if (!v) return; extra.refundAmount = Number(v);
    }
    const n = window.prompt('Note to the customer (optional)', '');
    if (n === null) return;
    setNote(''); setErr('');
    try { await call('POST', { action: 'return-update', rid: r.id, status, note: n, ...extra }); await load(); } catch (e) { setErr(e.message); }
  }
  async function bagReminders() {
    if (!window.confirm('Send one reminder email to every customer who asked for one and left their bag over a couple of hours ago?')) return;
    setNote(''); setErr('');
    try { const r = await call('POST', { action: 'send-bag-reminders' }); setNote(`Reminders sent: ${r.sent}. Skipped: ${r.skipped}. Failed: ${r.failed}.`); await load(); }
    catch (x) { setErr(x.message); }
  }
  async function act(o, action) {
    let extra = {};
    if (action === 'shipped') {
      const courier = window.prompt('Courier name'); if (courier === null) return;
      const tracking = window.prompt('Tracking number'); if (tracking === null) return;
      extra = { courier, tracking };
    } else {
      const cod = o.payment?.method === 'cod';
      const warn = action === 'cancelled' && o.status !== 'pending_payment' ? (cod ? ' The stock goes back on sale.' : ' This does NOT refund the customer: refund in the Razorpay dashboard.') : '';
      const label = action === 'cod-collected' ? 'cash collected' : action;
      if (!window.confirm(`Mark ${o.number} as ${label}?${warn}`)) return;
    }
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
        {err && <p role="alert" style={{ color: 'var(--red-text)' }}>{err}</p>}
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
        {offers && (
          <section aria-label="Offers" style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 12, padding: 14, marginBottom: 14, fontSize: 13, display: 'grid', gap: 12 }}>
            <strong>Codes, gift cards and reminders</strong>
            <div>
              <div style={{ color: 'var(--muted)', marginBottom: 4 }}>Coupons (edit them in <code>server/couponsConfig.js</code>)</div>
              {offers.coupons.map(c => <div key={c.code}>{c.code}{c.sample ? ' (sample)' : ''} · {c.active ? 'active' : 'off'} · used {c.used}{c.limit ? ` of ${c.limit}` : ''}</div>)}
            </div>
            <form onSubmit={issueCard} style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
              <input aria-label="Gift card amount in rupees" inputMode="numeric" placeholder="Amount ₹" value={gc.amount} onChange={e => setGc({ ...gc, amount: e.target.value })} style={{ width: 110, background: 'var(--bg3)', color: 'var(--text)', border: '1px solid var(--border2)', borderRadius: 4, padding: 8 }} />
              <input aria-label="Email to send it to (optional)" type="email" placeholder="Email (optional)" value={gc.email} onChange={e => setGc({ ...gc, email: e.target.value })} style={{ flex: 1, minWidth: 160, background: 'var(--bg3)', color: 'var(--text)', border: '1px solid var(--border2)', borderRadius: 4, padding: 8 }} />
              <input aria-label="Note" placeholder="Note" value={gc.note} onChange={e => setGc({ ...gc, note: e.target.value })} style={{ flex: 1, minWidth: 120, background: 'var(--bg3)', color: 'var(--text)', border: '1px solid var(--border2)', borderRadius: 4, padding: 8 }} />
              <button className="btn-ghost" style={{ padding: '8px 14px' }} disabled={!gc.amount}>Issue gift card</button>
            </form>
            {offers.giftCards.length > 0 && (
              <details><summary style={{ cursor: 'pointer' }}>Gift cards ({offers.giftCards.length})</summary>
                {offers.giftCards.map(g => <div key={g.code} style={{ padding: '3px 0', color: g.voided || g.expired ? 'var(--muted2)' : 'var(--text)' }}>{g.code} · {inr(g.balance)} of {inr(g.amount)} · {g.source}{g.voided ? ' · voided' : g.expired ? ' · expired' : ''}{g.note ? ` · ${g.note}` : ''}</div>)}
              </details>
            )}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
              <span>Saved bags waiting for a reminder: {offers.bagsDue}</span>
              <button className="btn-ghost" style={{ padding: '6px 12px' }} disabled={!offers.bagsDue} onClick={bagReminders}>Send reminders</button>
            </div>
          </section>
        )}
        {rets.length > 0 && (
          <section aria-label="Returns" style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 12, padding: 14, marginBottom: 14, fontSize: 13, display: 'grid', gap: 10 }}>
            <strong>Returns and exchanges ({rets.filter(r => ['requested', 'approved', 'received'].includes(r.status)).length} open)</strong>
            {rets.map(r => (
              <div key={r.id} style={{ borderTop: '1px solid var(--border)', paddingTop: 8, display: 'grid', gap: 4 }}>
                <div><strong>{r.number}</strong> · {r.kind}{r.exchangeSize ? ` → ${r.exchangeSize}` : ''} · <em>{r.status}</em> · {r.name} · {new Date(r.createdAt).toLocaleDateString('en-IN')}</div>
                <div>{r.items.map(i => `${i.name} (${i.size}) ×${i.qty}`).join(' · ')} · reason: {r.reason}{r.note ? ` · "${r.note}"` : ''}</div>
                {r.kind === 'return' && <div style={{ color: 'var(--muted)' }}>Suggested refund {inr(r.suggestedRefund)} (goods only, after discounts){r.cod ? ' · COD: refund by UPI/bank' : ''}{r.refundAmount != null ? ` · refunded ${inr(r.refundAmount)}` : ''}</div>}
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {r.status === 'requested' && <><button className="btn-ghost" style={{ padding: '4px 10px' }} onClick={() => retUpdate(r, 'approved')}>Approve</button><button className="btn-ghost" style={{ padding: '4px 10px' }} onClick={() => retUpdate(r, 'rejected')}>Reject</button></>}
                  {r.status === 'approved' && <button className="btn-ghost" style={{ padding: '4px 10px' }} onClick={() => retUpdate(r, 'received')}>Item received</button>}
                  {r.status === 'received' && (r.kind === 'return' ? <>{!r.cod && <button className="btn-primary" style={{ padding: '4px 10px' }} onClick={() => refundReturn(r)}>Refund via Razorpay</button>}<button className="btn-ghost" style={{ padding: '4px 10px' }} onClick={() => retUpdate(r, 'refunded')}>{r.cod ? 'Mark refunded (paid by UPI/bank)' : 'Mark refunded (done elsewhere)'}</button></> : <button className="btn-ghost" style={{ padding: '4px 10px' }} onClick={() => retUpdate(r, 'exchanged')}>Exchange sent</button>)}
                </div>
              </div>
            ))}
            <span style={{ color: 'var(--muted)' }}>This records and emails the customer. It does not move money or change stock: refund in Razorpay, and update your stock yourself if the item is resellable.</span>
          </section>
        )}
        {social && (social.reviews.length > 0 || social.questions.length > 0) && (
          <section aria-label="Reviews and questions" style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 12, padding: 14, marginBottom: 14, fontSize: 13, display: 'grid', gap: 10 }}>
            <strong>Reviews ({social.reviews.filter(r => r.status === 'pending').length} waiting for you)</strong>
            {social.reviews.map(r => (
              <div key={`${r.productId}|${r.key}`} style={{ borderTop: '1px solid var(--border)', paddingTop: 8, display: 'grid', gap: 4 }}>
                <div>{'★'.repeat(r.rating)}{'☆'.repeat(5 - r.rating)} · {r.productId} · {r.name} · order {r.orderNumber} · <em>{r.status}</em></div>
                {r.title && <strong>{r.title}</strong>}<div>{r.body}</div>
                <div style={{ display: 'flex', gap: 6 }}>
                  {r.status !== 'approved' && <button className="btn-ghost" style={{ padding: '4px 10px' }} onClick={() => moderate(r, 'approved')}>Approve</button>}
                  {r.status !== 'rejected' && <button className="btn-ghost" style={{ padding: '4px 10px' }} onClick={() => moderate(r, 'rejected')}>Hide</button>}
                  <button className="btn-ghost" style={{ padding: '4px 10px' }} onClick={() => moderate(r, 'delete')}>Delete</button>
                </div>
              </div>
            ))}
            <strong>Questions ({social.questions.filter(x => !x.answer).length} unanswered)</strong>
            {social.questions.map(x => (
              <div key={x.productId + x.id} style={{ borderTop: '1px solid var(--border)', paddingTop: 8, display: 'grid', gap: 4 }}>
                <div>{x.productId} · {x.name}: <strong>{x.q}</strong></div>
                {x.answer ? <div style={{ color: 'var(--muted)' }}>Answer: {x.answer}</div> : null}
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  <input aria-label={`Answer for ${x.q}`} value={answers[x.id] ?? ''} onChange={e => setAnswers(a => ({ ...a, [x.id]: e.target.value }))} placeholder={x.answer ? 'Change the answer' : 'Your answer (shown publicly)'} maxLength={600} style={{ flex: 1, minWidth: 180, background: 'var(--bg3)', color: 'var(--text)', border: '1px solid var(--border2)', borderRadius: 4, padding: 6 }} />
                  <button className="btn-ghost" style={{ padding: '4px 10px' }} disabled={!(answers[x.id] || '').trim()} onClick={() => answerQ(x, answers[x.id])}>Publish</button>
                  <button className="btn-ghost" style={{ padding: '4px 10px' }} onClick={() => answerQ(x, null)}>Delete</button>
                </div>
              </div>
            ))}
          </section>
        )}
        {orders && <><Dashboard call={call} fail={setErr} /><Products call={call} done={m => { setNote(m); setErr(''); }} fail={setErr} /><Customers call={call} done={m => { setNote(m); setErr(''); }} fail={setErr} /></>}
        {orders && !orders.length && <p style={{ color: 'var(--muted)' }}>No orders yet.</p>}
        <div style={{ display: 'grid', gap: '10px' }}>
          {orders?.map(o => (
            <article key={o.id} style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: '8px', padding: '14px', fontSize: '13px', display: 'grid', gap: '6px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: '8px', flexWrap: 'wrap' }}>
                <strong>{o.number} · {o.status}{o.payment?.method === 'cod' ? ' · COD' : ''}{o.kind === 'giftcard' ? ' · gift card' : ''}</strong><span>{inr(o.totals.total)} · {new Date(o.createdAt).toLocaleString('en-IN')}</span>
              </div>
              {o.flags?.length > 0 && <div style={{ color: 'var(--red-text)' }}>⚠ {o.flags.join(', ')}: needs your attention</div>}
              <div>{o.items.map(i => `${i.name} (${i.size}) ×${i.qty}`).join(' · ')}</div>
              {o.payment?.method === 'cod' && <div style={{ fontWeight: 600 }}>Collect {inr(o.totals.total)} in cash on delivery{o.codCollectedAt ? ' · cash collected ✓' : ''}</div>}
              {o.promo && <div>Code {o.promo.code}: −{inr(o.totals.couponDiscount)}</div>}
              {o.gift && <div>Gift card used: {inr(o.gift.applied)}</div>}
              {o.shipsBy && <div>Pre-order: ship by {o.shipsBy}</div>}
              {o.kind === 'giftcard' && <div>Gift card {o.giftcardCode || '(not issued yet)'} for {o.giftcard?.to}</div>}
              <div style={{ color: 'var(--muted)' }}>{o.customer.name}{o.customer.phone ? `, ${o.customer.phone}` : ''}, {o.customer.email}{o.customer.line1 && <><br />{o.customer.line1}{o.customer.line2 ? `, ${o.customer.line2}` : ''}, {o.customer.city}, {o.customer.state} {o.customer.pincode}</>}</div>
              {o.razorpay?.paymentId && <div style={{ color: 'var(--muted2)' }}>Razorpay payment {o.razorpay.paymentId}</div>}
              {o.refunds?.length > 0 && <div style={{ color: 'var(--good)' }}>Refunded {inr(o.refunds.reduce((n, r) => n + r.amount, 0))} ({o.refunds.length})</div>}
              {o.shipment && <div>Shipped: {o.shipment.courier} {o.shipment.tracking}</div>}
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                {['paid', 'cod_placed'].includes(o.status) && o.kind !== 'giftcard' && <button className="btn-ghost" onClick={() => act(o, 'shipped')}>Mark shipped</button>}
                {['paid', 'shipped', 'cod_placed'].includes(o.status) && <button className="btn-ghost" onClick={() => act(o, 'delivered')}>Mark delivered</button>}
                {o.status === 'delivered' && o.payment?.method === 'cod' && !o.codCollectedAt && <button className="btn-ghost" onClick={() => act(o, 'cod-collected')}>Cash collected</button>}
                {['paid', 'cod_placed', 'shipped', 'delivered'].includes(o.status) && <button className="btn-ghost" onClick={() => printOrder(o, 'invoice')}>Invoice</button>}
                {['paid', 'cod_placed', 'shipped'].includes(o.status) && o.kind !== 'giftcard' && <button className="btn-ghost" onClick={() => printOrder(o, 'slip')}>Packing slip</button>}
                {o.razorpay?.paymentId && o.payment?.method !== 'cod' && ['paid', 'shipped', 'delivered', 'cancelled'].includes(o.status) && o.totals.total > 0 && <button className="btn-ghost" onClick={() => refund(o)}>Refund…</button>}
                {['paid', 'pending_payment', 'expired', 'cod_placed', 'shipped'].includes(o.status) && <button className="btn-ghost" onClick={() => act(o, 'cancelled')}>{o.payment?.method === 'cod' ? 'Cancel / refused (restock)' : 'Cancel'}</button>}
              </div>
            </article>
          ))}
        </div>
      </div>
    </main>
  );
}
