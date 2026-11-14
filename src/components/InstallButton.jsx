import { useEffect, useState } from 'react';
import { useT } from '../i18n/index.jsx';

const standalone = () => { try { return window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true; } catch { return false; } };
const isIos = () => /iphone|ipad|ipod/i.test(navigator.userAgent || '');

/** "Install the app" — uses the browser's own prompt where it exists; on iPhone shows the Add to Home Screen steps. Renders nothing if already installed. */
export default function InstallButton() {
  const t = useT();
  const [evt, setEvt] = useState(null);
  const [hint, setHint] = useState(false);
  useEffect(() => {
    const on = (e) => { e.preventDefault(); setEvt(e); };
    const done = () => setEvt(null);
    window.addEventListener('beforeinstallprompt', on); window.addEventListener('appinstalled', done);
    return () => { window.removeEventListener('beforeinstallprompt', on); window.removeEventListener('appinstalled', done); };
  }, []);
  if (standalone()) return null;
  if (evt) return <button type="button" className="btn" style={{ minHeight: 40, marginTop: 10 }} onClick={async () => { evt.prompt(); try { await evt.userChoice; } catch { /* ignore */ } setEvt(null); }}>{t('Install the app')}</button>;
  if (isIos()) return <div style={{ marginTop: 10, fontSize: 12, color: 'var(--muted)' }}>{hint ? 'Tap the Share icon, then "Add to Home Screen".' : <button type="button" className="btn" style={{ minHeight: 40 }} onClick={() => setHint(true)}>{t('Install the app')}</button>}</div>;
  return null;
}
