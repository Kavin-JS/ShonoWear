import { describe, it, expect } from 'vitest';
import { catalog } from '../src/data/catalog.js';
import { parseFilters, filterProducts, filtersToParams, activeFilterCount } from '../src/lib/shopFilters.js';
import { looksContaining, validateItems } from '../src/lib/outfitRules.js';
import { localReply } from '../src/lib/localStylist.js';

const f = (qs) => parseFilters(new URLSearchParams(qs));

describe('shop filters', () => {
  it('returns everything with no filters', () => {
    expect(filterProducts(catalog, f(''))).toHaveLength(catalog.length);
  });
  it('filters by category, price cap and colour together', () => {
    const r = filterProducts(catalog, f('cat=top&max=1500&color=black'));
    expect(r.length).toBeGreaterThan(0);
    for (const p of r) { expect(p.category).toBe('top'); expect(p.price).toBeLessThanOrEqual(1500); expect(p.tags).toContain('black'); }
  });
  it('search understands synonyms like "sneakers"', () => {
    const r = filterProducts(catalog, f('q=sneakers'));
    expect(r.length).toBeGreaterThan(0);
    expect(r.every(p => p.category === 'footwear' || /sneaker/i.test(p.name))).toBe(true);
  });
  it('sorts by price', () => {
    const asc = filterProducts(catalog, f('sort=price-asc')).map(p => p.price);
    expect(asc).toEqual([...asc].sort((a, b) => a - b));
    const desc = filterProducts(catalog, f('sort=price-desc')).map(p => p.price);
    expect(desc).toEqual([...desc].sort((a, b) => b - a));
  });
  it('ignores junk in the URL instead of trusting it', () => {
    const x = f('cat=<script>&max=-5&style=goth&sort=evil&platform=eBay&q=' + 'a'.repeat(500));
    expect(x.cat).toBe(''); expect(x.max).toBe(0); expect(x.style).toBe(''); expect(x.sort).toBe('relevance'); expect(x.platform).toBe('');
    expect(x.q.length).toBe(60);
  });
  it('round-trips through URL params and counts active filters', () => {
    const x = f('cat=footwear&max=5000&sort=price-asc');
    expect(filtersToParams(x).toString()).toBe('cat=footwear&max=5000&sort=price-asc');
    expect(activeFilterCount(x)).toBe(2);
  });
});

describe('complete the look', () => {
  it('every suggested look contains the product and is a valid outfit', () => {
    for (const item of catalog.filter(p => p.category !== 'accessory').slice(0, 12)) {
      for (const look of looksContaining(item)) {
        expect(look.some(i => i.id === item.id)).toBe(true);
        expect(validateItems(look, 'high').ok).toBe(true);
      }
    }
  });
  it('accessories are added on top of a full look', () => {
    const acc = catalog.find(p => p.category === 'accessory');
    const looks = looksContaining(acc);
    expect(looks.length).toBeGreaterThan(0);
    expect(looks[0].some(i => i.id === acc.id)).toBe(true);
  });
});

describe('assistant + bag + shop link', () => {
  const ids = new Set(catalog.map(p => p.id));
  it('product search replies link to a pre-filtered shop', () => {
    const r = localReply('black sneakers under 5000');
    expect(r.shopLink).toMatch(/^\/shop\?/);
    expect(r.shopLink).toContain('cat=footwear');
    expect(r.shopLink).toContain('max=5000');
    expect(r.shopLink).toContain('color=black');
    expect(r.products.every(p => ids.has(p.id))).toBe(true);
  });
  it('tells you what your bag is missing and suggests real pieces', () => {
    const top = catalog.find(p => p.category === 'top'), bottom = catalog.find(p => p.category === 'bottom');
    const r = localReply("what's missing from my bag?", { bagIds: [top.id, bottom.id] });
    expect(r.reply).toMatch(/footwear/);
    expect(r.products.some(p => p.category === 'footwear')).toBe(true);
  });
  it('says a full bag is complete', () => {
    const l = looksContaining(catalog[0])[0];
    expect(localReply('check my bag', { bagIds: l.map(i => i.id) }).reply).toMatch(/complete outfit/);
  });
  it('handles an empty bag and ignores unknown ids', () => {
    expect(localReply('my bag').reply).toMatch(/empty/);
    expect(localReply('my bag', { bagIds: ['nope'] }).reply).toMatch(/empty/);
  });
});

describe('discountPct', () => {
  it('only shows a discount for a real mrp above the price', async () => {
    const { discountPct } = await import('../src/lib/store.js');
    expect(discountPct({ price: 800, mrp: 1000 })).toBe(20);
    expect(discountPct({ price: 1000, mrp: 1000 })).toBe(0);
    expect(discountPct({ price: 990, mrp: 1000 })).toBe(0);      // under 5%: not worth advertising
    expect(discountPct({ price: 500 })).toBe(0);
    expect(discountPct({ price: 500, mrp: '999' })).toBe(0);
  });
});
