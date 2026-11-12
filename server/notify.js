/**
 * SHONOWEAR — server/notify.js
 * Order emails through Resend (optional). Missing config just skips sending:
 * a failed email must never fail or delay an order.
 * Env: RESEND_API_KEY, ORDER_FROM_EMAIL (a sender on a domain verified in Resend), ORDER_NOTIFY_EMAIL (you)
 */
import { STORE } from '../src/data/storeConfig.js';
import { log } from './guard.js';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const inr = (n) => `₹${Number(n).toLocaleString('en-IN')}`;

function itemsHtml(o) {
  return o.items.map(i => `<li>${esc(i.name)} (${esc(i.size)}) × ${i.qty} — ${inr(i.price * i.qty)}</li>`).join('');
}

export const emailConfigured = () => Boolean(process.env.RESEND_API_KEY && process.env.ORDER_FROM_EMAIL);

async function send({ to, subject, html }) {
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: process.env.ORDER_FROM_EMAIL, to, subject, html }),
    signal: AbortSignal.timeout(5000),
  });
  if (!res.ok) throw new Error(`Resend ${res.status}`);
}

export async function sendOrderEmails(o) {
  if (!process.env.RESEND_API_KEY || !process.env.ORDER_FROM_EMAIL) { log('order_email_skipped'); return; }
  const c = o.customer;
  const customerHtml = `
    <h2>Thanks for your order, ${esc(c.name)}!</h2>
    <p>Order <strong>${esc(o.number)}</strong> is confirmed. Estimated delivery: ${esc(STORE.deliveryEstimate)}.</p>
    <ul>${itemsHtml(o)}</ul>
    <p>Subtotal ${inr(o.totals.subtotal)}${o.totals.discount ? ` · Bundle discount −${inr(o.totals.discount)}` : ''} · Shipping ${inr(o.totals.shipping)} · <strong>Total ${inr(o.totals.total)}</strong></p>
    <p>Shipping to: ${esc(c.line1)}${c.line2 ? ', ' + esc(c.line2) : ''}, ${esc(c.city)}, ${esc(c.state)} ${esc(c.pincode)}</p>
    ${process.env.SITE_URL ? `<p><a href="${esc(process.env.SITE_URL.replace(/\/+$/, ''))}/order/${esc(o.id)}">Track your order</a></p>` : ''}
    <p>Questions? Write to ${esc(STORE.supportEmail)}.</p>`;
  const jobs = [send({ to: c.email, subject: `Order ${o.number} confirmed`, html: customerHtml })];

  if (process.env.ORDER_NOTIFY_EMAIL) {
    const ownerHtml = `
      <h2>New paid order ${esc(o.number)} — ${inr(o.totals.total)}</h2>
      ${o.flags?.length ? `<p><strong>Needs attention:</strong> ${esc(o.flags.join(', '))}</p>` : ''}
      <ul>${itemsHtml(o)}</ul>
      <p>${esc(c.name)} · ${esc(c.phone)} · ${esc(c.email)}<br>
      ${esc(c.line1)}${c.line2 ? ', ' + esc(c.line2) : ''}, ${esc(c.city)}, ${esc(c.state)} ${esc(c.pincode)}</p>`;
    jobs.push(send({ to: process.env.ORDER_NOTIFY_EMAIL, subject: `New order ${o.number} (${inr(o.totals.total)})`, html: ownerHtml }));
  }
  await Promise.allSettled(jobs);
}

export async function sendBackInStock({ to, productName, size, url }) {
  if (!emailConfigured()) throw new Error('email not configured');
  await send({ to, subject: `Back in stock: ${productName} (${size})`, html: `
    <h2>Good news: it's back</h2>
    <p>${esc(productName)} in size <strong>${esc(size)}</strong> is available again. Stock is limited, so it may sell out again.</p>
    ${url ? `<p><a href="${esc(url)}">Shop it now</a></p>` : ''}
    <p style="color:#666;font-size:12px">You asked us to tell you once. We won't email you about this item again.</p>` });
}

export async function sendLowStockAlert(rows) {
  if (!emailConfigured() || !process.env.ORDER_NOTIFY_EMAIL || !rows.length) return;
  await send({ to: process.env.ORDER_NOTIFY_EMAIL, subject: `Low stock: ${rows.map(r => `${r.name} ${r.size}`).join(', ').slice(0, 80)}`, html: `
    <h2>Running low</h2><ul>${rows.map(r => `<li>${esc(r.name)} · size ${esc(r.size)}: <strong>${r.left}</strong> left</li>`).join('')}</ul>
    <p>Update the stock in <code>catalog.js</code> and redeploy when you restock.</p>` });
}
