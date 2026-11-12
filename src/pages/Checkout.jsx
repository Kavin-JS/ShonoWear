import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useBag, bagEntries, clearOwnLines } from '../lib/bag.js';
import { isOwn, computeTotals, inr } from '../lib/store.js';
import { validateCustomer, STATES } from '../lib/checkoutValidation.js';
import { useCheckoutConfig } from '../lib/checkoutConfig.js';
import { savedPin } from '../components/PincodeCheck.jsx';
import { STORE } from '../data/storeConfig.js';

const SCRIPT = 'https://checkout.razorpay.com/v1/checkout.js';
const DRAFT = 'shonowear_checkout_draft';

function loadRazorpay() {
  if (window.Razorpay) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = SCRIPT; s.async = true;
    s.onload = resolve;
    s.onerror = () => reject(new Error('Could not load the payment window. Check your connection or ad-blocker.'));
    document.head.appendChild(s);
  });
}

async function post(url, body) {
  const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const data = await r.json().catch(() => ({}));
  return { ok: r.ok, status: r.status, data };
}

const input = { width: '100%', background: 'var(--bg3)', color: 'var(--text)', border: '1px solid var(--border2)', borderRadius: '4px', padding: '12px', fontSize: '15px', fontFamily: 'inherit' };

function Field({ label, error, children, id }) {
  return (
    <div style={{ display: 'grid', gap: '4px' }}>
      <label htmlFor={id} style={{ fontSize: '12px', color: 'var(--muted)' }}>{label}</label>
      {children}
      {error && <div id={`${id}-err`} role="alert" style={{ fontSize: '12px', color: 'var(--red)' }}>{error}</div>}
    </div>
  );
}

export default function Checkout() {
  const lines = useBag();
  const navigate = useNavigate();
  const cfg = useCheckoutConfig();
  const own = useMemo(() => bagEntries(lines).filter(e => isOwn(e.product)), [lines]);
  const totals = computeTotals(own.map(e => ({ product: e.product, qty: e.qty })));

  const [f, setF] = useState(() => {
    try { const d = JSON.parse(sessionStorage.getItem(DRAFT) || '{}'); return d.pincode ? d : { ...d, pincode: savedPin() }; } catch { return {}; }
  });
  const [errors, setErrors] = useState({});
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const paid = useRef(false);

  useEffect(() => { document.title = `Checkout · ${STORE.name}`; }, []);
  useEffect(() => { try { sessionStorage.setItem(DRAFT, JSON.stringify(f)); } catch { /* ignore */ } }, [f]);

  const set = (k) => (e) => setF(prev => ({ ...prev, [k]: e.target.value }));
  const fld = (k, extra = {}) => ({ id: k, value: f[k] || '', onChange: set(k), style: input, 'aria-invalid': Boolean(errors[k]), 'aria-describedby': errors[k] ? `${k}-err` : undefined, ...extra });

  if (!own.length && !busy) {
    return (
      <main id="main" className="page" style={{ paddingTop: '110px', textAlign: 'center' }}>
        <div className="container" style={{ maxWidth: '460px' }}>
          <h1 style={{ fontSize: '40px', marginBottom: '12px' }}>NOTHING TO CHECK OUT</h1>
          <p style={{ color: 'var(--muted)', marginBottom: '24px' }}>Add something we ship (look for “Ships from us”) to your bag first.</p>
          <Link to="/shop" className="btn-primary">Shop now</Link>
        </div>
      </main>
    );
  }

  async function pay(e) {
    e.preventDefault();
    if (busy) return;
    setMsg('');
    const v = validateCustomer(f);
    setErrors(v.errors);
    if (!v.ok) { document.getElementById(Object.keys(v.errors)[0])?.focus(); return; }

    setBusy(true);
    let created = null;
    try {
      const r = await post('/api/checkout/create', { cart: own.map(({ id, size, qty }) => ({ id, size, qty })), customer: v.data });
      if (!r.ok) {
        if (r.data.fields) setErrors(r.data.fields);
        setMsg(r.data.error || 'We could not start the payment. Please try again.');
        setBusy(false);
        return;
      }
      created = r.data;
      await loadRazorpay();

      const rzp = new window.Razorpay({
        key: created.keyId,
        order_id: created.razorpayOrderId,
        amount: created.amount,
        currency: created.currency,
        name: STORE.name,
        description: `Order ${created.number}`,
        prefill: { name: v.data.name, email: v.data.email, contact: v.data.phone },
        theme: { color: '#e8153a' },
        modal: {
          ondismiss: () => {
            if (paid.current) return;
            post('/api/checkout/cancel', { orderId: created.orderId }).catch(() => {});
            setMsg('Payment cancelled. Your items are still in your bag.');
            setBusy(false);
          },
        },
        handler: async (resp) => {
          paid.current = true;
          setMsg('Confirming your payment…');
          const res = await post('/api/checkout/verify', { orderId: created.orderId, ...resp }).catch(() => null);
          // Money has moved either way: go to the order page, which keeps checking.
          if (res?.ok) { clearOwnLines(); try { sessionStorage.removeItem(DRAFT); } catch { /* ignore */ } }
          navigate(`/order/${created.orderId}`, { replace: true, state: { verified: Boolean(res?.ok) } });
        },
      });
      rzp.on('payment.failed', (resp) => {
        setMsg(resp?.error?.description || 'The payment failed. You can try again.');
      });
      rzp.open();
    } catch (err) {
      if (created && !paid.current) post('/api/checkout/cancel', { orderId: created.orderId }).catch(() => {});
      setMsg(err.message || 'Something went wrong. Please try again.');
      setBusy(false);
    }
  }

  return (
    <main id="main" className="page" style={{ paddingTop: '100px' }}>
      <div className="container" style={{ maxWidth: '920px' }}>
        <Link to="/bag" style={{ fontSize: '12px', color: 'var(--muted)' }}>← Back to bag</Link>
        <h1 style={{ fontSize: 'clamp(40px, 6vw, 64px)', margin: '12px 0 20px' }}>CHECKOUT</h1>

        {cfg?.testMode && (
          <div role="status" style={{ background: 'var(--red-dim)', border: '1px solid var(--red)', borderRadius: '6px', padding: '10px 14px', fontSize: '13px', marginBottom: '20px' }}>
            Test mode: no real money is taken. Use Razorpay's test card or UPI details.
          </div>
        )}
        {cfg && !cfg.checkoutEnabled && (
          <div role="alert" style={{ border: '1px solid var(--border2)', borderRadius: '6px', padding: '12px 14px', marginBottom: '20px', color: 'var(--muted)' }}>
            Checkout is not available right now. Please come back soon.
          </div>
        )}

        <div style={{ display: 'grid', gap: '28px', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', alignItems: 'start' }}>
          <form onSubmit={pay} noValidate aria-label="Delivery details" style={{ display: 'grid', gap: '14px' }}>
            <h2 style={{ fontSize: '12px', letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--muted)' }}>Delivery details</h2>
            <Field id="name" label="Full name" error={errors.name}><input {...fld('name', { autoComplete: 'name' })} /></Field>
            <Field id="phone" label="Mobile number" error={errors.phone}><input {...fld('phone', { autoComplete: 'tel', inputMode: 'tel', placeholder: '10-digit number' })} /></Field>
            <Field id="email" label="Email (for your order confirmation)" error={errors.email}><input {...fld('email', { type: 'email', autoComplete: 'email' })} /></Field>
            <Field id="line1" label="House / flat, street" error={errors.line1}><input {...fld('line1', { autoComplete: 'address-line1' })} /></Field>
            <Field id="line2" label="Area, landmark (optional)" error={errors.line2}><input {...fld('line2', { autoComplete: 'address-line2' })} /></Field>
            <div style={{ display: 'grid', gap: '14px', gridTemplateColumns: '1fr 1fr' }}>
              <Field id="city" label="City" error={errors.city}><input {...fld('city', { autoComplete: 'address-level2' })} /></Field>
              <Field id="pincode" label="Pincode" error={errors.pincode}><input {...fld('pincode', { autoComplete: 'postal-code', inputMode: 'numeric', maxLength: 6 })} /></Field>
            </div>
            <Field id="state" label="State" error={errors.state}>
              <select {...fld('state', { autoComplete: 'address-level1' })}>
                <option value="">Choose…</option>
                {STATES.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </Field>

            {msg && <div role="alert" style={{ fontSize: '13px', color: msg.startsWith('Confirming') ? 'var(--text)' : 'var(--red)' }}>{msg}</div>}

            <button type="submit" className="btn-primary" disabled={busy || (cfg && !cfg.checkoutEnabled)} style={{ justifyContent: 'center', opacity: busy ? 0.7 : 1 }}>
              {busy ? 'Please wait…' : `Pay ${inr(totals.total)}`}
            </button>
            <p style={{ fontSize: '11px', color: 'var(--muted2)', lineHeight: 1.6 }}>
              Payments are processed by Razorpay (UPI, cards, netbanking, wallets). We never see your card details. Your stock is held for {STORE.holdMinutes} minutes while you pay. By paying you agree to our{' '}
              <Link to="/terms" style={{ textDecoration: 'underline' }}>Terms</Link>,{' '}
              <Link to="/policies/shipping" style={{ textDecoration: 'underline' }}>Shipping</Link> and{' '}
              <Link to="/policies/returns" style={{ textDecoration: 'underline' }}>Returns</Link> policies.
            </p>
          </form>

          <aside aria-label="Order summary" style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: '8px', padding: '16px', display: 'grid', gap: '10px' }}>
            <h2 style={{ fontSize: '12px', letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--muted)' }}>Order summary</h2>
            {own.map(e => (
              <div key={`${e.id}:${e.size}`} style={{ display: 'flex', gap: '10px', fontSize: '13px' }}>
                <img src={e.product.image} alt="" width="44" height="56" style={{ objectFit: 'cover', borderRadius: '4px' }} />
                <div style={{ flex: 1, minWidth: 0 }}>{e.product.name}<div style={{ color: 'var(--muted)', fontSize: '12px' }}>Size {e.size} · Qty {e.qty}</div></div>
                <div>{inr(e.product.price * e.qty)}</div>
              </div>
            ))}
            <div style={{ borderTop: '1px solid var(--border)', paddingTop: '10px', display: 'grid', gap: '6px', fontSize: '14px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>Subtotal</span><span>{inr(totals.subtotal)}</span></div>
              {totals.discount > 0 && <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--good)' }}><span>Bundle discount</span><span>−{inr(totals.discount)}</span></div>}
                            <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>Shipping</span><span>{totals.shipping ? inr(totals.shipping) : 'Free'}</span></div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 600, fontSize: '18px' }}><span>Total</span><span>{inr(totals.total)}</span></div>
              <div style={{ fontSize: '11px', color: 'var(--muted2)' }}>Delivery in {STORE.deliveryEstimate}. The amount you pay is recalculated on our server.</div>
            </div>
          </aside>
        </div>
      </div>
    </main>
  );
}
