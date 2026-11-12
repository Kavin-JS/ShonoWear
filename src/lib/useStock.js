import { useEffect, useState } from 'react';

/** Live availability for own-stock products: { id: { size: unitsLeft } }. null while loading or if unavailable. */
export function useStock(ids) {
  const key = [...new Set(ids)].sort().join(',');
  const [stock, setStock] = useState(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!key) { setStock({}); return undefined; }
    const c = new AbortController();
    setFailed(false);
    fetch(`/api/stock?ids=${encodeURIComponent(key)}`, { signal: c.signal })
      .then(r => (r.ok ? r.json() : Promise.reject(new Error('stock'))))
      .then(d => setStock(d.stock || {}))
      .catch(e => { if (e.name !== 'AbortError') { setFailed(true); setStock(null); } });
    return () => c.abort();
  }, [key]);

  return { stock, failed };
}
