/* SHONOWEAR service worker — makes the site installable and gives a friendly offline page.
 * It caches ONLY static, public files. It never touches /api, checkout, orders, account or admin, and never caches HTML pages
 * (so prices and stock are never stale). BUILD_ID is stamped by scripts/prerender.mjs so every deploy gets a fresh cache. */
const BUILD_ID = '__BUILD_ID__';
const CACHE = `sw-static-${BUILD_ID}`;
const PRECACHE = ['/offline.html', '/favicon.svg', '/icons/icon-192.png', '/icons/icon-512.png'];
const NEVER = /^\/(api|checkout|order|account|admin|track|_vercel)(\/|$)/;

self.addEventListener('install', (e) => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(PRECACHE)).then(() => self.skipWaiting())); });
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k.startsWith('sw-static-') && k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  const req = e.request; if (req.method !== 'GET') return;
  const url = new URL(req.url); if (url.origin !== self.location.origin || NEVER.test(url.pathname)) return;
  if (req.mode === 'navigate') { // pages: always the network; offline page only if the network fails
    e.respondWith(fetch(req).catch(() => caches.match('/offline.html')));
    return;
  }
  if (url.pathname.startsWith('/assets/') || url.pathname.startsWith('/icons/')) { // hashed build files never change → cache first
    e.respondWith(caches.match(req).then(hit => hit || fetch(req).then(res => { if (res.ok) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(req, copy)); } return res; })));
  }
});
