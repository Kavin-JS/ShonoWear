import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { TOAST_EVENT } from '../lib/toast.js';

export default function Toaster() {
  const [toast, setToast] = useState(null);

  useEffect(() => {
    let timer;
    const on = (e) => {
      setToast(e.detail);
      clearTimeout(timer);
      timer = setTimeout(() => setToast(null), 4500);
    };
    window.addEventListener(TOAST_EVENT, on);
    return () => { window.removeEventListener(TOAST_EVENT, on); clearTimeout(timer); };
  }, []);

  if (!toast) return null;
  return (
    <div role="status" aria-live="polite" style={{
      position: 'fixed', left: '50%', bottom: 'calc(24px + var(--tab-offset, 0px))', transform: 'translateX(-50%)', zIndex: 300,
      background: 'var(--surface)', border: '1px solid var(--border2)', borderRadius: '999px',
      padding: '10px 18px', fontSize: '13px', display: 'flex', gap: '14px', alignItems: 'center',
      boxShadow: '0 8px 30px rgba(0,0,0,0.5)', maxWidth: 'calc(100vw - 32px)',
    }}>
      <span>{toast.message}</span>
      {toast.href && <Link to={toast.href} onClick={() => setToast(null)} style={{ color: 'var(--red)', whiteSpace: 'nowrap' }}>{toast.label || 'View'}</Link>}
    </div>
  );
}
