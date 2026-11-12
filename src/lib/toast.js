/* Tiny toast bus: showToast('Added', { href: '/bag', label: 'View bag' }) */
const EVENT = 'shonowear-toast';
export function showToast(message, { href, label } = {}) {
  window.dispatchEvent(new CustomEvent(EVENT, { detail: { message, href, label, id: Date.now() + Math.random() } }));
}
export const TOAST_EVENT = EVENT;
