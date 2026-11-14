/**
 * SHONOWEAR — invoice numbers. One number per order, assigned the first time an invoice is made and never changed.
 * Format: <prefix>/<financial year>/<4-digit serial>, e.g. SW/2026-27/0001. The serial restarts each financial year (April to March, India time).
 */
import { STORE } from '../src/data/storeConfig.js';
import { store } from './guard.js';

export function financialYear(iso) {
  const d = new Date(new Date(iso).getTime() + 5.5 * 3600_000);          // India time
  const y = d.getUTCFullYear(), m = d.getUTCMonth() + 1;
  const start = m >= 4 ? y : y - 1;
  return `${start}-${String((start + 1) % 100).padStart(2, '0')}`;
}

export async function invoiceNumber(order) {
  const key = `inv:${order.id}`;
  const [have] = await store([['GET', key]]);
  if (have) return have;
  const fy = financialYear(order.paidAt || order.createdAt);
  // only the holder of the lock takes a serial, so a double click cannot burn a number
  const [lock] = await store([['SET', `invlock:${order.id}`, '1', 'NX', 'EX', 30]]);
  if (lock !== 'OK') {
    for (let i = 0; i < 10; i++) { await new Promise(r => setTimeout(r, 100)); const [v] = await store([['GET', key]]); if (v) return v; }
    throw new Error('invoice number busy');
  }
  const [again] = await store([['GET', key]]);
  if (again) return again;
  const [n] = await store([['INCR', `invseq:${fy}`]]);
  const num = `${STORE.gst?.invoicePrefix || 'INV'}/${fy}/${String(n).padStart(4, '0')}`;
  await store([['SET', key, num]]);
  return num;
}
