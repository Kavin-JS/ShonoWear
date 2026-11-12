/*
  SHONOWEAR RECOMMENDATION ENGINE — no-API version
  Everything runs in the browser using the rules in outfitRules.js.
  No network calls, no AI model.
*/

import { completeToFour, budgetWarning } from './outfitRules.js';

export async function getRecommendationsAsync(profile) {
  const composed = completeToFour([], profile);
  const warnings = [budgetWarning(profile, composed)];
  if (profile.gender !== 'male') {
    warnings.push('Our catalogue is menswear-focused for now, so these picks may not suit every style preference.');
  }
  return {
    outfits: composed.outfits,
    stylingRules: null,
    source: 'rules',
    warning: warnings.filter(Boolean).join(' ') || null,
    notice: null,
  };
}
