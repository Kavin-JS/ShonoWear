// Fails if the catalogue can't produce complete outfits or has malformed products.
import { catalog } from '../src/data/catalog.js';
import { composeLooks } from '../src/lib/outfitRules.js';

const CATS = ['top', 'bottom', 'footwear', 'outerwear', 'set', 'accessory'];
const PLATFORMS = ['Amazon', 'Myntra'];
const errors = [];
const ids = new Set();

for (const p of catalog) {
  const w = (m) => errors.push(`${p.id || '(no id)'}: ${m}`);
  if (!p.id || ids.has(p.id)) w('missing or duplicate id');
  ids.add(p.id);
  if (!p.name) w('missing name');
  if (!CATS.includes(p.category)) w(`bad category ${p.category}`);
  if (!Number.isInteger(p.price) || p.price <= 0) w('price must be a positive integer');
  if (p.fulfilment === 'own') {
    if (p.platform !== 'Shonowear') w("own products must have platform 'Shonowear'");
    if (p.affiliateUrl) w('own products must not have an affiliateUrl');
    const sizes = p.sizes && typeof p.sizes === 'object' ? Object.entries(p.sizes) : [];
    if (!sizes.length) w('own products need a sizes object, e.g. { M: 5 }');
    for (const [size, n] of sizes) if (!Number.isInteger(n) || n < 0) w(`stock for size ${size} must be a whole number >= 0`);
  } else {
    if (!PLATFORMS.includes(p.platform)) w(`platform must be one of ${PLATFORMS}`);
    if (!/^https:\/\//.test(p.affiliateUrl || '')) w('affiliateUrl must be https');
    else if (p.platform === 'Amazon' && !/amazon\.in/.test(p.affiliateUrl)) w('Amazon product with non-amazon.in url');
  }
  if (!/^https:\/\//.test(p.image || '')) w('image must be https');
  if (!Array.isArray(p.tags) || !p.tags.length) w('missing tags');
  if (!p.explanation) w('missing explanation');
  if (p.images !== undefined && (!Array.isArray(p.images) || p.images.some(u => !/^https:\/\//.test(u)))) w('images must be an array of https URLs');
  if (p.addedAt !== undefined && !(/^\d{4}-\d{2}-\d{2}$/.test(p.addedAt) && !Number.isNaN(Date.parse(p.addedAt)))) w('addedAt must be YYYY-MM-DD');
  if (p.colorGroup !== undefined && (typeof p.colorGroup !== 'string' || !p.colorGroup)) w('colorGroup must be a non-empty string');
  if (p.sizeChart !== undefined && !(['tops', 'bottoms', 'footwear'].includes(p.sizeChart) || (p.sizeChart && typeof p.sizeChart === 'object' && p.sizeChart.rows && Array.isArray(p.sizeChart.columns)))) w('sizeChart must be tops|bottoms|footwear or { columns, rows }');
  if (p.preorder !== undefined) {
    const d = p.preorder && p.preorder.shipsOn;
    if (p.fulfilment !== 'own') w('preorder is only for products we ship');
    else if (!(/^\d{4}-\d{2}-\d{2}$/.test(d || '') && !Number.isNaN(Date.parse(d)))) w('preorder.shipsOn must be YYYY-MM-DD');
  }
  if (p.mrp !== undefined && (!Number.isInteger(p.mrp) || p.mrp <= p.price)) w('mrp must be an integer above the price (or remove it)');
}

const count = (c) => catalog.filter(p => p.category === c).length;
if (!count('top') || !count('bottom') || !count('footwear')) errors.push('catalogue needs at least one top, bottom and footwear');

// Can each budget tier be served with 4 looks per aesthetic/occasion?
const report = [];
for (const aesthetic of ['streetwear', 'minimal', 'bold', 'classic']) {
  for (const occasion of ['casual', 'datenight', 'work', 'festival']) {
    for (const budget of ['low', 'mid', 'high']) {
      const r = composeLooks({ aesthetic, occasion, budget });
      if (!r.looks.length) errors.push(`no complete look for ${aesthetic}/${occasion}/${budget}`);
      if (r.overBudget || r.looks.length < 4) report.push(`${aesthetic}/${occasion}/${budget}: ${r.looks.length} looks${r.overBudget ? ` (over budget, from ₹${r.minPrice})` : ''}`);
    }
  }
}

const budgets = Object.fromEntries(['low', 'mid', 'high'].map(b => [b, composeLooks({ aesthetic: 'streetwear', occasion: 'casual', budget: b })]));
console.log(`Catalogue: ${catalog.length} products`);
for (const c of CATS) console.log(`  ${c}: ${count(c)}`);
console.log(`Cheapest complete outfit: ₹${budgets.high.minPrice}`);
if (report.length) {
  console.log(`\nCoverage gaps (${report.length} of 48 combinations give fewer than 4 in-budget looks) — add products to fix:`);
  report.slice(0, 6).forEach(r => console.log('  ' + r));
  if (report.length > 6) console.log(`  …and ${report.length - 6} more`);
}
if (errors.length) { console.error('\nERRORS:\n' + errors.map(e => '  ✗ ' + e).join('\n')); process.exit(1); }
console.log('\nCatalogue OK');
