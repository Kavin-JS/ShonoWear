// Draws the app icons and the link-preview image from a simple brand mark, using the browser that Playwright already has.
// Run: node scripts/make-icons.mjs   → public/icons/*.png, public/og-image.jpg, public/favicon.svg
// Replace the brand mark (the SVG below) with your real logo later and run this again.
import fs from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');

import { BRAND, markSvg } from '../src/brand/mark.js';
const BG = BRAND.dark, RED = BRAND.red;
const mark = (size, pad = 0) => markSvg({ size, pad });
fs.mkdirSync('public/icons', { recursive: true });
fs.writeFileSync('public/favicon.svg', markSvg({ size: 100, rounded: 22 }).replace('width="100" height="100" ', ''));
const font = fs.readFileSync('node_modules/@fontsource/bebas-neue/files/bebas-neue-latin-400-normal.woff2').toString('base64');
const br = await chromium.launch(); const p = await br.newPage();
async function png(file, size, pad) {
  await p.setViewportSize({ width: size, height: size });
  await p.setContent(`<body style="margin:0;background:${BG}">${mark(size, pad)}</body>`);
  await p.screenshot({ path: file, clip: { x: 0, y: 0, width: size, height: size } });
}
await png('public/icons/icon-192.png', 192, 0);
await png('public/icons/icon-512.png', 512, 0);
await png('public/icons/maskable-512.png', 512, 14);      // extra safe area so Android can crop it into a circle
await png('public/icons/apple-touch-icon.png', 180, 0);
await p.setViewportSize({ width: 1200, height: 630 });
await p.setContent(`<body style="margin:0;width:1200px;height:630px;background:${BG};display:flex;align-items:center;justify-content:center;gap:40px;font-family:Bebas,Impact,sans-serif;color:#f4f4f6"><style>@font-face{font-family:Bebas;src:url(data:font/woff2;base64,${font}) format('woff2')}</style>
<div style="width:170px;height:170px">${mark(170)}</div><div><div style="font-size:120px;letter-spacing:4px;line-height:1">SHONO<span style="color:${RED}">WEAR</span></div><div style="font:30px Arial,sans-serif;color:#aaa;margin-top:8px">Streetwear and a free outfit stylist, made for India</div></div></body>`);
await p.screenshot({ path: 'public/og-image.jpg', type: 'jpeg', quality: 88 });
await br.close();
console.log('icons written');
