// npm run import:products -- products.csv        → writes src/data/catalogImported.js (replaces the previous import)
import fs from 'node:fs';
import { rowsToProducts, renderModule } from '../src/lib/productCsv.js';
import { catalog } from '../src/data/catalog.js';
import { importedProducts } from '../src/data/catalogImported.js';

const file = process.argv[2];
if (!file) { console.error('Usage: npm run import:products -- path/to/products.csv'); process.exit(1); }
const prior = new Set(importedProducts.map(p => p.id));
const existing = catalog.filter(p => !prior.has(p.id)).map(p => p.id);       // ids from catalog.js itself; re-importing your own CSV is allowed
const { products, errors } = rowsToProducts(fs.readFileSync(file, 'utf8'), { existingIds: existing });
if (errors.length) { console.error('Nothing was written. Fix these first:\n  ' + errors.join('\n  ')); process.exit(1); }
fs.writeFileSync(new URL('../src/data/catalogImported.js', import.meta.url), renderModule(products));
console.log(`Wrote ${products.length} product(s) to src/data/catalogImported.js. Now run: npm run check:catalog && npm run build`);
