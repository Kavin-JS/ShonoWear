/**
 * SHONOWEAR — what every URL says about itself (title, description, preview image, structured data).
 * One pure function, used by the browser (to update the tab and search-engine data) AND by the build step
 * that writes a ready-made HTML file for every URL, so link previews (WhatsApp, Instagram, X) work without JavaScript.
 */
import { STORE } from '../data/storeConfig.js';
import { catalog } from '../data/catalog.js';
import { collections } from '../data/collections.js';
import { PAGES } from '../data/pages.js';
import { POSTS, postBySlug } from '../data/posts.js';
import { INSTAGRAM } from '../data/instagram.js';
import { toText } from './textUtil.js';
import { activeLooks, lookBySlug } from './looks.js';

export const DEFAULT_TITLE = `${STORE.name} — Streetwear and Outfit Stylist for India`;
export const DEFAULT_DESC = 'Heavyweight streetwear basics at honest prices, plus a free stylist that builds outfits around your frame and budget. Cash on delivery across India.';
const NOINDEX = [/^\/admin/, /^\/order\//, /^\/checkout/, /^\/bag/, /^\/account/, /^\/track/, /^\/results/, /^\/saved/, /^\/wishlist/, /^\/unsubscribe/];
const cut = (s, n) => (s.length > n ? s.slice(0, n - 1).trimEnd() + '…' : s);

export function metaFor(pathname, { siteUrl = '' } = {}) {
  const path = (pathname || '/').split('?')[0].replace(/\/+$/, '') || '/';
  const abs = (p) => (/^https?:\/\//.test(p) ? p : `${siteUrl}${p}`);
  const out = { title: DEFAULT_TITLE, description: DEFAULT_DESC, image: abs('/og-image.jpg'), canonical: abs(path === '/' ? '/' : path), type: 'website', noindex: NOINDEX.some(r => r.test(path)), jsonLd: [], summary: '' };
  const crumbs = (items) => ({ '@context': 'https://schema.org', '@type': 'BreadcrumbList', itemListElement: items.map(([name, p], i) => ({ '@type': 'ListItem', position: i + 1, name, item: abs(p) })) });
  const set = (title, description) => { out.title = `${title} · ${STORE.name}`; out.description = cut(description, 160); };

  if (path === '/') {
    out.jsonLd.push({ '@context': 'https://schema.org', '@type': 'Organization', name: STORE.name, url: abs('/'), logo: abs('/icons/icon-512.png'), email: STORE.supportEmail,
      ...(INSTAGRAM.handle ? { sameAs: [`https://www.instagram.com/${INSTAGRAM.handle}/`] } : {}) });
    out.jsonLd.push({ '@context': 'https://schema.org', '@type': 'WebSite', name: STORE.name, url: abs('/'), potentialAction: { '@type': 'SearchAction', target: `${abs('/shop')}?q={search_term_string}`, 'query-input': 'required name=search_term_string' } });
    out.summary = DEFAULT_DESC;
  } else if (path === '/shop') { set('Shop', 'Browse streetwear tops, bottoms, footwear and accessories. Filter by size, price and style.'); out.jsonLd.push(crumbs([['Home', '/'], ['Shop', '/shop']])); }
  else if (path === '/collections') { set('Collections', 'Curated collections: flash sale, pre-orders, new arrivals and more.'); }
  else if (path === '/looks') { set('Shop the look', 'Complete outfits, ready to wear. Add a whole look to your bag in one go.'); out.summary = activeLooks().map(l => l.title).join(', '); out.jsonLd.push(crumbs([['Home', '/'], ['Shop the look', '/looks']])); }
  else if (path === '/build') set('Build your look', 'Pick a top, bottom, layer and shoes, see the price add up, and add the outfit to your bag.');
  else if (path.startsWith('/looks/') && lookBySlug(path.slice(7))) {
    const l = lookBySlug(path.slice(7));
    set(l.title, `${l.blurb} ${l.products.length} pieces.`); out.image = abs(l.products[0].image); out.summary = `${l.blurb} ${l.products.map(p => p.name).join(', ')}.`;
    out.jsonLd.push(crumbs([['Home', '/'], ['Shop the look', '/looks'], [l.title, path]]));
  }
  else if (path === '/upload') set('Free outfit stylist', 'Answer a few questions and get outfits built around your build, skin tone and budget. Free, no account needed.');
  else if (path === '/gift-cards') set('Gift cards', `Give a ${STORE.name} gift card. Delivered by email, valid for ${STORE.giftCards?.validMonths || 12} months.`);
  else if (path === '/privacy') set('Privacy policy', `How ${STORE.name} handles your data.`);
  else if (path === '/terms') set('Terms of sale', `The terms for buying from ${STORE.name}.`);
  else if (path === '/policies/shipping') set('Shipping and payment', 'Delivery times, charges, cash on delivery and payment information.');
  else if (path === '/policies/returns') set('Returns and exchanges', 'How to return or exchange an item, and how refunds work.');
  else if (path === '/contact') set('Contact us', `Write to ${STORE.name}. We reply within 2 business days.`);
  else if (path === '/blog') { set('Journal', 'Sizing, care and styling guides from Shonowear.'); out.jsonLd.push(crumbs([['Home', '/'], ['Journal', '/blog']])); out.summary = POSTS.map(p => p.title).join('. '); }
  else if (path.startsWith('/blog/') && postBySlug(path.slice(6))) {
    const p = postBySlug(path.slice(6));
    set(p.title, p.description); out.type = 'article'; out.image = abs(p.image || '/og-image.jpg');
    out.jsonLd.push({ '@context': 'https://schema.org', '@type': 'Article', headline: p.title, description: p.description, image: [out.image], datePublished: p.date, dateModified: p.date,
      author: { '@type': 'Organization', name: STORE.name }, publisher: { '@type': 'Organization', name: STORE.name, logo: { '@type': 'ImageObject', url: abs('/icons/icon-512.png') } }, mainEntityOfPage: abs(path) });
    out.jsonLd.push(crumbs([['Home', '/'], ['Journal', '/blog'], [p.title, path]]));
    out.summary = toText(p.body);
  } else if (path === PAGES.faq.path) {
    set(PAGES.faq.title, PAGES.faq.description);
    out.jsonLd.push({ '@context': 'https://schema.org', '@type': 'FAQPage', mainEntity: PAGES.faq.faq.map(([q, a]) => ({ '@type': 'Question', name: q, acceptedAnswer: { '@type': 'Answer', text: a } })) });
    out.summary = PAGES.faq.faq.map(([q, a]) => `${q} ${a}`).join(' ');
  } else if (PAGES.about.path === path || PAGES.care.path === path) {
    const pg = path === PAGES.about.path ? PAGES.about : PAGES.care;
    set(pg.title, pg.description); out.summary = toText(pg.body);
  } else if (path.startsWith('/collection/')) {
    const c = collections.find(x => x.slug === path.slice(12));
    if (c) { const items = catalog.filter(c.match); set(c.title, c.blurb); out.summary = items.map(p => p.name).join(', ');
      out.jsonLd.push(crumbs([['Home', '/'], ['Collections', '/collections'], [c.title, path]])); }
  } else if (path.startsWith('/product/')) {
    const p = catalog.find(x => x.id === path.slice(9));
    if (p) {
      set(p.name, `${p.name} by ${p.brand || STORE.name}. ${p.explanation || ''} ₹${p.price.toLocaleString('en-IN')}${p.fulfilment === 'own' ? ', cash on delivery available' : ''}.`);
      out.type = 'product'; out.image = abs(p.image);
      const inStock = p.fulfilment !== 'own' || Object.values(p.sizes || {}).some(n => n > 0);
      out.jsonLd.push({ '@context': 'https://schema.org', '@type': 'Product', name: p.name, image: [abs(p.image), ...(p.images || []).map(abs)].slice(0, 6), description: p.explanation || p.name, sku: p.id, brand: { '@type': 'Brand', name: p.brand || STORE.name }, category: p.category,
        offers: { '@type': 'Offer', url: abs(path), priceCurrency: 'INR', price: p.price, availability: inStock ? 'https://schema.org/InStock' : 'https://schema.org/OutOfStock', itemCondition: 'https://schema.org/NewCondition' } });
      out.jsonLd.push(crumbs([['Home', '/'], ['Shop', '/shop'], [p.name, path]]));
      out.summary = `${p.name}. ${p.explanation || ''} Price ₹${p.price}.`;
    }
  }
  return out;
}

/** Every public URL worth indexing (used by the sitemap and the build-time HTML writer). */
export function publicPaths() {
  return ['/', '/shop', '/upload', '/collections', '/looks', '/build', '/gift-cards', '/blog', PAGES.about.path, PAGES.faq.path, PAGES.care.path, '/privacy', '/terms', '/policies/shipping', '/policies/returns', '/contact',
    ...collections.filter(c => catalog.some(c.match)).map(c => `/collection/${c.slug}`), ...activeLooks().map(l => `/looks/${l.slug}`), ...POSTS.map(p => `/blog/${p.slug}`), ...catalog.map(p => `/product/${p.id}`)];
}
