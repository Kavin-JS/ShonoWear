// Writes dist/sitemap.xml and dist/robots.txt. Needs SITE_URL (e.g. https://shonowear.com) at build time.
import fs from 'node:fs';
import { publicPaths } from '../src/lib/seoMeta.js';

const site = (process.env.SITE_URL || '').replace(/\/+$/, '');
if (!fs.existsSync('dist')) { console.error('Run the build first.'); process.exit(1); }
if (!/^https?:\/\//.test(site)) {
  console.log('sitemap: SITE_URL not set, skipping (set it at build time, e.g. SITE_URL=https://yourdomain.com npm run build)');
  process.exit(0);
}
const urls = publicPaths();
fs.writeFileSync('dist/sitemap.xml',
  `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
  urls.map(u => `  <url><loc>${site}${u}</loc></url>`).join('\n') + `\n</urlset>\n`);
fs.writeFileSync('dist/robots.txt', `User-agent: *\nAllow: /\nDisallow: /admin\nDisallow: /order/\nDisallow: /checkout\nDisallow: /api/\nSitemap: ${site}/sitemap.xml\n`);
console.log(`sitemap: ${urls.length} URLs written for ${site}`);
