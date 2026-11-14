import { useRef } from 'react';

const fine = () => { try { return window.matchMedia('(hover: hover) and (pointer: fine)').matches && !window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch { return false; } };

/** A gentle 3D lean toward the pointer (mouse only; touch and reduced-motion users get a plain card). */
export default function Tilt({ children, max = 6, style, ...rest }) {
  const ref = useRef(null);
  const move = (e) => {
    const el = ref.current; if (!el || !fine()) return;
    const r = el.getBoundingClientRect();
    const px = (e.clientX - r.left) / r.width - 0.5, py = (e.clientY - r.top) / r.height - 0.5;
    el.dataset.tilting = '1';
    el.style.transform = `perspective(800px) rotateX(${(-py * max).toFixed(2)}deg) rotateY(${(px * max).toFixed(2)}deg) translateZ(0)`;
  };
  const leave = () => { const el = ref.current; if (!el) return; delete el.dataset.tilting; el.style.transform = ''; };
  return <div ref={ref} className="tilt" onPointerMove={move} onPointerLeave={leave} style={style} {...rest}>{children}</div>;
}
