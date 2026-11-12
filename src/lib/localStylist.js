/**
 * SHONOWEAR — local stylist ("Shono", no AI model, no network)
 *
 * A deterministic, keyword-driven assistant that runs in the browser.
 * It can only recommend products that exist in the catalogue, so every card is real.
 * It is NOT a language model: it understands a fixed set of topics and says so
 * when it doesn't understand.
 */

import { catalog } from '../data/catalog.js';
import { composeLooks } from './outfitRules.js';
import { STORE } from '../data/storeConfig.js';

const OCCASIONS = {
  work:      /\b(work|office|interview|meeting|formal|professional)\b/,
  datenight: /\b(date|dinner|romantic|evening)\b/,
  festival:  /\b(festival|party|fest|concert|club|college\s?fest|function|wedding)\b/,
  casual:    /\b(casual|everyday|daily|college|hangout|weekend|chill)\b/,
};
const AESTHETICS = {
  streetwear: /\b(street ?wear|street|oversized|baggy|hoodie|graphic)\b/,
  minimal:    /\b(minimal|clean|simple|neutral|plain)\b/,
  bold:       /\b(bold|loud|statement|colou?rful|bright)\b/,
  classic:    /\b(classic|timeless|smart|polished|preppy)\b/,
};
const CATEGORIES = {
  footwear:  /\b(shoe|shoes|sneaker|sneakers|footwear|boots?|kicks)\b/,
  bottom:    /\b(jeans|pants?|trousers?|bottoms?|cargo|chinos?|shorts)\b/,
  top:       /\b(tee|t-?shirt|shirt|top|tops|hoodie|sweatshirt|polo)\b/,
  outerwear: /\b(jacket|coat|outerwear|bomber|blazer|layer)\b/,
  accessory: /\b(accessor\w*|watch|cap|belt|bag|chain)\b/,
};
const COLORS = ['black', 'white', 'grey', 'olive', 'beige', 'navy', 'indigo', 'brown', 'silver'];

const SKIN_TIPS = {
  fair:           'Fair skin: navy, olive, charcoal and deep earthy tones add contrast; very pale pastels can wash you out.',
  'light brown':  'Light brown skin: olive, cream, rust and navy all work well. White and beige look fresh against it.',
  'medium brown': 'Medium brown skin: white, cream, olive, mustard and navy give clean contrast; try earthy tones for warmth.',
  'dark brown':   'Dark brown skin: crisp white, cream, bright and jewel tones pop; pastels and warm beige also look great.',
  deep:           'Deep skin: bright white, cobalt, emerald and warm tones create strong contrast; try tonal all-black for a sleek look.',
};
const BODY_TIPS = {
  lean:     'For a lean frame, add volume with layers, relaxed or oversized tops and straight or wide trousers.',
  athletic: 'For an athletic build, structured tops and tapered bottoms show your shape without feeling tight.',
  stocky:   'For a stocky build, keep lines clean and vertical: straight-fit bottoms, dark monotone colours and well-fitted (not tight) tops.',
  heavyset: 'For a fuller frame, pick structured fabrics, dark or tonal colours and a straight or regular fit; avoid anything clingy or oversized in both top and bottom.',
};

export const SUGGESTIONS = [
  'What should I wear to a date?',
  'Streetwear outfit under ₹12000',
  'Sneakers under ₹5000',
  "What's missing from my bag?",
];

function shopLinkFor({ cat, max, color, style, occasion } = {}) {
  const p = new URLSearchParams();
  if (cat) p.set('cat', cat);
  if (max && Number.isFinite(max)) p.set('max', String(Math.round(max)));
  if (color) p.set('color', color);
  if (style) p.set('style', style);
  if (occasion) p.set('occasion', occasion);
  const q = p.toString();
  return q ? `/shop?${q}` : '/shop';
}

const fmt = (n) => `₹${n.toLocaleString('en-IN')}`;
const first = (map, text) => Object.keys(map).find(k => map[k].test(text)) || null;

function parseBudget(text) {
  const m = text.match(/(?:under|below|within|max|upto|up to|less than|<)\s*(?:₹|rs\.?|inr)?\s*(\d[\d,]*)(\s*k)?/i)
        || text.match(/(?:₹|rs\.?|inr)\s*(\d[\d,]*)(\s*k)?/i);
  if (!m) return null;
  let n = Number(m[1].replace(/,/g, ''));
  if (m[2]) n *= 1000;
  return Number.isFinite(n) && n > 0 ? n : null;
}

function score(p, { aesthetic, occasion, color }) {
  let s = 0;
  if (aesthetic && p.tags.includes(aesthetic)) s += 3;
  if (occasion && p.tags.includes(occasion)) s += 2;
  if (color && p.tags.includes(color)) s += 3;
  return s;
}

const card = (p) => ({
  id: p.id, name: p.name, brand: p.brand, category: p.category, price: p.price,
  image: p.image, affiliateUrl: p.affiliateUrl || null, fulfilment: p.fulfilment || 'affiliate', platform: p.platform,
});

/**
 * @param {string} text  the user's latest message
 * @param {{profile?: object, bagIds?: string[]}} ctx
 * @returns {{ reply: string, products: object[], shopLink?: string }}
 */
export function localReply(text, ctx = {}) {
  const t = String(text || '').toLowerCase().slice(0, 300);
  const profile = ctx.profile || {};
  const budget = parseBudget(t);
  const occasion = first(OCCASIONS, t) || profile.occasion || null;
  const aesthetic = first(AESTHETICS, t) || profile.aesthetic || null;
  const category = first(CATEGORIES, t);
  const color = COLORS.find(c => new RegExp(`\\b${c}\\b`).test(t)) || null;

  if (/^(hi|hii+|hello|hey|yo|namaste)\b/.test(t) && t.length < 25) {
    return { reply: "Hi, I'm Shono. Ask me what to wear for an occasion, which colours suit you, or what goes with what, and I'll pick from our catalogue.", products: [] };
  }
  if (/\b(thanks|thank you|thx)\b/.test(t)) {
    return { reply: 'Happy to help. Ask me about any occasion or piece whenever you like.', products: [] };
  }
  if (/\b(are you (an )?(ai|bot|human|real)|who are you)\b/.test(t)) {
    return { reply: "I'm Shono, a simple built-in stylist. I'm not a language model: I match what you ask against our catalogue and some styling rules.", products: [] };
  }

  // Store questions: answered from storeConfig, never invented.
  if (/\b(ship(ping)?|deliver(y|ed)?|how long)\b/.test(t) && !/\b(outfit|wear)\b/.test(t)) {
    return { reply: `Items marked "Ships from us" arrive in ${STORE.deliveryEstimate}. Shipping is free over ₹${STORE.freeShippingOver}, otherwise ₹${STORE.shippingFee}. Partner items (Amazon, Myntra) follow their store's delivery.`, products: [], shopLink: '/policies/shipping' };
  }
  if (/\b(return|refund|exchange|cancel)\b/.test(t)) {
    return { reply: `You can return unused items we ship within ${STORE.returnDays} days of delivery. Refunds go back to your original payment method. Partner items follow Amazon's or Myntra's policy.`, products: [], shopLink: '/policies/returns' };
  }
  if (/\b(pay|payment|upi|cod|cash on delivery|card)\b/.test(t)) {
    return { reply: 'Items we ship are paid for securely online through Razorpay (UPI, cards, netbanking, wallets). We never see your card details. Cash on delivery is not available.', products: [] };
  }
  if (/\b(track|where is my order|order status)\b/.test(t)) {
    return { reply: 'Open the order link from your confirmation email, or use Track order in the footer. It shows the courier and tracking number once your order ships.', products: [], shopLink: '/track' };
  }

  // Bag awareness: what do I have, what's missing?
  if (/\b(bag|cart|basket|complete (my|the) look|finish (my|the) (look|outfit)|what'?s missing|what is missing)\b/.test(t)) {
    const index = new Map(catalog.map(p => [p.id, p]));
    const items = (ctx.bagIds || []).map(id => index.get(id)).filter(Boolean);
    if (!items.length) {
      return { reply: 'Your bag is empty. Tell me an occasion or an item and I can suggest pieces you can add with one tap.', products: [], shopLink: '/shop' };
    }
    const has = (c) => items.some(i => i.category === c);
    const need = [];
    if (!has('set')) { if (!has('top')) need.push('top'); if (!has('bottom')) need.push('bottom'); }
    if (!has('footwear')) need.push('footwear');
    const total = items.reduce((n, i) => n + i.price, 0);
    const base = `You have ${items.length} item${items.length > 1 ? 's' : ''} in your bag (${fmt(total)}).`;
    if (!need.length) {
      return { reply: `${base} That's a complete outfit. A watch or cap would be the finishing touch.`, products: [], shopLink: '/bag' };
    }
    const taste = {
      aesthetic: ['streetwear', 'minimal', 'bold', 'classic'].find(a => items.some(i => i.tags.includes(a))) || aesthetic,
      occasion,
      color: null,
    };
    const inBag = new Set(items.map(i => i.id));
    const picks = need.map(c => catalog.filter(p => p.category === c && !inBag.has(p.id))
      .sort((a, b) => score(b, taste) - score(a, taste) || a.price - b.price)[0]).filter(Boolean);
    return {
      reply: `${base} To make it a full outfit you still need ${need.join(' and ')}. These match what you picked.`,
      products: picks.map(card),
      shopLink: shopLinkFor({ cat: need[0], style: taste.aesthetic }),
    };
  }

  // Colour / skin tone advice
  if (/\b(skin|tone|complexion|colou?rs? (suit|look|for|match))\b/.test(t)) {
    const tip = SKIN_TIPS[profile.skinTone];
    return {
      reply: tip || 'Tell me your skin tone on the style page (fair, light brown, medium brown, dark brown or deep) and I can suggest colours. As a rule: navy, white and olive suit almost everyone.',
      products: [],
    };
  }
  // Fit / body advice
  if (/\b(fit|body|build|frame|slim|broad|chubby|fat|skinny|thin|bulky)\b/.test(t) && !category) {
    const tip = BODY_TIPS[profile.bodyType];
    return {
      reply: tip || 'Share your body type on the style page and I can tailor fit advice. A safe start: pick clothes that fit your shoulders, then adjust the rest.',
      products: [],
    };
  }

  // Pairing question: "what goes with jeans"
  if (/\b(goes? with|pair|match|wear with)\b/.test(t) && category) {
    const need = category === 'bottom' ? ['top', 'footwear'] : category === 'top' ? ['bottom', 'footwear'] : ['top', 'bottom'];
    const picks = need.map(c => catalog.filter(p => p.category === c)
      .sort((a, b) => score(b, { aesthetic, occasion, color }) - score(a, { aesthetic, occasion, color }))[0]).filter(Boolean);
    if (picks.length) {
      return { reply: `Good pairings to start with: ${picks.map(p => p.name).join(' and ')}. Keep one piece loud and the rest neutral.`, products: picks.map(card) };
    }
  }

  // A specific category
  if (category) {
    let pool = catalog.filter(p => p.category === category);
    if (budget) pool = pool.filter(p => p.price <= budget);
    pool = pool.sort((a, b) => score(b, { aesthetic, occasion, color }) - score(a, { aesthetic, occasion, color }) || a.price - b.price).slice(0, 3);
    if (!pool.length) {
      return { reply: `I couldn't find ${category === 'footwear' ? 'shoes' : category} ${budget ? 'under ' + fmt(budget) : 'for that'} in our catalogue yet. Try a higher budget or another item.`, products: [] };
    }
    return {
      reply: `Here ${pool.length === 1 ? 'is a pick' : 'are my picks'}${budget ? ' under ' + fmt(budget) : ''}${aesthetic ? ', matched to ' + aesthetic : ''}.`,
      products: pool.map(card),
      shopLink: shopLinkFor({ cat: category, max: budget, color, style: first(AESTHETICS, t) }),
    };
  }

  // Outfit / occasion request
  if (occasion || /\b(outfit|wear|look|style|fit check|suggest|recommend)\b/.test(t) || budget || color) {
    const prof = { aesthetic: aesthetic || 'streetwear', occasion: occasion || 'casual', budget: 'high' };
    const ceiling = budget || Infinity;
    const { looks } = composeLooks({ ...prof, budget: 'high' }, { count: 12 });
    const fitting = looks.filter(l => l.reduce((n, i) => n + i.price, 0) <= ceiling);
    if (!fitting.length) {
      const cheapest = looks.map(l => l.reduce((n, i) => n + i.price, 0)).sort((a, b) => a - b)[0];
      return {
        reply: `I can't build a complete outfit (top, bottom and shoes) under ${fmt(budget)} from our catalogue yet. The cheapest complete look I have is ${fmt(cheapest)}. You can also ask for one item at a time, like "shoes under ${fmt(Math.min(budget, 4000))}".`,
        products: [],
      };
    }
    const look = (color ? fitting.find(l => l.some(i => i.tags.includes(color))) : null) || fitting[0];
    const total = look.reduce((n, i) => n + i.price, 0);
    return {
      reply: `For ${prof.occasion === 'datenight' ? 'a date' : prof.occasion}, in a ${prof.aesthetic} style, try this look (${fmt(total)} in total): ${look.map(i => i.name).join(', ')}. Add a watch or cap if you want a finishing touch.`,
      products: look.slice(0, 4).map(card),
      shopLink: shopLinkFor({ max: budget, color, style: first(AESTHETICS, t), occasion: first(OCCASIONS, t) }),
    };
  }

  return {
    reply: "I can help with outfits for an occasion, picking shoes, tops or jeans, matching colours to your skin tone, and budgets (for example 'streetwear outfit under ₹6000'). What would you like?",
    products: [],
  };
}
