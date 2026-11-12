// Run before going live:  npm run check:launch
// Fails on anything that would make the site look finished while earning nothing.
import fs from 'node:fs';
import { catalog } from '../src/data/catalog.js';
import { STORE, hasPlaceholders } from '../src/data/storeConfig.js';

const problems = [];
const warn = [];

const affiliate = catalog.filter(p => p.fulfilment !== 'own');
const placeholders = affiliate.filter(p => /[?&]tag=shonowear-21\b/.test(p.affiliateUrl));
if (placeholders.length) problems.push(`${placeholders.length} products still use the placeholder Amazon tag "shonowear-21". Replace it with your real Associates tag or you earn nothing.`);
const amazonNoTag = affiliate.filter(p => p.platform === 'Amazon' && !/[?&]tag=/.test(p.affiliateUrl));
if (amazonNoTag.length) problems.push(`${amazonNoTag.length} Amazon products have no tag= parameter.`);
const myntraDirect = affiliate.filter(p => p.platform === 'Myntra' && /^https:\/\/www\.myntra\.com/.test(p.affiliateUrl));
if (myntraDirect.length) warn.push(`${myntraDirect.length} Myntra links go straight to myntra.com. They only earn if replaced with Admitad/vCommission tracking links.`);

const samples = catalog.filter(p => p.sample);
if (samples.length) problems.push(`${samples.length} SAMPLE products are still in the catalogue (${samples.map(p => p.id).join(', ')}). Delete them or customers could pay for products that don't exist.`);
if (hasPlaceholders()) problems.push('src/data/storeConfig.js still contains YOUR… placeholders (legal name, address, support email). Payment gateways and the law require real details.');
if (!catalog.some(p => p.fulfilment === 'own' && !p.sample)) warn.push('No real own-stock products yet: checkout will have nothing to sell. That is fine if you only want affiliate links.');
if (!fs.existsSync('public/og-image.jpg')) problems.push('public/og-image.jpg is missing (used for link previews).');
const privacy = fs.readFileSync('src/pages/Privacy.jsx', 'utf8');
if (/hello@shonowear\.com/.test(privacy)) warn.push('Privacy page lists hello@shonowear.com. Make sure you can receive mail at that address.');
if (/shonowear\.com/.test(fs.readFileSync('index.html', 'utf8'))) warn.push('index.html references shonowear.com. Make sure that is your real domain.');

for (const w of warn) console.log('⚠ ' + w);
if (problems.length) { console.error(problems.map(p => '✗ ' + p).join('\n')); process.exit(1); }
console.log('Launch check passed');
