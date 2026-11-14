import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { BRAND, markInner, markSvg } from '../src/brand/mark.js';
import Logo from '../src/components/Logo.jsx';
import { TOP, BOTTOM, canRun3D } from '../src/components/Mark3D.jsx';

const ROOT = path.resolve(import.meta.dirname, '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

describe('G1 · brand mark and logo', () => {
  it('the mark is valid SVG in the brand colours, transparent or on the dark tile', () => {
    const s = markSvg({ size: 64, rounded: 22 });
    expect(s).toContain('viewBox="0 0 100 100"'); expect(s).toContain(BRAND.dark); expect(s).toContain(BRAND.red); expect(s).toContain(BRAND.light);
    expect(markSvg({ bg: false })).not.toContain('<rect');
    expect((s.match(/<svg/g) || []).length).toBe(1);
  });
  it('the logo shows the wordmark as real text, hides the decorative mark, and labels the mark-only version', () => {
    const full = renderToStaticMarkup(createElement(Logo, { height: 30 }));
    expect(full).toContain('SHONO'); expect(full).toContain('WEAR'); expect(full).toContain('aria-hidden="true"');
    const mark = renderToStaticMarkup(createElement(Logo, { markOnly: true }));
    expect(mark).not.toContain('SHONO'); expect(mark).toContain('aria-label="Shonowear"');
  });
  it('the 3D mark is drawn from exactly the same coordinates as the flat mark', () => {
    const nums = (d) => d.match(/-?\d+(?:\.\d+)?/g).map(Number);
    const ds = [...markInner().matchAll(/ d="([^"]+)"/g)].map(m => nums(m[1]));
    expect(ds).toHaveLength(2);
    expect(ds[0]).toEqual(TOP.flatMap(([, ...a]) => a));
    expect(ds[1]).toEqual(BOTTOM.flatMap(([, ...a]) => a));
  });
  it('icons and the preview image are generated and the favicon is the same mark', () => {
    for (const f of ['public/favicon.svg', 'public/og-image.jpg', 'public/icons/icon-192.png', 'public/icons/icon-512.png', 'public/icons/maskable-512.png', 'public/icons/apple-touch-icon.png']) expect(fs.statSync(path.join(ROOT, f)).size, f).toBeGreaterThan(200);
    expect(read('public/favicon.svg')).toContain(markInner());
    expect(fs.readFileSync(path.join(ROOT, 'public/icons/icon-512.png')).subarray(1, 4).toString()).toBe('PNG');
  });
  it('the header and footer use the logo component, not loose text', () => {
    expect(read('src/components/Navbar.jsx')).toContain('<Logo'); expect(read('src/components/Footer.jsx')).toContain('<Logo');
  });
});

describe('G2 · motion respects people who turn it off', () => {
  const css = read('src/index.css');
  it('every animation class has a reduced-motion switch-off', () => {
    const rm = css.slice(css.lastIndexOf('@media (prefers-reduced-motion: reduce)'));
    for (const sel of ['.page', '.bump', '[data-reveal]', '.tilt']) expect(rm, sel).toContain(sel);
  });
  it('nothing is hidden by default: only elements the script marks as pending start invisible', () => {
    const hidden = [...css.matchAll(/([^{}]+)\{[^}]*opacity:\s*0[;\s}][^}]*\}/g)].map(m => m[1].trim()).filter(s => /reveal/.test(s));
    expect(hidden).toEqual(["[data-reveal='pending']"]);
    expect(read('src/components/Reveal.jsx')).toContain("typeof IntersectionObserver !== 'function'");
    expect(read('src/components/Reveal.jsx')).toContain('reduced()');
  });
  it('tilt only runs for a mouse', () => { expect(read('src/components/Tilt.jsx')).toContain('(hover: hover) and (pointer: fine)'); });
});

describe('G3 · 3D only where it can work', () => {
  const stub = (o) => { globalThis.window = {}; Object.defineProperty(globalThis, 'navigator', { value: o.nav || {}, configurable: true, writable: true }); globalThis.document = { createElement: () => ({ getContext: () => (o.gl ? {} : null) }) }; window.matchMedia = () => ({ matches: !!o.reduce }); };
  it('runs only with WebGL, normal motion and no data-saver', () => {
    stub({ gl: true }); expect(canRun3D()).toBe(true);
    stub({ gl: true, reduce: true }); expect(canRun3D()).toBe(false);
    stub({ gl: false }); expect(canRun3D()).toBe(false);
    stub({ gl: true, nav: { connection: { saveData: true } } }); expect(canRun3D()).toBe(false);
  });
  it('three.js is loaded on demand, never in the main bundle', () => {
    for (const f of ['src/components/Mark3D.jsx', 'src/components/Hero3D.jsx']) { const s = read(f); expect(s).toContain("import('three')"); expect(s).not.toMatch(/^import .* from 'three'/m); }
  });
  it('the 3D pieces release their GPU resources and stop when hidden', () => {
    const s = read('src/components/Mark3D.jsx');
    for (const k of ['dispose()', 'cancelAnimationFrame', 'IntersectionObserver', 'document.hidden', 'forceContextLoss']) expect(s).toContain(k);
  });
});

describe('G4 · fonts come from our own site', () => {
  it('no Google Fonts anywhere: page, policy header or code', () => {
    expect(read('index.html')).not.toMatch(/googleapis|gstatic/);
    const v = read('vercel.json'); expect(v).not.toMatch(/googleapis|gstatic/);
    expect(v).toContain("font-src 'self';");
  });
  it('every font family the CSS asks for is bundled, with the weights used', () => {
    const main = read('src/main.jsx');
    for (const w of ['300', '400', '500', '600']) expect(main).toContain(`@fontsource/poppins/${w}.css`);
    for (const f of ['@fontsource/bebas-neue/400.css', '@fontsource/dm-serif-display/400.css', '@fontsource/noto-sans-devanagari/400.css', '@fontsource/noto-sans-devanagari/700.css']) expect(main).toContain(f);
    const css = read('index.html') + read('src/index.css');
    for (const fam of ['Bebas Neue', 'DM Serif Display', 'Poppins', 'Noto Sans Devanagari']) expect(css).toContain(fam);
  });
  it('the files exist in the installed packages (npm ci installs them)', () => {
    for (const p of ['poppins/400.css', 'poppins/600.css', 'bebas-neue/400.css', 'dm-serif-display/400-italic.css', 'noto-sans-devanagari/600.css']) expect(fs.existsSync(path.join(ROOT, 'node_modules/@fontsource', p)), p).toBe(true);
    const deps = JSON.parse(read('package.json')).dependencies;
    for (const k of ['poppins', 'bebas-neue', 'dm-serif-display', 'noto-sans-devanagari']) expect(deps[`@fontsource/${k}`], k).toMatch(/^\d/);   // pinned exactly
  });
});

describe('G4 · the privacy page matches the fonts', () => {
  it('no longer lists Google Fonts as a processor', () => { expect(read('src/pages/Privacy.jsx')).not.toMatch(/Google Fonts/); });
});
