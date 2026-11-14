import { useEffect, useRef } from 'react';

const reduced = () => { try { return window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch { return true; } };

/**
 * Fades and lifts its content in the first time it scrolls into view. Content below the fold starts hidden
 * only AFTER the script runs, so without JavaScript, with reduced motion, or without IntersectionObserver
 * nothing is ever hidden. `delay` (seconds) staggers siblings.
 */
export default function Reveal({ as: Tag = 'div', delay = 0, children, style, ...rest }) {
  const ref = useRef(null);
  useEffect(() => {
    const el = ref.current;
    if (!el || reduced() || typeof IntersectionObserver !== 'function') return undefined;
    const r = el.getBoundingClientRect();
    if (r.top < window.innerHeight * 0.92) return undefined;          // already on screen: leave it alone
    el.setAttribute('data-reveal', 'pending');
    const io = new IntersectionObserver(([en]) => { if (en.isIntersecting) { el.setAttribute('data-reveal', 'in'); io.disconnect(); } }, { rootMargin: '0px 0px -8% 0px' });
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return <Tag ref={ref} style={{ ...style, '--reveal-delay': `${delay}s` }} {...rest}>{children}</Tag>;
}
