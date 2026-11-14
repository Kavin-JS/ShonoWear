/**
 * SHONOWEAR — refunds through Razorpay (admin only).
 * Rules: online orders only; never more than was charged online (gift-card money is not refunded here); one refund at a time per
 * order (lock); every refund is written to a ledger `refunds:<orderId>` BEFORE the order record is touched, so money that moved is never lost.
 */
import { store, log, hgetall } from './guard.js';
import { getOrder, saveOrder } from './orders.js';

const base = () => process.env.RAZORPAY_API_BASE || 'https://api.razorpay.com';
const RECORDED = new Set(['paid', 'shipped', 'delivered', 'cancelled']);

export async function refundedSoFar(orderId) {
  const [all] = await store([['HGETALL', `refunds:${orderId}`]]);
  return Object.values(hgetall(all)).reduce((n, raw) => { try { return n + (JSON.parse(raw).amount || 0); } catch { return n; } }, 0);
}
export async function refundList(orderId) {
  const [all] = await store([['HGETALL', `refunds:${orderId}`]]);
  return Object.values(hgetall(all)).map(r => { try { return JSON.parse(r); } catch { return null; } }).filter(Boolean).sort((a, b) => a.at.localeCompare(b.at));
}

export async function refundOrder(orderId, amountRupees, { reason = '' } = {}) {
  const order = await getOrder(String(orderId || ''));
  if (!order) return { ok: false, status: 404, error: 'Order not found.' };
  if (order.payment?.method === 'cod') return { ok: false, status: 409, error: 'Cash-on-delivery orders are refunded by UPI or bank transfer: pay the customer yourself and mark it done.' };
  const pid = order.razorpay?.paymentId;
  if (!pid || !RECORDED.has(order.status)) return { ok: false, status: 409, error: 'This order has no confirmed online payment to refund.' };
  const charged = Math.round(Number(order.totals?.total || 0));
  if (charged < 1) return { ok: false, status: 409, error: 'Nothing was charged online on this order (it was paid with a gift card).' };
  const amount = Math.round(Number(amountRupees));
  if (!(amount >= 1)) return { ok: false, status: 400, error: 'Enter the amount to refund, in rupees.' };

  const [lock] = await store([['SET', `refundlock:${order.id}`, '1', 'NX', 'EX', 60]]);
  if (lock !== 'OK') return { ok: false, status: 409, error: 'A refund for this order is already being processed. Wait a minute and check again.' };
  try {
    const done = await refundedSoFar(order.id);
    if (amount + done > charged) return { ok: false, status: 409, error: `You can refund at most ₹${charged - done} more (₹${charged} was charged, ₹${done} already refunded).` };
    const auth = Buffer.from(`${process.env.RAZORPAY_KEY_ID}:${process.env.RAZORPAY_KEY_SECRET}`).toString('base64');
    let data;
    try {
      const res = await fetch(`${base()}/v1/payments/${encodeURIComponent(pid)}/refund`, {
        method: 'POST', headers: { Authorization: `Basic ${auth}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount: amount * 100, speed: 'normal', notes: { orderId: order.id, number: order.number, reason: String(reason).slice(0, 100) } }),
        signal: AbortSignal.timeout(10_000),
      });
      data = await res.json().catch(() => ({}));
      if (!res.ok) return { ok: false, status: 502, error: `Razorpay refused the refund: ${data?.error?.description || res.status}` };
    } catch (e) {
      log('refund_call_failed', { order: order.number, msg: e.message });
      return { ok: false, status: 502, error: 'Could not reach Razorpay. Check the dashboard before trying again: the refund may have gone through.' };
    }
    if (!data?.id) return { ok: false, status: 502, error: 'Razorpay gave an unexpected answer. Check the dashboard before trying again.' };
    const rec = { id: data.id, amount, at: new Date().toISOString(), reason: String(reason).slice(0, 100), status: data.status || 'processed' };
    await store([['HSET', `refunds:${order.id}`, data.id, JSON.stringify(rec)]]);   // the ledger first: money has moved
    const fresh = await getOrder(order.id, { raw: true }) || order;
    await saveOrder({ ...fresh, refunds: [...(fresh.refunds || []), rec] }).catch(e => log('refund_mirror_failed', { order: order.number, msg: e.message }));
    log('refund_made', { order: order.number, amount });
    return { ok: true, refund: rec, refunded: done + amount, charged };
  } finally {
    await store([['DEL', `refundlock:${order.id}`]]).catch(() => {});
  }
}
