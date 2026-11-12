// Shared colour names → swatch (used by filters and variant pickers).
export const SWATCH = {
  black: '#111', white: '#fff', grey: '#9a9aa5', navy: '#1c2a52', olive: '#6b7040', beige: '#d9c7a3',
  indigo: '#3b4a8a', brown: '#6b4a32', silver: '#c9ccd3',
  multicolour: 'conic-gradient(#e8153a,#f5b400,#1fa971,#2b6ef5,#e8153a)',
};
export const COLOR_NAMES = Object.keys(SWATCH);
export const colorOf = (p) => (p?.tags || []).find(t => COLOR_NAMES.includes(t)) || '';
/** Other products in the same colour group (set `colorGroup` on each in the catalogue), including p itself. */
export function variantsOf(p, all) {
  if (!p?.colorGroup) return [];
  return all.filter(x => x.colorGroup === p.colorGroup);
}
