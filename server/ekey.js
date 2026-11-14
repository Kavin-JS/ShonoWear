import { hash } from './guard.js';
export const normEmail = (e) => String(e || '').trim().toLowerCase();
/** Stable hashed key for an email address, so nothing in Redis keys exposes it. */
export const eKey = (email) => hash(normEmail(email), 'acct').slice(0, 32);
