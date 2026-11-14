/* SHONOWEAR — talks to /api/cart: the exact price checkout will charge, and the opt-in bag reminder. */
import { useEffect, useRef, useState } from 'react';

async function post(body, signal) {
  const r = await fetch('/api/cart', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal });
  const data = await r.json().catch(() => ({}));
  return { ok: r.ok, status: r.status, data };
}

/**
 * The server's price for this bag. Re-asks (after a short pause) whenever an input changes and ignores stale answers.
 * Returns { quote, loading, error }: `quote` is null until the first answer or when the API is unreachable
 * (the page then falls back to its own bundle-only totals and says nothing is applied).
 */
export function useQuote({ cart, code, gift, payment, pincode, enabled = true }) {
  const [state, setState] = useState({ quote: null, loading: enabled, error: '' });
  const key = JSON.stringify([cart, code, gift, payment, pincode]);
  const seq = useRef(0);
  useEffect(() => {
    if (!enabled || !cart.length) { setState({ quote: null, loading: false, error: '' }); return undefined; }
    const my = ++seq.current;
    const ctl = new AbortController();
    setState(s => ({ ...s, loading: true }));
    const t = setTimeout(async () => {
      try {
        const r = await post({ action: 'quote', cart, code, gift, payment, pincode }, ctl.signal);
        if (my !== seq.current) return;
        setState(r.ok ? { quote: r.data, loading: false, error: '' } : { quote: null, loading: false, error: r.data.error || 'Could not price your bag.' });
      } catch (e) {
        if (e.name !== 'AbortError' && my === seq.current) setState({ quote: null, loading: false, error: '' });
      }
    }, 300);
    return () => { clearTimeout(t); ctl.abort(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, enabled]);
  return state;
}

/** Ask to be reminded once about this bag. Only ever called after the customer ticks the box. */
export function rememberBag(email, cart) {
  return post({ action: 'remember', email, cart, consent: true }).catch(() => null);
}
