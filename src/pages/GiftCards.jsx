import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { inr } from '../lib/store.js';
import { STORE } from '../data/storeConfig.js';
import { useCheckoutConfig } from '../lib/checkoutConfig.js';
import { openPayment, postJson } from '../lib/payFlow.js';

const input = { width: '100%', background: 'var(--bg3)', color: 'var(--text)', border: '1px solid var(--border2)', borderRadius: 4, padding: 12, fontSize: 15, fontFamily: 'inherit' };

export default function GiftCards() {
  const cfg = useCheckoutConfig();
  const navigate = useNavigate();
  const amounts = STORE.giftCards?.amounts || [];
  const [amount, setAmount] = useState(amounts[1] || amounts[0]);
  const [f, setF] = useState({ name: '', email: '', to: '', message: '' });
  const [errors, setErrors] = useState({});
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => { document.title = `Gift cards · ${STORE.name}`; }, []);
  const set = (k) => (e) => setF(p => ({ ...p, [k]: e.target.value }));

  if (STORE.giftCards?.enabled === false) return <main id="main" className="page"><div className="container"><h1>Gift cards are not available.</h1></div></main>;

  async function buy(e) {
    e.preventDefault();
    if (busy) return;
    setMsg(''); setErrors({}); setBusy(true);
    let created = null;
    try {
      const r = await postJson('/api/checkout/create', { giftcard: { amount, to: f.to, message: f.message }, customer: { name: f.name, email: f.email } });
      if (!r.ok) { setErrors(r.data.fields || {}); setMsg(r.data.error || 'We could not start the payment.'); setBusy(false); return; }
      created = r.data;
      await openPayment({
        created, prefill: { name: f.name, email: f.email },
        onDismiss: () => { setMsg('Payment cancelled.'); setBusy(false); },
        onPaid: (res) => navigate(`/order/${created.orderId}`, { replace: true, state: { verified: Boolean(res?.ok) } }),
        onFailed: (m) => setMsg(m),
      });
    } catch (err) {
      if (created) postJson('/api/checkout/cancel', { orderId: created.orderId }).catch(() => {});
      setMsg(err.message || 'Something went wrong.'); setBusy(false);
    }
  }

  const err = (k) => errors[k] && <div role="alert" style={{ fontSize: 12, color: 'var(--red-text)' }}>{errors[k]}</div>;
  return (
    <main id="main" className="page" style={{ paddingTop: 100 }}>
      <div className="container" style={{ maxWidth: 560 }}>
        <div className="eyebrow">Gift cards</div>
        <h1 style={{ fontSize: 'clamp(36px, 6vw, 56px)', margin: '8px 0 12px' }}>GIVE A WARDROBE REFRESH</h1>
        <p style={{ color: 'var(--muted)', marginBottom: 20, fontSize: 14, lineHeight: 1.6 }}>
          We email the code to the person you choose. They can spend it on anything we ship, in one go or in parts, for {STORE.giftCards.validMonths} months. It works on this website only and can't be exchanged for cash.
        </p>
        {cfg && !cfg.checkoutEnabled && <p role="alert" style={{ color: 'var(--muted)' }}>Payments are not available right now. Please come back soon.</p>}
        <form onSubmit={buy} noValidate aria-label="Buy a gift card" style={{ display: 'grid', gap: 14 }}>
          <div role="radiogroup" aria-label="Amount" style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {amounts.map(a => <button key={a} type="button" role="radio" aria-checked={amount === a} className="chip" onClick={() => setAmount(a)} style={amount === a ? { borderColor: 'var(--red)', background: 'var(--red-dim)' } : undefined}>{inr(a)}</button>)}
          </div>
          <label style={{ display: 'grid', gap: 4, fontSize: 12, color: 'var(--muted)' }}>Send the gift card to (email)
            <input style={input} type="email" value={f.to} onChange={set('to')} autoComplete="off" />{err('to')}</label>
          <label style={{ display: 'grid', gap: 4, fontSize: 12, color: 'var(--muted)' }}>Message (optional)
            <textarea style={{ ...input, minHeight: 70 }} maxLength={200} value={f.message} onChange={set('message')} /></label>
          <label style={{ display: 'grid', gap: 4, fontSize: 12, color: 'var(--muted)' }}>Your name
            <input style={input} value={f.name} onChange={set('name')} autoComplete="name" />{err('name')}</label>
          <label style={{ display: 'grid', gap: 4, fontSize: 12, color: 'var(--muted)' }}>Your email (for the receipt)
            <input style={input} type="email" value={f.email} onChange={set('email')} autoComplete="email" />{err('email')}</label>
          {msg && <div role="alert" style={{ fontSize: 13, color: 'var(--red-text)' }}>{msg}</div>}
          <button type="submit" className="btn-primary" disabled={busy || (cfg && !cfg.checkoutEnabled)} style={{ justifyContent: 'center' }}>{busy ? 'Please wait…' : `Pay ${inr(amount)}`}</button>
          <p style={{ fontSize: 11, color: 'var(--muted2)', lineHeight: 1.6 }}>Paid online through Razorpay. Gift cards are not refundable once issued. Have a code? Enter it at <Link to="/checkout" style={{ textDecoration: 'underline' }}>checkout</Link>.</p>
        </form>
      </div>
    </main>
  );
}
