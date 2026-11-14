/*
  SHONOWEAR — the brand mark in 3D (Three.js, loaded only when needed).
  The "S" is built as two tubes (white top half, red bottom half) from the same path as the flat logo in src/brand/mark.js.
  It turns slowly and leans toward the pointer. Decorative: the flat logo is shown first and stays if 3D is not available
  (reduced motion, data saver, no WebGL, or the file failing to load). It pauses off-screen and when the tab is hidden.
*/
import { useEffect, useRef, useState } from 'react';
import { BRAND, markSvg } from '../brand/mark.js';

export function canRun3D() {
  try {
    if (typeof window === 'undefined') return false;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return false;
    if (navigator.connection?.saveData) return false;
    const c = document.createElement('canvas');
    return Boolean(c.getContext('webgl2') || c.getContext('webgl'));
  } catch { return false; }
}

// Same geometry as the flat mark, in 100×100 units (y down), top half then bottom half.
export const TOP = [['M', 71, 29], ['L', 41, 29], ['Q', 28, 29, 28, 40.5], ['Q', 28, 50, 41, 50]];
export const BOTTOM = [['M', 41, 50], ['L', 59, 50], ['Q', 72, 50, 72, 61], ['Q', 72, 72, 59, 72], ['L', 27, 72]];

export default function Mark3D({ height = 260 }) {
  const host = useRef(null);
  const [live, setLive] = useState(false);

  useEffect(() => {
    if (!canRun3D()) return undefined;
    let disposed = false, cleanup = () => {};
    import('three').then((THREE) => {
      if (disposed || !host.current) return;
      let renderer;
      try { renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'low-power' }); } catch { return; }
      const el = host.current;
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
      el.appendChild(renderer.domElement);
      Object.assign(renderer.domElement.style, { width: '100%', height: '100%', display: 'block' });

      const toCurve = (cmds) => {
        const path = new THREE.CurvePath(); let cur = null;
        const P = (x, y) => new THREE.Vector3(x - 50, 50 - y, 0);
        for (const [c, ...a] of cmds) {
          if (c === 'M') cur = P(a[0], a[1]);
          else if (c === 'L') { const n = P(a[0], a[1]); path.add(new THREE.LineCurve3(cur, n)); cur = n; }
          else { const n = P(a[2], a[3]); path.add(new THREE.QuadraticBezierCurve3(cur, P(a[0], a[1]), n)); cur = n; }
        }
        return path;
      };
      const geos = [toCurve(TOP), toCurve(BOTTOM)].map(c => new THREE.TubeGeometry(c, 80, 5.5, 20, false));
      const mats = [BRAND.light, BRAND.red].map(color => new THREE.MeshStandardMaterial({ color, roughness: 0.38, metalness: 0.25 }));
      const group = new THREE.Group();
      geos.forEach((g, i) => group.add(new THREE.Mesh(g, mats[i])));
      // round the open ends so the tubes look finished
      const capGeo = new THREE.SphereGeometry(5.5, 20, 14);
      [[71, 29, 0], [27, 72, 1]].forEach(([x, y, i]) => { const m = new THREE.Mesh(capGeo, mats[i]); m.position.set(x - 50, 50 - y, 0); group.add(m); });
      const scene = new THREE.Scene(); scene.add(group);
      scene.add(new THREE.AmbientLight(0xffffff, 0.7));
      const key = new THREE.DirectionalLight(0xffffff, 2.2); key.position.set(40, 60, 90); scene.add(key);
      const rim = new THREE.DirectionalLight(0xe8153a, 1.4); rim.position.set(-70, -30, -40); scene.add(rim);
      const camera = new THREE.PerspectiveCamera(32, 1, 1, 500); camera.position.set(0, 0, 175);

      const resize = () => { const w = el.clientWidth || 1, h = el.clientHeight || 1; renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix(); };
      resize(); const ro = new ResizeObserver(resize); ro.observe(el);
      const target = { x: 0, y: 0 };
      const onMove = (e) => { target.x = (e.clientX / window.innerWidth - 0.5) * 0.9; target.y = (e.clientY / window.innerHeight - 0.5) * 0.5; };
      window.addEventListener('pointermove', onMove, { passive: true });

      let raf = 0, visible = true, t0 = performance.now();
      const frame = (now) => {
        raf = 0; if (!visible || document.hidden || disposed) return;
        const t = (now - t0) / 1000;
        group.rotation.y += ((Math.sin(t * 0.5) * 0.55 + target.x) - group.rotation.y) * 0.06;
        group.rotation.x += ((target.y) - group.rotation.x) * 0.06;
        group.position.y = Math.sin(t * 0.9) * 1.6;
        renderer.render(scene, camera);
        raf = requestAnimationFrame(frame);
      };
      const start = () => { if (!raf && visible && !document.hidden) raf = requestAnimationFrame(frame); };
      const io = new IntersectionObserver(([en]) => { visible = en.isIntersecting; if (visible) start(); }, { threshold: 0 }); io.observe(el);
      const onVis = () => start(); document.addEventListener('visibilitychange', onVis);
      setLive(true); start();

      cleanup = () => {
        cancelAnimationFrame(raf); raf = 0; io.disconnect(); ro.disconnect();
        window.removeEventListener('pointermove', onMove); document.removeEventListener('visibilitychange', onVis);
        geos.forEach(g => g.dispose()); capGeo.dispose(); mats.forEach(m => m.dispose());
        renderer.dispose(); renderer.forceContextLoss?.(); renderer.domElement.remove();
      };
      if (disposed) cleanup();
    }).catch(() => { /* chunk failed to load: the flat logo stays */ });
    return () => { disposed = true; cleanup(); setLive(false); };
  }, []);

  return (
    <div style={{ position: 'relative', height, width: '100%', maxWidth: 420, margin: '0 auto' }} aria-hidden="true" data-mark3d={live ? 'live' : 'flat'}>
      {!live && <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center' }} dangerouslySetInnerHTML={{ __html: markSvg({ size: Math.min(height, 200), rounded: 22 }) }} />}
      <div ref={host} style={{ position: 'absolute', inset: 0 }} />
    </div>
  );
}
