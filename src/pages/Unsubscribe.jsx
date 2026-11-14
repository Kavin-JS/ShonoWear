import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { STORE } from '../data/storeConfig.js';
import { acctPost } from '../lib/account.js';

export default function Unsubscribe() {
  const [sp] = useSearchParams();
  const email = sp.get('e') || '', token = sp.get('t') || '';
  const [state, setState] = useState(email && token ? 'ready' : 'bad'); const [msg, setMsg] = useState('');
  useEffect(() => { document.title = `Unsubscribe · ${STORE.name}`; }, []);
  async function go() {
    setState('busy');
    const r = await acctPost({ action: 'unsubscribe', email, token }).catch(() => null);
    if (r?.ok) setState('done'); else { setState('bad'); setMsg(r?.data?.error || ''); }
  }
  return (
    <main id="main" className="page">
      <div className="container" style={{ maxWidth: 520 }}>
        <h1 style={{ fontFamily: 'var(--font-body)', fontWeight: 700, fontSize: 24, marginBottom: 12 }}>Unsubscribe</h1>
        {state === 'ready' && <><p style={{ color: 'var(--muted)', marginBottom: 14 }}>Stop marketing emails to {email}? Order and shipping emails will still reach you.</p><button className="btn-primary" onClick={go}>Unsubscribe</button></>}
        {state === 'busy' && <p role="status">One moment…</p>}
        {state === 'done' && <p role="status">Done. You will not get marketing emails from us.</p>}
        {state === 'bad' && <p role="alert">{msg || `This link is not complete. Write to ${STORE.supportEmail} and we will remove you.`}</p>}
      </div>
    </main>
  );
}
