/* SHONOWEAR — customer account client. The session is an HttpOnly cookie, so nothing secret is readable here. */
import { useEffect, useState, useCallback } from 'react';

export async function acctGet(params) {
  const r = await fetch('/api/account?' + new URLSearchParams(params), { credentials: 'same-origin' });
  return { ok: r.ok, status: r.status, data: await r.json().catch(() => ({})) };
}
export async function acctPost(body) {
  const r = await fetch('/api/account', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  return { ok: r.ok, status: r.status, data: await r.json().catch(() => ({})) };
}

let cached; const listeners = new Set();
const set = (v) => { cached = v; listeners.forEach(f => f(v)); };
/** { email|null, loading, refresh } — email is null when signed out. */
export function useAccount() {
  const [v, setV] = useState(cached);
  useEffect(() => { listeners.add(setV); return () => listeners.delete(setV); }, []);
  const refresh = useCallback(async () => {
    try { const r = await acctGet({ action: 'me' }); set({ email: r.data.email || null }); } catch { set({ email: null }); }
  }, []);
  useEffect(() => { if (cached === undefined) refresh(); }, [refresh]);
  return { email: v?.email ?? null, loading: v === undefined, refresh };
}
