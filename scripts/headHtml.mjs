// Pure helpers that turn page meta into <head> HTML. Everything inserted is escaped (attributes) or \u003c-escaped (JSON-LD).
export const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const ld = (o) => JSON.stringify(o).replace(/</g, '\\u003c');

export function headFor(m) {
  return [
    `<title>${esc(m.title)}</title>`,
    `<meta name="description" content="${esc(m.description)}" />`,
    `<link rel="canonical" href="${esc(m.canonical)}" />`,
    `<meta name="robots" content="${m.noindex ? 'noindex, nofollow' : 'index, follow'}" />`,
    `<meta property="og:type" content="${esc(m.type)}" />`,
    `<meta property="og:site_name" content="Shonowear" />`,
    `<meta property="og:locale" content="en_IN" />`,
    `<meta property="og:url" content="${esc(m.canonical)}" />`,
    `<meta property="og:title" content="${esc(m.title)}" />`,
    `<meta property="og:description" content="${esc(m.description)}" />`,
    `<meta property="og:image" content="${esc(m.image)}" />`,
    `<meta name="twitter:card" content="summary_large_image" />`,
    `<meta name="twitter:title" content="${esc(m.title)}" />`,
    `<meta name="twitter:description" content="${esc(m.description)}" />`,
    `<meta name="twitter:image" content="${esc(m.image)}" />`,
    ...m.jsonLd.map(j => `<script type="application/ld+json">${ld(j)}</script>`),
  ].map(l => '    ' + l).join('\n');
}

