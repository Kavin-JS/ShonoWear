/*
  SHONOWEAR — original hero background (Three.js, MIT licensed `three` package).
  A slow, fabric-like ripple drawn by a fragment shader on a full-screen plane, tinted in the brand
  red, that leans gently toward the pointer. Decorative only (aria-hidden).

  It is skipped entirely on small screens, with "reduce motion", without WebGL, or in data-saver
  mode, and it pauses when scrolled out of view or when the tab is hidden. The page looks fine
  without it: the CSS glow behind it stays.
*/
import { useEffect, useRef } from 'react';

const VERT = `varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;
const FRAG = `
precision mediump float;
varying vec2 vUv;
uniform float uTime; uniform vec2 uMouse; uniform float uAspect;
float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p){
  vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f);
  return mix(mix(hash(i), hash(i+vec2(1,0)), f.x), mix(hash(i+vec2(0,1)), hash(i+vec2(1,1)), f.x), f.y);
}
float fbm(vec2 p){ float v = 0.0, a = 0.5; for(int i=0;i<4;i++){ v += a*noise(p); p *= 2.02; a *= 0.5; } return v; }
void main(){
  vec2 uv = vUv; uv.x *= uAspect;
  vec2 m = (uMouse - 0.5) * 0.35;
  float t = uTime * 0.045;
  vec2 q = vec2(fbm(uv*1.4 + t + m), fbm(uv*1.4 - t + 3.1 - m));
  float f = fbm(uv*1.8 + 2.4*q + t);
  // fold lines like draped cloth
  float fold = smoothstep(0.42, 0.5, abs(fract(f*5.0) - 0.5) * 2.0);
  vec3 base = vec3(0.027, 0.027, 0.059);               // --bg
  vec3 red  = vec3(0.91, 0.082, 0.227);                // --red
  vec3 col = mix(base, red, smoothstep(0.35, 0.95, f) * 0.34);
  col += red * (1.0 - fold) * 0.05 * smoothstep(0.3, 0.8, f);
  float vig = smoothstep(1.15, 0.25, length(vUv - 0.5) * 1.35);
  gl_FragColor = vec4(col * (0.55 + 0.45 * vig), 1.0);
}`;

export function canRunHero() {
  try {
    if (typeof window === 'undefined') return false;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return false;
    if (window.matchMedia('(max-width: 820px)').matches) return false;
    if (navigator.connection?.saveData) return false;
    const c = document.createElement('canvas');
    return Boolean(c.getContext('webgl2') || c.getContext('webgl'));
  } catch { return false; }
}

export default function Hero3D() {
  const host = useRef(null);

  useEffect(() => {
    if (!canRunHero()) return undefined;
    let disposed = false, cleanup = () => {};

    import('three').then((THREE) => {
      if (disposed || !host.current) return;
      let renderer;
      try { renderer = new THREE.WebGLRenderer({ antialias: false, alpha: false, powerPreference: 'low-power' }); }
      catch { return; }                                  // WebGL failed: keep the CSS background
      const el = host.current;
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
      el.appendChild(renderer.domElement);
      Object.assign(renderer.domElement.style, { width: '100%', height: '100%', display: 'block' });

      const scene = new THREE.Scene();
      const camera = new THREE.Camera();
      const uniforms = { uTime: { value: 0 }, uMouse: { value: new THREE.Vector2(0.5, 0.5) }, uAspect: { value: 1 } };
      const material = new THREE.ShaderMaterial({ uniforms, vertexShader: VERT, fragmentShader: FRAG });
      const geometry = new THREE.PlaneGeometry(2, 2);
      scene.add(new THREE.Mesh(geometry, material));

      const resize = () => {
        const w = el.clientWidth || 1, h = el.clientHeight || 1;
        renderer.setSize(w, h, false);
        uniforms.uAspect.value = w / h;
      };
      resize();
      const ro = new ResizeObserver(resize); ro.observe(el);

      const target = new THREE.Vector2(0.5, 0.5);
      const onMove = (e) => { target.set(e.clientX / window.innerWidth, 1 - e.clientY / window.innerHeight); };
      window.addEventListener('pointermove', onMove, { passive: true });

      let raf = 0, visible = true, last = performance.now();
      const frame = (now) => {
        raf = 0;
        if (!visible || document.hidden || disposed) return;
        uniforms.uTime.value += (now - last) / 1000; last = now;
        uniforms.uMouse.value.lerp(target, 0.04);
        renderer.render(scene, camera);
        raf = requestAnimationFrame(frame);
      };
      const start = () => { if (!raf && visible && !document.hidden) { last = performance.now(); raf = requestAnimationFrame(frame); } };
      const io = new IntersectionObserver(([en]) => { visible = en.isIntersecting; if (visible) start(); }, { threshold: 0 });
      io.observe(el);
      const onVis = () => start();
      document.addEventListener('visibilitychange', onVis);
      el.dataset.ready = '1';
      start();

      cleanup = () => {
        cancelAnimationFrame(raf); raf = 0;
        io.disconnect(); ro.disconnect();
        window.removeEventListener('pointermove', onMove);
        document.removeEventListener('visibilitychange', onVis);
        geometry.dispose(); material.dispose(); renderer.dispose();
        renderer.forceContextLoss?.();
        renderer.domElement.remove();
      };
      if (disposed) cleanup();
    }).catch(() => { /* chunk failed to load: CSS background stays */ });

    return () => { disposed = true; cleanup(); };
  }, []);

  return <div ref={host} aria-hidden="true" data-hero3d style={{ position: 'absolute', inset: 0, pointerEvents: 'none', opacity: 0.9 }} />;
}
