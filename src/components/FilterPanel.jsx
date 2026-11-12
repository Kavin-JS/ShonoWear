import { catalog } from '../data/catalog.js';
import { sizesOf } from '../lib/store.js';
import { CATEGORY_LABELS, STYLES, OCCASIONS, COLORS, PRICE_CAPS } from '../lib/shopFilters.js';

const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const OCC_LABEL = { casual: 'Casual', datenight: 'Date night', work: 'Work', festival: 'Festival' };
import { SWATCH } from '../lib/colors.js';

function Group({ title, children }) {
  return (
    <div role="group" aria-label={title} style={{ padding: '16px 0', borderBottom: '1px solid var(--border)' }}>
      <div aria-hidden="true" style={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 10 }}>{title}</div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>{children}</div>
    </div>
  );
}
const Opt = ({ on, onClick, children }) => (
  <button type="button" className="chip" aria-pressed={on} onClick={onClick}>{children}</button>
);

const BRANDS = [...new Set(catalog.map(p => p.brand))].sort((a, b) => a.localeCompare(b));
const SIZES = [...new Set(catalog.filter(p => p.sizes).flatMap(p => sizesOf(p)))];

/** Shared by the desktop sidebar and the mobile bottom sheet. `set` patches the URL filters. */
export default function FilterPanel({ f, set }) {
  const toggle = (k, v) => set({ [k]: f[k] === v ? '' : v });
  return (
    <div>
      <Group title="Availability">
        <Opt on={f.instock === '1'} onClick={() => set({ instock: f.instock ? '' : '1' })}>In stock only</Opt>
      </Group>
      <Group title="Category">
        {Object.entries(CATEGORY_LABELS).map(([k, l]) => <Opt key={k} on={f.cat === k} onClick={() => toggle('cat', k)}>{l}</Opt>)}
      </Group>
      <Group title="Price">
        {PRICE_CAPS.map(c => <Opt key={c} on={f.max === c} onClick={() => set({ max: f.max === c ? '' : c })}>Under ₹{c.toLocaleString('en-IN')}</Opt>)}
      </Group>
      <Group title="Sold by">
        <Opt on={f.platform === 'Shonowear'} onClick={() => toggle('platform', 'Shonowear')}>Ships from us</Opt>
        <Opt on={f.platform === 'Amazon'} onClick={() => toggle('platform', 'Amazon')}>Amazon</Opt>
        <Opt on={f.platform === 'Myntra'} onClick={() => toggle('platform', 'Myntra')}>Myntra</Opt>
      </Group>
      {SIZES.length > 0 && (
        <Group title="Size (items we ship)">
          {SIZES.map(sz => <Opt key={sz} on={f.size === sz} onClick={() => toggle('size', sz)}>{sz}</Opt>)}
        </Group>
      )}
      <Group title="Brand">
        {BRANDS.map(b => <Opt key={b} on={f.brand.toLowerCase() === b.toLowerCase()} onClick={() => set({ brand: f.brand.toLowerCase() === b.toLowerCase() ? '' : b })}>{b}</Opt>)}
      </Group>
      <Group title="Style">
        {STYLES.map(s => <Opt key={s} on={f.style === s} onClick={() => toggle('style', s)}>{cap(s)}</Opt>)}
      </Group>
      <Group title="Occasion">
        {OCCASIONS.map(o => <Opt key={o} on={f.occasion === o} onClick={() => toggle('occasion', o)}>{OCC_LABEL[o]}</Opt>)}
      </Group>
      <Group title="Colour">
        {COLORS.map(c => (
          <button key={c} type="button" className="chip" aria-pressed={f.color === c} onClick={() => toggle('color', c)} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <span aria-hidden="true" style={{ width: 12, height: 12, borderRadius: '50%', background: SWATCH[c], border: '1px solid var(--border2)' }} />{cap(c)}
          </button>
        ))}
      </Group>
    </div>
  );
}
