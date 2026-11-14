// Browser checks for Section C: sign-in, My orders, reviews, Q&A, returns, courier link.
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');

const ADMIN = 'admin-token-0123456789abcdefghij';
const env = { ...process.env, PORT: '8795', NODE_ENV: 'development', RAZORPAY_KEY_ID: 'rzp_test_x', RAZORPAY_KEY_SECRET: 'x'.repeat(20), ADMIN_TOKEN: ADMIN };
const srv = spawn('node', ['scripts/dev-server.mjs'], { env, stdio: 'ignore' });
await new Promise(r => setTimeout(r, 1500));
const B = 'http://localhost:8795';
const results = [];
const ok = (n, c) => { results.push([n, !!c]); console.log(c ? 'PASS' : 'FAIL', n); };
const PIC = '<svg xmlns="http://www.w3.org/2000/svg" width="300" height="400"><rect width="300" height="400" fill="#c9c9d6"/></svg>';
const admin = (body, q = '') => fetch(B + '/api/admin/orders' + q, { method: body ? 'POST' : 'GET', headers: { 'content-type': 'application/json', authorization: 'Bearer ' + ADMIN }, body: body ? JSON.stringify(body) : undefined }).then(r => r.json());
const cust = { name: 'Asha Rao', phone: '9876543210', email: 'asha@example.com', line1: '12 MG Road', city: 'Chennai', state: 'Tamil Nadu', pincode: '600001' };
async function codOrder(size = 'M', phone = cust.phone) {
  const r = await fetch(B + '/api/checkout/create', { method: 'POST', headers: { 'content-type': 'application/json', 'x-forwarded-for': '10.0.0.' + Math.floor(Math.random() * 200) }, body: JSON.stringify({ cart: [{ id: 'own-sample-tee', size, qty: 1 }], customer: { ...cust, phone }, payment: 'cod' }) });
  const d = await r.json(); if (!d.orderId) throw new Error('order failed ' + JSON.stringify(d)); return d.orderId;
}
let br;
try {
  const delivered = await codOrder('M');
  await admin({ id: delivered, action: 'delivered' });
  const shipped = await codOrder('L', '9876500002');
  await admin({ id: shipped, action: 'shipped', courier: 'Delhivery', tracking: 'DL12345678' });

  br = await chromium.launch();
  const ctx = await br.newContext({ viewport: { width: 1280, height: 900 } });
  const p = await ctx.newPage();
  const errors = []; p.on('pageerror', e => errors.push(String(e)));
  await p.route(/images\.unsplash\.com/, r => r.fulfill({ contentType: 'image/svg+xml', body: PIC }));

  // courier link on the order page
  await p.goto(B + '/order/' + shipped); await p.waitForSelector('text=Delhivery');
  ok('order page: courier tracking link', await p.locator('a[href*="delhivery.com/track/package/DL12345678"]').count() === 1);

  // sign in
  await p.goto(B + '/account'); await p.waitForSelector('form[aria-label="Sign in"]');
  await p.getByLabel(/Your email/).fill('asha@example.com');
  await p.getByRole('button', { name: /Email me a link/ }).click();
  await p.getByText('Check your email').waitFor();
  ok('sign-in: confirmation shown, no account hint', await p.getByText(/If that address can receive email/).count() === 1);
  await p.getByRole('link', { name: /Local test mode/ }).click();
  await p.getByText('Signed in as asha@example.com').waitFor({ timeout: 8000 });
  ok('sign-in: link signs me in and token leaves the URL', !p.url().includes('token='));
  await p.locator('article[aria-label^="Order "]').first().waitFor();
  ok('my orders: both orders listed', await p.locator('article[aria-label^="Order "]').count() === 2);
  ok('my orders: no phone or street shown', !(await p.content()).includes('9876543210') && !(await p.content()).includes('MG Road'));
  const cookies = await ctx.cookies();
  ok('session cookie is HttpOnly', cookies.some(c => c.name === 'sw_sid' && c.httpOnly));
  ok('session not readable from JS', !(await p.evaluate(() => document.cookie)).includes('sw_sid'));
  await p.reload(); await p.getByText('Signed in as asha@example.com').waitFor();
  ok('session survives reload', true);

  // review
  await p.getByRole('button', { name: 'Write a review' }).first().click();
  await p.getByRole('radio', { name: '4 stars' }).click();
  await p.getByLabel('Your review').fill('Heavy fabric and the fit is true to size.');
  await p.getByRole('button', { name: 'Send review' }).click();
  await p.getByText(/will appear after we check/).waitFor();
  ok('review: submitted, waiting for approval', true);
  await p.goto(B + '/product/own-sample-tee'); await p.waitForSelector('h1');
  ok('review: hidden before approval', await p.getByText('Heavy fabric and the fit').count() === 0);
  const pending = (await admin(null, '?view=reviews')).reviews;
  await admin({ action: 'review-moderate', productId: 'own-sample-tee', key: pending[0].key, decision: 'approved' });
  await p.reload(); await p.getByText('Heavy fabric and the fit').waitFor();
  ok('review: shown with verified-buyer label and average', await p.getByText(/Verified buyer/).count() > 0 && await p.getByText('4', { exact: true }).count() > 0);

  // question
  await p.getByLabel('Ask about fit, fabric or care').fill('Does it shrink in a warm wash?');
  await p.getByRole('button', { name: 'Ask', exact: true }).click();
  await p.getByText(/We will answer it here soon/).waitFor();
  const qs = (await admin(null, '?view=reviews')).questions;
  await admin({ action: 'qa-answer', productId: 'own-sample-tee', qid: qs[0].id, answer: 'Wash cold and it stays true to size.' });
  await p.reload(); await p.getByText(/Wash cold and it stays/).waitFor();
  ok('Q&A: answered question is public', true);

  // return request
  await p.goto(B + '/account'); await p.getByText('Signed in as asha@example.com').waitFor();
  const card = p.locator('article[aria-label^="Order "]', { hasText: 'Delivered' });
  await card.getByRole('button', { name: /Return or exchange/ }).click();
  await p.getByRole('button', { name: 'Send request' }).click();
  ok('return: validation asks for items', await p.getByText(/Choose the item/).count() === 1);
  await p.getByRole('checkbox').first().check();
  await p.getByLabel('Reason').selectOption('Does not fit');
  await p.getByRole('button', { name: 'Send request' }).click();
  await p.getByText(/Request sent/).waitFor();
  ok('return: request sent', true);
  const rets = (await admin(null, '?view=returns')).returns;
  ok('admin sees the return with a suggested refund', rets.length === 1 && rets[0].suggestedRefund > 0);
  await admin({ action: 'return-update', rid: rets[0].id, status: 'approved', note: 'Please ship it back' });
  await p.reload(); await p.getByText('Signed in as asha@example.com').waitFor();
  await p.getByText(/Approved: send it back/).first().waitFor({ timeout: 8000 }).catch(() => {});
  ok('return: status and note visible to customer', await p.getByText(/Approved: send it back/).count() > 0 && await p.getByText(/Please ship it back/).count() > 0);

  // sign out
  await p.getByRole('button', { name: 'Sign out' }).click();
  await p.waitForSelector('form[aria-label="Sign in"]');
  ok('sign out returns to the sign-in form', true);

  // phone width
  await p.setViewportSize({ width: 390, height: 800 });
  for (const path of ['/account', '/product/own-sample-tee']) {
    await p.goto(B + path); await p.waitForSelector('h1');
    ok(`phone: no horizontal scroll on ${path}`, await p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1));
  }
  ok('no page errors', errors.length === 0); if (errors.length) console.log(errors);
} catch (e) { console.log('E2E CRASH', e.message); results.push(['crash', false]); }
finally { await br?.close(); srv.kill(); }
const bad = results.filter(r => !r[1]);
console.log(`${results.length - bad.length}/${results.length} passed`);
process.exit(bad.length ? 1 : 0);
