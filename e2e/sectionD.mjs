// Browser checks for Section D: dashboard, price/stock editing, CSV, invoices, refunds UI, offers consent, unsubscribe.
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');

const ADMIN = 'admin-token-0123456789abcdefghij';
const env = { ...process.env, PORT: '8797', NODE_ENV: 'development', RAZORPAY_KEY_ID: 'rzp_test_x', RAZORPAY_KEY_SECRET: 'x'.repeat(20), ADMIN_TOKEN: ADMIN, SITE_URL: 'http://localhost:8797' };
const srv = spawn('node', ['scripts/dev-server.mjs'], { env, stdio: 'ignore' });
await new Promise(r => setTimeout(r, 1500));
const B = 'http://localhost:8797';
const results = [];
const ok = (n, c) => { results.push([n, !!c]); console.log(c ? 'PASS' : 'FAIL', n); };
const PIC = '<svg xmlns="http://www.w3.org/2000/svg" width="300" height="400"><rect width="300" height="400" fill="#c9c9d6"/></svg>';
const admin = (body, q = '') => fetch(B + '/api/admin/orders' + q, { method: body ? 'POST' : 'GET', headers: { 'content-type': 'application/json', authorization: 'Bearer ' + ADMIN }, body: body ? JSON.stringify(body) : undefined }).then(r => r.json());
const cust = { name: 'Asha Rao', phone: '9876543210', email: 'asha@example.com', line1: '12 MG Road', city: 'Chennai', state: 'Tamil Nadu', pincode: '600001' };
async function codOrder(extra = {}) {
  const r = await fetch(B + '/api/checkout/create', { method: 'POST', headers: { 'content-type': 'application/json', 'x-forwarded-for': '10.0.0.' + Math.floor(Math.random() * 200) }, body: JSON.stringify({ cart: [{ id: 'own-sample-tee', size: 'M', qty: 1 }], customer: cust, payment: 'cod', ...extra }) });
  const d = await r.json(); if (!d.orderId) throw new Error('order failed ' + JSON.stringify(d)); return d.orderId;
}
let br;
try {
  const marketed = await codOrder({ marketing: true });
  await codOrder();
  br = await chromium.launch();
  const ctx = await br.newContext({ viewport: { width: 1280, height: 1000 } });
  const p = await ctx.newPage();
  const errors = []; p.on('pageerror', e => errors.push(String(e)));
  await p.route(/images\.unsplash\.com/, r => r.fulfill({ contentType: 'image/svg+xml', body: PIC }));

  // checkout shows the optional offers box, unticked
  await p.goto(B + '/'); await p.evaluate(() => localStorage.setItem('shonowear_bag_v2', JSON.stringify([{ id: 'own-sample-tee', size: 'M', qty: 1 }])));
  await p.goto(B + '/checkout'); await p.waitForSelector('form[aria-label="Delivery details"]');
  const box = p.getByLabel(/Email me new drops and offers/);
  ok('checkout: offers box exists and is unticked', await box.count() === 1 && !(await box.isChecked()));

  // admin
  await p.goto(B + '/admin');
  await p.getByLabel('Admin token').fill(ADMIN); await p.getByRole('button', { name: 'Load' }).click();
  await p.getByRole('region', { name: 'Dashboard' }).waitFor({ timeout: 8000 });
  const dash = await p.getByRole('region', { name: 'Dashboard' }).innerText();
  ok('dashboard: orders and revenue shown', /Orders\s*\n?\s*2/.test(dash) && /Revenue/.test(dash));
  ok('dashboard: chart has a text label', await p.getByRole('img', { name: /Daily revenue/ }).count() === 1);

  // edit price + stock in the browser
  const products = p.getByRole('region', { name: 'Products' });
  await products.getByLabel('Price for [SAMPLE] Heavyweight Boxy Tee').first().fill('499');
  await products.getByLabel('Available L for [SAMPLE] Heavyweight Boxy Tee').first().fill('1');
  await products.getByRole('button', { name: 'Save' }).first().click();
  await p.getByText(/Saved \[SAMPLE\] Heavyweight Boxy Tee/).waitFor();
  ok('admin: price and stock saved', true);
  await p.goto(B + '/product/own-sample-tee'); await p.waitForSelector('h1');
  await p.waitForFunction(() => document.body.innerText.includes('499'), null, { timeout: 8000 }).catch(() => {});
  ok('product page shows the edited price', (await p.locator('body').innerText()).includes('₹499'));
  const stock = await (await fetch(B + '/api/stock?ids=own-sample-tee')).json();
  ok('stock endpoint shows edited stock', stock.stock['own-sample-tee'].L === 1);

  // CSV bulk edit: a bad file is refused, a good one applies
  await p.goto(B + '/admin'); await p.getByLabel('Admin token').fill(ADMIN); await p.getByRole('button', { name: 'Load' }).click();
  const prod = p.getByRole('region', { name: 'Products' }); await prod.waitFor();
  await prod.getByText('Bulk edit with a spreadsheet').click();
  await prod.getByLabel('CSV text').fill('id,size,stock,price\nown-sample-tee,XXL,3,\n');
  await prod.getByRole('button', { name: 'Check' }).click();
  await p.getByText(/Line 2/).waitFor();
  ok('csv: bad file refused with the line', true);
  await prod.getByLabel('CSV text').fill('id,size,stock,price\nown-sample-tee,M,6,520\n');
  await prod.getByRole('button', { name: 'Check' }).click();
  await prod.getByRole('button', { name: /Apply 1 product/ }).click();
  await p.getByText('Applied.').waitFor();
  ok('csv: good file applied', (await (await fetch(B + '/api/stock?ids=own-sample-tee')).json()).stock['own-sample-tee'].M === 6);

  // invoice and packing slip open as printable pages
  const [inv] = await Promise.all([ctx.waitForEvent('page'), p.getByRole('button', { name: 'Invoice' }).first().click()]);
  await inv.waitForLoadState();
  ok('invoice opens with a number', /INVOICE/.test(await inv.innerText('body')) && /SW\/\d{4}-\d{2}\/\d{4}/.test(await inv.innerText('body')));
  await inv.close();
  const [slip] = await Promise.all([ctx.waitForEvent('page'), p.getByRole('button', { name: 'Packing slip' }).first().click()]);
  await slip.waitForLoadState();
  ok('packing slip shows cash to collect', /CASH ON DELIVERY/.test(await slip.innerText('body')));
  await slip.close();

  // customers: consent counted, campaign test + unsubscribe flow
  const cu = p.getByRole('region', { name: 'Customers' }); await cu.waitFor();
  ok('customers: one person agreed to offers', /1 agreed to offers/.test(await cu.innerText()));
  const aud = (await admin(null, '?view=customers'));
  ok('customers list has the order', aud.customers.length >= 1);
  // read the unsubscribe token from the API-side record via the account route is not exposed; use the page with a wrong token
  await p.goto(B + '/unsubscribe?e=asha%40example.com&t=wrong');
  await p.getByRole('button', { name: 'Unsubscribe' }).click();
  await p.getByRole('alert').waitFor();
  ok('unsubscribe: wrong token refused', /not valid/.test(await p.getByRole('alert').innerText()));
  await p.goto(B + '/unsubscribe'); ok('unsubscribe: incomplete link explained', await p.getByRole('alert').count() === 1);

  // phone width
  await p.setViewportSize({ width: 390, height: 800 });
  for (const path of ['/admin', '/unsubscribe', '/checkout']) {
    await p.goto(B + path); await p.waitForSelector('h1');
    ok(`phone: no horizontal scroll on ${path}`, await p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1));
  }
  ok('no page errors', errors.length === 0); if (errors.length) console.log(errors);
  void marketed;
} catch (e) { console.log('E2E CRASH', e.message); results.push(['crash', false]); }
finally { await br?.close(); srv.kill(); }
const bad = results.filter(r => !r[1]);
console.log(`${results.length - bad.length}/${results.length} passed`);
process.exit(bad.length ? 1 : 0);
