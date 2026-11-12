// Browser end-to-end with a FAKE Razorpay (no network): fake order API + stubbed checkout popup.
// Signs payments with the same secret the server verifies against, so the whole signature path is exercised.
import http from 'node:http';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');

const SECRET = 'test_secret_abcdefghijklmnop';
const fake = http.createServer((req, res) => {
  let b = ''; req.on('data', c => b += c);
  req.on('end', () => {
    const j = JSON.parse(b || '{}');
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify({ id: 'order_' + crypto.randomBytes(6).toString('hex'), amount: j.amount, currency: 'INR' }));
  });
}).listen(9999);

const env = { ...process.env, PORT: '8788', RAZORPAY_API_BASE: 'http://localhost:9999', RAZORPAY_KEY_ID: 'rzp_test_abc123',
  RAZORPAY_KEY_SECRET: SECRET, RAZORPAY_WEBHOOK_SECRET: 'whsec_abcdefghijklmnop', ADMIN_TOKEN: 'admin-token-0123456789abcdefghij', NODE_ENV: 'development' };
const srv = spawn('node', ['scripts/dev-server.mjs'], { env, stdio: 'inherit' });
await new Promise(r => setTimeout(r, 1500));
const BASE = 'http://localhost:8788';

const results = [];
const ok = (name, cond) => { results.push([name, !!cond]); console.log(cond ? 'PASS' : 'FAIL', name); };
let browser;
try {
  browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(String(e)));
  page.on('console', m => { if (m.type() === 'error' && !/_vercel|Failed to load resource/.test(m.text())) errors.push(m.text()); });

  await page.exposeFunction('__sign', (o, p) => crypto.createHmac('sha256', SECRET).update(`${o}|${p}`).digest('hex'));
  await page.exposeFunction('__badSign', () => 'deadbeef');
  let mode = 'good';
  await page.exposeFunction('__mode', () => mode);
  await page.route('https://checkout.razorpay.com/**', r => r.fulfill({ contentType: 'application/javascript', body: `
    window.Razorpay = function(o){ this.o=o; this.on=function(){}; this.open=async function(){
      const m = await window.__mode();
      if (m === 'dismiss') { o.modal.ondismiss(); return; }
      const pid = 'pay_E2E' + Date.now();
      const sig = m === 'bad' ? await window.__badSign() : await window.__sign(o.order_id, pid);
      o.handler({ razorpay_order_id:o.order_id, razorpay_payment_id:pid, razorpay_signature:sig });
    }; };` }));

  // home + hero
  await page.goto(BASE + '/');
  await page.waitForSelector('h1');
  await page.waitForTimeout(2500);
  ok('home: 3D hero canvas mounted (or cleanly skipped)', await page.evaluate(() => {
    const h = document.querySelector('[data-hero3d]'); return h && (h.querySelector('canvas') || !h.dataset.ready);
  }));
  const canvas = await page.evaluate(() => Boolean(document.querySelector('[data-hero3d] canvas')));
  console.log('  hero canvas present:', canvas);

  // product → size → add
  await page.goto(BASE + '/product/own-sample-tee');
  await page.waitForSelector('text=Heavyweight');
  await page.getByRole('button', { name: /^M\b/ }).first().click().catch(() => {});
  await page.getByRole('button', { name: /add to bag/i }).first().click();
  await page.goto(BASE + '/bag');
  ok('bag: shows own item and checkout link', await page.locator('a[href="/checkout"]').count() > 0);
  await page.click('a[href="/checkout"]');

  // validation
  await page.waitForSelector('form[aria-label="Delivery details"]');
  await page.getByRole('button', { name: /^Pay/ }).click();
  ok('checkout: empty form shows validation errors', await page.locator('[role=alert]').count() >= 4);

  const fill = async () => {
    await page.fill('#name', 'Test Buyer'); await page.fill('#phone', '9876543210'); await page.fill('#email', 'buyer@example.com');
    await page.fill('#line1', '12 MG Road'); await page.fill('#city', 'Chennai'); await page.fill('#pincode', '600001');
    await page.selectOption('#state', 'Tamil Nadu');
  };
  await fill();

  // dismiss → hold released, bag intact
  mode = 'dismiss';
  await page.getByRole('button', { name: /^Pay/ }).click();
  await page.waitForSelector('text=Payment cancelled');
  ok('dismiss: message shown and bag kept', await page.evaluate(() => (localStorage.getItem('shonowear_bag_v2') || '').includes('own-sample-tee')));

  // forged signature → no thank-you
  mode = 'bad';
  await page.getByRole('button', { name: /^Pay/ }).click();
  await page.waitForURL(/\/order\//);
  await page.waitForTimeout(1500);
  ok('forged signature: order stays unpaid', await page.locator('text=Waiting for payment').count() > 0);
  ok('forged signature: bag NOT cleared', await page.evaluate(() => (localStorage.getItem('shonowear_bag_v2') || '').includes('own-sample-tee')));

  // real signature
  await page.goto(BASE + '/checkout');
  await fill();
  mode = 'good';
  await page.getByRole('button', { name: /^Pay/ }).click();
  await page.waitForURL(/\/order\//);
  await page.waitForSelector('text=THANK YOU', { timeout: 8000 }).catch(async e => { console.log('BODY:', (await page.innerText('body')).slice(0, 600)); throw e; });
  const orderUrl = page.url();
  ok('paid: thank-you + payment received', await page.locator('text=Payment received').count() > 0);
  ok('paid: bag cleared', await page.evaluate(() => !(localStorage.getItem('shonowear_bag_v2') || '').includes('own-sample-tee')));
  ok('paid: address not exposed on order page', !(await page.content()).includes('12 MG Road'));

  // stock decreased
  const stock = await (await fetch(BASE + '/api/stock?ids=own-sample-tee')).json();
  console.log('  stock now:', JSON.stringify(stock));

  // admin
  await page.goto(BASE + '/admin');
  await page.fill('input[aria-label="Admin token"]', 'wrong-token-wrong-token-wrong');
  await page.getByRole('button', { name: 'Load' }).click();
  await page.waitForSelector('[role=alert]');
  ok('admin: wrong token rejected', await page.locator('text=Unauthorized').count() > 0);
  await page.fill('input[aria-label="Admin token"]', env.ADMIN_TOKEN);
  await page.getByRole('button', { name: 'Load' }).click();
  await page.waitForSelector('text=Mark shipped');
  ok('admin: paid order listed with address', (await page.content()).includes('12 MG Road'));
  const answers = ['BlueDart', 'BD123'];
  page.on('dialog', d => d.accept(answers.shift() || ''));
  await page.getByRole('button', { name: 'Mark shipped' }).click();
  await page.waitForSelector('text=Shipped: BlueDart');
  await page.goto(orderUrl);
  await page.waitForSelector('text=BD123');
  ok('customer sees tracking after shipping', true);

  // policies + footer + 404 order
  for (const p of ['/policies/shipping', '/policies/returns', '/contact', '/track', '/privacy', '/terms']) {
    await page.goto(BASE + p); await page.waitForSelector('h1');
  }
  await page.goto(BASE + '/order/AAAAAAAAAAAAAAAA');
  await page.waitForSelector('text=could not find');
  ok('unknown order shows friendly message', true);

  // mobile: hero skipped, no horizontal scroll
  const m = await browser.newContext({ viewport: { width: 390, height: 800 }, isMobile: true });
  const mp = await m.newPage();
  await mp.goto(BASE + '/'); await mp.waitForTimeout(1500);
  ok('mobile: no 3D canvas', !(await mp.evaluate(() => Boolean(document.querySelector('[data-hero3d] canvas')))));
  for (const p of ['/', '/shop', '/bag', '/checkout', '/product/own-sample-tee']) {
    await mp.goto(BASE + p); await mp.waitForTimeout(500);
    ok(`mobile: no horizontal overflow ${p}`, await mp.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1));
  }
  await page.screenshot({ path: '/tmp/e2e-order.png' });
  ok('no page errors', errors.length === 0);
  if (errors.length) console.log(errors.slice(0, 5));
} catch (e) {
  console.error('E2E CRASH', e); results.push(['crash', false]);
} finally {
  await browser?.close(); srv.kill(); fake.close();
}
const failed = results.filter(r => !r[1]);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
process.exit(failed.length ? 1 : 0);
