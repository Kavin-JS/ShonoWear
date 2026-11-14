// Browser checks for Section H: accessibility (automated axe scan + keyboard), image sizes, monitoring in the admin, backup download.
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const { AxeBuilder } = require('@axe-core/playwright');

const ADMIN = 'admin-token-0123456789abcdefghij';
const env = { ...process.env, PORT: '8793', NODE_ENV: 'development', RAZORPAY_KEY_ID: 'rzp_test_x', RAZORPAY_KEY_SECRET: 'x'.repeat(20), ADMIN_TOKEN: ADMIN, SITE_URL: 'http://localhost:8793', BACKUP_PASSPHRASE: 'correct horse battery staple' };
const srv = spawn('node', ['scripts/dev-server.mjs'], { env, stdio: 'ignore' });
await new Promise(r => setTimeout(r, 1500));
const B = 'http://localhost:8793';
const results = [];
const ok = (n, c) => { results.push([n, !!c]); console.log(c ? 'PASS' : 'FAIL', n); };
const PIC = '<svg xmlns="http://www.w3.org/2000/svg" width="300" height="400"><rect width="300" height="400" fill="#c9c9d6"/></svg>';
const PAGES = ['/', '/shop', '/product/own-sample-tee', '/bag', '/checkout', '/looks/boxy-tee-and-cargo', '/build', '/about', '/faq', '/privacy', '/account', '/gift-cards'];
let br;
try {
  br = await chromium.launch();
  const mk = async (viewport, colorScheme = 'light', extra = {}) => {
    const ctx = await br.newContext({ viewport, colorScheme, ...extra });
    await ctx.addInitScript(() => { try { localStorage.setItem('sw_notice_v1', '{"noticed":true}'); } catch {} });
    const p = await ctx.newPage(); await p.route(/images\.unsplash\.com/, r => r.fulfill({ contentType: 'image/svg+xml', body: PIC })); return [ctx, p];
  };

  // ── automated scan: WCAG 2.0/2.1 A and AA rules, both colour themes, phone and desktop ──
  for (const [vp, scheme] of [[{ width: 1280, height: 900 }, 'light'], [{ width: 390, height: 800 }, 'dark']]) {
    const [ctx, p] = await mk(vp, scheme);
    const bad = [];
    for (const path of PAGES) {
      await p.goto(B + path); await p.waitForLoadState('networkidle').catch(() => {}); await p.waitForTimeout(400);
      const r = await new AxeBuilder({ page: p }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
      for (const v of r.violations) bad.push(`${path}: ${v.id} (${v.nodes[0].target.join(' ')})`);
    }
    ok(`axe: no WCAG A/AA violations on ${PAGES.length} pages (${vp.width}px, ${scheme})`, bad.length === 0); if (bad.length) console.log(bad.slice(0, 8));
    await ctx.close();
  }

  // ── keyboard and structure ──
  const [ctx, p] = await mk({ width: 1280, height: 900 });
  const errors = []; p.on('pageerror', e => errors.push(String(e)));
  await p.goto(B + '/'); await p.waitForSelector('h1');
  await p.keyboard.press('Tab');
  ok('keyboard: the first Tab stop is "Skip to content"', /skip to content/i.test(await p.evaluate(() => document.activeElement?.textContent || '')));
  await p.keyboard.press('Enter');
  ok('keyboard: the skip link moves focus into the page content', await p.evaluate(() => !!document.activeElement && (document.activeElement.id === 'main' || document.getElementById('main')?.contains(document.activeElement))));

  await p.goto(B + '/shop'); await p.waitForSelector('h1');
  let invisible = 0, stops = 0;
  for (let i = 0; i < 14; i++) {
    await p.keyboard.press('Tab');
    const vis = await p.evaluate(() => { const e = document.activeElement; if (!e || e === document.body) return null; const s = getComputedStyle(e); return (s.outlineStyle !== 'none' && parseFloat(s.outlineWidth) > 0) || (s.boxShadow && s.boxShadow !== 'none') || e.matches('input,select,textarea'); });
    if (vis === null) continue; stops++; if (!vis) invisible++;
  }
  ok('keyboard: every one of the first 14 tab stops shows a focus ring', stops >= 10 && invisible === 0);

  for (const path of ['/', '/shop', '/product/own-sample-tee', '/looks', '/build', '/about', '/faq', '/bag', '/privacy']) {
    await p.goto(B + path); await p.waitForSelector('h1');
    const n = await p.locator('h1').count();
    if (n !== 1) ok(`structure: exactly one h1 on ${path}`, false);
  }
  ok('structure: one h1 on each main page', !results.some(r => /structure/.test(r[0]) && !r[1]));
  await p.goto(B + '/'); ok('structure: the page language is declared', await p.evaluate(() => document.documentElement.lang) === 'en');
  const titles = new Set();
  for (const path of ['/', '/shop', '/about', '/faq', '/looks', '/build', '/privacy']) { await p.goto(B + path); await p.waitForSelector('h1'); titles.add(await p.title()); }
  ok('structure: every page has its own title', titles.size === 7);

  // dialogs
  await p.goto(B + '/'); await p.waitForSelector('h1');
  const launcher = p.locator('.sw-chat-launcher'); await launcher.focus(); await launcher.press('Enter');
  const dialog = p.getByRole('dialog', { name: /Shono/ }); await dialog.waitFor({ timeout: 4000 });
  ok('dialog: the chat opens as a dialog and focus moves inside it', await p.evaluate(() => !!document.querySelector('.sw-chat-panel')?.contains(document.activeElement)));
  await p.keyboard.press('Escape');
  ok('dialog: Escape closes the chat', await dialog.count() === 0);

  // text spacing and zoom
  await p.setViewportSize({ width: 320, height: 640 });
  for (const path of ['/', '/shop', '/product/own-sample-tee', '/bag', '/looks', '/faq']) { await p.goto(B + path); await p.waitForSelector('h1'); if (!(await p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1))) ok(`zoom: ${path} fits 320px wide`, false); }
  ok('zoom: pages fit a 320px wide screen (400% zoom) without sideways scrolling', !results.some(r => /^zoom/.test(r[0]) && !r[1]));
  const big = await p.evaluate(() => { document.documentElement.style.fontSize = '200%'; return document.documentElement.scrollWidth <= window.innerWidth + 1; });
  ok('zoom: text enlarged to 200% still fits 320px', big);
  ok('no page errors', errors.length === 0); if (errors.length) console.log(errors);
  await ctx.close();

  // ── images: a phone downloads the small versions ──
  const [c2, ph] = await mk({ width: 390, height: 800 }, 'light', { deviceScaleFactor: 1 });
  await ph.goto(B + '/shop'); await ph.waitForSelector('article img'); await ph.waitForTimeout(800);
  const widths = await ph.$$eval('article img', ims => ims.slice(0, 6).map(i => Number(new URL(i.currentSrc).searchParams.get('w'))));
  ok('images: product cards on a phone load the small (≤ 400px) size', widths.length >= 4 && widths.every(w => w > 0 && w <= 400));
  ok('images: they are lazy and decoded off the main thread', await ph.$$eval('article img', ims => ims.slice(0, 6).every(i => i.loading === 'lazy' && i.decoding === 'async')));
  await ph.goto(B + '/product/own-sample-tee'); await ph.waitForSelector('h1'); await ph.waitForTimeout(500);
  ok('images: the main product photo loads first (eager, high priority)', await ph.$eval('main img', i => i.loading === 'eager' && i.getAttribute('fetchpriority') === 'high'));
  await c2.close();

  // ── monitoring and backup in the admin ──
  const [c3, ap] = await mk({ width: 1280, height: 1000 });
  await fetch(B + '/api/config', { method: 'POST', headers: { 'content-type': 'application/json', 'x-forwarded-for': '10.7.7.7' }, body: JSON.stringify({ e: 'client_error', m: 'TypeError: boom for who@example.com', r: '/shop?x=1' }) });
  const h = await (await fetch(B + '/api/config?health=1')).json();
  ok('health check: answers ok with yes/no flags', h.ok === true && h.store === true && h.backupEncryption === true && !JSON.stringify(h).includes('rzp_'));
  await ap.goto(B + '/admin'); await ap.getByLabel('Admin token').fill(ADMIN); await ap.getByRole('button', { name: 'Load' }).click();
  await ap.getByRole('region', { name: 'Dashboard' }).waitFor({ timeout: 8000 });
  const panel = await ap.getByLabel('Health and problems').innerText();
  ok('admin: health flags and the recent problem are shown, personal data masked', /Database/.test(panel) && /client_error/.test(panel) && /TypeError: boom for \[email\]/.test(panel) && !/who@example/.test(panel));
  const dl = ap.waitForEvent('download', { timeout: 8000 });
  await ap.getByRole('button', { name: 'Download a backup' }).click();
  const d = await dl;
  ok('admin: the backup downloads as an encrypted file', /\.swb$/.test(d.suggestedFilename()));
  ok('admin: and says what it holds', /records/.test(await ap.getByRole('status').innerText()));
  await c3.close();

  // a crashing page shows a friendly message and keeps the header
  const [c4, cp] = await mk({ width: 1280, height: 900 });
  await cp.route(/\/api\/config$/, r => r.continue());
  await cp.goto(B + '/'); await cp.waitForSelector('h1');
  await cp.evaluate(() => { localStorage.setItem('shonowear_bag_v2', '{"broken":'); });
  await cp.goto(B + '/bag'); await cp.waitForSelector('h1', { timeout: 6000 }).catch(() => {});
  ok('resilience: a damaged saved bag does not blank the page', await cp.locator('header, nav').count() > 0 && await cp.locator('h1').count() >= 1);
  await c4.close();
} catch (e) { console.log('E2E CRASH', e.message); results.push(['crash', false]); }
finally { await br?.close(); srv.kill(); }
const bad = results.filter(r => !r[1]);
console.log(`${results.length - bad.length}/${results.length} passed`);
process.exit(bad.length ? 1 : 0);
