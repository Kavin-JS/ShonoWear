/**
 * SHONOWEAR — outfit rules (single source of truth)
 *
 * Pure functions, no I/O. Used by:
 *   - api/recommend.js  → validates whatever the model returns, fills gaps
 *   - src/lib/recommendationEngine.js → client-side fallback (same rules)
 *   - tests
 *
 * The model's output is never trusted. An AI outfit is accepted only if it
 * passes validateItems(); otherwise it is dropped and the deterministic
 * composer below fills the slot.
 *
 * BUDGET POLICY ("ceiling"):
 *   low  → total ≤ ₹1,500
 *   mid  → total ≤ ₹5,000
 *   high → no cap (₹5,000+ means "at least", so we don't force spending)
 * If the catalogue cannot build ANY complete outfit under the ceiling, we say
 * so and return the lowest-priced complete looks instead of pretending.
 */

import { catalog as defaultCatalog } from '../data/catalog.js';

export const BUDGET_CEILING = { low: 1500, mid: 5000, high: Infinity };
export const BUDGET_LABEL   = { low: 'under ₹1,500', mid: '₹1,500–₹5,000', high: '₹5,000+' };

const SINGLE = ['top', 'bottom', 'footwear', 'outerwear', 'set', 'accessory'];
const NEUTRALS = new Set(['black', 'grey', 'white', 'beige', 'navy', 'brown', 'silver', 'indigo']);
const LOUD     = new Set(['multicolour', 'olive']);
const COLOR_TAGS = new Set([...NEUTRALS, ...LOUD]);

/* ─────────────── helpers ─────────────── */

export function byId(catalog = defaultCatalog) {
  return new Map(catalog.map(p => [p.id, p]));
}

export function fingerprint(items) {
  return items.map(i => i.id).sort().join('+');
}

export function totalOf(items) {
  return items.reduce((s, i) => s + i.price, 0);
}

function colorOf(p) {
  return (p.tags || []).find(t => COLOR_TAGS.has(t)) || null;
}

/* ─────────────── validation ─────────────── */

/**
 * @param {Array} items  full catalog products
 * @param {'low'|'mid'|'high'} budget
 * @returns {{ ok: boolean, errors: string[], total: number }}
 */
export function validateItems(items, budget) {
  const errors = [];
  if (!Array.isArray(items) || items.length === 0) {
    return { ok: false, errors: ['no items'], total: 0 };
  }

  const ids = items.map(i => i.id);
  if (new Set(ids).size !== ids.length) errors.push('duplicate product');

  const count = Object.fromEntries(SINGLE.map(c => [c, 0]));
  for (const i of items) {
    if (!(i.category in count)) errors.push(`unknown category ${i.category}`);
    else count[i.category] += 1;
  }
  for (const c of SINGLE) if (count[c] > 1) errors.push(`more than one ${c}`);

  if (count.set) {
    if (count.top || count.bottom) errors.push('set combined with top/bottom');
  } else {
    if (!count.top)    errors.push('missing top');
    if (!count.bottom) errors.push('missing bottom');
  }
  if (!count.footwear) errors.push('missing footwear');

  const total = totalOf(items);
  const ceiling = BUDGET_CEILING[budget] ?? Infinity;
  if (total > ceiling) errors.push('over budget');

  const loud = items.filter(i => colorOf(i) === 'multicolour').length;
  if (loud > 1) errors.push('too many multicolour pieces');

  return { ok: errors.length === 0, errors, total };
}

/** Structure only (no budget) — used to decide whether a look is complete. */
export function isComplete(items) {
  return validateItems(items, 'high').ok;
}

/* ─────────────── scoring + composer ─────────────── */

function itemScore(p, profile) {
  let s = 0;
  if (p.tags.includes(profile.aesthetic)) s += 3;
  if (p.tags.includes(profile.occasion))  s += 2;
  if (p.tags.includes(profile.budget))    s += 1;
  return s;
}

function lookScore(items, profile) {
  let s = items.reduce((n, i) => n + itemScore(i, profile), 0);
  const loud = items.filter(i => LOUD.has(colorOf(i))).length;
  s += loud <= 1 ? 2 : -3;                           // at most one statement colour
  if (items.every(i => !colorOf(i) || NEUTRALS.has(colorOf(i)))) s += 1; // calm palette
  return s;
}

const TOP_K = { top: 8, bottom: 6, footwear: 6, outerwear: 3, set: 3, accessory: 3 };

/** Highest-scoring candidates per category, so no category is starved. */
export function candidateCatalog(profile, catalog = defaultCatalog) {
  const out = [];
  for (const [cat, k] of Object.entries(TOP_K)) {
    out.push(
      ...catalog
        .filter(p => p.category === cat)
        .map(p => ({ p, s: itemScore(p, profile) }))
        .sort((a, b) => b.s - a.s || a.p.price - b.p.price)
        .slice(0, k)
        .map(x => x.p),
    );
  }
  return out;
}

function enumerateLooks(profile, catalog) {
  const by = c => catalog.filter(p => p.category === c);
  const tops = by('top'), bottoms = by('bottom'), shoes = by('footwear');
  const outers = [null, ...by('outerwear')];
  const sets = by('set');
  const looks = [];

  for (const shoe of shoes) {
    for (const outer of outers) {
      for (const top of tops) {
        for (const bottom of bottoms) {
          looks.push([top, bottom, shoe, ...(outer ? [outer] : [])]);
        }
      }
      for (const set of sets) looks.push([set, shoe, ...(outer ? [outer] : [])]);
    }
  }
  return looks.filter(isComplete);
}

/**
 * Deterministic outfit builder.
 * @returns {{ looks: Array<Array>, overBudget: boolean, minPrice: number|null }}
 *   looks are arrays of products. overBudget=true means nothing fit the ceiling
 *   and these are the cheapest complete looks instead.
 */
export function composeLooks(profile, { count = 4, exclude = [], catalog = defaultCatalog } = {}) {
  const cands = candidateCatalog(profile, catalog);
  const all = enumerateLooks(profile, cands);
  const ceiling = BUDGET_CEILING[profile.budget] ?? Infinity;
  const taken = new Set(exclude);

  const fitting = all.filter(l => totalOf(l) <= ceiling && !taken.has(fingerprint(l)));
  const feasible = all.some(l => totalOf(l) <= ceiling);
  const minPrice = all.length ? Math.min(...all.map(totalOf)) : null;

  let pool, overBudget = false;
  if (feasible) {
    pool = fitting.sort((a, b) => lookScore(b, profile) - lookScore(a, profile) || totalOf(a) - totalOf(b));
  } else {
    overBudget = true;
    pool = all.filter(l => !taken.has(fingerprint(l)))
              .sort((a, b) => totalOf(a) - totalOf(b) || lookScore(b, profile) - lookScore(a, profile));
  }

  // Diversity: no single product in more than `cap` looks. Relax if we run short.
  const picked = [];
  for (const cap of [2, 3, 99]) {
    for (const look of pool) {
      if (picked.length >= count) break;
      if (picked.some(p => fingerprint(p) === fingerprint(look))) continue;
      const use = id => picked.filter(p => p.some(i => i.id === id)).length;
      if (look.every(i => use(i.id) < cap)) picked.push(look);
    }
    if (picked.length >= count) break;
  }
  return { looks: picked, overBudget, minPrice };
}

/* ─────────────── cards ─────────────── */

const pick = i => ({
  id: i.id, name: i.name, brand: i.brand, category: i.category, price: i.price,
  image: i.image, affiliateUrl: i.affiliateUrl || null, platform: i.platform, fulfilment: i.fulfilment || 'affiliate',
});

/**
 * Build the card shape the UI renders. Price is always recomputed from the
 * catalogue; ids are derived from the items so "saved" state is stable.
 */
export function toCard(items, { title, explanation, styleSummary, rating, origin } = {}) {
  const primary = items.find(i => i.category === 'top' || i.category === 'set') || items[0];
  return {
    id:           `look-${fingerprint(items)}`,
    name:         title || `${primary.name} look`,
    brand:        [...new Set(items.map(i => i.brand))].join(' + '),
    image:        primary.image,
    price:        totalOf(items),
    affiliateUrl: primary.affiliateUrl || null,
    platform:     primary.platform,
    fulfilment:   primary.fulfilment || 'affiliate',
    tags:         primary.tags || [],
    explanation:  explanation || primary.explanation || '',
    styleSummary: styleSummary || '',
    rating:       Number.isFinite(rating) ? rating : null, // null = not scored; UI hides it
    origin:       origin || 'rules',
    items:        items.map(pick),
  };
}

function cleanText(v, max) {
  if (typeof v !== 'string') return '';
  return v.replace(/[\u0000-\u001F\u007F]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
}

function clampRating(v) {
  const n = Number(v);
  return Number.isFinite(n) ? Math.min(10, Math.max(1, Math.round(n * 10) / 10)) : null;
}

/**
 * Validate the model's outfits. Returns the accepted ones as cards, plus why
 * the others were dropped (for logging; contains no user data).
 */
export function validateAiOutfits(aiOutfits, profile, catalog = defaultCatalog) {
  const index = byId(catalog);
  const accepted = [];
  const dropped = [];
  const seen = new Set();

  if (!Array.isArray(aiOutfits)) return { accepted, dropped: ['not an array'] };

  for (const o of aiOutfits.slice(0, 8)) {
    const ids = Array.isArray(o?.items) ? o.items.map(i => i?.id) : [];
    const items = ids.map(id => (typeof id === 'string' ? index.get(id) : undefined));
    if (items.some(i => !i)) { dropped.push('unknown product id'); continue; }

    const v = validateItems(items, profile.budget);
    if (!v.ok) { dropped.push(v.errors.join(', ')); continue; }

    const fp = fingerprint(items);
    if (seen.has(fp)) { dropped.push('duplicate outfit'); continue; }
    seen.add(fp);

    accepted.push(toCard(items, {
      title:        cleanText(o.title, 60),
      explanation:  cleanText(o.explanation, 400),
      styleSummary: cleanText(o.styleSummary, 120),
      rating:       clampRating(o.score),
      origin:       'ai',
    }));
    if (accepted.length === 4) break;
  }
  return { accepted, dropped };
}

/**
 * Take validated AI cards and top up to 4 with rule-based looks.
 * @returns {{ outfits, source: 'ai'|'mixed'|'rules', overBudget, minPrice, short }}
 */
export function completeToFour(aiCards, profile, catalog = defaultCatalog) {
  const have = aiCards.slice(0, 4);
  if (have.length === 4) return { outfits: have, source: 'ai', overBudget: false, minPrice: null, short: false };

  const exclude = have.map(c => fingerprint(c.items));
  const { looks, overBudget, minPrice } = composeLooks(profile, {
    count: 4 - have.length, exclude, catalog,
  });
  const filled = looks.map(l => toCard(l, { origin: 'rules' }));
  const outfits = [...have, ...filled];
  const source = have.length === 0 ? 'rules' : 'mixed';
  const short = !overBudget && outfits.length < 4;
  return { outfits, source, overBudget, minPrice, short };
}

export function budgetWarning(profile, { overBudget, minPrice, short, outfits }) {
  if (short) {
    const n = outfits.length;
    return `Only ${n} complete outfit${n === 1 ? '' : 's'} in our catalogue fit ${BUDGET_LABEL[profile.budget]} right now. We'd rather show fewer than stretch your budget.`;
  }
  if (!overBudget) return null;
  const from = minPrice ? ` (from ₹${minPrice.toLocaleString('en-IN')})` : '';
  return `We don't have a complete outfit ${BUDGET_LABEL[profile.budget]} yet. Showing our lowest-priced complete looks${from} instead.`;
}

/* ─────────────── styling rules ─────────────── */

const RULE_KEYS = ['fit', 'color', 'style', 'avoid'];
const LEGACY = { fit: 'fitRules', color: 'colorRules', style: 'styleRules', avoid: 'avoidRules' };

/** Accepts { fit, color, style, avoid } or legacy *Rules keys. Returns null if empty. */
export function normaliseRules(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const out = {};
  let any = false;
  for (const k of RULE_KEYS) {
    const list = Array.isArray(raw[k]) ? raw[k] : Array.isArray(raw[LEGACY[k]]) ? raw[LEGACY[k]] : [];
    out[k] = list.map(r => cleanText(r, 160)).filter(Boolean).slice(0, 5);
    if (out[k].length) any = true;
  }
  return any ? out : null;
}

/* ─────────────── cache helpers ─────────────── */

/** Reduce a card to what must be remembered: product ids + the written text. */
export function slimCard(card) {
  return {
    itemIds:      (card.items || []).map(i => i.id),
    title:        card.name,
    explanation:  card.explanation,
    styleSummary: card.styleSummary,
    rating:       card.rating,
    origin:       card.origin,
  };
}

/**
 * Rebuild a card from a slim record using the CURRENT catalogue, so prices,
 * images and affiliate links are never stale. Returns null if a product is gone.
 */
export function rehydrateCard(slim, catalog = defaultCatalog) {
  if (!slim || !Array.isArray(slim.itemIds)) return null;
  const index = byId(catalog);
  const items = slim.itemIds.map(id => index.get(id));
  if (!items.length || items.some(i => !i)) return null;
  return toCard(items, {
    title: slim.title, explanation: slim.explanation, styleSummary: slim.styleSummary,
    rating: slim.rating, origin: slim.origin,
  });
}

/* ─────────────── "complete the look" for a single product ─────────────── */

const STYLE_TAGS = ['streetwear', 'minimal', 'bold', 'classic'];
const OCCASION_TAGS = ['casual', 'datenight', 'work', 'festival'];

/**
 * Best complete outfits that contain `item`. Accessories can't anchor an outfit,
 * so they are added to the best looks instead. Deterministic; catalogue only.
 */
export function looksContaining(item, { count = 2, catalog = defaultCatalog } = {}) {
  const profile = {
    aesthetic: STYLE_TAGS.find(t => item.tags.includes(t)) || 'streetwear',
    occasion:  OCCASION_TAGS.find(t => item.tags.includes(t)) || 'casual',
    budget: 'high',
  };
  const all = enumerateLooks(profile, catalog);
  const isAcc = item.category === 'accessory';
  const pool = (isAcc ? all : all.filter(l => l.some(i => i.id === item.id)))
    .sort((a, b) => lookScore(b, profile) - lookScore(a, profile) || totalOf(a) - totalOf(b));

  const out = [];
  for (const look of pool) {
    const full = isAcc ? [...look, item] : look;
    if (out.some(o => fingerprint(o) === fingerprint(full))) continue;
    if (out.some(o => o.filter(i => look.some(j => j.id === i.id)).length >= look.length - 1 && !isAcc)) continue; // too similar
    out.push(full);
    if (out.length >= count) break;
  }
  return out;
}
