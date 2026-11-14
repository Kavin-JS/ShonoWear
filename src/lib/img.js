/**
 * Right-sized product pictures.
 *  - Unsplash links: the same photo is requested at several widths (and as WebP/AVIF automatically), so a phone downloads a small file.
 *  - Your own photos: put originals in `photos/` and run `npm run photos` (see scripts/optimize-images.mjs). Use "/p/<name>.jpg" as the
 *    product image; the script writes <name>-480.webp, -800.webp, -1200.webp next to it and this file builds the srcset from them.
 *  - Any other https link is used as is.
 */
export const LOCAL_WIDTHS = [480, 800, 1200];
const UNSPLASH = 'images.unsplash.com';

export function srcSetFor(url, widths = [240, 400, 640, 960]) {
  try {
    if (typeof url !== 'string') return undefined;
    if (/^\/p\/[\w.-]+\.jpe?g$/i.test(url)) {
      const base = url.replace(/\.jpe?g$/i, '');
      return LOCAL_WIDTHS.map(w => `${base}-${w}.webp ${w}w`).join(', ');
    }
    const u = new URL(url);
    if (u.hostname !== UNSPLASH) return undefined;
    const w0 = Number(u.searchParams.get('w')) || 400, h0 = Number(u.searchParams.get('h')) || 0;
    return widths.map(w => {
      const v = new URL(u); v.searchParams.set('w', String(w));
      if (h0) v.searchParams.set('h', String(Math.round((w * h0) / w0)));
      v.searchParams.set('q', '70'); v.searchParams.set('auto', 'format');
      return `${v.toString()} ${w}w`;
    }).join(', ');
  } catch { return undefined; }
}

/** Props for an <img>: src (fallback), srcSet and sizes. `sizes` says how wide the picture is drawn, e.g. "(max-width: 600px) 50vw, 25vw". */
export function imgProps(url, { sizes, widths } = {}) {
  const srcSet = srcSetFor(url, widths);
  return srcSet ? { src: url, srcSet, sizes: sizes || '100vw' } : { src: url };
}
