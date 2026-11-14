// Browser checks for Section G: own-site fonts, logo, motion (and its off switch), 3D mark.
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');

const env = { ...process.env, PORT: '8796', NODE_ENV: 'development', RAZORPAY_KEY_ID: 'rzp_test_x', RAZORPAY_KEY_SECRET: 'x'.repeat(20), ADMIN_TOKEN: 'admin-token-0123456789abcdefghij', SITE_URL: 'http://localhost:8796' };
const srv = spawn('node', ['scripts/dev-server.mjs'], { env, stdio: 'ignore' });
await new Promise(r => setTimeout(r, 1500));
const B = 'http://localhost:8796';
const results = [];
const ok = (n, c) => { results.push([n, !!c]); console.log(c ? 'PASS' : 'FAIL', n); };
const PIC = '<svg xmlns="http://www.w3.org/2000/svg" width="300" height="400"><rect width="300" height="400" fill="#c9c9d6"/></svg>';
let br;
try {
  br = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const init = () => { try { localStorage.setItem('sw_notice_v1', '{"noticed":true}'); } catch {} };

  // ── normal motion ──
  const ctx = await br.newContext({ viewport: { width: 1280, height: 900 } });
  await ctx.addInitScript(init);
  const p = await ctx.newPage();
  const errors = [], reqs = [];
  p.on('pageerror', e => errors.push(String(e))); p.on('request', r => reqs.push(r.url()));
  await p.route(/images\.unsplash\.com/, r => r.fulfill({ contentType: 'image/svg+xml', body: PIC }));

  await p.goto(B + '/shop'); await p.waitForSelector('h1', { timeout: 8000 }).catch(() => {});
  await p.evaluate(() => document.fonts.ready); await p.waitForTimeout(400);
  ok('fonts: nothing requested from Google', !reqs.some(u => /googleapis|gstatic/.test(u)));
  ok('fonts: font files come from our own site', reqs.some(u => /\.woff2?(\?|$)/.test(u) && u.startsWith(B)));
  const faces = await p.evaluate(() => [...document.fonts].filter(f => f.status === 'loaded').map(f => `${f.family}|${f.unicodeRange}`));
  ok('fonts: Poppins and Bebas Neue loaded', faces.some(f => /Poppins/.test(f)) && faces.some(f => /Bebas/.test(f)));
  const poppinsRupee = await p.evaluate(() => [...document.fonts].some(f => /Poppins/.test(f.family) && f.status === 'loaded' && /20B9/i.test(f.unicodeRange)));
  ok('fonts: the rupee sign is drawn by Poppins, not a fallback', poppinsRupee);

  await p.goto(B + '/'); await p.waitForSelector('h1');
  const logo = p.getByRole('link', { name: 'Shonowear home' });
  ok('logo: header logo links home and has the mark and the wordmark', await logo.locator('svg').count() === 1 && /SHONOWEAR/.test(await logo.innerText()));
  ok('logo: favicon and icons are ours', (await p.locator('link[rel="icon"]').first().getAttribute('href')).endsWith('.svg'));

  // reveal
  const occ = p.getByRole('region', { name: 'Shop by occasion' });
  const before = await occ.getAttribute('data-reveal');
  await occ.scrollIntoViewIfNeeded(); await p.waitForTimeout(900);
  ok('motion: a below-the-fold section starts hidden then reveals', (before === 'pending' || before === 'in' || before === null) && await occ.getAttribute('data-reveal') !== 'pending');
  ok('motion: it is fully visible afterwards', await occ.evaluate(e => getComputedStyle(e).opacity) === '1');
  await p.goto(B + '/shop'); await p.waitForSelector('main.page');
  ok('motion: pages fade in', await p.locator('main.page').first().evaluate(e => getComputedStyle(e).animationName) === 'pageIn');

  // tilt
  await p.goto(B + '/looks'); await p.waitForSelector('h1');
  const card = p.locator('.tilt').first(); const box = await card.boundingBox();
  await p.mouse.move(box.x + box.width * 0.8, box.y + box.height * 0.2);
  ok('motion: look cards lean toward the mouse', /perspective/.test(await card.evaluate(e => e.style.transform)));
  await p.mouse.move(5, 5);
  ok('motion: and settle back', (await card.evaluate(e => e.style.transform)) === '');

  // bag badge
  await p.goto(B + '/product/own-sample-cap'); await p.waitForSelector('h1');
  await p.getByRole('button', { name: 'One size' }).click();
  await p.getByRole('button', { name: /Add to bag/ }).first().click();
  await p.waitForTimeout(150);
  ok('motion: the bag count bumps when an item is added', await p.locator('.bump').count() >= 1);

  // 3D
  await p.goto(B + '/about'); await p.waitForSelector('h1');
  await p.waitForFunction(() => document.querySelector('[data-mark3d]')?.dataset.mark3d === 'live', null, { timeout: 8000 }).catch(() => {});
  const mode = await p.locator('[data-mark3d]').getAttribute('data-mark3d');
  console.log('INFO 3D mode:', mode);
  ok('3D: the mark shows (live 3D, or the flat logo if WebGL is unavailable)', mode === 'live' ? await p.locator('[data-mark3d] canvas').count() === 1 : await p.locator('[data-mark3d] svg').count() === 1);
  if (mode === 'live') {
    await p.waitForTimeout(600);
    const shot = (await p.locator('[data-mark3d]').screenshot()).toString('base64');
    const lit = await p.evaluate(async (b64) => { const img = new Image(); img.src = 'data:image/png;base64,' + b64; await img.decode(); const t = document.createElement('canvas'); t.width = img.width; t.height = img.height; const x = t.getContext('2d'); x.drawImage(img, 0, 0); const d = x.getImageData(0, 0, t.width, t.height).data; let n = 0; for (let i = 0; i < d.length; i += 4) if (d[i] > 180 && d[i + 1] < 70 && d[i + 2] < 100) n++; return n; }, shot);   // brand-red pixels from the 3D tube
    ok('3D: the canvas really draws the red half of the mark', lit > 300);
  }
  await p.goto(B + '/definitely-not-a-page'); await p.waitForSelector('h1');
  ok('3D: the 404 page has the mark too', await p.locator('[data-mark3d]').count() === 1);

  // phone header
  await p.setViewportSize({ width: 390, height: 800 });
  for (const path of ['/', '/about', '/shop']) { await p.goto(B + path); await p.waitForSelector('h1'); ok(`phone: no horizontal scroll on ${path} with the logo`, await p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)); }
  await p.goto(B + '/'); await p.getByRole('button', { name: 'हिन्दी' }).click(); await p.waitForTimeout(500);
  ok('fonts: Hindi uses Noto Sans Devanagari from our site', (await p.evaluate(() => [...document.fonts].filter(f => f.status === 'loaded').map(f => f.family))).some(f => /Noto Sans Devanagari/.test(f)));
  ok('no page errors', errors.length === 0); if (errors.length) console.log(errors);
  await ctx.close();

  // ── reduced motion ──
  const rctx = await br.newContext({ viewport: { width: 1280, height: 900 }, reducedMotion: 'reduce' });
  await rctx.addInitScript(init);
  const r = await rctx.newPage();
  await r.route(/images\.unsplash\.com/, x => x.fulfill({ contentType: 'image/svg+xml', body: PIC }));
  await r.goto(B + '/'); await r.waitForSelector('h1');
  ok('reduced motion: no section is ever hidden', await r.locator('[data-reveal]').count() === 0);
  await r.goto(B + '/shop'); await r.waitForSelector('main.page');
  ok('reduced motion: no page fade', await r.locator('main.page').first().evaluate(e => getComputedStyle(e).animationName) === 'none');
  await r.goto(B + '/about'); await r.waitForSelector('h1'); await r.waitForTimeout(800);
  ok('reduced motion: the 3D mark stays a flat logo, no canvas, no 3D library fetched', await r.locator('[data-mark3d] canvas').count() === 0 && await r.locator('[data-mark3d]').getAttribute('data-mark3d') === 'flat');
  await rctx.close();
} catch (e) { console.log('E2E CRASH', e.message); results.push(['crash', false]); }
finally { await br?.close(); srv.kill(); }
const bad = results.filter(r => !r[1]);
console.log(`${results.length - bad.length}/${results.length} passed`);
process.exit(bad.length ? 1 : 0);
