import { useMemo } from 'react';
import { catalog } from '../data/catalog.js';
import { useRecent } from '../lib/recent.js';
import Rail from './Rail.jsx';

export default function RecentlyViewed({ exclude, min = 1 }) {
  const ids = useRecent();
  const items = useMemo(() => {
    const m = new Map(catalog.map(p => [p.id, p]));
    return ids.filter(id => id !== exclude).map(id => m.get(id)).filter(Boolean).slice(0, 10);
  }, [ids, exclude]);
  if (items.length < min) return null;
  return <Rail title="Recently viewed" to="/shop" items={items} />;
}
