import { useState } from 'react';
import { Link } from 'react-router-dom';

const KEY = 'sw_notice_v1';
/** Which optional categories the visitor allowed. Today we run none that need consent (the counters are anonymous and cookieless);
 *  if you ever add an ad pixel or a third-party tracker, load it only when `hasConsent('marketing')` is true. */
export function hasConsent(category) {
  try { return JSON.parse(localStorage.getItem(KEY) || '{}')[category] === true; } catch { return false; }
}
function seen() { try { return localStorage.getItem(KEY) !== null; } catch { return true; } }
function save(v) { try { localStorage.setItem(KEY, JSON.stringify(v)); } catch { /* ignore */ } }

/** A short, honest notice shown once. It says what we use; it does not pretend to need consent for things we do not run. */
export default function PrivacyNotice() {
  const [open, setOpen] = useState(() => !seen());
  if (!open) return null;
  const ok = () => { save({ marketing: false, noticed: true }); setOpen(false); };
  return (
    <div role="region" aria-label="Privacy notice" style={{ position: 'fixed', left: 12, right: 12, bottom: 76, zIndex: 60, maxWidth: 520, margin: '0 auto', background: 'var(--bg2, #14141c)', border: '1px solid var(--border, #2a2a35)', borderRadius: 12, padding: '12px 14px', fontSize: 13, display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
      <span style={{ flex: '1 1 220px' }}>We set a cookie only if you sign in, and count visits anonymously. No ad trackers. <Link to="/privacy" style={{ color: 'var(--red-text)' }}>Details</Link></span>
      <button type="button" className="btn" onClick={ok} style={{ minHeight: 40 }}>Got it</button>
    </div>
  );
}
