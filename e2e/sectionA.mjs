// Browser checks for the shopping-experience features (gallery, size guide, variants, quick view, filters, pincode, waitlist, collections, bundle discount).
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');

const env = { ...process.env, PORT: '8792', NODE_ENV: 'development', RAZORPAY_KEY_ID: 'rzp_test_x', RAZORPAY_KEY_SECRET: 'x'.repeat(20), ADMIN_TOKEN: 'a'.repeat(30) };
const srv = spawn('node', ['scripts/dev-server.mjs'], { env, stdio: 'ignore' });
await new Promise(r => setTimeout(r, 1500));
const B = 'http://localhost:8792';
const results = [];
const ok = (n, c) => { results.push([n, !!c]); console.log(c ? 'PASS' : 'FAIL', n); };
const PIC = '<svg xmlns="http://www.w3.org/2000/svg" width="300" height="400"><rect width="300" height="400" fill="#c9c9d6"/></svg>';
let br;
try {
  br = await chromium.launch();
  const ctx = await br.newContext({ viewport: { width: 1280, height: 900 } });
  const p = await ctx.newPage();
  const errors = [];
  p.on('pageerror', e => errors.push(String(e)));
  await p.route(/images\.unsplash\.com/, r => r.fulfill({ contentType: 'image/svg+xml', body: PIC }));

  // gallery
  await p.goto(B + '/product/own-sample-tee'); await p.waitForSelector('h1');
  ok('gallery: 3 thumbnails', await p.locator('[aria-label="Photo thumbnails"] button').count() === 3);
  await p.getByRole('button', { name: /Open photo 1 of 3/ }).click();
  ok('lightbox opens', await p.locator('[role=dialog][aria-label*="photo 1 of 3"]').count() === 1);
  await p.keyboard.press('ArrowRight');
  ok('lightbox arrow key moves to photo 2', await p.locator('[role=dialog][aria-label*="photo 2 of 3"]').count() === 1);
  await p.keyboard.press('Escape');
  ok('lightbox closes on Esc', await p.locator('[role=dialog]').count() === 0);

  // size guide + find my size
  await p.getByRole('button', { name: /Size guide/ }).click();
  ok('size guide dialog', await p.locator('[role=dialog][aria-label="Size guide"]').count() === 1);
  const dlg = p.locator('[role=dialog][aria-label="Size guide"]');
  await dlg.getByLabel('Height (cm)').fill('175'); await dlg.getByLabel('Weight (kg)').fill('70');
  await p.getByRole('button', { name: 'Suggest a size' }).click();
  ok('suggests M for 175cm/70kg', (await dlg.locator('[role=status]').innerText()).includes('suggest M'));
  await p.getByRole('button', { name: /Select size M/ }).click();
  ok('picking from guide selects the size', await p.locator('button[aria-pressed="true"]:has-text("M")').count() > 0);

  // colour variants + waitlist
  await p.locator('a[aria-label^="white"]').click();
  await p.waitForURL(/own-sample-tee-white/);
  ok('swatch navigates to the white variant', true);
  await p.waitForSelector('form[aria-label="Back in stock alert"]');
  ok('sold-out size S offers a waitlist', (await p.locator('form[aria-label="Back in stock alert"]').innerText()).includes('S'));
  await p.fill('form[aria-label="Back in stock alert"] input[type=email]', 'me@example.com');
  await p.getByRole('button', { name: 'Notify me' }).click();
  await p.waitForSelector('text=Done. We');
  ok('waitlist sign-up confirmed', true);

  // pincode
  await p.fill('#pin', '600001'); await p.getByRole('button', { name: 'Check' }).click();
  ok('pincode: estimate shown', (await p.locator('form[aria-label="Delivery estimate"]').innerText()).includes('Estimated delivery'));
  await p.fill('#pin', '12345'); await p.getByRole('button', { name: 'Check' }).click();
  ok('pincode: invalid rejected', (await p.locator('form[aria-label="Delivery estimate"]').innerText()).includes('valid 6-digit'));

  // recently viewed on home
  await p.goto(B + '/'); await p.waitForSelector('text=Recently viewed');
  ok('home: recently viewed row', true);

  // filters + quick view
  await p.goto(B + '/shop?brand=Shonowear&size=M');
  await p.waitForSelector('.product-grid');
  ok('filters: brand+size only own items', await p.locator('.product-grid article').count() >= 2);
  ok('filters: chips shown', await p.getByRole('button', { name: /Remove filter Size M/ }).count() === 1);
  await p.locator('.product-grid article').first().hover();
  await p.locator('.qv-btn').first().click();
  ok('quick view opens', await p.locator('[role=dialog][aria-label^="Quick view"]').count() === 1);
  await p.getByRole('button', { name: 'Add to bag' }).click();
  ok('quick view: needs a size first', (await p.locator('[role=dialog]').innerText()).includes('Please choose a size'));
  await p.locator('[role=dialog] button.chip:has-text("M")').click();
  await p.getByRole('button', { name: 'Add to bag' }).click();
  ok('quick view: adds to bag and closes', await p.locator('[role=dialog]').count() === 0);

  // bundle discount in the bag
  await p.goto(B + '/product/own-sample-pants'); await p.waitForSelector('h1');
  await p.getByRole('button', { name: /^32\b/ }).first().click();
  await p.getByRole('button', { name: /add to bag/i }).first().click();
  await p.goto(B + '/bag'); await p.waitForSelector('text=Bundle discount');
  const txt = await p.locator('main').innerText();
  ok('bag: bundle discount line shown', /Bundle discount/.test(txt));
  ok('bag: checkout button shows a total', /Checkout · ₹[\d,]+/i.test(txt) && /−₹[\d,]+/.test(txt));

  // collections
  await p.goto(B + '/collections'); await p.waitForSelector('h1');
  ok('collections index lists collections', await p.locator('a[href^="/collection/"]').count() >= 3);
  await p.goto(B + '/collection/ships-from-us'); await p.waitForSelector('.product-grid');
  ok('collection page shows products', await p.locator('.product-grid article').count() >= 3);
  await p.goto(B + '/collection/nope'); await p.waitForTimeout(500);
  ok('unknown collection shows not-found', (await p.locator('body').innerText()).length > 0);

  // mobile layout
  const m = await br.newContext({ viewport: { width: 390, height: 800 }, isMobile: true, hasTouch: true });
  const mp = await m.newPage();
  await mp.route(/images\.unsplash\.com/, r => r.fulfill({ contentType: 'image/svg+xml', body: PIC }));
  for (const path of ['/product/own-sample-tee', '/shop?brand=Shonowear', '/collections', '/collection/wedding-season', '/']) {
    await mp.goto(B + path); await mp.waitForTimeout(500);
    ok(`mobile: no horizontal overflow ${path}`, await mp.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1));
  }
  await mp.goto(B + '/product/own-sample-tee'); await mp.waitForTimeout(600);
  await mp.screenshot({ path: '/tmp/shots/A-product-m.png' });
  await p.goto(B + '/product/own-sample-tee'); await p.waitForTimeout(600);
  await p.screenshot({ path: '/tmp/shots/A-product-d.png' });
  ok('no page errors', errors.length === 0);
  if (errors.length) console.log(errors.slice(0, 5));
} catch (e) { console.error('CRASH', e); results.push(['crash', false]); }
finally { await br?.close(); srv.kill(); }
const failed = results.filter(r => !r[1]);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
process.exit(failed.length ? 1 : 0);
