import { useState } from 'react';
import { estimateDelivery } from '../lib/pincode.js';
import { STORE } from '../data/storeConfig.js';
import { inr } from '../lib/store.js';

const KEY = 'shonowear_pin';
export const savedPin = () => { try { return localStorage.getItem(KEY) || ''; } catch { return ''; } };

export default function PincodeCheck() {
  const [pin, setPin] = useState(savedPin());
  const [res, setRes] = useState(() => (savedPin() ? estimateDelivery(savedPin()) : null));
  const check = (e) => {
    e.preventDefault();
    const r = estimateDelivery(pin); setRes(r);
    if (r.ok) { try { localStorage.setItem(KEY, pin.trim()); } catch { /* ignore */ } }
  };
  return (
    <form onSubmit={check} style={{ display: 'grid', gap: 8 }} aria-label="Delivery estimate">
      <label htmlFor="pin" style={{ fontSize: 12, fontWeight: 600 }}>Check delivery</label>
      <div style={{ display: 'flex', gap: 8, maxWidth: 320 }}>
        <input id="pin" inputMode="numeric" autoComplete="postal-code" maxLength={6} placeholder="Enter pincode" value={pin} onChange={e => setPin(e.target.value.replace(/\D/g, ''))}
          style={{ flex: 1, minWidth: 0, background: 'var(--bg2)', color: 'var(--text)', border: '1px solid var(--border2)', borderRadius: 8, padding: '10px 12px', fontSize: 14, fontFamily: 'inherit' }} />
        <button type="submit" className="btn-ghost" style={{ padding: '10px 16px' }}>Check</button>
      </div>
      <div role="status" style={{ fontSize: 13 }}>
        {res && !res.ok && <span style={{ color: 'var(--red)' }}>{res.error}</span>}
        {res?.ok && <span>Estimated delivery <strong>{res.label}</strong>{res.remote ? ' (remote area: a little longer)' : ''}. {STORE.freeShippingOver ? `Free shipping over ${inr(STORE.freeShippingOver)}.` : ''}<br /><span style={{ color: 'var(--muted)', fontSize: 11 }}>An estimate: the courier confirms the exact date once shipped.</span></span>}
      </div>
    </form>
  );
}
