// After `vite build`: writes a ready-made HTML file for every public URL (dist/<path>/index.html) with the right
// title, description, preview image, canonical link and structured data in the <head>, plus a plain-text summary
// for people and bots without JavaScript. The shop itself still runs as the normal single-page app.
// Vercel serves a static file before it applies the SPA rewrite, so these simply win for their own URLs.
// Needs SITE_URL for absolute preview links (WhatsApp/Instagram need absolute og:image). Without it, links stay relative.
import fs from 'node:fs';
import path from 'node:path';
import { metaFor, publicPaths } from '../src/lib/seoMeta.js';
import { esc, headFor } from './headHtml.mjs';

const site = (process.env.SITE_URL || '').replace(/\/+$/, '');
const dist = 'dist';
if (!fs.existsSync(path.join(dist, 'index.html'))) { console.error('Run vite build first.'); process.exit(1); }
if (site && !/^https?:\/\//.test(site)) { console.error('SITE_URL must start with http:// or https://'); process.exit(1); }
if (!site) console.log('prerender: SITE_URL not set — preview images/canonicals will be relative (set it for real deploys).');

const tpl = fs.readFileSync(path.join(dist, 'index.html'), 'utf8');
const A = '<!--SEO:START-->', B = '<!--SEO:END-->';
if (!tpl.includes(A) || !tpl.includes(B)) { console.error('index.html is missing the SEO markers.'); process.exit(1); }
let n = 0;
for (const p of publicPaths()) {
  const m = metaFor(p, { siteUrl: site });
  let html = tpl.slice(0, tpl.indexOf(A) + A.length) + '\n' + headFor(m) + '\n    ' + tpl.slice(tpl.indexOf(B));
  if (m.summary) html = html.replace('<div id="root"></div>', `<div id="root"></div>\n    <noscript><h1>${esc(m.title)}</h1><p>${esc(m.summary).slice(0, 4000)}</p></noscript>`);
  const out = p === '/' ? path.join(dist, 'index.html') : path.join(dist, p, 'index.html');
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, html); n++;
}
console.log(`prerender: ${n} pages written`);

// Give the service worker a cache name that changes with every build.
const swPath = path.join(dist, 'sw.js');
if (fs.existsSync(swPath)) fs.writeFileSync(swPath, fs.readFileSync(swPath, 'utf8').replace('__BUILD_ID__', Date.now().toString(36)));
