import { describe, it, expect, vi, beforeEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { mockRes, mockReq } from './helpers.js';

const ROOT = path.resolve(import.meta.dirname, '..');
const ADMIN = 'a'.repeat(32), CRON = 'c'.repeat(20), PASS = 'correct horse battery staple';
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function fresh(extraEnv = {}) {
  vi.resetModules(); vi.doUnmock('../server/notify.js');
  for (const k of ['VERCEL_ENV', 'NODE_ENV', 'UPSTASH_REDIS_REST_URL', 'UPSTASH_REDIS_REST_TOKEN', 'CRON_SECRET', 'BACKUP_PASSPHRASE', 'ORDER_NOTIFY_EMAIL', 'RESEND_API_KEY', 'ORDER_FROM_EMAIL']) delete process.env[k];
  Object.assign(process.env, { ADMIN_TOKEN: ADMIN, RAZORPAY_KEY_ID: 'rzp_test_abc', RAZORPAY_KEY_SECRET: 'k'.repeat(10), ...extraEnv });
  const alerts = [], mails = [];
  vi.doMock('../server/notify.js', async (orig) => ({ ...(await orig()), sendAlertEmail: async (a) => { alerts.push(a); return true; }, sendBackupEmail: async (a) => { mails.push(a); } }));
  return { g: await import('../server/guard.js'), mon: await import('../server/monitor.js'), bk: await import('../server/backup.js'), alerts, mails };
}
let ip = 20;
const admin = async (query, headers = {}) => {
  const { default: h } = await import('../api/admin/orders.js');
  const req = mockReq(undefined, { method: 'GET', headers: { 'x-vercel-forwarded-for': `203.0.113.${(ip++ % 250) + 1}`, ...headers } }); req.query = query;
  const res = mockRes(); await h(req, res); return res;
};
const bearer = (t) => ({ authorization: `Bearer ${t}` });

describe('H1 · monitoring', () => {
  it('clean() masks emails, long numbers and query strings, and shortens', async () => {
    const { mon } = await fresh();
    expect(mon.clean('failed for a.b+c@mail.example id 9876543210 at /order/x?token=SECRET#frag ok')).toBe('failed for [email] id [number] at /order/x ok');
    expect(mon.clean('x'.repeat(500))).toHaveLength(200);
    expect(mon.clean(null)).toBe('');
  });
  it('serious problems are kept, counted and e-mailed once an hour; minor ones are kept without an e-mail', async () => {
    const { mon, alerts } = await fresh();
    await mon.capture('webhook_amount_mismatch', { msg: 'paid 100 expected 200 for a@b.co', orderId: 'ord_1' });
    await mon.capture('webhook_amount_mismatch', { msg: 'again' });
    await mon.capture('subscribe_mark_failed', { msg: 'minor' });
    const p = await mon.recentProblems();
    expect(p.recent.map(r => r.kind)).toEqual(['subscribe_mark_failed', 'webhook_amount_mismatch', 'webhook_amount_mismatch']);
    expect(p.today).toBe(3);
    expect(JSON.stringify(p)).not.toContain('a@b.co');
    expect(alerts).toHaveLength(1);                         // one e-mail, not two, not three
    expect(alerts[0]).toMatchObject({ kind: 'webhook_amount_mismatch', count: 1 });
  });
  it('the list never grows past 100', async () => {
    const { mon } = await fresh();
    for (let i = 0; i < 130; i++) await mon.capture('cart_error', { msg: `n${i}` });
    const p = await mon.recentProblems(500);
    expect(p.recent).toHaveLength(100); expect(p.recent[0].msg).toBe('n129');
  });
  it('log() feeds it automatically for *_error / *_failed / *_mismatch, and ignores normal events', async () => {
    const { g, mon } = await fresh();
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    g.log('checkout_error', { msg: 'boom' }); g.log('order_paid', { id: 'x' }); g.log('analytics_failed', { err: 'nope' });
    await sleep(60); spy.mockRestore();
    const kinds = (await mon.recentProblems()).recent.map(r => r.kind).sort();
    expect(kinds).toEqual(['analytics_failed', 'checkout_error']);
  });
  it('monitoring never throws, even when the database is unavailable', async () => {
    const { mon } = await fresh({ NODE_ENV: 'production', VERCEL_ENV: 'production' });
    await expect(mon.capture('checkout_error', { msg: 'x' })).resolves.toBeUndefined();
    await expect(mon.captureClient({ m: 'x' })).resolves.toBe(false);
  });
  it('browser errors are cleaned, de-duplicated and noise is dropped', async () => {
    const { mon } = await fresh();
    expect(await mon.captureClient({ m: 'TypeError: x is undefined for me@x.io', r: '/shop?utm=1' })).toBe(true);
    expect(await mon.captureClient({ m: 'TypeError: x is undefined for me@x.io', r: '/shop' })).toBe(false);   // same again
    expect(await mon.captureClient({ m: '', r: '/' })).toBe(false);
    const [e] = (await mon.recentProblems()).recent;
    expect(e).toMatchObject({ kind: 'client_error', ref: '/shop' }); expect(e.msg).not.toContain('me@x.io');
  });
  it('the config endpoint accepts browser errors with their own limit, always answers 204', async () => {
    const { mon } = await fresh();
    const { default: cfg } = await import('../api/config.js');
    const post = async (b, ipx) => { const req = mockReq(b, { method: 'POST', headers: { 'x-vercel-forwarded-for': ipx } }); const res = mockRes(); await cfg(req, res); return res.statusCode; };
    for (let i = 0; i < 14; i++) expect(await post({ e: 'client_error', m: `err ${i}`, r: '/x' }, '198.51.100.7')).toBe(204);
    expect((await mon.recentProblems()).recent).toHaveLength(10);      // 10 per 10 minutes per visitor
  });
  it('/api/config?health=1 answers 200 with yes/no flags only, and no secret values', async () => {
    await fresh({ RESEND_API_KEY: 're_secretvalue123', ORDER_FROM_EMAIL: 'x@y.z' });
    const { default: cfg } = await import('../api/config.js');
    const req = mockReq(undefined, { method: 'GET', headers: { 'x-vercel-forwarded-for': '203.0.113.9' } }); req.query = { health: '1' };
    const res = mockRes(); await cfg(req, res);
    expect(res.statusCode).toBe(200);
    expect(res.body).toMatchObject({ ok: true, store: true, payments: true, email: true, alerts: false, backupEncryption: false });
    expect(JSON.stringify(res.body)).not.toMatch(/secretvalue|rzp_|kkkk/);
  });
  it('the admin dashboard carries health and problems', async () => {
    const { mon } = await fresh();
    await mon.capture('stock_error', { msg: 'x' });
    const res = await admin({ view: 'dashboard' }, bearer(ADMIN));
    expect(res.statusCode).toBe(200);
    expect(res.body.problems.recent[0].kind).toBe('stock_error'); expect(res.body.health.ok).toBe(true);
  });
  it('the browser side caps reports and skips known noise', () => {
    const s = fs.readFileSync(path.join(ROOT, 'src/lib/errorReport.js'), 'utf8');
    expect(s).toContain('sent >= 5'); expect(s).toContain('ResizeObserver loop');
    expect(fs.readFileSync(path.join(ROOT, 'src/App.jsx'), 'utf8')).toContain('<ErrorBoundary resetKey={pathname}>');
  });
});

describe('H2 · backups', () => {
  async function seed(g) {
    await g.store([
      ['SET', 'order:o1', JSON.stringify({ id: 'o1', customer: { email: 'buyer@example.com', name: 'Asha' } })], ['SET', 'order:seq', '41'],
      ['ZADD', 'orders:index', 100, 'o1', 200, 'o2'], ['HSET', 'pov', 'own-sample-tee', '{"price":499}', 'x', 'y'],
      ['LPUSH', 'campaigns', 'second'], ['LPUSH', 'campaigns', 'first'],
      ['SET', 'rev:window', 'v', 'EX', 5000],
      // short-lived things that must NOT be backed up:
      ['SET', 'sess:abc', '1'], ['SET', 'rl:login:1.2.3.4', '3'], ['SET', 'hold:p:M', '1'], ['SET', 'login:t', '1'],
    ]);
  }
  it('dumps every kind of key, skips the short-lived ones, keeps expiry', async () => {
    const { g, bk } = await fresh(); await seed(g);
    const d = await bk.dumpAll();
    const keys = d.items.map(i => i.k);
    expect(keys).toEqual(['campaigns', 'order:o1', 'order:seq', 'orders:index', 'pov', 'rev:window']);
    const by = Object.fromEntries(d.items.map(i => [i.k, i]));
    expect(by.campaigns).toMatchObject({ t: 'list', v: ['first', 'second'] });
    expect(by['orders:index']).toMatchObject({ t: 'zset', v: { o1: '100', o2: '200' } });
    expect(by.pov).toMatchObject({ t: 'hash', v: { 'own-sample-tee': '{"price":499}', x: 'y' } });
    expect(by['rev:window'].ms).toBeGreaterThan(4_000_000);
    expect(bk.summarise(d)).toMatchObject({ keys: 6, orders: 1 });
  });
  it('seal/unseal round-trips plain and encrypted; encrypted hides the data', async () => {
    const { g, bk } = await fresh(); await seed(g);
    const d = await bk.dumpAll();
    expect(bk.unseal(bk.seal(d)).check).toBe(d.check);
    const enc = bk.seal(d, PASS);
    expect(bk.unseal(enc, PASS).items).toEqual(d.items);
    expect(enc.toString('latin1')).not.toContain('buyer@example.com');
    expect(zlib.gunzipSync(bk.seal(d)).toString()).toContain('buyer@example.com');   // plain really is plain
  });
  it('wrong passphrase, missing passphrase, damaged file, edited content: all refused with a clear message', async () => {
    const { g, bk } = await fresh(); await seed(g);
    const d = await bk.dumpAll(); const enc = bk.seal(d, PASS);
    expect(() => bk.unseal(enc, 'wrong passphrase!!')).toThrow(/Wrong passphrase/);
    expect(() => bk.unseal(enc)).toThrow(/passphrase is needed/);
    const flipped = Buffer.from(enc); flipped[flipped.length - 5] ^= 1;
    expect(() => bk.unseal(flipped, PASS)).toThrow(/Wrong passphrase, or the file is damaged/);
    expect(() => bk.unseal(Buffer.from('not a backup'))).toThrow(/Not a valid backup/);
    const edited = JSON.parse(JSON.stringify(d)); edited.items[1].v = '{"id":"o1","hacked":true}';
    expect(() => bk.unseal(zlib.gzipSync(JSON.stringify(edited)))).toThrow(/checksum/);
  });
  it('restores into an empty database identically, and refuses to overwrite a non-empty one', async () => {
    const A = await fresh(); await seed(A.g);
    const d = await A.bk.dumpAll(); const file = A.bk.seal(d, PASS);
    const B = await fresh();                                         // a brand-new empty store
    const r = await B.bk.restoreDump(B.bk.unseal(file, PASS));
    expect(r.written).toBe(6);
    const d2 = await B.bk.dumpAll();
    const norm = (x) => x.items.map(i => ({ ...i, ms: i.ms ? 1 : 0 }));
    expect(norm(d2)).toEqual(norm(d)); expect(d2.items.find(i => i.k === 'rev:window').ms).toBeGreaterThan(4_000_000);
    await expect(B.bk.restoreDump(B.bk.unseal(file, PASS))).rejects.toThrow(/already has 6 records/);
    await B.g.store([['SET', 'order:o1', 'changed']]);
    await B.bk.restoreDump(B.bk.unseal(file, PASS), { force: true });
    expect((await B.g.store([['GET', 'order:o1']]))[0]).toContain('buyer@example.com');
  });
  it('a restore does not bring back sessions or other short-lived keys even if a file contains them', async () => {
    const { g, bk } = await fresh();
    const items = [{ k: 'sess:evil', t: 'string', v: '1', ms: 0 }, { k: 'order:ok', t: 'string', v: '1', ms: 0 }];
    const dump = { format: 'shonowear-backup', version: 1, createdAt: new Date().toISOString(), count: 2, check: (await import('node:crypto')).createHash('sha256').update(JSON.stringify(items)).digest('hex'), items };
    expect((await bk.restoreDump(bk.unseal(bk.seal(dump)))).written).toBe(1);
    expect((await g.store([['GET', 'sess:evil']]))[0]).toBeNull();
  });
  it('the admin download needs the admin token and returns a file that decrypts', async () => {
    const { g, bk } = await fresh({ BACKUP_PASSPHRASE: PASS }); await seed(g);
    expect((await admin({ view: 'backup' })).statusCode).toBe(401);
    const res = await admin({ view: 'backup' }, bearer(ADMIN));
    expect(res.statusCode).toBe(200); expect(res.body).toMatchObject({ encrypted: true, orders: 1 }); expect(res.body.name).toMatch(/\.swb$/);
    expect(bk.unseal(Buffer.from(res.body.base64, 'base64'), PASS).count).toBe(6);
  });
  it('the daily cron: only with CRON_SECRET, only e-mails an encrypted file', async () => {
    const { g, bk, mails } = await fresh({ CRON_SECRET: CRON, BACKUP_PASSPHRASE: PASS }); await seed(g);
    expect((await admin({ view: 'backup-cron' }, bearer('wrong'.repeat(5)))).statusCode).toBe(401);
    await admin({ view: 'backup-cron' }, bearer(ADMIN));
    expect(mails).toHaveLength(0);                                   // the admin token does not trigger the e-mail path
    const ok = await admin({ view: 'backup-cron' }, bearer(CRON));
    expect(ok.statusCode).toBe(200); expect(mails).toHaveLength(1);
    const f = mails[0].file; expect(f.name).toMatch(/\.swb$/);
    expect(Buffer.from(f.base64, 'base64').toString('latin1')).not.toContain('buyer@example.com');
    expect(bk.unseal(Buffer.from(f.base64, 'base64'), PASS).count).toBe(6);
  });
  it('the cron refuses to e-mail without a strong passphrase, and is off without a long CRON_SECRET', async () => {
    const a = await fresh({ CRON_SECRET: CRON, BACKUP_PASSPHRASE: 'short' }); await seed(a.g);
    expect((await admin({ view: 'backup-cron' }, bearer(CRON))).statusCode).toBe(412); expect(a.mails).toHaveLength(0);
    await fresh({ CRON_SECRET: 'tooshort', BACKUP_PASSPHRASE: PASS });
    expect((await admin({ view: 'backup-cron' }, bearer('tooshort'))).statusCode).toBe(401);
  });
  it('the schedule is configured, scripts exist, and backup files are git-ignored', () => {
    const v = JSON.parse(fs.readFileSync(path.join(ROOT, 'vercel.json'), 'utf8'));
    expect(v.crons[0].path).toBe('/api/admin/orders?view=backup-cron');
    for (const f of ['scripts/backup.mjs', 'scripts/restore.mjs']) expect(fs.existsSync(path.join(ROOT, f))).toBe(true);
    expect(fs.readFileSync(path.join(ROOT, '.gitignore'), 'utf8')).toContain('backups/');
  });
});

/* ───────────── H3 · images ───────────── */
import os from 'node:os';
import { execFileSync } from 'node:child_process';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { srcSetFor, imgProps } from '../src/lib/img.js';
import Img from '../src/components/Img.jsx';
import sharp from 'sharp';

describe('H3 · responsive images', () => {
  const U = 'https://images.unsplash.com/photo-1576566588028-4147f3842f27?w=400&h=500&fit=crop';
  it('Unsplash photos are requested at several widths, keeping the 4:5 shape and the crop', () => {
    const set = srcSetFor(U).split(', ');
    expect(set).toHaveLength(4);
    const first = new URL(set[0].split(' ')[0]);
    expect(first.searchParams.get('w')).toBe('240'); expect(first.searchParams.get('h')).toBe('300');
    expect(first.searchParams.get('fit')).toBe('crop'); expect(first.searchParams.get('auto')).toBe('format');
    expect(set.at(-1)).toMatch(/w=960&h=1200.* 960w$/);
    for (const e of set) expect(e.startsWith('https://images.unsplash.com/photo-1576566588028-4147f3842f27?')).toBe(true);   // never another host
  });
  it('a photo with no h keeps no h; custom widths are honoured', () => {
    expect(srcSetFor('https://images.unsplash.com/photo-1?w=800', [100, 200])).not.toContain('h=');
    expect(srcSetFor(U, [168, 252]).split(', ')).toHaveLength(2);
  });
  it('your own photos map to the files the script writes; other links and junk are left alone', () => {
    expect(srcSetFor('/p/black-tee.jpg')).toBe('/p/black-tee-480.webp 480w, /p/black-tee-800.webp 800w, /p/black-tee-1200.webp 1200w');
    expect(srcSetFor('/p/../etc/passwd.jpg')).toBeUndefined();
    for (const x of ['https://example.com/a.jpg', 'data:image/png;base64,AAA', '', null, undefined, 42, 'not a url']) expect(srcSetFor(x), String(x)).toBeUndefined();
    expect(imgProps('https://example.com/a.jpg')).toEqual({ src: 'https://example.com/a.jpg' });
  });
  it('the component is lazy and async by default; priority makes the first picture eager and high priority', () => {
    const lazy = renderToStaticMarkup(createElement(Img, { src: U, sizes: '50vw', alt: 'x' }));
    expect(lazy).toContain('loading="lazy"'); expect(lazy).toContain('decoding="async"'); expect(lazy).toContain('srcSet='); expect(lazy).toContain('sizes="50vw"'); expect(lazy).not.toContain('fetchpriority');
    const top = renderToStaticMarkup(createElement(Img, { src: U, priority: true }));
    expect(top).toContain('loading="eager"'); expect(top).toContain('fetchpriority="high"');
  });
  it('the main product pictures all go through the component', () => {
    for (const f of ['src/components/ProductCard.jsx', 'src/components/Gallery.jsx', 'src/pages/Bag.jsx', 'src/pages/Builder.jsx', 'src/components/LookBoard.jsx']) {
      const s = fs.readFileSync(path.join(ROOT, f), 'utf8'); expect(s, f).toContain("import Img from"); expect(s, f).not.toMatch(/<img src=\{(product|p)\.image\}/);
    }
  });
  it('npm run photos resizes, crops to 4:5, converts to WebP and strips camera and location data', async () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'sw-photos-'));
    fs.mkdirSync(path.join(tmp, 'photos'));
    // a 3000x2000 landscape photo that carries GPS-like EXIF and a rotate-me orientation flag
    await sharp({ create: { width: 3000, height: 2000, channels: 3, background: { r: 200, g: 40, b: 60 } } }).jpeg().withExif({ IFD0: { Copyright: 'secret-owner', Orientation: '6' }, IFD3: { GPSLatitudeRef: 'N' } }).toFile(path.join(tmp, 'photos', 'Black Tee (1).jpg'));
    fs.writeFileSync(path.join(tmp, 'photos', 'notes.txt'), 'ignore me');
    const out = execFileSync('node', [path.join(ROOT, 'scripts/optimize-images.mjs')], { cwd: tmp, encoding: 'utf8' });
    expect(out).toContain('/p/black-tee-1.jpg');
    for (const w of [480, 800, 1200]) {
      const m = await sharp(path.join(tmp, 'public/p', `black-tee-1-${w}.webp`)).metadata();
      expect([m.format, m.width, m.height]).toEqual(['webp', w, Math.round(w * 1.25)]);
      expect(m.exif).toBeUndefined();
    }
    const j = await sharp(path.join(tmp, 'public/p/black-tee-1.jpg')).metadata();
    expect([j.format, j.width, j.height]).toEqual(['jpeg', 1200, 1500]);
    expect(fs.readFileSync(path.join(tmp, 'public/p/black-tee-1.jpg')).includes('secret-owner')).toBe(false);
    expect(fs.statSync(path.join(tmp, 'public/p/black-tee-1-480.webp')).size).toBeLessThan(30_000);
    expect(fs.readdirSync(path.join(tmp, 'public/p'))).toHaveLength(4);
    fs.rmSync(tmp, { recursive: true, force: true });
  });
  it('a missing photos folder gives a clear message', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'sw-photos-'));
    let err = ''; try { execFileSync('node', [path.join(ROOT, 'scripts/optimize-images.mjs')], { cwd: tmp, stdio: 'pipe' }); } catch (e) { err = String(e.stderr); }
    expect(err).toContain('Create a "photos" folder'); fs.rmSync(tmp, { recursive: true, force: true });
  });
});

import { readFileSync as rf, readdirSync as rd, statSync as st } from 'node:fs';
import { join as jn } from 'node:path';
describe('H4 accessibility guards', () => {
  const walk = d => rd(d).flatMap(f => { const p = jn(d, f); return st(p).isDirectory() ? walk(p) : /\.jsx?$/.test(p) ? [p] : []; });
  it('red text uses the --red-text token, defined for both themes', () => {
    const css = rf('src/index.css', 'utf8');
    expect((css.match(/--red-text:/g) || []).length).toBeGreaterThanOrEqual(2);
    const bad = walk('src').filter(f => /color:\s*'var\(--red\)'/.test(rf(f, 'utf8')));
    expect(bad).toEqual([]);
  });
  it('the chat launcher label starts with its visible text', () => {
    expect(rf('src/components/ChatWidget.jsx', 'utf8')).toMatch(/'Ask Shono, the style assistant'/);
  });
  it('the skip link focuses main', () => {
    expect(rf('src/components/Navbar.jsx', 'utf8')).toMatch(/skip-link[\s\S]{0,200}focus\(/);
  });
});

describe('H1 critical alert list', () => {
  it('covers every payment-critical failure', async () => {
    const { CRITICAL } = await import('../server/monitor.js');
    for (const k of ['webhook_error', 'webhook_amount_mismatch', 'checkout_error', 'verify_error', 'refund_call_failed', 'refund_mirror_failed', 'stock_error', 'order_email_failed']) expect(CRITICAL).toContain(k);
  });
});
