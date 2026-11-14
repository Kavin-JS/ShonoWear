/**
 * SHONOWEAR — first-party, cookieless visit counters.
 * We only count: one Redis hash per day (IST) holding totals per event and per product. No IP, no user id, no cookie,
 * no fingerprint is stored, so there is nothing personal to consent to. "Unique visitors" are deliberately not counted.
 * Anything not on the whitelist is ignored.
 */
import { catalog } from '../src/data/catalog.js';
import { store, hgetall } from './guard.js';

export const EVENTS = ['pv_home', 'pv_shop', 'pv_product', 'pv_collection', 'pv_content', 'pv_other', 'add_to_bag', 'checkout_start', 'buy_click', 'stylist_used', 'email_signup', 'search'];
const ids = new Set(catalog.map(p => p.id));
const TTL = 120 * 86400;
export const istDayOf = (ms) => new Date(ms + 5.5 * 3600_000).toISOString().slice(0, 10);

/** @returns {Promise<boolean>} true when something was counted */
export async function recordEvent({ e, id } = {}, now = Date.now()) {
  if (typeof e !== 'string' || !EVENTS.includes(e)) return false;
  const key = `an:${istDayOf(now)}`;
  const cmds = [['HINCRBY', key, `e:${e}`, 1]];
  if (typeof id === 'string' && ids.has(id) && ['pv_product', 'add_to_bag', 'buy_click'].includes(e)) cmds.push(['HINCRBY', key, `p:${e}:${id}`, 1]);
  cmds.push(['EXPIRE', key, TTL]);
  await store(cmds);
  return true;
}

export async function funnel({ days = 30, now = Date.now() } = {}) {
  const day = [];
  for (let i = days - 1; i >= 0; i--) day.push(istDayOf(now - i * 86400_000));
  const rows = await store(day.map(d => ['HGETALL', `an:${d}`]));
  const totals = Object.fromEntries(EVENTS.map(e => [e, 0]));
  const prod = new Map();
  const series = day.map((d, i) => {
    const h = hgetall(rows[i]); let views = 0;
    for (const [k, v] of Object.entries(h)) {
      const n = Number(v) || 0;
      if (k.startsWith('e:')) { const e = k.slice(2); if (e in totals) totals[e] += n; if (e.startsWith('pv_')) views += n; }
      else if (k.startsWith('p:')) { const [, e, id] = k.split(':'); const t = prod.get(id) || { id, views: 0, adds: 0, buys: 0 }; if (e === 'pv_product') t.views += n; else if (e === 'add_to_bag') t.adds += n; else if (e === 'buy_click') t.buys += n; prod.set(id, t); }
    }
    return { day: d, views };
  });
  const pageViews = EVENTS.filter(e => e.startsWith('pv_')).reduce((n, e) => n + totals[e], 0);
  const name = new Map(catalog.map(p => [p.id, p.name]));
  const products = [...prod.values()].map(p => ({ ...p, name: name.get(p.id) || p.id })).sort((a, b) => b.views - a.views).slice(0, 8);
  return { days, pageViews, totals, series, products,
    steps: [['Product views', totals.pv_product], ['Added to bag', totals.add_to_bag], ['Started checkout', totals.checkout_start]] };
}
