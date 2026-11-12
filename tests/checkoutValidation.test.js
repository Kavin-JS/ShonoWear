import { describe, it, expect } from 'vitest';
import { validateCustomer } from '../src/lib/checkoutValidation.js';

const ok = { name: 'Asha Rao', phone: '98765 43210', email: 'Asha@Example.com', line1: '12 MG Road', city: 'Pune', state: 'Maharashtra', pincode: '411001' };

describe('validateCustomer', () => {
  it('accepts and normalises a good address', () => {
    const r = validateCustomer({ ...ok, phone: '+91 98765-43210' });
    expect(r.ok).toBe(true);
    expect(r.data.phone).toBe('9876543210');
    expect(r.data.email).toBe('asha@example.com');
  });
  it('strips control characters and caps lengths', () => {
    const r = validateCustomer({ ...ok, line1: '12 MG Road\u0000\n\n' + 'x'.repeat(500) });
    expect(r.data.line1.length).toBeLessThanOrEqual(120);
    expect(r.data.line1).not.toMatch(/[\u0000\n]/);
  });
  it.each([
    ['phone', '5876543210'], ['phone', '98765'], ['pincode', '012345'], ['pincode', '41100'],
    ['email', 'nope'], ['name', 'A'], ['state', 'Mars'], ['line1', '12'],
  ])('rejects bad %s: %s', (field, value) => {
    const r = validateCustomer({ ...ok, [field]: value });
    expect(r.ok).toBe(false);
    expect(r.errors[field]).toBeTruthy();
  });
  it('never throws on junk', () => {
    for (const x of [null, undefined, 5, 'x', [], { name: {} }]) expect(() => validateCustomer(x)).not.toThrow();
  });
});
