/* SHONOWEAR — the Razorpay popup, shared by checkout and gift-card purchase. */
import { STORE } from '../data/storeConfig.js';

const SCRIPT = 'https://checkout.razorpay.com/v1/checkout.js';

export function loadRazorpay() {
  if (window.Razorpay) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = SCRIPT; s.async = true; s.onload = resolve;
    s.onerror = () => reject(new Error('Could not load the payment window. Check your connection or ad-blocker.'));
    document.head.appendChild(s);
  });
}

export async function postJson(url, body) {
  const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const data = await r.json().catch(() => ({}));
  return { ok: r.ok, status: r.status, data };
}

/**
 * Opens the popup for an order made by /api/checkout/create.
 * onDismiss: closed without paying (the unpaid claims are released here)
 * onPaid(res): paid; `res` is the /verify answer (money has moved either way, so go to the order page)
 * onFailed(msg): a payment attempt failed (the customer can try again in the same popup)
 */
export async function openPayment({ created, prefill, onDismiss, onPaid, onFailed }) {
  await loadRazorpay();
  let paid = false;
  const rzp = new window.Razorpay({
    key: created.keyId, order_id: created.razorpayOrderId, amount: created.amount, currency: created.currency,
    name: STORE.name, description: `Order ${created.number}`, prefill, theme: { color: '#e8153a' },
    modal: { ondismiss: () => { if (paid) return; postJson('/api/checkout/cancel', { orderId: created.orderId }).catch(() => {}); onDismiss?.(); } },
    handler: async (resp) => { paid = true; const res = await postJson('/api/checkout/verify', { orderId: created.orderId, ...resp }).catch(() => null); onPaid?.(res); },
  });
  rzp.on('payment.failed', (resp) => onFailed?.(resp?.error?.description || 'The payment failed. You can try again.'));
  rzp.open();
  return { wasPaid: () => paid };
}
