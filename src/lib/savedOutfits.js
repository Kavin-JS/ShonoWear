/*
  SAVED OUTFITS — localStorage utility
  Phase 2 upgrade: replace with Firestore reads/writes.
  Data shape stays the same — only the storage layer changes.
*/

const KEY = 'shonowear_saved_outfits';

export function getSavedOutfits() {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function saveOutfit(product) {
  const current = getSavedOutfits();
  if (current.find(p => p.id === product.id)) return current;
  const updated = [product, ...current];
  localStorage.setItem(KEY, JSON.stringify(updated));
  return updated;
}

export function unsaveOutfit(productId) {
  const updated = getSavedOutfits().filter(p => p.id !== productId);
  localStorage.setItem(KEY, JSON.stringify(updated));
  return updated;
}

export function isOutfitSaved(productId) {
  return getSavedOutfits().some(p => p.id === productId);
}
