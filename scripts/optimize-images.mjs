// Turns your original product photos into small, fast web files.
//   1. Put the originals (jpg, png, webp, heic) in the folder  photos/   — name them like  black-tee.jpg
//   2. npm run photos
//   3. In src/data/catalog.js use  image: '/p/black-tee.jpg'  (and the same for extra gallery photos)
// Output goes to public/p/:  black-tee.jpg (1200 px wide, the fallback)  and  black-tee-480.webp, -800.webp, -1200.webp.
// Photos are rotated by their camera tag, stripped of location data, and cropped to 4:5 (the shop's card shape) around the centre.
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';

const IN = process.argv[2] || 'photos', OUT = 'public/p';
const WIDTHS = [480, 800, 1200];
if (!fs.existsSync(IN)) { console.error(`Create a "${IN}" folder and put your photos in it first.`); process.exit(1); }
fs.mkdirSync(OUT, { recursive: true });
const files = fs.readdirSync(IN).filter(f => /\.(jpe?g|png|webp|heic|heif|avif)$/i.test(f));
if (!files.length) { console.error(`No photos found in ${IN}/.`); process.exit(1); }
let bytesIn = 0, bytesOut = 0;
for (const f of files) {
  const name = path.parse(f).name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  if (!name) { console.warn('Skipped (unusable name):', f); continue; }
  const src = path.join(IN, f); bytesIn += fs.statSync(src).size;
  const base = sharp(src, { failOn: 'none' }).rotate();                 // .rotate() applies the EXIF orientation; metadata is dropped on output
  const meta = await base.metadata();
  if ((meta.width || 0) < 600) console.warn(`  ${f} is only ${meta.width}px wide: it will look soft on large screens.`);
  for (const w of WIDTHS) {
    const out = path.join(OUT, `${name}-${w}.webp`);
    await base.clone().resize({ width: w, height: Math.round(w * 1.25), fit: 'cover', position: 'attention', withoutEnlargement: false }).webp({ quality: 74, effort: 5 }).toFile(out);
    bytesOut += fs.statSync(out).size;
  }
  const jpg = path.join(OUT, `${name}.jpg`);
  await base.clone().resize({ width: 1200, height: 1500, fit: 'cover', position: 'attention' }).jpeg({ quality: 78, mozjpeg: true, progressive: true }).toFile(jpg);
  bytesOut += fs.statSync(jpg).size;
  console.log(`✓ ${f} → /p/${name}.jpg`);
}
console.log(`\nDone: ${files.length} photo(s), ${(bytesIn / 1e6).toFixed(1)} MB in, ${(bytesOut / 1e6).toFixed(1)} MB out (all sizes together).`);
