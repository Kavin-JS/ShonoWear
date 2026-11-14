import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { STORE } from '../data/storeConfig.js';
import { acctGet, acctPost, useAccount } from '../lib/account.js';

const Star = ({ on }) => <span aria-hidden="true" style={{ color: on ? 'var(--gold, #f5b301)' : 'var(--muted2)' }}>★</span>;
export const Stars = ({ value }) => <span aria-hidden="true">{[1, 2, 3, 4, 5].map(n => <Star key={n} on={n <= Math.round(value)} />)}</span>;
const input = { width: '100%', background: 'var(--bg3)', color: 'var(--text)', border: '1px solid var(--border2)', borderRadius: 4, padding: 10, fontSize: 14, fontFamily: 'inherit' };

/** Reviews (verified buyers only, approved by you) and customer questions for a product we ship. Nothing here is invented. */
export default function ProductSocial({ productId }) {
  const [rev, setRev] = useState(null); const [qa, setQa] = useState([]);
  const { email } = useAccount();
  const [q, setQ] = useState(''); const [msg, setMsg] = useState(''); const [busy, setBusy] = useState(false);
  useEffect(() => {
    let live = true; setRev(null);
    acctGet({ action: 'reviews', product: productId }).then(r => live && setRev(r.ok ? r.data : { count: 0, reviews: [] })).catch(() => live && setRev({ count: 0, reviews: [] }));
    acctGet({ action: 'qa', product: productId }).then(r => live && setQa(r.data.questions || [])).catch(() => {});
    return () => { live = false; };
  }, [productId]);
  async function ask(e) {
    e.preventDefault(); setBusy(true); setMsg('');
    const r = await acctPost({ action: 'ask', productId, question: q, name: email?.split('@')[0] || '' }).catch(() => null);
    setBusy(false);
    if (r?.ok) { setQ(''); setMsg('Thanks! We will answer it here soon.'); } else setMsg(r?.data?.error || 'Could not send your question.');
  }
  if (STORE.reviews?.enabled === false && !qa.length) return null;
  return (
    <section aria-label="Reviews and questions" style={{ marginBottom: 48, display: 'grid', gap: 16 }}>
      <div className="eyebrow">Reviews</div>
      {rev === null ? <div style={{ color: 'var(--muted)', fontSize: 14 }}>Loading…</div>
        : rev.count === 0 ? <p style={{ color: 'var(--muted)', fontSize: 14 }}>No reviews yet. Only customers whose order was delivered can review, so every review here is a real one.</p>
        : (<>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <strong style={{ fontSize: 24 }}>{rev.average}</strong><Stars value={rev.average} />
            <span style={{ color: 'var(--muted)', fontSize: 13 }}>{rev.count} verified review{rev.count === 1 ? '' : 's'}</span>
          </div>
          <div style={{ display: 'grid', gap: 12 }}>
            {rev.reviews.map(r => (
              <article key={r.id} style={{ borderTop: '1px solid var(--border)', paddingTop: 10, display: 'grid', gap: 4 }}>
                <div><Stars value={r.rating} /> <span className="sr-only" style={{ position: 'absolute', left: -9999 }}>{r.rating} out of 5</span> {r.title && <strong style={{ marginLeft: 6 }}>{r.title}</strong>}</div>
                <p style={{ fontSize: 14, lineHeight: 1.6 }}>{r.body}</p>
                <span style={{ fontSize: 12, color: 'var(--muted)' }}>{r.name} · Verified buyer · {new Date(r.createdAt).toLocaleDateString('en-IN')}</span>
              </article>
            ))}
          </div>
        </>)}
      <div className="eyebrow" style={{ marginTop: 8 }}>Questions</div>
      {qa.map(x => (
        <div key={x.id} style={{ display: 'grid', gap: 2, fontSize: 14 }}>
          <strong>Q: {x.q}</strong><span style={{ color: 'var(--muted)' }}>A: {x.a}</span>
        </div>
      ))}
      {email ? (
        <form onSubmit={ask} noValidate aria-label="Ask a question" style={{ display: 'grid', gap: 8, maxWidth: 520 }}>
          <label htmlFor="q-ask" style={{ fontSize: 13, color: 'var(--muted)' }}>Ask about fit, fabric or care</label>
          <textarea id="q-ask" value={q} maxLength={300} onChange={e => setQ(e.target.value)} style={{ ...input, minHeight: 60 }} />
          {msg && <div role="status" style={{ fontSize: 13 }}>{msg}</div>}
          <button className="btn-ghost" disabled={busy || q.trim().length < 8} style={{ justifySelf: 'start' }}>Ask</button>
        </form>
      ) : <p style={{ fontSize: 13, color: 'var(--muted)' }}><Link to="/account" style={{ textDecoration: 'underline' }}>Sign in</Link> to ask a question. We answer here so others can see.</p>}
    </section>
  );
}
