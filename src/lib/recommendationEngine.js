/*
  SHONOWEAR RECOMMENDATION ENGINE
  ─────────────────────────────────────────────────────────────────
  Calls /api/recommend (single unified Claude call).
  Falls back to local rule-based engine if API is unavailable.
  Returns full response: { outfits, stylingRules, source, warning? }
*/

import { catalog } from '../data/catalog.js';

const API_URL = '/api/recommend';

export async function getRecommendationsAsync(userProfile) {
  try {
    const res = await fetch(API_URL, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(userProfile),
    });

    if (res.status === 429) {
      const data = await res.json().catch(() => ({}));
      // Return fallback with rate limit notice surfaced to UI
      return {
        outfits:      localFallback(userProfile),
        stylingRules: null,
        source:       'fallback',
        warning:      `Too many requests — showing quick matches. Try again in ${Math.ceil((data.retryAfter || 600) / 60)} minutes.`,
      };
    }

    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    // Full response passthrough — includes warning, notice, source
    return await res.json();

  } catch (err) {
    console.warn('[recommendationEngine] API unavailable, using local fallback:', err.message);
    return {
      outfits:      localFallback(userProfile),
      stylingRules: null,
      source:       'fallback',
    };
  }
}

/* ── Local rule-based fallback ── */
function localFallback(styleProfile) {
  const { aesthetic, occasion, budget } = styleProfile;

  const scored = catalog.map(p => {
    let score = 0;
    if (p.tags.includes(aesthetic)) score += 3;
    if (p.tags.includes(occasion))  score += 2;
    if (p.tags.includes(budget))    score += 1;
    return { p, score };
  }).sort((a, b) => b.score - a.score);

  const seen   = new Set();
  const result = [];

  for (const { p } of scored) {
    if (result.length >= 4) break;
    if (!seen.has(p.category)) {
      seen.add(p.category);
      result.push(toCard(p, result.length + 1));
    }
  }

  for (const { p } of scored) {
    if (result.length >= 4) break;
    if (!result.find(r => r.items[0].id === p.id)) {
      result.push(toCard(p, result.length + 1));
    }
  }

  return result;
}

function toCard(p, n) {
  return {
    id: `local-${n}`, name: p.name, brand: p.brand,
    image: p.image, price: p.price,
    affiliateUrl: p.affiliateUrl, platform: p.platform,
    tags: p.tags, explanation: p.explanation,
    styleSummary: '', rating: 7,
    items: [{
      id: p.id, name: p.name, brand: p.brand, category: p.category,
      price: p.price, image: p.image, affiliateUrl: p.affiliateUrl, platform: p.platform,
    }],
  };
}
