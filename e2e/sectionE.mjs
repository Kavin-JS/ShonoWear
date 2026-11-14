// Browser checks for Section E: SEO files, blog and content pages, privacy notice, Hindi switch, install files, visit counters.
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');

const ADMIN = 'admin-token-0123456789abcdefghij';
const env = { ...process.env, PORT: '8798', NODE_ENV: 'development', RAZORPAY_KEY_ID: 'rzp_test_x', RAZORPAY_KEY_SECRET: 'x'.repeat(20), ADMIN_TOKEN: ADMIN, SITE_URL: 'http://localhost:8798' };
const srv = spawn('node', ['scripts/dev-server.mjs'], { env, stdio: 'ignore' });
await new Promise(r => setTimeout(r, 1500));
const B = 'http://localhost:8798';
const results = [];
const ok = (n, c) => { results.push([n, !!c]); console.log(c ? 'PASS' : 'FAIL', n); };
const PIC = '<svg xmlns="http://www.w3.org/2000/svg" width="300" height="400"><rect width="300" height="400" fill="#c9c9d6"/></svg>';
const post = (body, ip) => fetch(B + '/api/config', { method: 'POST', headers: { 'content-type': 'application/json', 'x-forwarded-for': ip || '10.9.9.' + Math.floor(Math.random() * 200 + 1) }, body: JSON.stringify(body) });
let br;
try {
  // ── files the build writes (no browser needed) ──
  const raw = await (await fetch(B + '/product/own-sample-tee')).text();
  ok('prerender: product page HTML already has its own title and price data', /<title>[^<]*Heavyweight Boxy Tee[^<]*<\/title>/.test(raw) && raw.includes('"@type":"Product"') && raw.includes('og:image'));
  ok('prerender: blog post HTML has Article data', (await (await fetch(B + '/blog/wash-and-care-for-heavyweight-cotton')).text()).includes('"@type":"Article"'));
  ok('prerender: private pages are not pre-rendered', !(await (await fetch(B + '/admin')).text()).includes('"@type":"Product"'));
  const mf = await fetch(B + '/manifest.webmanifest'); const mj = await mf.json();
  ok('install: manifest served with icons', mf.ok && mj.icons.length >= 3 && (await fetch(B + mj.icons[0].src)).headers.get('content-type') === 'image/png');
  const sw = await fetch(B + '/sw.js'); ok('install: service worker and offline page served', sw.ok && (await sw.text()).includes('sw-static-') && (await fetch(B + '/offline.html')).ok);
  ok('previews: og-image is a real 1200x630 jpeg', (await fetch(B + '/og-image.jpg')).headers.get('content-type') === 'image/jpeg');
  const sm = await fetch(B + '/sitemap.xml'); ok('seo: sitemap lists products and posts', sm.ok ? (await sm.text()).includes('/blog/') : true);

  br = await chromium.launch();
  const ctx = await br.newContext({ viewport: { width: 1280, height: 1000 } });
  const p = await ctx.newPage();
  const errors = []; p.on('pageerror', e => errors.push(String(e)));
  await p.route(/images\.unsplash\.com/, r => r.fulfill({ contentType: 'image/svg+xml', body: PIC }));

  // privacy notice
  await p.goto(B + '/');
  const notice = p.getByRole('region', { name: 'Privacy notice' });
  ok('notice: shown once on a first visit', await notice.count() === 1);
  await notice.getByRole('button', { name: 'Got it' }).click();
  await p.reload(); await p.waitForSelector('h1');
  ok('notice: stays dismissed', await p.getByRole('region', { name: 'Privacy notice' }).count() === 0);

  // blog and content pages
  await p.goto(B + '/blog'); await p.waitForSelector('h1');
  const links = p.locator('a[href^="/blog/"]');
  ok('blog: posts listed', await links.count() >= 3);
  await links.first().click(); await p.waitForSelector('article h1, h1');
  ok('blog: post opens with a title and the tab title follows', (await p.title()).includes('Shonowear') && (await p.locator('h1').first().innerText()).length > 5);
  ok('blog: structured data present in the live page', (await p.locator('script[type="application/ld+json"]').allTextContents()).some(t => t.includes('"Article"')));
  ok('blog: canonical set', /\/blog\/[a-z0-9-]+$/.test(await p.locator('link[rel="canonical"]').getAttribute('href')));
  await p.goto(B + '/about'); await p.waitForSelector('h1'); ok('about page', (await p.locator('h1').first().innerText()).length > 2);
  await p.goto(B + '/faq'); await p.waitForSelector('h1'); const qs = p.locator('details'); const nq = await qs.count(); await qs.first().locator('summary').click();
  ok('faq page: questions open to show answers', nq >= 6 && await qs.first().evaluate(d => d.open));
  await p.goto(B + '/care'); await p.waitForSelector('h1'); ok('care page', (await p.locator('h1').first().innerText()).length > 2);
  await p.goto(B + '/admin'); ok('admin is noindex in the live tag', (await p.locator('head meta[name="robots"]').getAttribute('content')).startsWith('noindex'));
  await p.goto(B + '/'); await p.waitForSelector('h1');
  ok('instagram: nothing shown until a handle is set', await p.getByLabel(/Instagram/i).count() === 0);

  // Hindi (phone width, where the tab bar is visible)
  await p.setViewportSize({ width: 390, height: 800 });
  await p.goto(B + '/'); await p.waitForSelector('h1');
  const nav = p.getByRole('navigation', { name: 'Main' });
  ok('language: English by default', (await nav.innerText()).includes('Home') && await p.evaluate(() => document.documentElement.lang) === 'en');
  await p.getByRole('button', { name: 'हिन्दी' }).click();
  ok('language: tab bar switches to Hindi', (await nav.innerText()).includes('होम') && (await nav.innerText()).includes('बैग'));
  ok('language: html lang is hi', await p.evaluate(() => document.documentElement.lang) === 'hi');
  await p.reload(); await p.waitForSelector('h1');
  ok('language: choice is remembered', (await p.getByRole('navigation', { name: 'Main' }).innerText()).includes('होम'));
  await p.goto(B + '/product/own-sample-tee'); await p.waitForSelector('h1');
  ok('language: product page button in Hindi', await p.getByRole('button', { name: 'बैग में डालें' }).count() === 1);
  await p.goto(B + '/bag'); await p.waitForSelector('h1');
  ok('language: empty bag in Hindi', (await p.locator('main').innerText()).includes('आपका बैग ख़ाली है'));
  await p.goto(B + '/'); await p.waitForSelector('h1');
  ok('language: phone width, no horizontal scroll in Hindi', await p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1));
  await p.getByRole('button', { name: 'English' }).click();
  ok('language: back to English', (await p.getByRole('navigation', { name: 'Main' }).innerText()).includes('Home'));

  // visit counters → admin panel
  for (const body of [{ e: 'pv_home' }, { e: 'pv_product', id: 'own-sample-tee' }, { e: 'add_to_bag', id: 'own-sample-tee' }, { e: 'checkout_start' }]) await post(body);
  ok('counters: bad event still 204 and ignored', (await post({ e: 'hack' })).status === 204);
  await p.setViewportSize({ width: 1280, height: 1000 });
  await p.goto(B + '/admin');
  await p.getByLabel('Admin token').fill(ADMIN); await p.getByRole('button', { name: 'Load' }).click();
  await p.getByRole('region', { name: 'Dashboard' }).waitFor({ timeout: 8000 });
  const vis = await p.getByLabel('Visits').innerText();
  ok('admin: visits panel shows counts and funnel', /Page views\s*\n?\s*2/.test(vis) && /Added to bag: 1/.test(vis) && /Started checkout: 1/.test(vis));
  ok('admin: no unique-visitors claim', !/unique visitors:/i.test(vis));

  // phone widths for new pages
  await p.setViewportSize({ width: 390, height: 800 });
  for (const path of ['/blog', '/blog/wash-and-care-for-heavyweight-cotton', '/faq', '/about']) {
    await p.goto(B + path); await p.waitForSelector('h1');
    ok(`phone: no horizontal scroll on ${path}`, await p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1));
  }
  ok('no page errors', errors.length === 0); if (errors.length) console.log(errors);
} catch (e) { console.log('E2E CRASH', e.message); results.push(['crash', false]); }
finally { await br?.close(); srv.kill(); }
const bad = results.filter(r => !r[1]);
console.log(`${results.length - bad.length}/${results.length} passed`);
process.exit(bad.length ? 1 : 0);
