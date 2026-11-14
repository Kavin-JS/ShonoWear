import { trackUrl, waLink } from '../lib/courier.js';
import { useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { inr } from '../lib/store.js';
import { STORE } from '../data/storeConfig.js';
import { prettyDate } from '../lib/offers.js';

const PLACED = ['paid', 'cod_placed', 'shipped', 'delivered'];

const LABEL = {
  pending_payment: 'Waiting for payment',
  paid: 'Payment received',
  cod_placed: 'Placed · pay on delivery',
  shipped: 'Shipped',
  delivered: 'Delivered',
  cancelled: 'Cancelled',
  expired: 'Payment window expired',
};

export function OrderView({ order }) {
  return (
    <section aria-label="Order details" style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: '8px', padding: '16px', display: 'grid', gap: '10px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px' }}>
        <strong>Order {order.number}</strong>
        <span style={{ color: order.status === 'cancelled' || order.status === 'expired' ? 'var(--red-text)' : 'var(--text)' }}>{LABEL[order.status] || order.status}</span>
      </div>
      {order.items.map((i, k) => (
        <div key={k} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '14px', gap: '10px' }}>
          <span>{i.name} <span style={{ color: 'var(--muted)' }}>· {i.size} × {i.qty}{i.preorder ? ` · pre-order, ships by ${prettyDate(i.preorder)}` : ''}</span></span><span>{inr(i.price * i.qty)}</span>
        </div>
      ))}
      <div style={{ borderTop: '1px solid var(--border)', paddingTop: '8px', fontSize: '14px', display: 'grid', gap: '4px' }}>
        {order.totals.bundleDiscount > 0 && <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--good)' }}><span>Bundle discount</span><span>−{inr(order.totals.bundleDiscount)}</span></div>}
        {order.totals.couponDiscount > 0 && <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--good)' }}><span>Code {order.promoCode}</span><span>−{inr(order.totals.couponDiscount)}</span></div>}
        {!order.totals.bundleDiscount && !order.totals.couponDiscount && order.totals.discount > 0 && <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--good)' }}><span>Discount</span><span>−{inr(order.totals.discount)}</span></div>}
        {order.kind !== 'giftcard' && <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>Shipping</span><span>{order.totals.shipping ? inr(order.totals.shipping) : 'Free'}</span></div>}
        {order.totals.codFee > 0 && <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>Cash on delivery fee</span><span>{inr(order.totals.codFee)}</span></div>}
        {order.totals.giftApplied > 0 && <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--good)' }}><span>Gift card</span><span>−{inr(order.totals.giftApplied)}</span></div>}
        <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 600 }}><span>{order.payment === 'cod' ? 'To pay on delivery' : 'Total'}</span><span>{inr(order.totals.total)}</span></div>
      </div>
      {order.shipment && (
        <div style={{ fontSize: '13px', color: 'var(--muted)' }}>
          Shipped{order.shipment.courier ? ` with ${order.shipment.courier}` : ''}{order.shipment.tracking ? `, tracking number ${order.shipment.tracking}` : ''}.
          {trackUrl(order.shipment.courier, order.shipment.tracking) && <> <a href={trackUrl(order.shipment.courier, order.shipment.tracking)} target="_blank" rel="noopener noreferrer" style={{ textDecoration: 'underline', color: 'var(--text)' }}>Track with the courier</a>.</>}
        </div>
      )}
      {waLink(STORE.whatsapp, `Hi, about my order ${order.number}`) && <a href={waLink(STORE.whatsapp, `Hi, about my order ${order.number}`)} target="_blank" rel="noopener noreferrer" className="btn-ghost" style={{ justifySelf: 'start', fontSize: 13 }}>Chat with us on WhatsApp</a>}
      {order.city && <div style={{ fontSize: '12px', color: 'var(--muted2)' }}>Delivering to {order.city}, {order.state}</div>}
    </section>
  );
}

export default function Order() {
  const { id } = useParams();
  const [order, setOrder] = useState(null);
  const [err, setErr] = useState('');
  const tries = useRef(0);

  useEffect(() => {
    document.title = `Your order · ${STORE.name}`;
    let stop = false, timer;
    async function load() {
      try {
        const r = await fetch(`/api/order?id=${encodeURIComponent(id)}`);
        const d = await r.json().catch(() => ({}));
        if (stop) return;
        if (r.status === 404) { setErr('We could not find this order. Check the link in your confirmation email.'); return; }
        if (!r.ok) throw new Error();
        setOrder(d.order); setErr('');
        // keep checking for a short while: the payment confirmation can arrive a moment after the popup closes
        if (d.order.status === 'pending_payment' && ++tries.current < 30) timer = setTimeout(load, 4000);
      } catch {
        if (!stop) { setErr('Could not load your order. Retrying…'); if (++tries.current < 30) timer = setTimeout(load, 6000); }
      }
    }
    load();
    return () => { stop = true; clearTimeout(timer); };
  }, [id]);

  const pending = order?.status === 'pending_payment';
  return (
    <main id="main" className="page" style={{ paddingTop: '100px' }}>
      <div className="container" style={{ maxWidth: '640px' }}>
        <h1 style={{ fontSize: 'clamp(36px, 6vw, 56px)', marginBottom: '12px' }}>
          {order && !pending && PLACED.includes(order.status) ? 'THANK YOU' : 'YOUR ORDER'}
        </h1>
        {err && !order && <p role="alert" style={{ color: 'var(--muted)' }}>{err}</p>}
        {pending && <p role="status" style={{ color: 'var(--muted)', marginBottom: '16px' }}>We're confirming your payment. If you were charged, this page updates by itself and we'll email you. Please don't pay twice.</p>}
        {order && PLACED.includes(order.status) && order.kind === 'giftcard' && (
          <div style={{ border: '1px solid var(--border2)', borderRadius: 12, padding: 16, marginBottom: 16 }}>
            <p style={{ color: 'var(--muted)', fontSize: 14, marginBottom: 8 }}>Your gift card is ready and has been emailed to the person you chose. Keep this code too:</p>
            {order.giftCode ? <div style={{ fontSize: 24, letterSpacing: 2, fontWeight: 700 }} aria-label="Gift card code">{order.giftCode}</div> : <p role="status">Preparing your code…</p>}
            <p style={{ fontSize: 12, color: 'var(--muted2)', marginTop: 8 }}>Anyone with the code can spend it, so share it only with the person it is for.</p>
          </div>
        )}
        {order && PLACED.includes(order.status) && order.kind !== 'giftcard' && (
          <p style={{ color: 'var(--muted)', marginBottom: 16 }}>
            We've got your order. A confirmation is on its way to your email. {order.shipsBy ? `Part of it is a pre-order: it ships by ${prettyDate(order.shipsBy)}.` : `Delivery in ${STORE.deliveryEstimate}.`}
            {order.payment === 'cod' && !order.codCollected && <> <strong>Please keep {inr(order.totals.total)} in cash ready for the courier.</strong> We may call you to confirm before shipping.</>}
            {' '}Bookmark this page to follow it, or use <Link to="/track" style={{ textDecoration: 'underline' }}>Track order</Link>.
          </p>
        )}
        {order?.referralCode && order.kind !== 'giftcard' && (
          <div style={{ border: '1px dashed var(--border2)', borderRadius: 12, padding: 14, marginBottom: 16, fontSize: 14 }}>
            <strong>Share and earn.</strong> Give a friend your code <strong style={{ letterSpacing: 1 }}>{order.referralCode}</strong>: they get {inr(STORE.referral.friendOff)} off a first order over {inr(STORE.referral.minSubtotal)}, and you get {inr(STORE.referral.referrerReward)} store credit once their order is delivered.
          </div>
        )}
        {order?.status === 'expired' && <p style={{ color: 'var(--muted)', marginBottom: '16px' }}>This order wasn't paid in time, so the items were released. If money left your account, it will be refunded; contact {STORE.supportEmail}.</p>}
        {order && <OrderView order={order} />}
        <p style={{ fontSize: '12px', color: 'var(--muted2)', marginTop: '20px' }}>Questions? <Link to="/contact" style={{ textDecoration: 'underline' }}>Contact us</Link> and quote your order number.</p>
      </div>
    </main>
  );
}
