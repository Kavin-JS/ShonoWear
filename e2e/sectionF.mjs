// Browser checks for Section F: Shop the look pages and the outfit builder.
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');

const env = { ...process.env, PORT: '8799', NODE_ENV: 'development', RAZORPAY_KEY_ID: 'rzp_test_x', RAZORPAY_KEY_SECRET: 'x'.repeat(20), ADMIN_TOKEN: 'admin-token-0123456789abcdefghij', SITE_URL: 'http://localhost:8799' };
const srv = spawn('node', ['scripts/dev-server.mjs'], { env, stdio: 'ignore' });
await new Promise(r => setTimeout(r, 1500));
const B = 'http://localhost:8799';
const results = [];
const ok = (n, c) => { results.push([n, !!c]); console.log(c ? 'PASS' : 'FAIL', n); };
const PIC = '<svg xmlns="http://www.w3.org/2000/svg" width="300" height="400"><rect width="300" height="400" fill="#c9c9d6"/></svg>';
let br;
try {
  const raw = await (await fetch(B + '/looks/clean-office')).text();
  ok('prerender: look page has its own title in the HTML', /<title>Clean office/.test(raw));

  br = await chromium.launch();
  const ctx = await br.newContext({ viewport: { width: 1280, height: 1000 } });
  await ctx.addInitScript(() => { try { localStorage.setItem('sw_notice_v1', '{"noticed":true}'); } catch {} });
  const p = await ctx.newPage();
  const errors = []; p.on('pageerror', e => errors.push(String(e)));
  await p.route(/images\.unsplash\.com/, r => r.fulfill({ contentType: 'image/svg+xml', body: PIC }));
  const bagLines = () => p.evaluate(() => JSON.parse(localStorage.getItem('shonowear_bag_v2') || '[]'));

  // index and home
  await p.goto(B + '/looks'); await p.waitForSelector('h1');
  ok('looks: index lists the curated looks', await p.locator('a[href^="/looks/"]').count() === 5);
  await p.goto(B + '/'); await p.waitForSelector('h1');
  ok('home: Shop the look section shows 3 looks', await p.getByRole('region', { name: 'Shop the look' }).locator('a[href^="/looks/"]').count() === 3);

  // partner-only look
  await p.goto(B + '/looks/campus-streetwear'); await p.waitForSelector('h1');
  const buy = p.getByRole('link', { name: /^Buy on/ });
  ok('partner look: a buy link per piece, opens safely', await buy.count() === 3 && (await buy.first().getAttribute('rel')).includes('sponsored') && (await buy.first().getAttribute('rel')).includes('noopener'));
  ok('partner look: no add-to-bag button, partner total shown', await p.getByRole('button', { name: /Add .* to bag/ }).count() === 0 && /Partner items \(3\)/.test(await p.locator('main').innerText()));

  // own look: sizes and bag
  await p.goto(B + '/looks/boxy-tee-and-cargo'); await p.waitForSelector('h1');
  await p.getByRole('button', { name: /Add 3 items to bag/ }).click();
  ok('own look: adding without sizes asks for them and adds nothing', (await p.getByRole('alert').innerText()).includes('Choose a size') && (await bagLines()).length === 0);
  for (const g of await p.getByRole('group', { name: /^Size for/ }).all()) await g.locator('button:not([disabled])').first().click();
  ok('own look: bundle discount appears once every size is chosen', /Bundle discount/.test(await p.locator('main').innerText()) && /You pay us/.test(await p.locator('main').innerText()));
  await p.getByRole('button', { name: /Add 3 items to bag/ }).click();
  await p.waitForTimeout(300);
  ok('own look: all 3 items land in the bag with their sizes', (await bagLines()).length === 3 && (await bagLines()).every(l => l.size && l.qty === 1));
  await p.goto(B + '/bag'); await p.waitForSelector('h1');
  ok('own look: bag page shows the items', (await p.locator('main').innerText()).includes('Heavyweight Boxy Tee'));

  // builder
  await p.evaluate(() => localStorage.clear()); await p.addInitScript(() => {});
  await p.goto(B + '/build'); await p.waitForSelector('h1');
  ok('builder: starts empty with a hint', /Choose a piece above/.test(await p.locator('main').innerText()));
  await p.getByRole('option', { name: /Heavyweight Boxy Tee, ₹599/ }).first().click();
  await p.getByRole('tab', { name: /^Bottom/ }).click();
  await p.getByRole('option', { name: /Relaxed Cargo Pants/ }).click();
  ok('builder: picks go into the address so the look can be shared', /top=own-sample-tee/.test(p.url()) && /bottom=own-sample-pants/.test(p.url()));
  ok('builder: two pieces are listed', await p.locator('article').count() === 2);
  await p.reload(); await p.waitForSelector('h1');
  ok('builder: the look survives a reload', await p.locator('article').count() === 2);
  await p.getByRole('option', { name: /\[SAMPLE\] Heavyweight Boxy Tee/ }).first().waitFor().catch(() => {});
  await p.getByRole('tab', { name: /^Top/ }).click();
  const white = p.getByRole('option', { name: /Heavyweight Boxy Tee/ }).nth(1);
  await white.click();
  const sizeBtns = p.getByRole('group', { name: /Size for/ }).first().locator('button');
  ok('builder: a sold-out size is disabled', await sizeBtns.first().isDisabled());
  await p.getByRole('button', { name: 'Remove' }).first().click();
  ok('builder: Remove takes a piece out', await p.locator('article').count() === 1);
  await p.getByLabel('Name this look').fill('Weekend');
  await p.getByRole('button', { name: 'Save look' }).click();
  ok('builder: saved look is listed', await p.getByRole('region', { name: 'My saved looks' }).getByText('Weekend').count() === 1);
  await p.reload(); await p.waitForSelector('h1');
  ok('builder: saved look survives a reload', await p.getByRole('region', { name: 'My saved looks' }).count() === 1);
  await p.getByRole('button', { name: 'Delete Weekend' }).click();
  ok('builder: saved look can be deleted', await p.getByRole('region', { name: 'My saved looks' }).count() === 0);
  await p.goto(B + '/build?top=%3Cscript%3Ealert(1)%3C/script%3E&bottom=own-sample-tee'); await p.waitForSelector('h1');
  ok('builder: bad links are ignored, nothing breaks', await p.locator('article').count() === 0);

  // product page link
  await p.goto(B + '/product/sw-001'); await p.waitForSelector('h1');
  await p.getByRole('region', { name: 'Worn in these looks' }).getByRole('link').first().click();
  await p.waitForSelector('h1');
  ok('product: "Worn in these looks" opens the look', /\/looks\//.test(p.url()));

  // phone
  await p.setViewportSize({ width: 390, height: 800 });
  for (const path of ['/looks', '/looks/boxy-tee-and-cargo', '/looks/date-night-layered', '/build?top=own-sample-tee&bottom=own-sample-pants']) {
    await p.goto(B + path); await p.waitForSelector('h1');
    ok(`phone: no horizontal scroll on ${path.split('?')[0]}`, await p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1));
  }
  ok('no page errors', errors.length === 0); if (errors.length) console.log(errors);
} catch (e) { console.log('E2E CRASH', e.message); results.push(['crash', false]); }
finally { await br?.close(); srv.kill(); }
const bad = results.filter(r => !r[1]);
console.log(`${results.length - bad.length}/${results.length} passed`);
process.exit(bad.length ? 1 : 0);
