/**
 * SHONOWEAR — /api/recommend.js
 * Vercel Serverless Function
 *
 * Production hardening:
 *   - Upstash Redis rate limiting (persistent across instances)
 *   - Full input validation + sanitization
 *   - AbortController backend timeout (20s hard kill)
 *   - Global daily cost cap via KV counter
 *   - AI kill switch via AI_ENABLED env flag
 *   - Catalog health check before calling AI
 *   - No key logging, no client-side secret exposure
 *
 * Required env vars (set in Vercel Dashboard → Settings → Env Vars):
 *   ANTHROPIC_API_KEY   — Claude API key
 *   UPSTASH_REDIS_REST_URL   — from upstash.com
 *   UPSTASH_REDIS_REST_TOKEN — from upstash.com
 *   AI_ENABLED          — set to "false" to kill AI without redeploying
 *   AI_DAILY_LIMIT      — max AI calls per day (default: 500)
 */

import { catalog } from '../src/data/catalog.js';

const MODEL          = process.env.RECOMMEND_MODEL || 'claude-sonnet-4-20250514';
const CLAUDE_URL     = 'https://api.anthropic.com/v1/messages';
const CLAUDE_TIMEOUT = 20_000; // 20s hard kill — Vercel function limit is 30s

/* ─────────────────────────────────────────────────────────────
   VALID VALUES — used for input validation
   ───────────────────────────────────────────────────────────── */
const VALID = {
  gender:    ['male', 'female', 'other'],
  bodyType:  ['lean', 'athletic', 'stocky', 'heavyset'],
  skinTone:  ['fair', 'light brown', 'medium brown', 'dark brown', 'deep'],
  aesthetic: ['streetwear', 'minimal', 'bold', 'classic'],
  occasion:  ['casual', 'datenight', 'work', 'festival'],
  budget:    ['low', 'mid', 'high'],
};

/* ─────────────────────────────────────────────────────────────
   INPUT VALIDATION & SANITIZATION
   Validates every field. Clamps numeric ranges.
   Returns { ok, error, data } — never trusts raw req.body.
   ───────────────────────────────────────────────────────────── */
function validateProfile(body) {
  if (!body || typeof body !== 'object') {
    return { ok: false, error: 'Request body must be a JSON object.' };
  }

  const errors = [];
  const data   = {};

  // Required string enums
  for (const [field, allowed] of Object.entries(VALID)) {
    const val = body[field];
    if (!val || typeof val !== 'string') {
      errors.push(`${field} is required.`);
      continue;
    }
    const cleaned = val.trim().toLowerCase();
    if (!allowed.includes(cleaned)) {
      errors.push(`${field} must be one of: ${allowed.join(', ')}.`);
      continue;
    }
    data[field] = cleaned;
  }

  // Numeric fields — clamp to safe ranges, never trust raw values
  const height = Number(body.height);
  const weight = Number(body.weight);

  if (!Number.isFinite(height) || height < 100 || height > 250) {
    errors.push('height must be a number between 100 and 250 (cm).');
  } else {
    data.height = Math.round(height); // integer only
  }

  if (!Number.isFinite(weight) || weight < 30 || weight > 300) {
    errors.push('weight must be a number between 30 and 300 (kg).');
  } else {
    data.weight = Math.round(weight);
  }

  if (errors.length > 0) {
    return { ok: false, error: errors.join(' ') };
  }

  // Derive preferences array — used in prompt, never from user input directly
  data.preferences = [data.aesthetic, data.occasion];

  return { ok: true, data };
}

/* ─────────────────────────────────────────────────────────────
   UPSTASH REDIS RATE LIMITER
   Persistent across serverless instances and cold starts.
   Falls back gracefully if Upstash is not configured.

   Setup:
   1. upstash.com → Create Redis database (free tier is fine)
   2. Copy REST URL and REST Token
   3. Add to Vercel env vars:
      UPSTASH_REDIS_REST_URL
      UPSTASH_REDIS_REST_TOKEN
   ───────────────────────────────────────────────────────────── */
const RATE_LIMIT_MAX    = 5;               // requests
const RATE_LIMIT_WINDOW = 10 * 60;        // seconds (10 minutes)

async function checkRateLimit(ip) {
  const url   = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;

  // If Upstash is not configured, skip rate limiting (log a warning)
  if (!url || !token) {
    console.warn('[rate-limit] Upstash not configured — rate limiting disabled');
    return { limited: false };
  }

  const key = `rl:recommend:${ip}`;

  try {
    // INCR key (creates if not exists, returns new count)
    const incrRes = await fetch(`${url}/incr/${key}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const { result: count } = await incrRes.json();

    // On first request, set expiry
    if (count === 1) {
      await fetch(`${url}/expire/${key}/${RATE_LIMIT_WINDOW}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
    }

    if (count > RATE_LIMIT_MAX) {
      // Get TTL so we can tell the user how long to wait
      const ttlRes = await fetch(`${url}/ttl/${key}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const { result: ttl } = await ttlRes.json();
      return { limited: true, retryAfter: Math.max(ttl, 0) };
    }

    return { limited: false };
  } catch (err) {
    // If Redis is down, don't block the user — just log and continue
    console.error('[rate-limit] Upstash error:', err.message);
    return { limited: false };
  }
}

/* ─────────────────────────────────────────────────────────────
   DAILY COST CAP
   Counts AI calls today using Upstash KV.
   Kill switch: set AI_ENABLED=false in Vercel env vars to
   instantly disable AI without redeploying.
   ───────────────────────────────────────────────────────────── */
const DEFAULT_DAILY_LIMIT = 500;

async function checkCostGuardrails() {
  // Hard kill switch — set AI_ENABLED=false to disable immediately
  if (process.env.AI_ENABLED === 'false') {
    return { blocked: true, reason: 'AI is temporarily disabled. Using quick-match recommendations.' };
  }

  const url   = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;

  if (!url || !token) return { blocked: false }; // no KV, skip check

  const dailyLimit = Number(process.env.AI_DAILY_LIMIT) || DEFAULT_DAILY_LIMIT;
  const today      = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
  const key        = `cost:daily:${today}`;

  try {
    const incrRes = await fetch(`${url}/incr/${key}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const { result: count } = await incrRes.json();

    // Set expiry to 25 hours (covers timezone edge cases)
    if (count === 1) {
      await fetch(`${url}/expire/${key}/90000`, {
        headers: { Authorization: `Bearer ${token}` },
      });
    }

    if (count > dailyLimit) {
      console.warn(`[cost-guard] Daily limit hit: ${count}/${dailyLimit}`);
      return { blocked: true, reason: 'Daily AI capacity reached. Using quick-match recommendations.' };
    }

    return { blocked: false };
  } catch (err) {
    console.error('[cost-guard] error:', err.message);
    return { blocked: false }; // don't block on KV failure
  }
}

/* ─────────────────────────────────────────────────────────────
   CATALOG HEALTH CHECK
   Ensures enough products exist per category before AI call.
   Returns warning message if catalog is too thin.
   ───────────────────────────────────────────────────────────── */
function checkCatalogHealth(filteredCatalog) {
  const counts = filteredCatalog.reduce((acc, p) => {
    acc[p.category] = (acc[p.category] || 0) + 1;
    return acc;
  }, {});

  const hasTops     = (counts.top || 0) + (counts.set || 0) >= 1;
  const hasBottoms  = (counts.bottom || 0) + (counts.set || 0) >= 1;
  const hasFootwear = (counts.footwear || 0) >= 1;

  if (!hasTops || !hasBottoms || !hasFootwear) {
    return {
      healthy: false,
      message: 'Limited options available for your style — showing best available matches.',
    };
  }

  return { healthy: true };
}

/* ─────────────────────────────────────────────────────────────
   CATALOG FILTER
   ───────────────────────────────────────────────────────────── */
function filterCatalog(profile) {
  const { aesthetic, occasion, budget } = profile;

  return catalog
    .map(p => {
      let score = 0;
      if (p.tags.includes(aesthetic)) score += 3;
      if (p.tags.includes(occasion))  score += 2;
      if (p.tags.includes(budget))    score += 1;
      return { p, score };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, 20)
    .map(({ p }) => ({
      id:       p.id,
      name:     p.name,
      category: p.category,
      price:    p.price,
      tags:     p.tags,
    }));
}

/* ─────────────────────────────────────────────────────────────
   UNIFIED PROMPT
   ───────────────────────────────────────────────────────────── */
function buildPrompt(profile, filteredCatalog) {
  return `You are a professional fashion recommendation engine. Your job is to generate high-quality, realistic, and wearable outfits based on a structured user profile and a product catalog.
You must follow strict rules for consistency, logic, and usability. Do not produce random or vague outputs.

INPUT

User Profile:
${JSON.stringify(profile, null, 2)}

Product Catalog:
${JSON.stringify(filteredCatalog, null, 2)}

OBJECTIVE
Generate exactly 4 complete outfits.
Each outfit must:
- Be realistic and wearable
- Match the user's body type and proportions
- Respect the occasion and aesthetic
- Stay within budget (budget tier: "${profile.budget}" — low = under ₹1500, mid = ₹1500–₹5000, high = ₹5000+)
- Use proper category combinations

HARD CONSTRAINTS (MANDATORY)
1. Each outfit MUST include:
   - 1 top (OR 1 set that covers top+bottom)
   - 1 bottom (unless using a "set")
   - 1 footwear
2. Optional: outerwear, accessories
3. DO NOT:
   - Select duplicate categories within one outfit (e.g., 2 tops)
   - Exceed budget — totalPrice = sum of ALL selected item prices in the outfit
   - Use incompatible styles (e.g., formal + gym wear)
   - Ignore body type constraints
4. Ensure color harmony using color tags in the catalog

STAGE 1: STYLE RULE GENERATION
Derive from the user profile:
- fitRules: based on body type and height (max 5, specific and actionable)
- colorRules: based on skin tone (max 5)
- styleRules: based on aesthetic + occasion (max 5)
- avoidRules: what NOT to recommend (max 5)

STAGE 2: OUTFIT CONSTRUCTION
- Select items that strictly follow the Stage 1 rules
- Build 4 distinct outfits with variety
- totalPrice = exact sum of all item prices in that outfit

STAGE 3: EVALUATION & SCORING
Score each outfit out of 10:
- Fit suitability for this user's body type: 40%
- Color harmony: 30%
- Occasion match: 20%
- Style alignment: 10%

For each outfit:
- title: 3–5 word punchy name
- styleSummary: one sentence vibe
- explanation: 1–2 sentences, personalised, under 60 words, no generic statements

OUTPUT FORMAT (STRICT JSON ONLY):
{
  "stylingRules": { "fit": [], "color": [], "style": [], "avoid": [] },
  "outfits": [
    {
      "title": "",
      "score": 0,
      "styleSummary": "",
      "items": [{ "id": "", "name": "", "category": "", "price": 0 }],
      "totalPrice": 0,
      "explanation": ""
    }
  ]
}

RULES:
- Only use product IDs from the provided catalog — never invent products
- Return ONLY valid JSON — no markdown, no backticks, no text outside JSON
- If constraints cannot be fully satisfied, return 4 best-effort outfits`;
}

/* ─────────────────────────────────────────────────────────────
   CLAUDE CALLER — with AbortController hard timeout
   ───────────────────────────────────────────────────────────── */
async function callClaude(prompt) {
  // Verify key exists — never log it
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error('ANTHROPIC_API_KEY is not set');
  }

  const controller = new AbortController();
  const timeoutId  = setTimeout(() => controller.abort(), CLAUDE_TIMEOUT);

  try {
    const res = await fetch(CLAUDE_URL, {
      method:  'POST',
      headers: {
        'Content-Type':    'application/json',
        'x-api-key':       process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model:      MODEL,
        max_tokens: 2500,
        messages:   [{ role: 'user', content: prompt }],
      }),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!res.ok) {
      // Log status only — never log response body (may contain sensitive info)
      throw new Error(`Claude API returned ${res.status}`);
    }

    const data = await res.json();
    return data.content.map(b => b.text || '').join('').replace(/```json\n?|```/g, '').trim();

  } catch (err) {
    clearTimeout(timeoutId);
    if (err.name === 'AbortError') {
      throw new Error(`Claude call timed out after ${CLAUDE_TIMEOUT / 1000}s`);
    }
    throw err;
  }
}

/* ─────────────────────────────────────────────────────────────
   HYDRATE OUTFITS
   ───────────────────────────────────────────────────────────── */
function hydrateOutfits(aiOutfits) {
  return aiOutfits.map((outfit, index) => {
    const hydratedItems = (outfit.items || []).map(item => {
      const full = catalog.find(p => p.id === item.id);
      if (!full) return null;
      return {
        id:           full.id,
        name:         full.name,
        brand:        full.brand,
        category:     full.category,
        price:        full.price,
        image:        full.image,
        affiliateUrl: full.affiliateUrl,
        platform:     full.platform,
      };
    }).filter(Boolean);

    if (!hydratedItems.length) return null;

    const primary    = hydratedItems.find(i => i.category === 'top' || i.category === 'set') || hydratedItems[0];
    const totalPrice = hydratedItems.reduce((sum, i) => sum + i.price, 0); // recalculated — never trust AI arithmetic

    return {
      id:           `outfit-${index + 1}`,
      name:         outfit.title || primary.name,
      brand:        [...new Set(hydratedItems.map(i => i.brand))].join(' + '),
      image:        primary.image,
      price:        totalPrice,
      affiliateUrl: primary.affiliateUrl,
      platform:     primary.platform,
      tags:         primary.tags || [],
      explanation:  outfit.explanation || primary.explanation,
      styleSummary: outfit.styleSummary || '',
      rating:       typeof outfit.score === 'number' ? Math.min(10, Math.max(1, outfit.score)) : 7,
      items:        hydratedItems,
    };
  }).filter(Boolean);
}

/* ─────────────────────────────────────────────────────────────
   LOCAL FALLBACK
   ───────────────────────────────────────────────────────────── */
function localFallback(profile) {
  const { aesthetic, occasion, budget } = profile;

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
      result.push(toOutfitCard(p, result.length + 1));
    }
  }

  // Fill if dedup left us short
  for (const { p } of scored) {
    if (result.length >= 4) break;
    if (!result.find(r => r.items[0].id === p.id)) {
      result.push(toOutfitCard(p, result.length + 1));
    }
  }

  return result;
}

function toOutfitCard(p, n) {
  return {
    id: `fallback-${n}`, name: p.name, brand: p.brand,
    image: p.image, price: p.price,
    affiliateUrl: p.affiliateUrl, platform: p.platform,
    tags: p.tags, explanation: p.explanation,
    styleSummary: '', rating: 7,
    items: [{ id: p.id, name: p.name, brand: p.brand, category: p.category,
              price: p.price, image: p.image, affiliateUrl: p.affiliateUrl, platform: p.platform }],
  };
}

/* ─────────────────────────────────────────────────────────────
   IP HELPER
   ───────────────────────────────────────────────────────────── */
function getClientIp(req) {
  return (
    req.headers['x-forwarded-for']?.split(',')[0]?.trim() ||
    req.headers['x-real-ip'] ||
    req.socket?.remoteAddress ||
    'unknown'
  );
}

/* ─────────────────────────────────────────────────────────────
   MAIN HANDLER
   ───────────────────────────────────────────────────────────── */
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST')   return res.status(405).json({ error: 'Method not allowed' });

  // ── 1. Rate limiting (Upstash — persistent across instances) ──
  const clientIp    = getClientIp(req);
  const rateResult  = await checkRateLimit(clientIp);
  if (rateResult.limited) {
    return res.status(429).json({
      error:      'Too many requests. Please wait a few minutes before trying again.',
      retryAfter: rateResult.retryAfter,
    });
  }

  // ── 2. Input validation & sanitization ──
  const validation = validateProfile(req.body);
  if (!validation.ok) {
    return res.status(400).json({ error: validation.error });
  }
  const profile = validation.data; // safe, validated copy — never use req.body directly below

  // ── 3. Cost guardrails ──
  const costCheck = await checkCostGuardrails();
  if (costCheck.blocked) {
    return res.status(200).json({
      outfits:      localFallback(profile),
      stylingRules: null,
      source:       'fallback',
      notice:       costCheck.reason,
    });
  }

  // ── 4. Catalog health check ──
  const filteredCatalog = filterCatalog(profile);
  const catalogHealth   = checkCatalogHealth(filteredCatalog);
  const catalogWarning  = catalogHealth.healthy ? null : catalogHealth.message;

  // ── 5. AI call ──
  try {
    const prompt = buildPrompt(profile, filteredCatalog);
    const raw    = await callClaude(prompt);

    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch {
      // Log parse error without logging raw AI output (may contain user data)
      console.error('[recommend] JSON parse failed — Claude returned non-JSON');
      throw new Error('Invalid AI response format');
    }

    const { stylingRules, outfits: aiOutfits } = parsed;

    if (!Array.isArray(aiOutfits) || aiOutfits.length === 0) {
      throw new Error('AI returned no outfits');
    }

    const outfits = hydrateOutfits(aiOutfits);

    if (outfits.length === 0) {
      throw new Error('No valid products matched AI selections');
    }

    return res.status(200).json({
      outfits,
      stylingRules,
      source:  'ai',
      warning: catalogWarning,
    });

  } catch (err) {
    console.error('[/api/recommend]', err.message); // message only — never log stack in prod
    return res.status(200).json({
      outfits:      localFallback(profile),
      stylingRules: null,
      source:       'fallback',
      warning:      catalogWarning,
    });
  }
}
