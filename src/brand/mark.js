/**
 * SHONOWEAR brand mark: one place for the colours and the drawing, shared by the website logo and by
 * scripts/make-icons.mjs (favicon, app icons, preview image). To rebrand, edit this file and run
 * `node scripts/make-icons.mjs`, or replace the PNG/SVG files in public/ with your own logo.
 * The mark is an "S" drawn with strokes (no font needed): white top half, red bottom half, on the dark brand colour.
 */
export const BRAND = { dark: '#08080f', red: '#e8153a', light: '#f4f4f6' };

/** Inner drawing on a 100×100 canvas (no background). `scale`/`pad` shrink it for maskable icons. */
export const markInner = ({ red = BRAND.red, light = BRAND.light } = {}) =>
  // An "S" in two halves: the top in white, the bottom in red. Rounded joins, square ends.
  `<path d="M71 29L41 29Q28 29 28 40.5Q28 50 41 50" fill="none" stroke="${light}" stroke-width="11" stroke-linejoin="round"/>` +
  `<path d="M41 50L59 50Q72 50 72 61Q72 72 59 72L27 72" fill="none" stroke="${red}" stroke-width="11" stroke-linejoin="round"/>`;

/** Full SVG string. `bg` = false makes it transparent (for the website logo). */
export function markSvg({ size = 100, bg = true, pad = 0, rounded = 0 } = {}) {
  const k = (100 - pad * 2) / 100;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 100 100">` +
    (bg ? `<rect width="100" height="100" rx="${rounded}" fill="${BRAND.dark}"/>` : '') +
    `<g transform="translate(${pad} ${pad}) scale(${k})">${markInner()}</g></svg>`;
}
