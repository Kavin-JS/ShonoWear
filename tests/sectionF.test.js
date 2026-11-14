import { describe, it, expect, beforeEach } from 'vitest';
import { catalog } from '../src/data/catalog.js';
import { LOOKS } from '../src/data/looks.js';
import { STORE } from '../src/data/storeConfig.js';
import { lookItems, activeLooks, lookBySlug, looksWith, parseBuild, buildQuery, lookSummary, addLookToBag, myLooks, saveMyLook, deleteMyLook, pickables, SLOTS, MAX_LOOK_ITEMS } from '../src/lib/looks.js';
import { getLines, clearBag } from '../src/lib/bag.js';
import { metaFor, publicPaths } from '../src/lib/seoMeta.js';

// A tiny browser stand-in so the bag and "My looks" can be exercised in Node.
const mem = new Map();
globalThis.localStorage = { getItem: k => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, String(v)), removeItem: k => mem.delete(k) };
globalThis.window = globalThis.window || { addEventListener() {}, removeEventListener() {}, dispatchEvent() {} };
globalThis.Event = globalThis.Event || class { constructor(t) { this.type = t; } };
beforeEach(() => { mem.clear(); clearBag(); });

const tee = catalog.find(p => p.id === 'own-sample-tee');
const pants = catalog.find(p => p.id === 'own-sample-pants');
const cap = catalog.find(p => p.id === 'own-sample-cap');
const affil = catalog.find(p => p.id === 'sw-001');

describe('F · looks data', () => {
  it('curated looks have unique valid slugs and every look keeps 2+ real products', () => {
    const slugs = LOOKS.map(l => l.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
    for (const s of slugs) expect(s).toMatch(/^[a-z0-9-]+$/);
    expect(activeLooks().length).toBe(LOOKS.length);
    for (const l of activeLooks()) expect(l.products.length).toBeGreaterThanOrEqual(2);
  });
  it('lookItems drops unknown ids and repeats and caps the length', () => {
    expect(lookItems([tee.id, 'ghost', tee.id, pants.id]).map(p => p.id)).toEqual([tee.id, pants.id]);
    expect(lookItems(catalog.slice(0, 20).map(p => p.id))).toHaveLength(MAX_LOOK_ITEMS);
    expect(lookItems('nope')).toEqual([]);
    expect(lookItems([{ toString: () => tee.id }]).length).toBeLessThanOrEqual(1);
  });
  it('a look with fewer than 2 real products disappears, and lookBySlug follows', () => {
    const saved = LOOKS.splice(0, LOOKS.length, { slug: 'one', title: 'One', occasion: 'x', blurb: 'x', items: [tee.id, 'ghost'] }, { slug: 'two', title: 'Two', occasion: 'x', blurb: 'x', items: [tee.id, pants.id] });
    try { expect(activeLooks().map(l => l.slug)).toEqual(['two']); expect(lookBySlug('one')).toBeNull(); expect(looksWith(tee.id)).toHaveLength(1); expect(looksWith(cap.id)).toHaveLength(0); }
    finally { LOOKS.splice(0, LOOKS.length, ...saved); }
  });
});

describe('F · builder state from the URL', () => {
  it('reads only known products placed in the right row', () => {
    const sel = parseBuild(`top=${tee.id}&bottom=${tee.id}&footwear=ghost&accessory=${cap.id}&bogus=1`);
    expect(Object.keys(sel).sort()).toEqual(['accessory', 'top']);   // tee in the bottom row is rejected
    expect(parseBuild('top=%3Cscript%3E&bottom[]=x')).toEqual({});
    expect(parseBuild(undefined)).toEqual({});
  });
  it('round-trips through the query string', () => {
    const sel = { top: tee, bottom: pants, accessory: cap };
    const back = parseBuild(buildQuery(sel));
    expect(Object.fromEntries(Object.entries(back).map(([k, v]) => [k, v.id]))).toEqual({ top: tee.id, bottom: pants.id, accessory: cap.id });
  });
  it('every row has something to pick from the catalogue (except rows the shop does not stock yet)', () => {
    expect(pickables('top').length).toBeGreaterThan(3);
    for (const s of SLOTS) expect(pickables(s).every(p => p.category === s)).toBe(true);
  });
});

describe('F · price of a look', () => {
  it('own items use the real totals, partner items are summed apart', () => {
    const none = lookSummary([tee, pants, affil], {});
    expect(none.missingSize.sort()).toEqual([pants.id, tee.id].sort());
    expect(none.partnerTotal).toBe(affil.price);
    expect(none.ownItemsSubtotal).toBe(tee.price + pants.price);
    const sized = lookSummary([tee, pants, affil], { [tee.id]: 'M', [pants.id]: '32' });
    expect(sized.sized).toBe(2); expect(sized.missingSize).toEqual([]);
    expect(sized.totals.discount).toBe(Math.floor(((tee.price + pants.price) * STORE.bundleDiscount.percent) / 100));
    expect(sized.totals.subtotal).toBe(tee.price + pants.price);          // the partner item never enters our total
  });
  it('no bundle discount for a single own item', () => {
    expect(lookSummary([tee, affil], { [tee.id]: 'M' }).totals.discount).toBe(0);
  });
});

describe('F · add the look to the bag', () => {
  it('adds sized, in-stock own items and skips partner items', () => {
    const r = addLookToBag([tee, pants, affil], { [tee.id]: 'M', [pants.id]: '32' });
    expect(r.added.sort()).toEqual([pants.id, tee.id].sort());
    expect(getLines().map(l => l.id).sort()).toEqual([pants.id, tee.id].sort());
    expect(getLines().find(l => l.id === tee.id)).toMatchObject({ size: 'M', qty: 1 });
  });
  it('reports missing sizes and sold-out sizes instead of guessing', () => {
    const r = addLookToBag([tee, pants, cap], { [tee.id]: 'M', [pants.id]: '32' }, (id, s) => (id === pants.id ? 0 : 5));
    expect(r.soldOut).toEqual([pants.id]);
    expect(r.needSize).toEqual([cap.id]);
    expect(r.added).toEqual([]);                    // all or nothing
    expect(getLines()).toEqual([]);
  });
  it('all or nothing: one missing size means the whole look waits', () => {
    const r = addLookToBag([tee, pants, cap], { [cap.id]: 'One size' });
    expect(r.added).toEqual([]); expect(r.needSize.sort()).toEqual([pants.id, tee.id].sort()); expect(getLines()).toEqual([]);
  });
  it('refuses a size the product does not have', () => {
    const r = addLookToBag([tee], { [tee.id]: 'XXXL' });
    expect(r.added).toEqual([]); expect(r.needSize).toEqual([tee.id]); expect(getLines()).toEqual([]);
  });
});

describe('F · My looks (saved on the device)', () => {
  it('saves, lists and deletes, ids only', () => {
    saveMyLook('Weekend', [tee, pants]);
    expect(myLooks()).toHaveLength(1);
    expect(JSON.parse(mem.get('sw_my_looks'))[0]).toEqual({ id: expect.any(String), name: 'Weekend', ids: [tee.id, pants.id] });
    deleteMyLook(myLooks()[0].id);
    expect(myLooks()).toEqual([]);
  });
  it('survives tampered storage: unknown ids dropped, long names cut, junk ignored, capped at 20', () => {
    mem.set('sw_my_looks', JSON.stringify([{ id: 'a', name: 'x'.repeat(500), ids: [tee.id, 'ghost'] }, { id: 'b', ids: ['ghost'] }, 7, null]));
    const l = myLooks();
    expect(l).toHaveLength(1); expect(l[0].name).toHaveLength(40); expect(l[0].products.map(p => p.id)).toEqual([tee.id]);
    mem.set('sw_my_looks', '{not json'); expect(myLooks()).toEqual([]);
    mem.clear(); for (let i = 0; i < 25; i++) saveMyLook(`L${i}`, [tee]);
    expect(myLooks()).toHaveLength(20);
  });
  it('an empty look is not saved', () => { saveMyLook('empty', []); expect(myLooks()).toEqual([]); });
});

describe('F · search data for the new pages', () => {
  it('looks and the builder are public and have titles', () => {
    const urls = publicPaths();
    expect(urls).toContain('/looks'); expect(urls).toContain('/build');
    for (const l of activeLooks()) { expect(urls).toContain(`/looks/${l.slug}`); const m = metaFor(`/looks/${l.slug}`, { siteUrl: 'https://x.test' }); expect(m.title).toContain(l.title); expect(m.noindex).toBe(false); expect(m.description.length).toBeLessThanOrEqual(160); }
    expect(metaFor('/looks/nope').title).toBe(metaFor('/').title);
  });
});
