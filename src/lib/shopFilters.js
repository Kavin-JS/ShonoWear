/*
  SHONOWEAR — shop filtering (pure functions, used by the Shop page, tests and the assistant)
*/

export const CATEGORY_LABELS = {
  top: 'Tops', bottom: 'Bottoms', footwear: 'Footwear',
  outerwear: 'Outerwear', set: 'Sets', accessory: 'Accessories',
};
export const STYLES = ['streetwear', 'minimal', 'bold', 'classic'];
export const OCCASIONS = ['casual', 'datenight', 'work', 'festival'];
export const COLORS = ['black', 'white', 'grey', 'navy', 'olive', 'beige', 'indigo', 'brown', 'silver', 'multicolour'];
export const PRICE_CAPS = [1000, 2000, 3000, 5000];
export const SORTS = { relevance: 'Featured', newest: 'Newest first', 'price-asc': 'Price: low to high', 'price-desc': 'Price: high to low' };

// Words people type → the category they mean.
const SYNONYMS = {
  shoe: 'footwear', shoes: 'footwear', sneaker: 'footwear', sneakers: 'footwear', boots: 'footwear',
  tee: 'top', tees: 'top', tshirt: 'top', 't-shirt': 'top', shirt: 'top', shirts: 'top', hoodie: 'top', hoodies: 'top',
  jeans: 'bottom', pants: 'bottom', trousers: 'bottom', cargo: 'bottom', cargos: 'bottom', shorts: 'bottom', joggers: 'bottom',
  jacket: 'outerwear', jackets: 'outerwear', coat: 'outerwear', bomber: 'outerwear',
  watch: 'accessory', cap: 'accessory', belt: 'accessory', bag: 'accessory',
};

const pick = (v, allowed) => (allowed.includes(v) ? v : '');

/** Reads and sanitises filters from URLSearchParams (never trusts the URL). */
export function parseFilters(params) {
  const g = (k) => params.get(k) || '';
  const max = Number(g('max'));
  return {
    q: g('q').slice(0, 60),
    cat: pick(g('cat'), Object.keys(CATEGORY_LABELS)),
    max: Number.isFinite(max) && max > 0 && max <= 100000 ? Math.round(max) : 0,
    platform: pick(g('platform'), ['Amazon', 'Myntra', 'Shonowear']),
    style: pick(g('style'), STYLES),
    occasion: pick(g('occasion'), OCCASIONS),
    color: pick(g('color'), COLORS),
    brand: g('brand').replace(/[^\p{L}\p{N} &.'-]/gu, '').slice(0, 40),
    size: g('size').replace(/[^A-Za-z0-9 ]/g, '').slice(0, 10),
    instock: g('instock') === '1' ? '1' : '',
    sort: pick(g('sort'), Object.keys(SORTS)) || 'relevance',
  };
}

export function filtersToParams(f) {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(f)) {
    if (v && v !== 'relevance') p.set(k, String(v));
  }
  return p;
}

export function filterProducts(catalog, f) {
  const tokens = f.q.toLowerCase().split(/\s+/).filter(Boolean);
  let list = catalog.filter(p => {
    if (f.cat && p.category !== f.cat) return false;
    if (f.max && p.price > f.max) return false;
    if (f.platform && p.platform !== f.platform) return false;
    if (f.style && !p.tags.includes(f.style)) return false;
    if (f.occasion && !p.tags.includes(f.occasion)) return false;
    if (f.color && !p.tags.includes(f.color)) return false;
    if (f.brand && p.brand.toLowerCase() !== f.brand.toLowerCase()) return false;
    // Size and stock use the catalogue's totals. Live stock is checked on the product page and at checkout.
    if (f.size && !(p.sizes && Object.hasOwn(p.sizes, f.size) && p.sizes[f.size] > 0)) return false;
    if (f.instock && p.sizes && !Object.values(p.sizes).some(n => n > 0)) return false;
    if (tokens.length) {
      const hay = `${p.name} ${p.brand} ${p.category} ${p.tags.join(' ')}`.toLowerCase();
      return tokens.every(t => hay.includes(t) || SYNONYMS[t] === p.category);
    }
    return true;
  });
  if (f.sort === 'newest') {
    const t = (p) => (p.addedAt ? Date.parse(p.addedAt) || 0 : 0);
    list = list.map((p, i) => [p, i]).sort((a, b) => t(b[0]) - t(a[0]) || a[1] - b[1]).map(x => x[0]);
  }
  if (f.sort === 'price-asc')  list = [...list].sort((a, b) => a.price - b.price);
  if (f.sort === 'price-desc') list = [...list].sort((a, b) => b.price - a.price);
  return list;
}

export function activeFilterCount(f) {
  return ['cat', 'max', 'platform', 'style', 'occasion', 'color', 'brand', 'size', 'instock'].filter(k => f[k]).length + (f.q ? 1 : 0);
}
