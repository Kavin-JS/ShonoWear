import { useEffect, useMemo, useState } from 'react';
import { Analytics } from '../lib/analytics.js';
import { Link, useNavigate } from 'react-router-dom';
import { useBag, bagEntries, clearOwnLines } from '../lib/bag.js';
import { isOwn, computeTotals, inr } from '../lib/store.js';
import { unitPrice, preorderDate, prettyDate } from '../lib/offers.js';
import { validateCustomer, STATES } from '../lib/checkoutValidation.js';
import { useCheckoutConfig } from '../lib/checkoutConfig.js';
import { useQuote, rememberBag } from '../lib/cartApi.js';
import { listAddresses, saveAddress, removeAddress } from '../lib/addresses.js';
import { openPayment, postJson } from '../lib/payFlow.js';
import { savedPin } from '../components/PincodeCheck.jsx';
import { STORE } from '../data/storeConfig.js';
import { useT } from '../i18n/index.jsx';

const DRAFT = 'shonowear_checkout_draft';
const input = { width: '100%', background: 'var(--bg3)', color: 'var(--text)', border: '1px solid var(--border2)', borderRadius: '4px', padding: '12px', fontSize: '15px', fontFamily: 'inherit' };
const card = { background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 12, padding: 14 };
const heading = { fontSize: '12px', letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--muted)' };
const row = { display: 'flex', justifyContent: 'space-between', gap: 8 };

function Field({ label, error, children, id }) {
  const t = useT(); label = t(label);
  return (
    <div style={{ display: 'grid', gap: '4px' }}>
      <label htmlFor={id} style={{ fontSize: '12px', color: 'var(--muted)' }}>{label}</label>
      {children}
      {error && <div id={`${id}-err`} role="alert" style={{ fontSize: '12px', color: 'var(--red-text)' }}>{error}</div>}
    </div>
  );
}

/** A code box: type, Apply, and the reason underneath if the server refuses it. */
function CodeBox({ id, label, placeholder, applied, error, okText, onApply, onRemove }) {
  const [v, setV] = useState('');
  return (
    <div style={{ display: 'grid', gap: 6 }}>
      <label htmlFor={id} style={{ fontSize: 12, color: 'var(--muted)' }}>{label}</label>
      {applied ? (
        <div style={{ ...row, alignItems: 'center', fontSize: 13 }}>
          <span style={{ color: error ? 'var(--red-text)' : 'var(--good)' }}>{error || okText}</span>
          <button type="button" onClick={() => { onRemove(); setV(''); }} style={{ background: 'none', border: 'none', textDecoration: 'underline', color: 'var(--muted)', cursor: 'pointer', fontSize: 12 }}>Remove</button>
        </div>
      ) : (
        <form onSubmit={(e) => { e.preventDefault(); if (v.trim()) onApply(v.trim()); }} style={{ display: 'flex', gap: 8 }}>
          <input id={id} value={v} onChange={e => setV(e.target.value)} placeholder={placeholder} autoComplete="off" autoCapitalize="characters" spellCheck="false" style={{ ...input, padding: '10px 12px', textTransform: 'uppercase' }} />
          <button type="submit" className="btn-ghost" style={{ padding: '8px 16px' }}>Apply</button>
        </form>
      )}
      {!applied && error && <div role="alert" style={{ fontSize: 12, color: 'var(--red-text)' }}>{error}</div>}
    </div>
  );
}

export default function Checkout() {
  const lines = useBag();
  const navigate = useNavigate();
  const cfg = useCheckoutConfig();
  const own = useMemo(() => bagEntries(lines).filter(e => isOwn(e.product)), [lines]);
  const cart = useMemo(() => own.map(({ id, size, qty }) => ({ id, size, qty })), [own]);

  const [f, setF] = useState(() => {
    try { const d = JSON.parse(sessionStorage.getItem(DRAFT) || '{}'); return d.pincode ? d : { ...d, pincode: savedPin() }; } catch { return {}; }
  });
  const [errors, setErrors] = useState({});
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const [payment, setPayment] = useState('online');
  const [code, setCode] = useState('');
  const [gift, setGift] = useState('');
  const [saved, setSaved] = useState(() => listAddresses());
  const [saveAddr, setSaveAddr] = useState(true);
  const [remind, setRemind] = useState(false);
  const [marketing, setMarketing] = useState(false);

  const pin = /^\d{6}$/.test(f.pincode || '') ? f.pincode : '';
  const { quote, loading, error: quoteError } = useQuote({ cart, code, gift, payment, pincode: pin, enabled: own.length > 0 });
  const local = computeTotals(own.map(e => ({ product: e.product, qty: e.qty })));
  const totals = quote?.totals || local;
  const cod = quote?.cod;
  const effPayment = quote?.cod?.selected ? 'cod' : 'online';
  const preDates = own.map(e => preorderDate(e.product)).filter(Boolean).sort();

  useEffect(() => { document.title = `Checkout · ${STORE.name}`; Analytics.checkoutStarted(); }, []);
  useEffect(() => { try { sessionStorage.setItem(DRAFT, JSON.stringify(f)); } catch { /* ignore */ } }, [f]);
  // If COD stops being available (limit, gift card, pre-order), fall back to online instead of leaving a dead choice selected.
  useEffect(() => { if (payment === 'cod' && quote && !quote.cod?.available) setPayment('online'); }, [payment, quote]);

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

  function applySaved(a) { setF(prev => ({ ...prev, ...a })); setErrors({}); }
  function maybeRemember() {
    if (remind && /^[^\s@]+@[^\s@]+\.[A-Za-z]{2,}$/.test(f.email || '')) rememberBag(f.email, cart);
  }
  const done = (orderId, state) => {
    if (state.verified) clearOwnLines(); // an unverified result keeps the bag; the order page keeps checking
    try { sessionStorage.removeItem(DRAFT); } catch { /* ignore */ }
    navigate(`/order/${orderId}`, { replace: true, state });
  };

  async function pay(e) {
    e.preventDefault();
    if (busy || loading) return;
    setMsg('');
    const v = validateCustomer(f);
    setErrors(v.errors);
    if (!v.ok) { document.getElementById(Object.keys(v.errors)[0])?.focus(); return; }
    if ((code && quote?.promo && !quote.promo.ok) || (gift && quote?.gift && !quote.gift.ok)) { setMsg('Please fix or remove the code above before continuing.'); return; }
    if (saveAddr) setSaved(saveAddress(v.data));

    setBusy(true);
    let created = null;
    try {
      const r = await postJson('/api/checkout/create', {
        cart, customer: v.data, payment: effPayment, ...(code ? { code } : {}), ...(gift ? { gift } : {}),
        ...(quote ? { expectTotal: totals.total } : {}),
        ...(marketing ? { marketing: true } : {}),
      });
      if (!r.ok) {
        if (r.status === 409 && r.data.error === 'prices_changed') setMsg(r.data.message);
        else { if (r.data.fields) setErrors(r.data.fields); setMsg(r.data.error || 'We could not start the payment. Please try again.'); }
        if (r.data.field === 'code') setCode('');
        if (r.data.field === 'gift') setGift('');
        setBusy(false);
        return;
      }
      created = r.data;
      if (created.cod || created.paid) { done(created.orderId, { verified: true, cod: Boolean(created.cod) }); return; }

      await openPayment({
        created, prefill: { name: v.data.name, email: v.data.email, contact: v.data.phone },
        onDismiss: () => { setMsg('Payment cancelled. Your items are still in your bag.'); setBusy(false); },
        onPaid: (res) => { setMsg('Confirming your payment…'); done(created.orderId, { verified: Boolean(res?.ok) }); },
        onFailed: (m) => setMsg(m),
      });
    } catch (err) {
      if (created && !created.cod && !created.paid) postJson('/api/checkout/cancel', { orderId: created.orderId }).catch(() => {});
      setMsg(err.message || 'Something went wrong. Please try again.');
      setBusy(false);
    }
  }

  const payLabel = busy ? 'Please wait…' : loading ? 'Updating price…'
    : totals.total === 0 ? 'Place order' : effPayment === 'cod' ? `Place order · pay ${inr(totals.total)} on delivery` : `Pay ${inr(totals.total)}`;

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
            <h2 style={heading}>Delivery details</h2>

            {saved.length > 0 && (
              <div role="group" aria-label="Saved addresses" style={{ display: 'grid', gap: 6 }}>
                <div style={{ fontSize: 12, color: 'var(--muted)' }}>Use a saved address (kept on this device only)</div>
                {saved.map((a, i) => (
                  <div key={`${a.line1}|${a.pincode}`} style={{ ...card, padding: '8px 10px', display: 'flex', gap: 8, alignItems: 'center', fontSize: 13 }}>
                    <button type="button" onClick={() => applySaved(a)} style={{ flex: 1, textAlign: 'left', background: 'none', border: 'none', color: 'var(--text)', cursor: 'pointer', fontFamily: 'inherit', fontSize: 13 }}>
                      <strong>{a.name}</strong> · {a.line1}, {a.city} {a.pincode}
                    </button>
                    <button type="button" aria-label={`Delete saved address ${a.line1}`} onClick={() => setSaved(removeAddress(i))} style={{ background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer', fontSize: 12, textDecoration: 'underline' }}>Delete</button>
                  </div>
                ))}
              </div>
            )}

            <Field id="name" label="Full name" error={errors.name}><input {...fld('name', { autoComplete: 'name' })} /></Field>
            <Field id="phone" label="Mobile number" error={errors.phone}><input {...fld('phone', { autoComplete: 'tel', inputMode: 'tel', placeholder: '10-digit number' })} /></Field>
            <Field id="email" label="Email (for your order confirmation)" error={errors.email}><input {...fld('email', { type: 'email', autoComplete: 'email', onBlur: maybeRemember })} /></Field>
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
            <label style={{ display: 'flex', gap: 8, fontSize: 13, color: 'var(--muted)', alignItems: 'center' }}>
              <input type="checkbox" checked={saveAddr} onChange={e => setSaveAddr(e.target.checked)} /> Save this address on this device for next time
            </label>
            {STORE.abandonedBag?.enabled && (
              <label style={{ display: 'flex', gap: 8, fontSize: 13, color: 'var(--muted)', alignItems: 'flex-start' }}>
                <input type="checkbox" checked={remind} onChange={e => { setRemind(e.target.checked); if (e.target.checked && /@/.test(f.email || '')) rememberBag(f.email, cart); }} style={{ marginTop: 3 }} />
                <span>If I don't finish, email me one reminder about my bag. We keep your email and bag for up to {STORE.abandonedBag.maxDays} days for this, then delete them.</span>
              </label>
            )}

            <label style={{ display: 'flex', gap: 8, fontSize: 13, color: 'var(--muted)', alignItems: 'flex-start' }}>
              <input type="checkbox" checked={marketing} onChange={e => setMarketing(e.target.checked)} style={{ marginTop: 3 }} />
              <span>Email me new drops and offers (optional). Every email has an unsubscribe link. Your order emails are not affected.</span>
            </label>

            <h2 style={{ ...heading, marginTop: 8 }}>Payment</h2>
            <div role="radiogroup" aria-label="Payment method" style={{ display: 'grid', gap: 8 }}>
              <label style={{ ...card, display: 'flex', gap: 10, alignItems: 'flex-start', cursor: 'pointer', borderColor: payment === 'online' ? 'var(--red)' : 'var(--border)' }}>
                <input type="radio" name="pm" checked={payment === 'online'} onChange={() => setPayment('online')} style={{ marginTop: 3 }} />
                <span style={{ fontSize: 14 }}><strong>Pay online</strong><br /><span style={{ color: 'var(--muted)', fontSize: 12 }}>UPI, cards, netbanking, wallets, through Razorpay</span></span>
              </label>
              {STORE.cod?.enabled && (
                <label style={{ ...card, display: 'flex', gap: 10, alignItems: 'flex-start', cursor: cod?.available === false ? 'not-allowed' : 'pointer', opacity: cod?.available === false ? 0.6 : 1, borderColor: payment === 'cod' ? 'var(--red)' : 'var(--border)' }}>
                  <input type="radio" name="pm" disabled={cod?.available === false} checked={payment === 'cod'} onChange={() => setPayment('cod')} style={{ marginTop: 3 }} />
                  <span style={{ fontSize: 14 }}><strong>Cash on delivery</strong> <span style={{ color: 'var(--muted)', fontSize: 12 }}>(+{inr(STORE.cod.fee)} fee)</span><br />
                    <span style={{ color: 'var(--muted)', fontSize: 12 }}>{cod?.available === false ? cod.reason : `Pay the courier in cash. Up to ${inr(STORE.cod.maxOrder)}. We may call to confirm before shipping.`}</span></span>
                </label>
              )}
            </div>

            {msg && <div role="alert" style={{ fontSize: '13px', color: msg.startsWith('Confirming') ? 'var(--text)' : 'var(--red-text)' }}>{msg}</div>}
            {quoteError && <div role="alert" style={{ fontSize: '13px', color: 'var(--red-text)' }}>{quoteError}</div>}

            <button type="submit" className="btn-primary" disabled={busy || loading || (cfg && !cfg.checkoutEnabled && effPayment !== 'cod')} style={{ justifyContent: 'center', opacity: busy || loading ? 0.7 : 1 }}>
              {payLabel}
            </button>
            <p style={{ fontSize: '11px', color: 'var(--muted2)', lineHeight: 1.6 }}>
              {effPayment === 'cod' ? 'Please keep the exact amount ready. Orders refused at the door may limit future cash-on-delivery orders. ' : 'Payments are processed by Razorpay. We never see your card details. '}
              Your stock is held for {STORE.holdMinutes} minutes while you pay. By ordering you agree to our{' '}
              <Link to="/terms" style={{ textDecoration: 'underline' }}>Terms</Link>,{' '}
              <Link to="/policies/shipping" style={{ textDecoration: 'underline' }}>Shipping</Link> and{' '}
              <Link to="/policies/returns" style={{ textDecoration: 'underline' }}>Returns</Link> policies.
            </p>
          </form>

          <aside aria-label="Order summary" style={{ ...card, borderRadius: 8, padding: 16, display: 'grid', gap: '12px' }}>
            <h2 style={heading}>Order summary</h2>
            {own.map(e => {
              const unit = unitPrice(e.product);
              return (
                <div key={`${e.id}:${e.size}`} style={{ display: 'flex', gap: '10px', fontSize: '13px' }}>
                  <img src={e.product.image} alt="" width="44" height="56" style={{ objectFit: 'cover', borderRadius: '4px' }} />
                  <div style={{ flex: 1, minWidth: 0 }}>{e.product.name}
                    <div style={{ color: 'var(--muted)', fontSize: '12px' }}>Size {e.size} · Qty {e.qty}{unit < e.product.price ? ' · sale price' : ''}</div>
                    {preorderDate(e.product) && <div style={{ color: 'var(--muted)', fontSize: 12 }}>Pre-order · ships by {prettyDate(preorderDate(e.product))}</div>}
                  </div>
                  <div>{inr(unit * e.qty)}</div>
                </div>
              );
            })}
            {preDates.length > 0 && <div role="note" style={{ fontSize: 12, color: 'var(--muted)' }}>Your order includes a pre-order, so it ships together by {prettyDate(preDates[preDates.length - 1])}.</div>}

            <div style={{ borderTop: '1px solid var(--border)', paddingTop: 12, display: 'grid', gap: 12 }}>
              {STORE.giftCards?.enabled !== false && <CodeBox id="gift" label="Gift card" placeholder="SW-XXXX-XXXX-XXXX" applied={Boolean(gift)}
                error={quote?.gift && !quote.gift.ok ? quote.gift.error : ''}
                okText={quote?.gift?.ok ? `Gift card applied: −${inr(quote.gift.applied)} (balance ${inr(quote.gift.balance)})` : 'Checking…'}
                onApply={(v) => { setGift(v); }} onRemove={() => setGift('')} />}
              <CodeBox id="promo" label="Promo or referral code" placeholder="Enter code" applied={Boolean(code)}
                error={quote?.promo && !quote.promo.ok ? quote.promo.error : ''}
                okText={quote?.promo?.ok ? (quote.promo.applied > 0 ? `${quote.promo.code} applied: −${inr(quote.promo.applied)}` : `${quote.promo.code}: your bundle discount is already better, so it stays`) : 'Checking…'}
                onApply={(v) => setCode(v)} onRemove={() => setCode('')} />
            </div>

            <div style={{ borderTop: '1px solid var(--border)', paddingTop: '10px', display: 'grid', gap: '6px', fontSize: '14px' }}>
              <div style={row}><span>Subtotal</span><span>{inr(totals.subtotal)}</span></div>
              {totals.saleSavings > 0 && <div style={{ ...row, color: 'var(--muted)', fontSize: 12 }}><span>Includes sale savings of</span><span>{inr(totals.saleSavings)}</span></div>}
              {totals.bundleDiscount > 0 && <div style={{ ...row, color: 'var(--good)' }}><span>Bundle discount</span><span>−{inr(totals.bundleDiscount)}</span></div>}
              {totals.couponDiscount > 0 && <div style={{ ...row, color: 'var(--good)' }}><span>Promo code</span><span>−{inr(totals.couponDiscount)}</span></div>}
              <div style={row}><span>Shipping</span><span>{totals.shipping ? inr(totals.shipping) : 'Free'}</span></div>
              {totals.codFee > 0 && <div style={row}><span>Cash on delivery fee</span><span>{inr(totals.codFee)}</span></div>}
              {totals.giftApplied > 0 && <div style={{ ...row, color: 'var(--good)' }}><span>Gift card</span><span>−{inr(totals.giftApplied)}</span></div>}
              <div style={{ ...row, fontWeight: 600, fontSize: '18px' }}><span>{effPayment === 'cod' ? 'To pay on delivery' : 'Total'}</span><span>{inr(totals.total)}</span></div>
              <div style={{ fontSize: '11px', color: 'var(--muted2)' }}>Delivery in {STORE.deliveryEstimate}. The amount you pay is calculated on our server. Sale items are left out of bundle and promo discounts.</div>
            </div>
          </aside>
        </div>
      </div>
    </main>
  );
}
