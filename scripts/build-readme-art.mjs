// Generates the animated README panels (light + dark) into docs/assets/. No dependencies.
// Usage: node scripts/build-readme-art.mjs
import { mkdirSync, writeFileSync } from 'node:fs';

const THEMES = {
  dark:  { bg: '#161b22', border: '#30363d', text: '#e6edf3', sub: '#9da7b3', muted: '#6e7681', line: '#484f58', accent: '#ff4d6d' },
  light: { bg: '#ffffff', border: '#d0d7de', text: '#1f2328', sub: '#59636e', muted: '#818b98', line: '#afb8c1', accent: '#d6103a' },
};
const SANS = "-apple-system, BlinkMacSystemFont, 'Segoe UI', 'Noto Sans', Helvetica, Arial, sans-serif";
const MONO = "ui-monospace, SFMono-Regular, 'SF Mono', Menlo, Consolas, 'Liberation Mono', monospace";
const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const svg = (w, h, label, body, clip = false) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" role="img" aria-label="${esc(label)}">
${clip ? `<defs><clipPath id="c"><rect width="${w}" height="${h}" rx="12"/></clipPath></defs>\n<g clip-path="url(#c)">` : ''}
${body}
${clip ? '</g>' : ''}</svg>\n`;
const fadeIn = (delay, dur = 0.8, inner) => `<g><animate attributeName="opacity" values="0;0;1" keyTimes="0;${delay ? (delay / (delay + dur)).toFixed(4) : 0};1" dur="${(delay + dur).toFixed(2)}s" fill="freeze"/><animateTransform attributeName="transform" type="translate" values="0 8;0 8;0 0" keyTimes="0;${delay ? (delay / (delay + dur)).toFixed(4) : 0};1" dur="${(delay + dur).toFixed(2)}s" fill="freeze"/>${inner}</g>`;
const text = (x, y, s, o = {}) => `<text x="${x}" y="${y}"${o.anchor ? ` text-anchor="${o.anchor}"` : ''} font-family="${o.mono ? MONO : SANS}" font-size="${o.size || 14}"${o.weight ? ` font-weight="${o.weight}"` : ''}${o.ls ? ` letter-spacing="${o.ls}"` : ''} fill="${o.fill}">${s}</text>`;

// ---------- 3D wireframe T-shirt (rotating), keyframes precomputed ----------
function shirtFrames(t, cx, cy, scale, frames = 72) {
  const poly = [[-14, -9], [-6, -13], [-3, -12.2], [0, -10.5], [3, -12.2], [6, -13], [14, -9], [11, -2], [7, -4], [7, 13], [-7, 13], [-7, -4], [-11, -2]];
  const depth = 5.5; const edges = [];
  const n = poly.length; const pts = [];
  for (const z of [-depth, depth]) for (const [x, y] of poly) pts.push([x, y, z]);
  for (let i = 0; i < n; i++) { edges.push([i, (i + 1) % n], [n + i, n + (i + 1) % n], [i, n + i]); }
  const dFor = k => {
    const a = (k / frames) * Math.PI * 2, ca = Math.cos(a), sa = Math.sin(a), tilt = -0.28, ct = Math.cos(tilt), st = Math.sin(tilt);
    const P = pts.map(([x, y, z]) => { const X = x * ca + z * sa, Z0 = -x * sa + z * ca; const Y = y * ct - Z0 * st, Z = y * st + Z0 * ct; const f = 60 / (60 + Z); return [cx + X * scale * f, cy + Y * scale * f]; });
    return edges.map(([i, j]) => `M${P[i][0].toFixed(1)} ${P[i][1].toFixed(1)}L${P[j][0].toFixed(1)} ${P[j][1].toFixed(1)}`).join('');
  };
  const vals = []; for (let k = 0; k <= frames; k++) vals.push(dFor(k % frames));
  return `<path d="${vals[0]}" fill="none" stroke="${t.accent}" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" opacity="0.9"><animate attributeName="d" values="${vals.join(';')}" dur="14s" repeatCount="indefinite"/></path>`;
}

const hero = t => svg(1000, 280, 'Shonowear: an online fashion shop for India with checkout, live stock and a built-in style assistant', `
<rect width="1000" height="280" fill="${t.bg}"/>
${fadeIn(0, 0.8, text(50, 150, 'Shonowear', { size: 84, weight: 700, fill: t.text }))}
${fadeIn(0.3, 0.8, text(52, 196, 'Online fashion shop for India', { size: 28, fill: t.sub }))}
${fadeIn(0.6, 0.8, text(52, 236, 'Razorpay checkout · Live stock · Size finder · Style assistant', { size: 16, fill: t.muted }))}
<circle cx="800" cy="140" r="104" fill="none" stroke="${t.border}" stroke-dasharray="3 7"/>
${shirtFrames(t, 800, 140, 7.6)}
`, true);

const heading = (label, w = 1000) => t => {
  const x0 = Math.round(label.length * 14.2 + 26);
  return svg(w, 56, label, `
${fadeIn(0, 0.6, text(2, 36, esc(label), { size: 24, weight: 600, fill: t.text }))}
<line x1="${x0}" y1="28" x2="${w - 4}" y2="28" stroke="${t.border}" stroke-width="1.5" stroke-dasharray="${w - 4 - x0}" stroke-dashoffset="0"><animate attributeName="stroke-dashoffset" values="${w - 4 - x0};${w - 4 - x0};0" keyTimes="0;0.15;1" dur="1.3s" fill="freeze"/></line>
<circle cx="${x0}" cy="28" r="3" fill="${t.accent}" opacity="0"><animate attributeName="cx" values="${x0};${w - 4}" dur="6s" repeatCount="indefinite"/><animate attributeName="opacity" values="0;1;1;0" keyTimes="0;0.1;0.85;1" dur="6s" repeatCount="indefinite"/></circle>`);
};

const link = (kind, value) => t => svg(240, 62, `${kind}: ${value}`, `
<rect x="0.5" y="0.5" width="239" height="61" rx="10" fill="${t.bg}" stroke="${t.border}"/>
${text(18, 25, esc(kind.toUpperCase()), { mono: 1, size: 10.5, ls: 1.6, fill: t.muted })}
${text(18, 46, esc(value), { size: 14, weight: 500, fill: t.text })}
<g transform="translate(210,22)"><path d="M0 12 L12 0 M2 0 H12 V10" fill="none" stroke="${t.accent}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><animateTransform attributeName="transform" type="translate" values="0 0;2.5 -2.5;0 0" dur="3s" repeatCount="indefinite"/></path></g>`);

const intro = lines => t => {
  const out = lines.map((ln, i) => `<g transform="translate(2,${34 + i * 34})">${fadeIn(i * 0.25, 0.8, `<text font-family="${SANS}" font-size="21" fill="${t.sub}">${ln.replace(/\*\*(.+?)\*\*/g, `<tspan fill="${t.text}" font-weight="600">$1</tspan>`)}</text>`)}</g>`).join('');
  return svg(1000, 34 + lines.length * 34 + 8, lines.join(' ').replace(/\*\*/g, ''), out);
};

// ---------- feature cards: 4-step diagram that lights up in sequence ----------
function card({ title, desc, steps, tags, w = 490, h = 300 }) {
  return t => {
    const n = steps.length, gap = 14, bw = Math.floor((w - 68 - gap * (n - 1)) / n);
    let b = `<rect width="${w}" height="${h}" fill="${t.bg}"/>`;
    steps.forEach((s, i) => {
      const x = 34 + i * (bw + gap);
      b += `<rect x="${x}" y="38" width="${bw}" height="66" rx="8" stroke="${t.line}" stroke-width="1.4" fill="none"/>
<rect x="${x}" y="38" width="${bw}" height="66" rx="8" stroke="${t.accent}" stroke-width="1.6" fill="none" opacity="0"><animate attributeName="opacity" values="0;0.9;0;0" keyTimes="0;0.12;0.3;1" dur="${n}s" begin="${(i * 0.7).toFixed(1)}s" repeatCount="indefinite"/></rect>
${text(x + bw / 2, 76, esc(s.icon), { mono: 1, size: 13, anchor: 'middle', fill: t.accent })}
${text(x + bw / 2, 124, esc(s.label), { mono: 1, size: 10.5, anchor: 'middle', fill: t.muted })}`;
    });
    b += `<line x1="26" y1="146" x2="${w - 26}" y2="146" stroke="${t.border}"/>
${text(26, 186, esc(title), { size: 20, weight: 600, fill: t.text })}`;
    desc.forEach((d, i) => { b += text(26, 214 + i * 22, esc(d), { size: 14.5, fill: t.sub }); });
    b += text(26, h - 24, esc(tags), { mono: 1, size: 12, fill: t.muted });
    return svg(w, h, `${title}: ${desc.join(' ')}`, b, true);
  };
}

const mini = (icon, title, sub) => t => svg(326, 86, `${title}: ${sub}`, `
<rect x="0.5" y="0.5" width="325" height="85" rx="12" fill="${t.bg}" stroke="${t.border}"/>
<g transform="translate(44,43)">${icon(t)}</g>
${text(88, 38, esc(title), { size: 16, weight: 600, fill: t.text })}
${text(88, 59, esc(sub), { size: 12.5, fill: t.sub })}`);
const ic = (d, pulse = true) => t => `<path d="${d}" fill="none" stroke="${t.line}" stroke-width="1.6" stroke-linejoin="round" stroke-linecap="round"/><circle r="2.4" fill="${t.accent}">${pulse ? '<animate attributeName="opacity" values="1;0.2;1" dur="3s" repeatCount="indefinite"/>' : ''}</circle>`;

// ---------- stat tiles ----------
const stats = items => t => {
  const w = 1000, h = 140, cw = w / items.length;
  let b = `<rect width="${w}" height="${h}" fill="${t.bg}"/>`;
  items.forEach((it, i) => {
    const x = 32 + i * cw;
    if (i) b += `<line x1="${i * cw}" y1="26" x2="${i * cw}" y2="${h - 26}" stroke="${t.border}"/>`;
    b += `<g transform="translate(${x},0)"><animate attributeName="opacity" values="0;0;1" keyTimes="0;${(0.15 + i * 0.04).toFixed(2)};1" dur="${(0.65 + i * 0.12).toFixed(2)}s" fill="freeze"/>${text(0, 66, esc(it[0]), { size: 38, weight: 600, fill: t.text })}${text(0, 92, esc(it[1]), { size: 13, fill: t.sub })}${text(0, 112, esc(it[2]), { mono: 1, size: 10.5, ls: 1.2, fill: t.muted })}</g>`;
  });
  return svg(w, h, 'At a glance: ' + items.map(i => `${i[0]} ${i[1]}`).join(', '), b, true);
};

// ---------- stack (columns with progress bars + chips) ----------
const stack = t => {
  const cols = [['FRONTEND', 32, ['React 18', 'Vite 5', 'React Router 6', 'Three.js (3D hero)']], ['BACKEND', 350, ['Vercel serverless', 'Upstash Redis', 'Razorpay', 'Resend email']], ['QUALITY', 700, ['Vitest', 'Playwright', 'Catalogue + launch checks']]];
  let b = '';
  cols.forEach(([h, x, items], ci) => {
    const w = ci === 1 ? 330 : ci === 2 ? 268 : 290;
    b += text(x, 30, h, { mono: 1, size: 11, ls: 1.6, fill: t.muted });
    b += `<line x1="${x}" y1="42" x2="${x + w}" y2="42" stroke="${t.border}" stroke-width="1.5"/><line x1="${x}" y1="42" x2="${x + w * 0.45}" y2="42" stroke="${t.accent}" stroke-width="1.5"><animate attributeName="x2" values="${x};${x + w * 0.45}" dur="1.2s" fill="freeze"/></line>`;
    items.forEach((it, i) => { b += fadeIn(0.2 + i * 0.15, 0.6, `<circle cx="${x + 4}" cy="${74 + i * 34}" r="3" fill="${t.accent}"/>${text(x + 18, 80 + i * 34, esc(it), { size: 19, weight: 500, fill: t.text })}`); });
  });
  b += text(32, 226, 'AREAS', { mono: 1, size: 11, ls: 1.6, fill: t.muted }) + `<line x1="32" y1="236" x2="968" y2="236" stroke="${t.border}" stroke-width="1.5"/>`;
  let x = 32; ['Payments and webhooks', 'Stock and overselling', 'Server-side pricing', 'Mobile-first UI', 'Accessibility', 'SEO and sitemap'].forEach((c, i) => {
    const wd = c.length * 6.6 + 26; b += fadeIn(0.3 + i * 0.12, 0.6, `<rect x="${x}" y="250" width="${wd}" height="30" rx="15" fill="none" stroke="${t.line}"/>${text(x + wd / 2, 270, esc(c), { size: 12.5, anchor: 'middle', fill: t.sub })}`); x += wd + 8;
  });
  return svg(1000, 296, 'Stack: React 18, Vite 5, React Router 6, Three.js; Vercel serverless, Upstash Redis, Razorpay, Resend; Vitest and Playwright. Areas: payments and webhooks, stock and overselling, server-side pricing, mobile-first UI, accessibility basics, SEO and sitemap.', b);
};

// ---------- roadmap timeline ----------
const roadmap = t => {
  const rows = [['A', 'Shopping experience', 'Gallery, size guide, colours, quick view, filters, collections, bundles, pincode, waitlist', true],
    ['B', 'Selling tools', 'Coupons, COD, abandoned-bag emails, saved addresses, gift cards, referrals, pre-orders, flash sales', false],
    ['C', 'Customers', 'Accounts, reviews, Q&A, returns and exchanges, WhatsApp and email updates, live courier tracking', false],
    ['D', 'Back office', 'Dashboard, edit products in the browser, refunds, GST invoices, CSV import, customer list', false],
    ['E–H', 'Content, AI, polish, reliability', 'Blog, SEO pre-render, PWA, Hindi, real AI chat, brand and 3D work, monitoring, backups', false]];
  let b = `<line x1="46" y1="24" x2="46" y2="${24 + (rows.length - 1) * 74}" stroke="${t.border}" stroke-width="2"/>`;
  rows.forEach(([k, a, d, done], i) => {
    const y = 24 + i * 74;
    b += fadeIn(i * 0.25, 0.7, `<circle cx="46" cy="${y}" r="6" fill="${done ? t.accent : t.bg}" stroke="${done ? t.accent : t.line}" stroke-width="2"/>${text(76, y - 2, `<tspan fill="${t.muted}" font-family="${MONO}" font-size="12" letter-spacing="1.2">${esc(k)}</tspan>  ${esc(a)}`, { size: 18, weight: 600, fill: t.text })}${text(76, y + 24, esc(d), { size: 14, fill: t.sub })}${done ? text(960, y - 2, 'SHIPPED', { mono: 1, size: 11, ls: 1.4, anchor: 'end', fill: t.accent }) : text(960, y - 2, 'PLANNED', { mono: 1, size: 11, ls: 1.4, anchor: 'end', fill: t.muted })}`);
  });
  return svg(1000, 24 + (rows.length - 1) * 74 + 44, 'Roadmap. A, shopping experience: shipped. B, selling tools; C, customers; D, back office; E to H, content, AI, polish and reliability: planned.', b);
};

const cards = {
  'f-checkout': card({ title: 'Checkout that cannot oversell', desc: ['Price is computed on the server, stock is held for', '15 minutes, and a signed webhook confirms payment.'], steps: [{ icon: 'bag', label: 'BAG' }, { icon: 'hold', label: 'HOLD' }, { icon: 'pay', label: 'RAZORPAY' }, { icon: 'paid', label: 'CONFIRMED' }], tags: 'Razorpay · Redis · Idempotent' }),
  'f-size': card({ title: 'Size guide and size finder', desc: ['Height and weight or a chest measurement', 'suggests a size, checked against your real stock.'], steps: [{ icon: '175 cm', label: 'HEIGHT' }, { icon: '70 kg', label: 'WEIGHT' }, { icon: 'chart', label: 'CHART' }, { icon: 'M', label: 'SUGGESTED' }], tags: 'Tops · Bottoms · Footwear' }),
  'f-waitlist': card({ title: 'Waitlist and low-stock alerts', desc: ['Customers join a sold-out size; you send one email', 'when it is back. You also get low-stock warnings.'], steps: [{ icon: 'S: 0', label: 'SOLD OUT' }, { icon: 'email', label: 'JOIN' }, { icon: 'S: 5', label: 'RESTOCK' }, { icon: 'sent', label: 'NOTIFY' }], tags: 'Upstash · Resend · Admin' }),
  'f-bundle': card({ title: 'Bundles, filters and collections', desc: ['Bundle discount applied on the server, seven curated', 'collections, quick view and brand, size and stock filters.'], steps: [{ icon: '2 items', label: 'BAG' }, { icon: '−10%', label: 'BUNDLE' }, { icon: 'free', label: 'SHIPPING' }, { icon: 'total', label: 'TOTAL' }], tags: 'Collections · Quick view · Filters' }),
  'f-assistant': card({ title: 'Shono, the style assistant', desc: ['A rule-based stylist that builds outfits from your', 'catalogue. No API, no cost, no data leaves the browser.'], steps: [{ icon: 'style', label: 'STYLE' }, { icon: 'budget', label: 'BUDGET' }, { icon: 'match', label: 'MATCH' }, { icon: 'outfit', label: 'OUTFIT' }], tags: 'Local · Private · Free' }),
  'f-admin': card({ title: 'Admin page for orders', desc: ['Token-protected. Mark orders shipped with tracking,', 'see flagged payments and the waitlist by size.'], steps: [{ icon: 'paid', label: 'ORDER' }, { icon: 'pack', label: 'PACK' }, { icon: 'ship', label: 'SHIPPED' }, { icon: 'track', label: 'TRACKED' }], tags: 'Orders · Waitlist · Tracking' }),
};
const minis = {
  'm-pin': mini(ic('M0 -13 C8 -13 12 -7 12 -2 C12 6 0 14 0 14 C0 14 -12 6 -12 -2 C-12 -7 -8 -13 0 -13 Z'), 'Delivery estimate', 'Pincode check, business days'),
  'm-3d': mini(ic('M0 -13 L12 -6 V8 L0 14 L-12 8 V-6 Z'), '3D hero', 'Three.js, desktop only'),
  'm-wish': mini(ic('M0 12 C-14 2 -12 -10 -5 -10 C-2 -10 0 -7 0 -7 C0 -7 2 -10 5 -10 C12 -10 14 2 0 12 Z'), 'Wishlist and recents', 'Saved in the browser'),
  'm-track': mini(ic('M-13 8 H13 M-9 8 V-4 H3 V8 M3 -1 H9 L12 3 V8'), 'Order tracking', 'Private 96-bit links'),
  'm-tabs': mini(ic('M-8 -13 H8 Q10 -13 10 -11 V11 Q10 13 8 13 H-8 Q-10 13 -10 11 V-11 Q-10 -13 -8 -13 Z M-3 9 H3'), 'Built for phones', 'Bottom tab bar, buy bar'),
  'm-legal': mini(ic('M0 -13 V13 M-12 -8 H12 M-12 -8 L-16 4 H-8 Z M12 -8 L8 4 H16 Z'), 'Policies included', 'Starting text, not legal advice'),
};

const files = {
  hero, 'h-glance': heading('At a glance'), 'h-features': heading('What it does'), 'h-more': heading('And the details'), 'h-stack': heading('Built with'), 'h-run': heading('Run it'), 'h-live': heading('Go live'), 'h-ops': heading('Running the shop'), 'h-honest': heading('What is and is not verified'), 'h-road': heading('Roadmap'),
  'link-run': link('Quick start', 'Run it locally'), 'link-live': link('Deploy', 'Go live on Vercel'), 'link-ops': link('Owner guide', 'Running the shop'), 'link-honest': link('Honesty', 'What is tested'),
  intro: intro(['An online fashion shop for **India**, built from scratch.', 'Customers pay through **Razorpay**; stock, prices and orders are', 'checked on the **server**, and a rule-based **style assistant** is built in.', 'Sell your own stock and earn affiliate commission side by side.']),
  stats: stats([['113', 'unit and integration tests', 'VITEST'], ['49', 'browser checks, 2 suites', 'PLAYWRIGHT'], ['10', 'API functions (12 max)', 'VERCEL'], ['7', 'curated collections', 'CATALOGUE'], ['0', 'fake ratings or discounts', 'POLICY']]),
  stack, roadmap, ...cards, ...minis,
};
for (const [theme, t] of Object.entries(THEMES)) {
  mkdirSync(`docs/assets/${theme}`, { recursive: true });
  for (const [name, fn] of Object.entries(files)) writeFileSync(`docs/assets/${theme}/${name}.svg`, fn(t));
}
console.log(Object.keys(files).length, 'panels x 2 themes');
