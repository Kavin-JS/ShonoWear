import { describe, it, expect } from 'vitest';
import { catalog } from '../src/data/catalog.js';
import {
  validateItems, composeLooks, completeToFour, validateAiOutfits, normaliseRules,
  totalOf, fingerprint, slimCard, rehydrateCard, toCard, byId, BUDGET_CEILING,
} from '../src/lib/outfitRules.js';

const idx = byId(catalog);
const P = (id) => idx.get(id);
const profile = (budget) => ({ aesthetic: 'streetwear', occasion: 'casual', budget });
const first = (cat) => catalog.filter(p => p.category === cat);

describe('validateItems', () => {
  it('accepts top + bottom + footwear', () => {
    expect(validateItems([first('top')[0], first('bottom')[0], first('footwear')[0]], 'high').ok).toBe(true);
  });
  it('rejects missing footwear, missing bottom, duplicate category', () => {
    expect(validateItems([first('top')[0], first('bottom')[0]], 'high').errors).toContain('missing footwear');
    expect(validateItems([first('top')[0], first('footwear')[0]], 'high').errors).toContain('missing bottom');
    const two = [first('top')[0], first('top')[1], first('bottom')[0], first('footwear')[0]];
    expect(validateItems(two, 'high').errors).toContain('more than one top');
  });
  it('rejects the same product twice', () => {
    const t = first('top')[0];
    expect(validateItems([t, t, first('bottom')[0], first('footwear')[0]], 'high').errors).toContain('duplicate product');
  });
  it('accepts a set + footwear, rejects set + top', () => {
    const set = first('set')[0], shoe = first('footwear')[0];
    expect(validateItems([set, shoe], 'high').ok).toBe(true);
    expect(validateItems([set, first('top')[0], shoe], 'high').errors).toContain('set combined with top/bottom');
  });
  it('enforces the budget ceiling', () => {
    const look = [first('top')[0], first('bottom')[0], first('footwear')[0]];
    expect(totalOf(look)).toBeGreaterThan(BUDGET_CEILING.low);
    expect(validateItems(look, 'low').errors).toContain('over budget');
  });
});

describe('composeLooks', () => {
  it('returns only complete looks, no repeated outfit', () => {
    for (const b of ['low', 'mid', 'high']) {
      const { looks } = composeLooks(profile(b));
      const fps = looks.map(fingerprint);
      expect(new Set(fps).size).toBe(fps.length);
      for (const l of looks) expect(validateItems(l, 'high').ok).toBe(true);
    }
  });
  it('mid/high looks respect the ceiling', () => {
    for (const b of ['mid', 'high']) {
      const { looks, overBudget } = composeLooks(profile(b));
      expect(overBudget).toBe(false);
      for (const l of looks) expect(totalOf(l)).toBeLessThanOrEqual(BUDGET_CEILING[b]);
    }
  });
  it('low budget is flagged over-budget and returns the cheapest complete looks', () => {
    const { looks, overBudget, minPrice } = composeLooks(profile('low'));
    expect(overBudget).toBe(true);
    expect(minPrice).toBe(totalOf(looks[0]));
    expect(totalOf(looks[0])).toBeGreaterThan(1500);
  });
});

describe('validateAiOutfits + completeToFour', () => {
  const good = composeLooks(profile('high'), { count: 4 }).looks;
  const asAi = (look) => ({ title: 'T', score: 9, items: look.map(i => ({ id: i.id })), explanation: 'e', totalPrice: 1 });

  it('recomputes price from the catalogue, ignoring the model total', () => {
    const { accepted } = validateAiOutfits([asAi(good[0])], profile('high'));
    expect(accepted[0].price).toBe(totalOf(good[0]));
  });
  it('drops invented ids, duplicates and structurally bad outfits', () => {
    const bad = [
      { items: [{ id: 'nope-1' }, { id: good[0][0].id }] },
      asAi(good[0]), asAi(good[0]),
      { items: [first('top')[0], first('top')[1], first('bottom')[0], first('footwear')[0]].map(i => ({ id: i.id })) },
    ];
    const { accepted, dropped } = validateAiOutfits(bad, profile('high'));
    expect(accepted).toHaveLength(1);
    expect(dropped.length).toBe(3);
  });
  it('tops up to 4 and labels the source', () => {
    const { accepted } = validateAiOutfits([asAi(good[0])], profile('high'));
    const r = completeToFour(accepted, profile('high'));
    expect(r.outfits).toHaveLength(4);
    expect(r.source).toBe('mixed');
    expect(new Set(r.outfits.map(o => o.id)).size).toBe(4);
  });
  it('clamps rating and strips control characters from text', () => {
    const { accepted } = validateAiOutfits([{ ...asAi(good[0]), score: 99, title: 'Hi\u0000 there' }], profile('high'));
    expect(accepted[0].rating).toBe(10);
    expect(accepted[0].name).not.toMatch(/\u0000/);
  });
  it('rule-based cards carry no fake rating', () => {
    const r = completeToFour([], profile('high'));
    expect(r.outfits.every(o => o.rating === null)).toBe(true);
  });
  it('mid budget returns fewer than 4 and says so instead of overspending', () => {
    const r = completeToFour([], profile('mid'));
    for (const o of r.outfits) expect(o.price).toBeLessThanOrEqual(5000);
  });
});

describe('rules + cache', () => {
  it('normalises both key styles, caps at 5, drops non-strings', () => {
    const r = normaliseRules({ fitRules: ['a', 'b', 'c', 'd', 'e', 'f'], color: ['x', 5, null], style: [], avoid: ['z'] });
    expect(r.fit).toHaveLength(5);
    expect(r.color).toEqual(['x']);
    expect(normaliseRules({})).toBeNull();
    expect(normaliseRules(null)).toBeNull();
  });
  it('slim → rehydrate restores images, price and links from the catalogue', () => {
    const look = composeLooks(profile('high')).looks[0];
    const card = toCard(look, { title: 'X', explanation: 'why' });
    const back = rehydrateCard({ ...slimCard(card) });
    expect(back.price).toBe(card.price);
    expect(back.image).toBe(card.image);
    expect(rehydrateCard({ itemIds: ['gone'] })).toBeNull();
  });
});
