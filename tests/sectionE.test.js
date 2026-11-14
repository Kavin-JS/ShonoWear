import { describe, it, expect, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { mockRes, mockReq } from './helpers.js';
import { metaFor, publicPaths } from '../src/lib/seoMeta.js';
import { parseBlocks, inline } from '../src/lib/miniMd.jsx';
import { toText } from '../src/lib/textUtil.js';
import { translate } from '../src/i18n/index.jsx';
import { HI } from '../src/i18n/hi.js';
import { catalog } from '../src/data/catalog.js';
import { POSTS } from '../src/data/posts.js';

const ROOT = path.resolve(import.meta.dirname, '..');
const ADMIN = 'a'.repeat(32);
const SITE = 'https://shonowear.test';
const own = catalog.find(p => p.fulfilment === 'own');

describe('E1 · page meta (search and link previews)', () => {
  it('home carries Organization and WebSite data', () => {
    const m = metaFor('/', { siteUrl: SITE });
    expect(m.jsonLd.map(j => j['@type'])).toEqual(['Organization', 'WebSite']);
    expect(m.canonical).toBe(`${SITE}/`);
    expect(m.image).toBe(`${SITE}/og-image.jpg`);
    expect(m.noindex).toBe(false);
  });
  it('a product has Product + Offer with the live price and stock state', () => {
    const m = metaFor(`/product/${own.id}`, { siteUrl: SITE });
    const prod = m.jsonLd.find(j => j['@type'] === 'Product');
    expect(prod.offers.price).toBe(own.price);
    expect(prod.offers.priceCurrency).toBe('INR');
    expect(prod.offers.availability).toMatch(/InStock/);
    expect(m.title).toContain(own.name);
    expect(m.jsonLd.some(j => j['@type'] === 'BreadcrumbList')).toBe(true);
    const sold = { ...own, sizes: Object.fromEntries(Object.keys(own.sizes).map(k => [k, 0])) };
    const idx = catalog.indexOf(own); catalog[idx] = sold;
    try { expect(metaFor(`/product/${own.id}`).jsonLd.find(j => j['@type'] === 'Product').offers.availability).toMatch(/OutOfStock/); } finally { catalog[idx] = own; }
  });
  it('unknown product and private pages are not indexed with invented data', () => {
    expect(metaFor('/product/nope-123').jsonLd).toEqual([]);
    for (const p of ['/admin', '/order/abc', '/checkout', '/bag', '/account', '/track', '/unsubscribe']) expect(metaFor(p).noindex, p).toBe(true);
    expect(metaFor('/shop').noindex).toBe(false);
  });
  it('blog posts are Articles, the FAQ is FAQPage, descriptions stay short', () => {
    expect(metaFor(`/blog/${POSTS[0].slug}`, { siteUrl: SITE }).jsonLd.map(j => j['@type'])).toContain('Article');
    expect(metaFor('/faq').jsonLd[0]['@type']).toBe('FAQPage');
    for (const p of publicPaths()) expect(metaFor(p).description.length, p).toBeLessThanOrEqual(160);
  });
  it('trailing slashes and queries do not change the canonical', () => {
    expect(metaFor('/shop/?cat=top', { siteUrl: SITE }).canonical).toBe(`${SITE}/shop`);
  });
  it('the public URL list is unique, covers products and posts, and has nothing private', () => {
    const urls = publicPaths();
    expect(new Set(urls).size).toBe(urls.length);
    expect(urls).toContain(`/product/${own.id}`);
    expect(urls).toContain(`/blog/${POSTS[0].slug}`);
    for (const u of urls) { expect(metaFor(u).noindex, u).toBe(false); expect(u).not.toMatch(/^\/(admin|checkout|order\/|account|bag)/); }
  });
  it('the build step writes one valid HTML file per URL', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'sw-prerender-'));
    fs.mkdirSync(path.join(tmp, 'dist'));
    fs.copyFileSync(path.join(ROOT, 'index.html'), path.join(tmp, 'dist', 'index.html'));
    fs.copyFileSync(path.join(ROOT, 'public/sw.js'), path.join(tmp, 'dist', 'sw.js'));
    execFileSync('node', [path.join(ROOT, 'scripts/prerender.mjs')], { cwd: tmp, env: { ...process.env, SITE_URL: SITE } });
    const file = path.join(tmp, 'dist', 'product', own.id, 'index.html');
    const html = fs.readFileSync(file, 'utf8');
    expect(html.match(/<!--SEO:START-->/g)).toHaveLength(1);
    expect(html).toContain(`<link rel="canonical" href="${SITE}/product/${own.id}" />`);
    expect(html).toContain('<noscript>');
    for (const m of html.matchAll(/<script type="application\/ld\+json">(.*?)<\/script>/g)) expect(() => JSON.parse(m[1])).not.toThrow();
    expect(fs.existsSync(path.join(tmp, 'dist', 'blog', POSTS[0].slug, 'index.html'))).toBe(true);
    expect(fs.existsSync(path.join(tmp, 'dist', 'admin'))).toBe(false);
    expect(fs.readFileSync(path.join(tmp, 'dist', 'sw.js'), 'utf8')).not.toContain('__BUILD_ID__');
    fs.rmSync(tmp, { recursive: true, force: true });
  });
  it('hostile text cannot break out of the page head', async () => {
    const { headFor, esc } = await import('../scripts/headHtml.mjs');
    const evil = 'Tee </script><script>alert(1)</script> "x" <b>';
    const html = headFor({ title: evil, description: evil, canonical: 'https://x.test/?a="1"&b=<2>', image: evil, type: 'product', noindex: false, jsonLd: [{ name: evil }] });
    expect(html).not.toContain('<script>alert');
    expect(html.match(/<\/script>/g)).toHaveLength(1);              // only the JSON-LD block's own closing tag
    expect(html).not.toMatch(/content="[^"]*"[^>]*"x"/);
    const ld = html.match(/<script type="application\/ld\+json">(.*?)<\/script>/)[1];
    expect(JSON.parse(ld).name).toBe(evil);                           // still reads back exactly
    expect(esc('<a href="x">&')).toBe('&lt;a href=&quot;x&quot;&gt;&amp;');
  });
});

describe('E2 · content pages (safe mini markdown)', () => {
  it('parses headings, lists and paragraphs', () => {
    const b = parseBlocks('## Title\n\nHello **there**\n\n- a\n- b');
    expect(b.map(x => x.t)).toEqual(['h2', 'p', 'ul']);
    expect(b[2].items).toEqual(['a', 'b']);
  });
  it('only https and site-path links become links; javascript: stays plain text', () => {
    const bad = inline('[x](javascript:alert(1)) and [y](http://insecure.example) and <img src=x onerror=alert(1)>');
    expect(bad.every(n => typeof n === 'string')).toBe(true);
    const good = inline('[ok](https://example.com/a) [in](/shop)').filter(n => typeof n !== 'string');
    expect(good).toHaveLength(2);
  });
  it('toText strips markup for summaries', () => {
    expect(toText('## Hi\n\n- **a** [b](/c)')).toBe('Hi a b');
  });
  it('every starter post has what search engines need', () => {
    for (const p of POSTS) { expect(p.slug).toMatch(/^[a-z0-9-]+$/); expect(p.title.length).toBeGreaterThan(10); expect(p.description.length).toBeGreaterThan(30); expect(p.date).toMatch(/^\d{4}-\d{2}-\d{2}$/); }
  });
});

describe('E3 · cookieless analytics', () => {
  async function setup() {
    vi.resetModules();
    for (const k of ['VERCEL_ENV', 'NODE_ENV', 'UPSTASH_REDIS_REST_URL', 'UPSTASH_REDIS_REST_TOKEN']) delete process.env[k];
    Object.assign(process.env, { ADMIN_TOKEN: ADMIN, RAZORPAY_KEY_ID: 'rzp_test_abc', RAZORPAY_KEY_SECRET: 'k'.repeat(10) });
    return { config: (await import('../api/config.js')).default, an: await import('../server/analytics.js'), admin: (await import('../api/admin/orders.js')).default };
  }
  let n = 150;
  const post = async (m, body, ip) => { const req = mockReq(body, { method: 'POST', headers: { 'x-vercel-forwarded-for': ip || `203.0.113.${(n++ % 250) + 1}` } }); const res = mockRes(); await m.config(req, res); return res; };

  it('counts whitelisted events and answers 204', async () => {
    const m = await setup();
    expect((await post(m, { e: 'add_to_bag', id: own.id })).statusCode).toBe(204);
    await post(m, { e: 'pv_home' }); await post(m, { e: 'pv_product', id: own.id });
    const f = await m.an.funnel();
    expect(f.totals.add_to_bag).toBe(1);
    expect(f.pageViews).toBe(2);
    expect(f.products[0]).toMatchObject({ id: own.id, views: 1, adds: 1 });
  });
  it('ignores unknown events, unknown product ids and junk, still 204', async () => {
    const m = await setup();
    for (const b of [{ e: 'drop table' }, { e: '__proto__' }, { e: 'pv_product', id: 'ghost' }, 'text', null, { e: ['pv_home'] }]) expect((await post(m, b)).statusCode).toBe(204);
    const f = await m.an.funnel();
    expect(f.totals.pv_product).toBe(1);   // counted without a product id
    expect(f.products).toEqual([]);
    expect(f.pageViews).toBe(1);
    const g = await import('../server/guard.js');
    const [raw] = await g.store([['HGETALL', `an:${m.an.istDayOf(Date.now())}`]]);
    expect(Object.keys(g.hgetall(raw))).toEqual(['e:pv_product']);   // junk was never written, not just hidden
  });
  it('stores no personal data: only counters keyed by day', async () => {
    const m = await setup();
    await post(m, { e: 'pv_home', email: 'a@b.c', name: 'x' }, '198.51.100.9');
    const g = await import('../server/guard.js');
    const [raw] = await g.store([['HGETALL', `an:${m.an.istDayOf(Date.now())}`]]);
    const all = JSON.stringify(raw);
    expect(all).not.toMatch(/198\.51|a@b\.c|@/);
    expect(Object.keys(g.hgetall(raw))).toEqual(['e:pv_home']);
  });
  it('is rate limited per visitor but never errors', async () => {
    const m = await setup();
    for (let i = 0; i < 130; i++) expect((await post(m, { e: 'pv_other' }, '203.0.113.250')).statusCode).toBe(204);
    expect((await m.an.funnel()).totals.pv_other).toBe(120);
  });
  it('rejects oversized bodies and other sites posting here', async () => {
    const m = await setup();
    const big = mockReq({ e: 'pv_home', pad: 'x'.repeat(2000) }, { method: 'POST', headers: { 'content-length': '2100', 'x-vercel-forwarded-for': '203.0.113.1' } });
    const r1 = mockRes(); await m.config(big, r1); expect(r1.statusCode).toBe(413);
    const evil = mockReq({ e: 'pv_home' }, { method: 'POST', headers: { origin: 'https://evil.example', 'x-vercel-forwarded-for': '203.0.113.2' } });
    const r2 = mockRes(); await m.config(evil, r2); expect(r2.statusCode).toBe(403);
  });
  it('GET still returns the config, and the admin dashboard includes the traffic panel data', async () => {
    const m = await setup();
    await post(m, { e: 'checkout_start' });
    const g = mockRes(); await m.config(mockReq(undefined, { method: 'GET' }), g);
    expect(g.statusCode).toBe(200); expect(g.body).toHaveProperty('checkoutEnabled');
    const req = mockReq(undefined, { method: 'GET', headers: { authorization: `Bearer ${ADMIN}`, 'x-vercel-forwarded-for': '203.0.113.3' } }); req.query = { view: 'dashboard' };
    const res = mockRes(); await m.admin(req, res);
    expect(res.statusCode).toBe(200);
    expect(res.body.traffic.totals.checkout_start).toBe(1);
    expect(res.body.traffic.series).toHaveLength(30);
  });
  it('the browser side respects Do Not Track and never sends page addresses', () => {
    const src = fs.readFileSync(path.join(ROOT, 'src/lib/analytics.js'), 'utf8');
    expect(src).toContain('doNotTrack'); expect(src).toContain('globalPrivacyControl');
    expect(fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8')).not.toContain('insights');
  });
});

describe('E4 · installable app', () => {
  it('the manifest is valid and every icon exists', () => {
    const mf = JSON.parse(fs.readFileSync(path.join(ROOT, 'public/manifest.webmanifest'), 'utf8'));
    expect(mf.display).toBe('standalone'); expect(mf.start_url).toMatch(/^\//);
    expect(mf.icons.some(i => i.purpose === 'maskable')).toBe(true);
    for (const i of mf.icons) expect(fs.existsSync(path.join(ROOT, 'public', i.src)), i.src).toBe(true);
    for (const f of ['offline.html', 'favicon.svg', 'og-image.jpg', 'icons/apple-touch-icon.png']) expect(fs.existsSync(path.join(ROOT, 'public', f)), f).toBe(true);
  });
  it('the service worker never handles the API, checkout, orders, account or admin, and caches no pages', () => {
    const sw = fs.readFileSync(path.join(ROOT, 'public/sw.js'), 'utf8');
    const never = new RegExp(sw.match(/const NEVER = \/(.*)\/;/)[1]);
    for (const p of ['/api/checkout/create', '/checkout', '/order/x', '/account', '/admin', '/track']) expect(never.test(p), p).toBe(true);
    expect(never.test('/shop')).toBe(false);
    expect(sw).toMatch(/req\.method !== 'GET'/);
    expect(sw).toContain("req.mode === 'navigate'");
    expect(sw).not.toMatch(/cache\.put\(req.*navigate/);
  });
  it('vercel.json serves the worker uncached and runs the full build', () => {
    const v = JSON.parse(fs.readFileSync(path.join(ROOT, 'vercel.json'), 'utf8'));
    expect(v.buildCommand).toBe('npm run build');
    const h = v.headers.find(x => x.source === '/sw.js').headers;
    expect(h.find(x => x.key === 'Cache-Control').value).toBe('no-cache');
  });
});

describe('E5 · Hindi', () => {
  it('translates, falls back to English, and fills placeholders', () => {
    expect(translate('hi', 'Add to bag')).toBe(HI['Add to bag']);
    expect(translate('en', 'Add to bag')).toBe('Add to bag');
    expect(translate('hi', 'A string nobody translated')).toBe('A string nobody translated');
    expect(translate('hi', '{days}-day returns', { days: 7 })).toContain('7');
    expect(translate('en', 'Free shipping over {amount} on items we ship', { amount: '₹999' })).toBe('Free shipping over ₹999 on items we ship');
  });
  it('every string passed to t() in the code has a Hindi entry', () => {
    const missing = [];
    const walk = (d) => { for (const f of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, f.name); if (f.isDirectory()) { if (f.name !== 'i18n') walk(p); } else if (/\.jsx?$/.test(f.name)) { const s = fs.readFileSync(p, 'utf8'); for (const m of s.matchAll(/\bt\('((?:[^'\\]|\\.)*)'/g)) { const k = m[1].replace(/\\'/g, "'"); if (!(k in HI)) missing.push(`${f.name}: ${k}`); } } } };
    walk(path.join(ROOT, 'src'));
    expect(missing).toEqual([]);
  });
  it('labels passed through variables are covered too (nav, footer, tabs, categories, checkout fields)', () => {
    for (const k of ['Home', 'Shop', 'Stylist', 'Wishlist', 'Bag', 'Tops', 'Bottoms', 'Footwear', 'Outerwear', 'Sets', 'Accessories', 'Mobile number', 'Full name', 'Pincode', 'City', 'State', 'Gift card']) expect(HI[k], k).toBeTruthy();
  });
  it('placeholders match between English and Hindi and Hindi is really Devanagari', () => {
    for (const [en, hi] of Object.entries(HI)) {
      expect((en.match(/\{\w+\}/g) || []).sort(), en).toEqual((hi.match(/\{\w+\}/g) || []).sort());
      expect(hi.trim().length, en).toBeGreaterThan(0);
      if (!/^[\W\d_]*$/.test(en)) expect(/[ऀ-ॿ]/.test(hi), en).toBe(true);
    }
  });
});
