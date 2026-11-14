/*
  SHONOWEAR — Analytics (first-party, cookieless)
  Counts a handful of anonymous events on our own server (see server/analytics.js) and shows them in /admin.
  No third-party script, no cookie, no visitor id. Do Not Track / Global Privacy Control are respected.

  import { track } from '../lib/analytics';
  track('your_event_name', { optional: 'properties' });   // only events listed in SERVER_EVENT are sent
*/

const IS_DEV = typeof window !== 'undefined' && window.location.hostname === 'localhost';

/** Event names used around the app → the whitelisted names the server counts. Anything not listed is not sent. */
const SERVER_EVENT = { product_viewed: 'pv_product', added_to_bag: 'add_to_bag', outfit_buy_clicked: 'buy_click', chat_product_clicked: 'buy_click', form_completed: 'stylist_used', email_subscribed: 'email_signup', checkout_started: 'checkout_start' };

/** People who send Do Not Track or Global Privacy Control are not counted at all. */
function optedOut() {
  try { return navigator.doNotTrack === '1' || window.doNotTrack === '1' || navigator.globalPrivacyControl === true; } catch { return false; }
}
/** Sends one anonymous count to our own server (no cookie, no id, no third party). Never throws. */
export function count(e, id) {
  try {
    if (IS_DEV || optedOut() || typeof fetch !== 'function') return;
    const body = JSON.stringify(id ? { e, id } : { e });
    fetch('/api/config', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body, keepalive: true }).catch(() => {});
  } catch { /* analytics must never crash the app */ }
}
/** Counts one page view in a coarse group (home, shop, product…). The page address itself is never sent. */
export function countPageview(pathname, id) {
  const p = pathname || '/';
  const g = p === '/' ? 'pv_home' : p.startsWith('/shop') ? 'pv_shop' : p.startsWith('/product/') ? 'pv_product' : p.startsWith('/collection') ? 'pv_collection' : /^\/(blog|about|faq|care|policies|privacy|terms|contact)/.test(p) ? 'pv_content' : 'pv_other';
  if (/^\/(admin|order|account|checkout|unsubscribe)/.test(p)) return;
  count(g, g === 'pv_product' ? id : undefined);
}

/**
 * Track a named event with optional properties.
 * In dev it is logged to the console. In production the few events on the whitelist above are counted on our own server.
 */
export function track(eventName, properties = {}) {
  try {
    if (IS_DEV) { console.log(`[Analytics] ${eventName}`, properties); return; }
    const e = SERVER_EVENT[eventName];
    if (e) count(e, properties.productId);
  } catch { /* never let analytics errors crash the app */ }
}

/* ── Convenience wrappers for common events ── */

export const Analytics = {
  outfitViewed(profile) {
    track('outfit_viewed', {
      aesthetic: profile?.aesthetic,
      occasion:  profile?.occasion,
      budget:    profile?.budget,
    });
  },

  outfitSaved(productId, productName) {
    track('outfit_saved', { productId, productName });
  },

  buyClicked(productId, productName, platform, price) {
    track('outfit_buy_clicked', { productId, productName, platform, price });
  },

  productViewed(productId, productName) {
    track('product_viewed', { productId, productName });
  },

  addedToBag(productId, productName) {
    track('added_to_bag', { productId, productName });
  },

  emailSubscribed() {
    track('email_subscribed');
  },

  fallbackUsed(reason) {
    track('fallback_used', { reason });
  },

  formCompleted(aesthetic, occasion, budget) {
    track('form_completed', { aesthetic, occasion, budget });
  },

  timeoutHit() {
    track('timeout_hit');
  },

  checkoutStarted() {
    track('checkout_started');
  },

  chatOpened() {
    track('chat_opened');
  },

  chatMessageSent(userMessageCount) {
    track('chat_message_sent', { userMessageCount });
  },

  chatProductClicked(productId, productName, platform, price) {
    track('chat_product_clicked', { productId, productName, platform, price });
  },
};
