// Writes dist/sitemap.xml and dist/robots.txt. Needs SITE_URL (e.g. https://shonowear.com) at build time.
import fs from 'node:fs';
import { catalog } from '../src/data/catalog.js';
import { collections } from '../src/data/collections.js';

const site = (process.env.SITE_URL || '').replace(/\/+$/, '');
if (!fs.existsSync('dist')) { console.error('Run the build first.'); process.exit(1); }
if (!/^https?:\/\//.test(site)) {
  console.log('sitemap: SITE_URL not set, skipping (set it at build time, e.g. SITE_URL=https://yourdomain.com npm run build)');
  process.exit(0);
}
const urls = ['/', '/shop', '/upload', '/privacy', '/terms', '/policies/shipping', '/policies/returns', '/contact', '/collections', ...collections.filter(c => catalog.some(c.match)).map(c => `/collection/${c.slug}`), ...catalog.map(p => `/product/${p.id}`)];
fs.writeFileSync('dist/sitemap.xml',
  `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
  urls.map(u => `  <url><loc>${site}${u}</loc></url>`).join('\n') + `\n</urlset>\n`);
fs.writeFileSync('dist/robots.txt', `User-agent: *\nAllow: /\nDisallow: /admin\nDisallow: /order/\nDisallow: /checkout\nDisallow: /api/\nSitemap: ${site}/sitemap.xml\n`);
console.log(`sitemap: ${urls.length} URLs written for ${site}`);
