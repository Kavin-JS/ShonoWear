// Browser checks for Section B: coupons, COD, gift cards, referral, pre-order, flash sale, saved address.
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import crypto from 'node:crypto';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');

const ADMIN = 'admin-token-0123456789abcdefghij';
const env = { ...process.env, PORT: '8793', NODE_ENV: 'development', RAZORPAY_KEY_ID: 'rzp_test_x', RAZORPAY_KEY_SECRET: 'x'.repeat(20), ADMIN_TOKEN: ADMIN };
const srv = spawn('node', ['scripts/dev-server.mjs'], { env, stdio: 'ignore' });
await new Promise(r => setTimeout(r, 1500));
const B = 'http://localhost:8793';
const results = [];
const ok = (n, c) => { results.push([n, !!c]); console.log(c ? 'PASS' : 'FAIL', n); };
const PIC = '<svg xmlns="http://www.w3.org/2000/svg" width="300" height="400"><rect width="300" height="400" fill="#c9c9d6"/></svg>';
const admin = (body) => fetch(B + '/api/admin/orders', { method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer ' + ADMIN }, body: JSON.stringify(body) }).then(r => r.json());
let br;
try {
  br = await chromium.launch();
  const ctx = await br.newContext({ viewport: { width: 1280, height: 900 } });
  const p = await ctx.newPage();
  const errors = [];
  p.on('pageerror', e => errors.push(String(e)));
  await p.route(/images\.unsplash\.com/, r => r.fulfill({ contentType: 'image/svg+xml', body: PIC }));
  const setBag = (lines) => p.evaluate((l) => localStorage.setItem('shonowear_bag_v2', JSON.stringify(l)), lines);
  const fill = async (email = 'b@example.com', phone = '9876543210') => {
    await p.fill('#name', 'Test Buyer'); await p.fill('#phone', phone); await p.fill('#email', email);
    await p.fill('#line1', '12 MG Road'); await p.fill('#city', 'Chennai'); await p.fill('#pincode', '600001');
    await p.selectOption('#state', 'Tamil Nadu');
  };

  // home rail + flash sale visuals
  await p.goto(B + '/'); await p.waitForSelector('h1');
  ok('home: flash sale rail with countdown', await p.getByText('Flash sale').first().isVisible() && await p.getByText(/Ends in/).count() > 0);
  await p.goto(B + '/collection/flash-sale'); await p.waitForSelector('h1');
  ok('collection: flash sale lists the cap', await p.locator('a[href="/product/own-sample-cap"]').count() > 0);
  await p.goto(B + '/product/own-sample-cap'); await p.waitForSelector('h1');
  ok('product: sale banner shown', await p.getByText(/Flash sale|SALE|Sample flash sale/i).count() > 0);

  // pre-order
  await p.goto(B + '/product/own-sample-hoodie'); await p.waitForSelector('h1');
  ok('pre-order: note with ship date', await p.getByRole('note').filter({ hasText: 'Pre-order' }).count() > 0);

  // checkout: promo + COD
  await p.goto(B + '/'); await setBag([{ id: 'own-sample-tee', size: 'M', qty: 2 }]);
  await p.goto(B + '/checkout'); await p.waitForSelector('form[aria-label="Delivery details"]');
  await fill();
  await p.fill('#promo', 'WELCOME10'); await p.locator('form:has(#promo) button[type=submit]').click();
  await p.getByRole('button', { name: 'Remove' }).first().waitFor({ timeout: 5000 }).catch(() => {});
  await p.waitForTimeout(1200);
  const summary = await p.locator('aside[aria-label="Order summary"]').innerText();
  console.log(summary.replace(/\n+/g, ' | '));
  ok('promo: applied (Remove button) and discount row', await p.getByRole('button', { name: 'Remove' }).count() > 0 && /−|-\s?₹\d+/.test(summary));
  const cod = p.getByRole('radio', { name: /Cash on delivery/i });
  ok('cod: option offered', await cod.count() === 1);
  await cod.check();
  await p.getByText('Cash on delivery fee').waitFor({ timeout: 5000 }).catch(() => {});
  ok('cod: fee shown', /Cash on delivery fee/.test(await p.locator('aside[aria-label="Order summary"]').innerText()));
  await p.getByRole('button', { name: /Place order|^Pay/i }).click();
  await p.waitForURL(/\/order\//, { timeout: 8000 });
  await p.waitForSelector('text=THANK YOU', { timeout: 8000 });
  ok('cod: order placed without payment', await p.getByText(/cash on delivery/i).count() > 0);
  ok('cod: bag cleared', await p.evaluate(() => !(localStorage.getItem('shonowear_bag_v2') || '').includes('own-sample-tee')));
  ok('referral: share code shown', await p.getByText(/SWF-[A-Z0-9]{6}/).count() > 0);

  // saved address persisted on device only
  const saved = await p.evaluate(() => Object.keys(localStorage).filter(k => /addr/i.test(k)).map(k => localStorage.getItem(k)).join(''));
  ok('saved address kept in localStorage', saved.includes('12 MG Road'));

  // gift card only flow
  const issued = await admin({ action: 'issue-giftcard', amount: 3000, note: 'e2e' });
  const code = issued.code || issued.card?.code;
  ok('admin: issued gift card', /^SW-/.test(code || ''));
  await p.goto(B + '/'); await setBag([{ id: 'own-sample-tee', size: 'M', qty: 1 }]);
  await p.goto(B + '/checkout'); await p.waitForSelector('form[aria-label="Delivery details"]');
  await fill('g@example.com', '9876500001');
  await p.fill('#gift', code); await p.locator('form:has(#gift) button[type=submit]').click();
  await p.waitForSelector('text=/gift card|Gift card/i');
  await p.getByRole('button', { name: /Place order|Pay|Confirm/i }).last().click();
  await p.waitForURL(/\/order\//, { timeout: 8000 });
  await p.waitForSelector('text=THANK YOU', { timeout: 8000 });
  ok('gift card: covers whole order, no Razorpay', await p.getByText(/Payment received|gift card/i).count() > 0);

  // gift card purchase page
  await p.goto(B + '/gift-cards'); await p.waitForSelector('form[aria-label="Buy a gift card"]');
  ok('gift cards page: amounts offered', await p.locator('[role=radiogroup][aria-label="Amount"] button, [role=radiogroup][aria-label="Amount"] label').count() >= 3);

  // policy text
  await p.goto(B + '/policies/shipping'); await p.waitForSelector('h1'); ok('policy: COD and pre-order text', (await p.content()).includes('Cash on delivery') && (await p.content()).includes('Pre-orders'));

  // phone width, no horizontal overflow
  await p.setViewportSize({ width: 390, height: 800 });
  for (const path of ['/', '/checkout', '/gift-cards', '/collection/flash-sale', '/product/own-sample-hoodie']) {
    await p.goto(B + path); await p.waitForSelector('h1,h2');
    ok(`phone: no horizontal scroll on ${path}`, await p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1));
  }
  ok('no page errors', errors.length === 0);
  if (errors.length) console.log(errors);
} catch (e) { console.log('E2E CRASH', e.message); results.push(['crash', false]); }
finally { await br?.close(); srv.kill(); }
const bad = results.filter(r => !r[1]);
console.log(`${results.length - bad.length}/${results.length} passed`);
process.exit(bad.length ? 1 : 0);
