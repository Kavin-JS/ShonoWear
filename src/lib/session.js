/*
  SHONOWEAR — Session persistence
  ──────────────────────────────────────────────────────────────
  Two tiers, on purpose:

  sessionStorage (cleared when the tab closes)
    shonowear_profile  — the FULL profile, including height, weight, body type
                         and skin tone. Needed to generate results; never kept longer.

  localStorage (24 hours, so a returning visitor isn't starting from zero)
    shonowear_last_prefs   — style preferences ONLY: aesthetic, occasion, budget
    shonowear_last_results — the outfit cards shown (catalogue products), source
                             and warning. The AI-written Style DNA is NOT kept,
                             because it is derived from body measurements.

  Height, weight, body type and skin tone are never written to localStorage.
  clearAllData() wipes everything this app stores, including saved outfits, the bag and chat.
*/

import { slimCard, rehydrateCard } from './outfitRules.js';

const SESSION_PROFILE = 'shonowear_profile';
const PREFS_KEY   = 'shonowear_last_prefs';
const RESULTS_KEY = 'shonowear_last_results';
const SAVED_KEY   = 'shonowear_saved_outfits';
const CHAT_KEY    = 'shonowear_chat';
const BAG_KEY     = 'shonowear_bag';
const TTL_MS      = 24 * 60 * 60 * 1000;

const ENUMS = {
  aesthetic: ['streetwear', 'minimal', 'bold', 'classic'],
  occasion:  ['casual', 'datenight', 'work', 'festival'],
  budget:    ['low', 'mid', 'high'],
};

function safeParse(raw) {
  try { return raw ? JSON.parse(raw) : null; } catch { return null; }
}

function readWithExpiry(key) {
  try {
    const parsed = safeParse(localStorage.getItem(key));
    if (!parsed || typeof parsed !== 'object') return null;
    if (!parsed.expiresAt || Date.now() > parsed.expiresAt) {
      localStorage.removeItem(key);
      return null;
    }
    return parsed.data ?? null;
  } catch {
    return null;
  }
}

function writeWithExpiry(key, data) {
  try {
    localStorage.setItem(key, JSON.stringify({ data, expiresAt: Date.now() + TTL_MS }));
  } catch { /* storage full or blocked — ignore */ }
}

/* ── full profile: this tab only ── */
export function saveSessionProfile(profile) {
  try { sessionStorage.setItem(SESSION_PROFILE, JSON.stringify(profile)); } catch { /* ignore */ }
}

export function loadSessionProfile() {
  try {
    const p = safeParse(sessionStorage.getItem(SESSION_PROFILE));
    return p && typeof p === 'object' && !Array.isArray(p) ? p : null;
  } catch {
    return null;
  }
}

/* ── preferences only: 24h ── */
export function saveLastProfile(profile) {
  const prefs = {};
  for (const [k, allowed] of Object.entries(ENUMS)) {
    if (allowed.includes(profile?.[k])) prefs[k] = profile[k];
  }
  writeWithExpiry(PREFS_KEY, prefs);
}

/** Preferences only. Never contains measurements. */
export function loadLastProfile() {
  const p = readWithExpiry(PREFS_KEY);
  if (!p || typeof p !== 'object') return null;
  const out = {};
  for (const [k, allowed] of Object.entries(ENUMS)) {
    if (allowed.includes(p[k])) out[k] = p[k];
  }
  return out;
}

/* ── results: 24h ── */
export function saveLastResults(results) {
  if (!Array.isArray(results?.outfits)) return;
  writeWithExpiry(RESULTS_KEY, {
    source:  results.source || 'rules',
    warning: results.warning || null,
    outfits: results.outfits.map(slimCard), // ids + text only; prices/links are re-read from the catalogue
  });
}

export function loadLastResults() {
  const r = readWithExpiry(RESULTS_KEY);
  if (!r || !Array.isArray(r.outfits)) return null;
  const outfits = r.outfits.map(o => rehydrateCard(o)).filter(Boolean);
  return outfits.length ? { source: r.source, warning: r.warning, outfits } : null;
}

/* ── wipe ── */
export function clearAllData() {
  for (const k of [PREFS_KEY, RESULTS_KEY, SAVED_KEY, BAG_KEY, 'shonowear_last_profile']) {
    try { localStorage.removeItem(k); } catch { /* ignore */ }
  }
  for (const k of [SESSION_PROFILE, CHAT_KEY]) {
    try { sessionStorage.removeItem(k); } catch { /* ignore */ }
  }
}

/** @deprecated use clearAllData */
export const clearSession = clearAllData;
