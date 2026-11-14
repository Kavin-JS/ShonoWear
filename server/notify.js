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
  return o.items.map(i => `<li>${esc(i.name)} (${esc(i.size)}) × ${i.qty} — ${inr(i.price * i.qty)}${i.preorder ? ` <em>(pre-order, ships by ${esc(i.preorder)})</em>` : ''}</li>`).join('');
}

function totalsHtml(o) {
  const t = o.totals, cod = o.payment?.method === 'cod';
  const parts = [`Subtotal ${inr(t.subtotal)}`];
  if (t.bundleDiscount) parts.push(`Bundle discount −${inr(t.bundleDiscount)}`);
  else if (t.discount && !t.couponDiscount) parts.push(`Discount −${inr(t.discount)}`);
  if (t.couponDiscount) parts.push(`${esc(o.promo?.code || 'Code')} −${inr(t.couponDiscount)}`);
  parts.push(`Shipping ${t.shipping ? inr(t.shipping) : 'free'}`);
  if (t.codFee) parts.push(`Cash on delivery fee ${inr(t.codFee)}`);
  if (t.giftApplied) parts.push(`Gift card −${inr(t.giftApplied)}`);
  return `<p>${parts.join(' · ')} · <strong>${cod ? 'Pay on delivery' : 'Total'} ${inr(t.total)}</strong></p>`;
}

export const emailConfigured = () => Boolean(process.env.RESEND_API_KEY && process.env.ORDER_FROM_EMAIL);

async function send({ to, subject, html, attachments }) {
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: process.env.ORDER_FROM_EMAIL, to, subject, html, ...(attachments ? { attachments } : {}) }),
    signal: AbortSignal.timeout(5000),
  });
  if (!res.ok) throw new Error(`Resend ${res.status}`);
}

export async function sendOrderEmails(o) {
  if (!process.env.RESEND_API_KEY || !process.env.ORDER_FROM_EMAIL) { log('order_email_skipped'); return; }
  const c = o.customer;
  const customerHtml = `
    <h2>Thanks for your order, ${esc(c.name)}!</h2>
    <p>Order <strong>${esc(o.number)}</strong> is confirmed. ${o.shipsBy ? `Part of it is a pre-order: it ships by ${esc(o.shipsBy)}.` : `Estimated delivery: ${esc(STORE.deliveryEstimate)}.`}</p>
    <ul>${itemsHtml(o)}</ul>
    ${totalsHtml(o)}
    ${o.payment?.method === 'cod' ? `<p><strong>Please keep ${inr(o.totals.total)} ready in cash for the courier.</strong> We may call you to confirm this order before we ship it.</p>` : ''}
    <p>Shipping to: ${esc(c.line1)}${c.line2 ? ', ' + esc(c.line2) : ''}, ${esc(c.city)}, ${esc(c.state)} ${esc(c.pincode)}</p>
    ${process.env.SITE_URL ? `<p><a href="${esc(process.env.SITE_URL.replace(/\/+$/, ''))}/order/${esc(o.id)}">Track your order</a></p>` : ''}
    ${o.referralCode ? `<p>Share your code <strong>${esc(o.referralCode)}</strong>: a friend gets ${inr(STORE.referral.friendOff)} off a first order over ${inr(STORE.referral.minSubtotal)}, and you get ${inr(STORE.referral.referrerReward)} store credit once their order is delivered.</p>` : ''}
    <p>Questions? Write to ${esc(STORE.supportEmail)}.</p>`;
  const jobs = [send({ to: c.email, subject: `Order ${o.number} confirmed`, html: customerHtml })];

  if (process.env.ORDER_NOTIFY_EMAIL) {
    const ownerHtml = `
      <h2>New ${o.payment?.method === 'cod' ? 'COD order (collect ' + inr(o.totals.total) + ' on delivery)' : 'paid order'} ${esc(o.number)} — ${inr(o.totals.total)}</h2>
      ${o.flags?.length ? `<p><strong>Needs attention:</strong> ${esc(o.flags.join(', '))}</p>` : ''}
      <ul>${itemsHtml(o)}</ul>
      <p>${esc(c.name)} · ${esc(c.phone)} · ${esc(c.email)}<br>
      ${esc(c.line1)}${c.line2 ? ', ' + esc(c.line2) : ''}, ${esc(c.city)}, ${esc(c.state)} ${esc(c.pincode)}</p>`;
    jobs.push(send({ to: process.env.ORDER_NOTIFY_EMAIL, subject: `New order ${o.number} (${inr(o.totals.total)})`, html: ownerHtml }));
  }
  await Promise.allSettled(jobs);
}

export async function sendGiftCardEmail({ to, from, amount, code, expiresAt, message, url }) {
  if (!emailConfigured()) throw new Error('email not configured');
  await send({ to, subject: `Your ${inr(amount)} ${STORE.name} gift card`, html: `
    <h2>${from ? `${esc(from)} sent you a gift card` : 'Your gift card'}</h2>
    ${message ? `<blockquote>${esc(message)}</blockquote>` : ''}
    <p>Value: <strong>${inr(amount)}</strong></p>
    <p style="font-size:22px;letter-spacing:2px"><strong>${esc(code)}</strong></p>
    <p>Enter this code in your bag or at checkout on ${esc(STORE.name)}. It is valid until ${esc(String(expiresAt).slice(0, 10))} and works on this website only.</p>
    ${url ? `<p><a href="${esc(url)}">Start shopping</a></p>` : ''}` });
}

export async function sendGiftReceipt({ to, name, amount, number, recipient }) {
  if (!emailConfigured()) throw new Error('email not configured');
  await send({ to, subject: `Receipt for ${number}`, html: `
    <h2>Thanks, ${esc(name)}</h2>
    <p>You bought a ${inr(amount)} ${esc(STORE.name)} gift card (order ${esc(number)}). We emailed the code to ${esc(recipient)}.</p>
    <p>Questions? Write to ${esc(STORE.supportEmail)}.</p>` });
}

export async function sendReferralReward({ to, amount, code, expiresAt }) {
  if (!emailConfigured()) throw new Error('email not configured');
  await send({ to, subject: `You earned ${inr(amount)} store credit`, html: `
    <h2>A friend's first order arrived</h2>
    <p>Thanks for sharing ${esc(STORE.name)}. Here is ${inr(amount)} store credit:</p>
    <p style="font-size:22px;letter-spacing:2px"><strong>${esc(code)}</strong></p>
    <p>Use it in your bag or at checkout. Valid until ${esc(String(expiresAt).slice(0, 10))}.</p>` });
}

export async function sendBagReminder({ to, items, url }) {
  if (!emailConfigured()) throw new Error('email not configured');
  await send({ to, subject: `You left something in your ${STORE.name} bag`, html: `
    <h2>Still thinking it over?</h2>
    <ul>${items.map(i => `<li>${esc(i.name)} (${esc(i.size)}) × ${i.qty} — ${inr(i.price * i.qty)}</li>`).join('')}</ul>
    <p>Stock is limited and is only held while you check out.</p>
    ${url ? `<p><a href="${esc(url)}">Open my bag</a></p>` : ''}
    <p style="color:#666;font-size:12px">You asked for this reminder at checkout. It is the only one we send and we have deleted your saved bag.</p>` });
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

/* ── Section C: accounts, shipping updates, returns ── */
const site = () => (process.env.SITE_URL || '').replace(/\/+$/, '');

export async function sendLoginEmail({ to, token }) {
  if (!emailConfigured()) throw new Error('email not configured');
  const link = `${site()}/account?token=${encodeURIComponent(token)}`;
  await send({ to, subject: `Your ${STORE.name} sign-in link`, html: `
    <h2>Sign in to ${esc(STORE.name)}</h2>
    <p><a href="${esc(link)}" style="font-size:16px">Sign in</a></p>
    <p>This link works once and expires in ${STORE.accounts?.loginMinutes || 15} minutes. If you did not ask for it, ignore this email: nobody can sign in without it.</p>` });
}

export async function sendShippedEmail(o, trackLink) {
  if (!emailConfigured() || !o.customer?.email) return;
  const s = o.shipment || {};
  await send({ to: o.customer.email, subject: `Order ${o.number} has shipped`, html: `
    <h2>Your order is on its way</h2>
    <p>Order <strong>${esc(o.number)}</strong>${s.courier ? ` is with <strong>${esc(s.courier)}</strong>` : ' has shipped'}${s.tracking ? `, tracking number <strong>${esc(s.tracking)}</strong>` : ''}.</p>
    ${trackLink ? `<p><a href="${esc(trackLink)}">Track with the courier</a></p>` : ''}
    ${site() ? `<p><a href="${esc(site())}/order/${esc(o.id)}">View your order</a></p>` : ''}
    ${o.payment?.method === 'cod' ? `<p>Please keep ${inr(o.totals.total)} in cash ready.</p>` : ''}` });
}

export async function sendDeliveredEmail(o) {
  if (!emailConfigured() || !o.customer?.email) return;
  await send({ to: o.customer.email, subject: `Order ${o.number} was delivered`, html: `
    <h2>Delivered</h2>
    <p>We hope you like it. You can ask for a return or exchange within ${STORE.returnDays} days, and leave a review, from your account.</p>
    ${site() ? `<p><a href="${esc(site())}/account">Open your account</a></p>` : ''}
    <p>Anything wrong? Write to ${esc(STORE.supportEmail)}.</p>` });
}

const RET = {
  requested: 'We received your request. We will reply within 2 business days.',
  approved: 'Your request was approved. Please pack the item unused, with tags, and wait for our email on how to send it back.',
  rejected: 'We could not approve this request.',
  received: 'We received the item. We will complete your refund or exchange shortly.',
  refunded: 'Your refund has been sent.',
  exchanged: 'Your exchange has been sent.',
};
export async function sendReturnUpdate(r) {
  if (!emailConfigured() || !r.email) return;
  await send({ to: r.email, subject: `Your ${r.kind} for order ${r.number}: ${r.status}`, html: `
    <h2>${esc(r.kind === 'exchange' ? 'Exchange' : 'Return')} request ${esc(r.status)}</h2>
    <p>${esc(RET[r.status] || '')}</p>
    ${r.adminNote ? `<p>Note from us: ${esc(r.adminNote)}</p>` : ''}
    ${r.status === 'refunded' ? `<p>Amount refunded: ${inr(r.refundAmount)}. Banks can take 5–7 business days to show it.</p>` : ''}
    <p>Questions? Write to ${esc(STORE.supportEmail)}.</p>` });
  if (r.status === 'requested' && process.env.ORDER_NOTIFY_EMAIL) {
    await send({ to: process.env.ORDER_NOTIFY_EMAIL, subject: `New ${r.kind} request for ${r.number}`, html: `<p>${esc(r.name)} asked for a ${esc(r.kind)} (${esc(r.reason)}). Open /admin to handle it.</p>` }).catch(() => {});
  }
}

/** A marketing email: plain text from the owner, escaped, with the unsubscribe link and business address (required for marketing mail). */
export async function sendCampaignEmail({ to, subject, text, unsub }) {
  if (!emailConfigured()) throw new Error('email not configured');
  const paras = String(text).split(/\n{2,}/).map(p => `<p>${esc(p).replace(/\n/g, '<br>')}</p>`).join('');
  await send({ to, subject, html: `${paras}
    <hr><p style="font-size:12px;color:#666">You get this because you chose to hear from ${esc(STORE.name)} when you ordered. ${esc(STORE.legalName)}, ${esc(STORE.address)}.<br>
    <a href="${esc(unsub)}">Unsubscribe</a></p>` });
}

/** Tells the owner something important broke. Only kind + a short, already-cleaned message; no customer data. */
export async function sendAlertEmail({ kind, msg, count }) {
  if (!emailConfigured() || !process.env.ORDER_NOTIFY_EMAIL) return false;
  await send({ to: process.env.ORDER_NOTIFY_EMAIL, subject: `[${STORE.name}] Problem: ${kind}`, html: `<p><strong>${esc(kind)}</strong>${count > 1 ? ` (${count} times today)` : ''}</p><p>${esc(msg || 'No details.')}</p>
    <p style="font-size:12px;color:#666">Open the admin Dashboard, "Recent problems", for the list. You get at most one email per kind per hour.</p>` });
  return true;
}

/** Emails the encrypted backup file. `file` = { name, base64 }. */
export async function sendBackupEmail({ file, summary }) {
  if (!emailConfigured() || !process.env.ORDER_NOTIFY_EMAIL) throw new Error('email not configured');
  await send({ to: process.env.ORDER_NOTIFY_EMAIL, subject: `[${STORE.name}] Daily backup ${summary.date}`, html: `<p>Encrypted backup attached (${esc(String(summary.keys))} records, ${esc(String(summary.orders))} orders).</p>
    <p style="font-size:12px;color:#666">It is encrypted with your BACKUP_PASSPHRASE. Keep a few of these; to restore, run <code>node scripts/restore.mjs</code> (see the README).</p>`, attachments: [{ filename: file.name, content: file.base64 }] });
}
