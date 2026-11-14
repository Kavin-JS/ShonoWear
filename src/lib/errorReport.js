/** Sends browser errors (a short cleaned message and the page path, nothing else) to our own server, so you see them in /admin. */
const IS_DEV = typeof window !== 'undefined' && window.location.hostname === 'localhost';
let sent = 0;

export function reportError(message) {
  try {
    if (IS_DEV || sent >= 5 || typeof fetch !== 'function') return;     // at most 5 per page load
    const m = String(message || '').slice(0, 300);
    if (!m || /ResizeObserver loop|Script error\.?$|chrome-extension:|moz-extension:/.test(m)) return;   // noise we cannot fix
    sent++;
    fetch('/api/config', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ e: 'client_error', m, r: window.location.pathname }), keepalive: true }).catch(() => {});
  } catch { /* reporting must never cause errors */ }
}

export function installErrorReporting() {
  if (typeof window === 'undefined') return;
  window.addEventListener('error', (e) => reportError(e.message || e.error?.message));
  window.addEventListener('unhandledrejection', (e) => reportError(`Unhandled: ${e.reason?.message || e.reason}`));
}
