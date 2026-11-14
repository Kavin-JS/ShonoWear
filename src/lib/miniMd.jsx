/**
 * A tiny, SAFE markdown subset for blog posts and content pages. Output is React elements (never raw HTML), links are
 * limited to https:// or site paths, so pasted text cannot inject scripts.
 *   ## Heading        - bullet        blank line = new paragraph        **bold**       [text](https://… or /path)
 */
import React from 'react'; // eslint-disable-line no-unused-vars
import { Link } from 'react-router-dom';

const LINK = /\[([^\]]{1,80})\]\(((?:https:\/\/[^\s)]+)|(?:\/[^\s)]*))\)/;
export function parseBlocks(src) {
  const blocks = [];
  for (const chunk of String(src || '').trim().split(/\n{2,}/)) {
    const lines = chunk.split('\n').map(l => l.trimEnd());
    const rest = [];
    let list = null;
    for (const l of lines) {
      if (/^##\s+/.test(l)) { if (rest.length) blocks.push({ t: 'p', text: rest.splice(0).join(' ') }); if (list) { blocks.push(list); list = null; } blocks.push({ t: 'h2', text: l.replace(/^##\s+/, '') }); }
      else if (/^-\s+/.test(l)) { if (rest.length) blocks.push({ t: 'p', text: rest.splice(0).join(' ') }); (list ||= { t: 'ul', items: [] }).items.push(l.replace(/^-\s+/, '')); }
      else if (l.trim()) { if (list) { blocks.push(list); list = null; } rest.push(l.trim()); }
    }
    if (rest.length) blocks.push({ t: 'p', text: rest.join(' ') });
    if (list) blocks.push(list);
  }
  return blocks;
}

export function inline(text, keyBase = 'i') {
  const out = []; let s = String(text), n = 0;
  while (s) {
    const lm = LINK.exec(s), bm = /\*\*([^*]+)\*\*/.exec(s);
    const m = [lm, bm].filter(Boolean).sort((a, b) => a.index - b.index)[0];
    if (!m) { out.push(s); break; }
    if (m.index) out.push(s.slice(0, m.index));
    const key = `${keyBase}${n++}`;
    if (m === lm) out.push(m[2].startsWith('/') ? <Link key={key} to={m[2]} style={{ textDecoration: 'underline' }}>{m[1]}</Link> : <a key={key} href={m[2]} rel="noopener noreferrer" target="_blank" style={{ textDecoration: 'underline' }}>{m[1]}</a>);
    else out.push(<strong key={key}>{m[1]}</strong>);
    s = s.slice(m.index + m[0].length);
  }
  return out;
}

export function MiniMd({ source }) {
  return (
    <div style={{ display: 'grid', gap: 12, lineHeight: 1.75, fontSize: 16 }}>
      {parseBlocks(source).map((b, i) => b.t === 'h2' ? <h2 key={i} style={{ fontFamily: 'var(--font-body)', fontSize: 20, marginTop: 10 }}>{b.text}</h2>
        : b.t === 'ul' ? <ul key={i} style={{ paddingLeft: 22, display: 'grid', gap: 6 }}>{b.items.map((x, k) => <li key={k}>{inline(x, `l${i}-${k}-`)}</li>)}</ul>
        : <p key={i}>{inline(b.text, `p${i}-`)}</p>)}
    </div>
  );
}
/** Plain text of a markdown source (for meta descriptions and the no-JavaScript summary). */
export { toText } from './textUtil.js';
