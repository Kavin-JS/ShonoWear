import { describe, it, expect } from 'vitest';
import { catalog } from '../src/data/catalog.js';
import { collections } from '../src/data/collections.js';
import { chartFor, suggestSize } from '../src/lib/sizeGuide.js';
import { estimateDelivery, validPincode, addBusinessDays } from '../src/lib/pincode.js';
import { parseFilters, filterProducts, activeFilterCount } from '../src/lib/shopFilters.js';
import { variantsOf, colorOf } from '../src/lib/colors.js';
import { isNew } from '../src/lib/store.js';

const byId = (id) => catalog.find(p => p.id === id);
const F = (o) => parseFilters(new URLSearchParams(o));

describe('size guide', () => {
  const tee = byId('own-sample-tee'), pants = byId('own-sample-pants'), cap = byId('own-sample-cap');
  it('picks a chart by category, and none for one-size items', () => {
    expect(chartFor(tee).kind).toBe('tops');
    expect(chartFor(pants).kind).toBe('bottoms');
    expect(chartFor(cap)).toBeNull();
  });
  it('suggests from chest, and from height + weight', () => {
    expect(suggestSize(tee, { chest: 97 }).size).toBe('M');
    expect(suggestSize(tee, { chest: 98 }).size).toBe('L');                      // body must fit inside
    expect(suggestSize(tee, { chest: 97, fit: 'relaxed' }).size).toBe('L');
    expect(suggestSize(tee, { height: 175, weight: 70 }).size).toBe('M');
    expect(suggestSize(tee, { height: 190, weight: 70 }).size).toBe('L');
  });
  it('clamps to sizes the product really has, and says so', () => {
    const r = suggestSize(tee, { chest: 80 });                                   // XS is not made: closest is S
    expect(r.size).toBe('S'); expect(r.note).toMatch(/closest/);
    expect(suggestSize(tee, { chest: 130 }).size).toBe('XL');
  });
  it('bottoms use waist, and bad input is an error, never a guess', () => {
    expect(suggestSize(pants, { waist: 81 }).size).toBe('32');
    expect(suggestSize(pants, { waist: 'abc' }).error).toBeTruthy();
    expect(suggestSize(tee, {}).error).toBeTruthy();
    expect(suggestSize(tee, { height: 20, weight: 5 }).error).toBeTruthy();
  });
  it('a product-specific chart wins and disables the estimator', () => {
    const custom = { ...tee, sizeChart: { title: 'Ours', columns: ['Chest', 'Length'], rows: { S: [90, 68], M: [96, 70] } } };
    expect(chartFor(custom).custom).toBe(true);
    expect(suggestSize(custom, { chest: 90 }).error).toBeTruthy();
  });
});

describe('pincode estimate', () => {
  const MON = Date.parse('2026-11-09T10:00:00');                                  // a Monday
  it('validates the format', () => {
    for (const bad of ['', '12345', '1234567', '012345', 'abcdef', '60 001']) expect(validPincode(bad)).toBe(false);
    expect(validPincode('600001')).toBe(true);
  });
  it('skips weekends when counting business days', () => {
    expect(addBusinessDays(MON, 5).getDay()).toBe(1);                            // Monday + 5 business days = next Monday
  });
  it('adds days for remote areas only', () => {
    const std = estimateDelivery('600001', MON), far = estimateDelivery('793001', MON);
    expect(std.ok && !std.remote).toBe(true);
    expect(far.remote).toBe(true);
    expect(Date.parse(far.to)).toBeGreaterThan(Date.parse(std.to));
    expect(estimateDelivery('12', MON).ok).toBe(false);
  });
});

describe('filters', () => {
  it('filters by brand, size and stock using catalogue totals', () => {
    expect(filterProducts(catalog, F({ brand: 'shonowear' })).every(p => p.brand === 'Shonowear')).toBe(true);
    const sized = filterProducts(catalog, F({ size: 'XL' }));
    expect(sized.length).toBeGreaterThan(0);
    expect(sized.every(p => p.sizes && p.sizes.XL > 0)).toBe(true);
    expect(filterProducts(catalog, F({ size: 'S' })).map(p => p.id)).not.toContain('own-sample-tee-white');   // S is 0 there
    expect(filterProducts(catalog, F({ size: '__proto__' }))).toEqual([]);
  });
  it('sorts newest first, keeping undated items in their original order', () => {
    const r = filterProducts(catalog, F({ sort: 'newest' }));
    expect(r[0].addedAt).toBeTruthy();
    const undated = r.filter(p => !p.addedAt).map(p => p.id);
    expect(undated).toEqual(catalog.filter(p => !p.addedAt).map(p => p.id));
  });
  it('sanitises and counts the new filters', () => {
    expect(F({ brand: '<script>' }).brand).toBe('script');
    expect(activeFilterCount(F({ brand: 'Shonowear', size: 'M', instock: '1' }))).toBe(3);
  });
});

describe('colour variants, New badge, collections', () => {
  it('links the colours of one design', () => {
    const v = variantsOf(byId('own-sample-tee'), catalog).map(p => colorOf(p)).sort();
    expect(v).toEqual(['black', 'white']);
    expect(variantsOf(byId('own-sample-cap'), catalog)).toEqual([]);
  });
  it('shows New for 30 days after addedAt only', () => {
    const p = { addedAt: '2026-11-08' };
    expect(isNew(p, Date.parse('2026-11-20'))).toBe(true);
    expect(isNew(p, Date.parse('2026-12-20'))).toBe(false);
    expect(isNew(p, Date.parse('2026-11-01'))).toBe(false);                      // not before it was added
    expect(isNew({}, Date.now())).toBe(false);
  });
  it('every collection has a unique slug and at least one product', () => {
    expect(new Set(collections.map(c => c.slug)).size).toBe(collections.length);
    for (const c of collections) expect(catalog.filter(c.match).length, c.slug).toBeGreaterThan(0);
  });
});
