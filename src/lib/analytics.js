/*
  SHONOWEAR — Analytics
  ─────────────────────────────────────────────────────────────
  Lightweight event tracking. Two layers:

  Layer 1 — Vercel Web Analytics (free, no cookie banner needed,
  GDPR-compliant, zero config after enabling in Vercel dashboard):
  Dashboard → your project → Analytics → Enable

  Layer 2 — Custom events logged to console in dev,
  sent to Vercel Analytics in production via window.va().

  EVENTS WE TRACK:
  - outfit_viewed      : user sees results page
  - outfit_saved       : user taps ♥ on a card
  - outfit_buy_clicked : user taps Buy / Shop
  - email_subscribed   : user submits email form
  - fallback_used      : AI failed, rule-based engine used
  - form_completed     : user submits the upload form
  - timeout_hit        : AI call exceeded 25s
  - chat_opened        : user opened the Shono chat
  - chat_message_sent  : user sent a chat message
  - chat_product_clicked : user tapped Shop on a product Shono recommended

  HOW TO ADD CUSTOM EVENTS:
  import { track } from '../lib/analytics';
  track('your_event_name', { optional: 'properties' });
*/

const IS_DEV = typeof window !== 'undefined' && window.location.hostname === 'localhost';

/**
 * Track a named event with optional properties.
 * Uses Vercel Analytics if available, falls back to console.log in dev.
 */
export function track(eventName, properties = {}) {
  try {
    if (IS_DEV) {
      console.log(`[Analytics] ${eventName}`, properties);
      return;
    }
    // Vercel Analytics (window.va is injected by @vercel/analytics)
    if (typeof window !== 'undefined' && window.va) {
      window.va('event', { name: eventName, ...properties });
    }
  } catch {
    // Never let analytics errors crash the app
  }
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
