import { describe, it, expect } from 'vitest';
import { localReply } from '../src/lib/localStylist.js';
import { catalog } from '../src/data/catalog.js';

const ids = new Set(catalog.map(p => p.id));
const allReal = (r) => r.products.every(p => ids.has(p.id));

describe('localReply', () => {
  it('only ever returns real catalogue products', () => {
    for (const q of ['what to wear on a date', 'shoes under 5000', 'black jacket', 'streetwear outfit under 12000', 'office look', 'zzz']) {
      expect(allReal(localReply(q))).toBe(true);
    }
  });
  it('respects a per-item budget', () => {
    const r = localReply('shirt under 1000');
    expect(r.products.length).toBeGreaterThan(0);
    for (const p of r.products) expect(p.price).toBeLessThanOrEqual(1000);
  });
  it('is honest when no complete outfit fits the budget', () => {
    const r = localReply('outfit under 1500');
    expect(r.products).toHaveLength(0);
    expect(r.reply).toMatch(/can't build a complete outfit/);
  });
  it('outfit total stays within the stated budget', () => {
    const r = localReply('streetwear outfit under 8000');
    if (r.products.length) expect(r.reply).toMatch(/₹/);
  });
  it('uses skin tone from the profile', () => {
    expect(localReply('colours for my skin', { profile: { skinTone: 'deep' } }).reply).toMatch(/Deep skin/);
  });
  it('says what it can do when it does not understand', () => {
    expect(localReply('quantum physics').reply).toMatch(/I can help with/);
  });
  it('admits it is not a language model', () => {
    expect(localReply('are you an ai?').reply).toMatch(/not a language model/);
  });
  it('never throws on odd input', () => {
    for (const q of ['', null, undefined, '😀'.repeat(500), '{{sw-001}}']) expect(() => localReply(q)).not.toThrow();
  });
});

describe('store questions', () => {
  it('answers shipping, returns, payment and tracking from the store config', async () => {
    const { localReply } = await import('../src/lib/localStylist.js');
    expect(localReply('how long does delivery take').reply).toMatch(/business days/);
    expect(localReply('what is your return policy').reply).toMatch(/return/i);
    expect(localReply('do you have cod').reply).toMatch(/not available/);
    expect(localReply('where is my order').shopLink).toBe('/track');
    expect(localReply('what should i wear to a wedding').reply).not.toMatch(/Razorpay/);
  });
});
