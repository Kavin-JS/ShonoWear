import { Link } from 'react-router-dom';
import { STORE } from '../data/storeConfig.js';

const wrap = (title, children) => (
  <main id="main" className="page" style={{ paddingTop: '100px' }}>
    <div className="container" style={{ maxWidth: '720px', fontSize: '14px', color: 'var(--muted)', lineHeight: 1.8 }}>
      <Link to="/" style={{ fontSize: '12px' }}>← Back to Home</Link>
      <h1 style={{ fontSize: 'clamp(40px, 7vw, 64px)', color: 'var(--text)', margin: '16px 0 24px' }}>{title}</h1>
      {children}
    </div>
  </main>
);
const H = ({ children }) => <h2 style={{ fontFamily: 'Poppins, sans-serif', fontSize: '16px', fontWeight: 600, color: 'var(--text)', margin: '28px 0 8px' }}>{children}</h2>;

export function Shipping() {
  return wrap('SHIPPING', <>
    <p>Items marked “Ships from us” are sold and shipped by {STORE.legalName}. Items marked Amazon or Myntra are sold and shipped by those stores under their policies.</p>
    <H>Delivery time</H><p>Orders are dispatched and delivered within {STORE.deliveryEstimate} across India. Remote pincodes may take longer.</p>
    <H>Shipping fee</H><p>Orders of ₹{STORE.freeShippingOver} or more ship free. Below that, shipping is ₹{STORE.shippingFee}.</p>
    <H>Tracking</H><p>When your order ships, the courier and tracking number appear on your order page and in an email.</p>
    <H>Payment and stock</H><p>Stock is held for {STORE.holdMinutes} minutes while you pay. If payment is not completed, the items are released. If an item turns out to be unavailable after you paid, we will refund you in full.</p>
  </>);
}
export function Returns() {
  return wrap('RETURNS & REFUNDS', <>
    <p>Applies to items we ship. Partner-store items follow Amazon's or Myntra's policy.</p>
    <H>Returns</H><p>You may request a return within {STORE.returnDays} days of delivery if the item is unused, unwashed, with tags and original packaging. Email {STORE.supportEmail} with your order number and the reason.</p>
    <H>Refunds</H><p>Approved refunds go back to the original payment method, normally within 5–7 business days of us receiving the item. Banks may take longer to show it.</p>
    <H>Damaged or wrong item</H><p>Tell us within 48 hours of delivery with photos and we'll replace it or refund you, including shipping.</p>
  </>);
}
export function Contact() {
  return wrap('CONTACT', <>
    <p><strong style={{ color: 'var(--text)' }}>{STORE.legalName}</strong><br />{STORE.address}</p>
    <p>Email: <a href={`mailto:${STORE.supportEmail}`} style={{ textDecoration: 'underline' }}>{STORE.supportEmail}</a>{STORE.supportPhone ? <><br />Phone: {STORE.supportPhone}</> : null}</p>
    {STORE.gstin && <p>GSTIN: {STORE.gstin}</p>}
    <p>We reply within 2 business days. Please include your order number.</p>
  </>);
}
