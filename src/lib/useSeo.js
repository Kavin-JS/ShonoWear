import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { metaFor } from './seoMeta.js';
import { countPageview } from './analytics.js';

function setTag(sel, attr, value, make) {
  let el = document.head.querySelector(sel);
  if (!el) { el = document.createElement(make.tag); for (const [k, v] of Object.entries(make.attrs)) el.setAttribute(k, v); document.head.appendChild(el); }
  el.setAttribute(attr, value);
}
/** Keeps the tab title, description, preview tags, canonical link and structured data in step with the current URL. */
export function useRouteSeo() {
  const { pathname } = useLocation();
  useEffect(() => {
    const m = metaFor(pathname, { siteUrl: window.location.origin });
    document.title = m.title;
    setTag('meta[name="description"]', 'content', m.description, { tag: 'meta', attrs: { name: 'description' } });
    setTag('link[rel="canonical"]', 'href', m.canonical, { tag: 'link', attrs: { rel: 'canonical' } });
    for (const [prop, v] of [['og:title', m.title], ['og:description', m.description], ['og:url', m.canonical], ['og:image', m.image], ['og:type', m.type]]) setTag(`meta[property="${prop}"]`, 'content', v, { tag: 'meta', attrs: { property: prop } });
    for (const [n, v] of [['twitter:title', m.title], ['twitter:description', m.description], ['twitter:image', m.image]]) setTag(`meta[name="${n}"]`, 'content', v, { tag: 'meta', attrs: { name: n } });
    setTag('meta[name="robots"]', 'content', m.noindex ? 'noindex, nofollow' : 'index, follow', { tag: 'meta', attrs: { name: 'robots' } });
    document.head.querySelectorAll('script[data-seo]').forEach(n => n.remove());
    for (const j of m.jsonLd) { const s = document.createElement('script'); s.type = 'application/ld+json'; s.dataset.seo = '1'; s.textContent = JSON.stringify(j); document.head.appendChild(s); }
    document.head.querySelectorAll('script[type="application/ld+json"]:not([data-seo])').forEach(n => n.remove()); // the static WebApplication block from index.html
  }, [pathname]);
  // One anonymous page-view count per route change (product views are counted with the product id by the Product page instead).
  useEffect(() => { if (!pathname.startsWith('/product/')) countPageview(pathname); }, [pathname]);
}
