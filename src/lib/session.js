/*
  SHONOWEAR — Session Persistence
  ──────────────────────────────────────────────────────────────
  Saves the last profile and last results to localStorage so
  users can refresh or come back and see their previous outfits
  instead of hitting a blank page.

  Keys:
    shonowear_last_profile  — the last submitted userProfile
    shonowear_last_results  — the last AI response { outfits, stylingRules, source }

  Both expire after 24 hours to keep the experience fresh.
*/

const PROFILE_KEY = 'shonowear_last_profile';
const RESULTS_KEY = 'shonowear_last_results';
const TTL_MS      = 24 * 60 * 60 * 1000; // 24 hours

function withExpiry(data) {
  return { data, expiresAt: Date.now() + TTL_MS };
}

function readWithExpiry(key) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const { data, expiresAt } = JSON.parse(raw);
    if (Date.now() > expiresAt) {
      localStorage.removeItem(key);
      return null;
    }
    return data;
  } catch {
    return null;
  }
}

export function saveLastProfile(profile) {
  try {
    localStorage.setItem(PROFILE_KEY, JSON.stringify(withExpiry(profile)));
  } catch { /* storage full — ignore */ }
}

export function loadLastProfile() {
  return readWithExpiry(PROFILE_KEY);
}

export function saveLastResults(results) {
  try {
    // Don't store images/large fields to keep localStorage lean
    const lean = {
      ...results,
      outfits: results.outfits.map(o => ({ ...o, image: undefined })),
    };
    localStorage.setItem(RESULTS_KEY, JSON.stringify(withExpiry(lean)));
  } catch { /* storage full — ignore */ }
}

export function loadLastResults() {
  return readWithExpiry(RESULTS_KEY);
}

export function clearSession() {
  localStorage.removeItem(PROFILE_KEY);
  localStorage.removeItem(RESULTS_KEY);
  sessionStorage.removeItem('shonowear_profile');
}
