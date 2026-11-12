import { useEffect, useState } from 'react';

/** { checkoutEnabled, testMode } from /api/config; loading → null. */
export function useCheckoutConfig() {
  const [cfg, setCfg] = useState(null);
  useEffect(() => {
    const c = new AbortController();
    fetch('/api/config', { signal: c.signal })
      .then(r => (r.ok ? r.json() : Promise.reject()))
      .then(setCfg)
      .catch(e => { if (e?.name !== 'AbortError') setCfg({ checkoutEnabled: false, testMode: false }); });
    return () => c.abort();
  }, []);
  return cfg;
}
