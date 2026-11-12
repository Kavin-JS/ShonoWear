/*
  SHONOWEAR — size guide (pure functions).
  Standard Indian-market body measurements in cm. These are GENERAL guides: every brand cuts a little
  differently, so a product can carry its own `sizeChart` in the catalogue, which always wins.
  "Find my size" is an estimate, and says so.
*/
import { sizesOf } from './store.js';

export const CHARTS = {
  tops: {
    title: 'Tops (body measurements, cm)', columns: ['Chest'],
    rows: { XS: [86], S: [91], M: [97], L: [102], XL: [107], XXL: [112] },
  },
  bottoms: {
    title: 'Bottoms (body measurements, cm)', columns: ['Waist'],
    rows: { '28': [71], '30': [76], '32': [81], '34': [86], '36': [91], '38': [97] },
  },
  footwear: {
    title: 'Footwear (foot length, cm)', columns: ['Foot length'],
    rows: { '6': [24.5], '7': [25.4], '8': [26.2], '9': [27.1], '10': [27.9], '11': [28.8] },
  },
};
const KIND = { top: 'tops', outerwear: 'tops', set: 'tops', bottom: 'bottoms', footwear: 'footwear' };

/** Which chart applies: a custom `sizeChart` object, a named one, or the default for the category. Null = none. */
export function chartFor(p) {
  if (!p || !p.sizes) return null;
  const sc = p.sizeChart;
  if (sc && typeof sc === 'object' && sc.rows) return { custom: true, kind: null, ...sc };
  const name = typeof sc === 'string' ? sc : KIND[p.category];
  const chart = CHARTS[name];
  if (!chart) return null;
  const have = sizesOf(p);
  if (!have.some(s => Object.hasOwn(chart.rows, s))) return null;   // e.g. 'One size'
  return { custom: false, kind: name, ...chart };
}

const num = (v) => { const n = Number(v); return Number.isFinite(n) ? n : NaN; };
const order = (rows) => Object.keys(rows);

/** Smallest size whose measurement is at least `value` (the body must fit inside the garment). */
function atLeast(rows, value) {
  const keys = order(rows);
  const hit = keys.find(k => rows[k][0] >= value);
  return hit || keys[keys.length - 1];
}
const shift = (rows, size, by) => {
  const keys = order(rows); const i = keys.indexOf(size);
  return keys[Math.min(keys.length - 1, Math.max(0, i + by))];
};

/**
 * input: { kind, height (cm), weight (kg), chest|waist|foot (cm), fit: 'snug'|'regular'|'relaxed' }
 * returns { size, basis } or { error }.  The size is clamped to what the product actually has.
 */
export function suggestSize(product, input) {
  const chart = chartFor(product);
  if (!chart || chart.custom) return { error: 'No automatic size suggestion for this item: use the chart.' };
  const rows = chart.rows;
  let size; let basis;
  const fitShift = { snug: -1, regular: 0, relaxed: 1 }[input.fit ?? 'regular'] ?? 0;

  if (chart.kind === 'tops') {
    const chest = num(input.chest);
    if (chest >= 60 && chest <= 160) { size = atLeast(rows, chest); basis = `chest ${chest} cm`; }
    else {
      const h = num(input.height), w = num(input.weight);
      if (!(h >= 120 && h <= 230 && w >= 30 && w <= 250)) return { error: 'Enter your chest, or both height and weight.' };
      const keys = order(rows);
      const idx = w < 55 ? 0 : w < 65 ? 1 : w < 75 ? 2 : w < 85 ? 3 : w < 95 ? 4 : 5;
      size = keys[Math.min(keys.length - 1, Math.max(0, idx + (h >= 183 && idx < 5 ? 1 : 0)))];
      basis = `${h} cm and ${w} kg (estimate)`;
    }
  } else if (chart.kind === 'bottoms') {
    const waist = num(input.waist);
    if (!(waist >= 55 && waist <= 150)) return { error: 'Enter your waist in cm.' };
    size = atLeast(rows, waist); basis = `waist ${waist} cm`;
  } else {
    const foot = num(input.foot);
    if (!(foot >= 18 && foot <= 36)) return { error: 'Enter your foot length in cm.' };
    size = atLeast(rows, foot); basis = `foot ${foot} cm`;
    if (fitShift) size = shift(rows, size, fitShift);
    return clampTo(product, size, basis);
  }
  size = shift(rows, size, fitShift);
  return clampTo(product, size, basis);
}

function clampTo(product, size, basis) {
  const have = sizesOf(product);
  if (have.includes(size)) return { size, basis };
  // nearest available size on the chart scale
  const all = Object.keys((chartFor(product) || {}).rows || {});
  const want = all.indexOf(size);
  let best = null, bestD = Infinity;
  for (const s of have) { const d = Math.abs(all.indexOf(s) - want); if (all.indexOf(s) >= 0 && d < bestD) { best = s; bestD = d; } }
  return best ? { size: best, basis, note: `We don't make ${size} in this item; ${best} is the closest.` } : { error: 'No matching size available.' };
}
