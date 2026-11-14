import { useEffect, useState } from 'react';
import { inr } from '../lib/store.js';

const box = { background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 12, padding: 14, marginBottom: 14, fontSize: 13, display: 'grid', gap: 10 };
const field = { background: 'var(--bg3)', color: 'var(--text)', border: '1px solid var(--border2)', borderRadius: 4, padding: 6, fontFamily: 'inherit', fontSize: 13 };
const btn = { padding: '4px 10px' };

function download(name, text, type = 'text/csv') {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement('a'); a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
}
export function openPrintable(html) {
  const w = window.open('', '_blank');
  if (!w) return false;
  w.document.open(); w.document.write(html); w.document.close(); return true;
}

function Stat({ label, value, sub }) {
  return <div style={{ background: 'var(--bg3)', borderRadius: 8, padding: '8px 12px', minWidth: 120 }}><div style={{ color: 'var(--muted)', fontSize: 12 }}>{label}</div><div style={{ fontSize: 20, fontWeight: 700 }}>{value}</div>{sub && <div style={{ fontSize: 11, color: 'var(--muted2)' }}>{sub}</div>}</div>;
}

function Traffic({ t, orders }) {
  const max = Math.max(1, ...t.series.map(s => s.views));
  const top = t.steps[0][1];
  return (
    <div aria-label="Visits">
      <strong>Visits · last {t.days} days</strong>
      <div style={{ color: 'var(--muted2)', fontSize: 11 }}>Anonymous counts on your own server: no cookies, no visitor ids, so there is no "unique visitors" number. People who send Do Not Track are not counted.</div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', margin: '6px 0' }}>
        <Stat label="Page views" value={t.pageViews} /><Stat label="Stylist used" value={t.totals.stylist_used} /><Stat label="Email sign-ups" value={t.totals.email_signup} /><Stat label="Buy clicks" value={t.totals.buy_click} sub="affiliate items" />
      </div>
      <svg viewBox="0 0 300 40" role="img" aria-label={`Daily page views, highest ${max}`} style={{ width: '100%', height: 50 }} preserveAspectRatio="none">
        {t.series.map((s, i) => { const h = Math.round((s.views / max) * 36); return <rect key={s.day} x={i * 10 + 1} y={38 - h} width={8} height={Math.max(h, s.views ? 1 : 0)} fill="currentColor" opacity="0.6"><title>{s.day}: {s.views} views</title></rect>; })}
      </svg>
      <div><strong>Shopping funnel</strong>
        {t.steps.map(([label, n], i) => <div key={label}>{label}: {n}{i > 0 && top > 0 ? ` (${Math.round((n / top) * 100)}% of product views)` : ''}</div>)}
        <div>Orders placed: {orders}{t.totals.checkout_start > 0 ? ` (${Math.round((orders / t.totals.checkout_start) * 100)}% of checkouts started)` : ''}</div>
      </div>
      {t.products.length > 0 && <div><strong>Most viewed</strong>{t.products.map(p => <div key={p.id}>{p.name}: {p.views} views · {p.adds} added to bag</div>)}</div>}
    </div>
  );
}

function Health({ h, problems, call, fail }) {
  const [busy, setBusy] = useState(false); const [note, setNote] = useState('');
  const flags = [['Database', h.store], ['Payments', h.payments], ['Email', h.email], ['Owner alerts', h.alerts], ['Encrypted backups', h.backupEncryption]];
  async function backup() {
    setBusy(true); setNote('');
    try {
      const r = await call('GET', null, '?view=backup');
      const bytes = Uint8Array.from(atob(r.base64), c => c.charCodeAt(0));
      const url = URL.createObjectURL(new Blob([bytes], { type: 'application/octet-stream' }));
      const a = document.createElement('a'); a.href = url; a.download = r.name; a.click(); setTimeout(() => URL.revokeObjectURL(url), 2000);
      setNote(`Saved ${r.name}: ${r.keys} records, ${r.orders} orders${r.encrypted ? ', encrypted' : '. NOT encrypted: it holds customer details, keep it private'}.`);
    } catch (e) { fail(e.message); } finally { setBusy(false); }
  }
  return (
    <div aria-label="Health and problems" style={{ display: 'grid', gap: 6 }}>
      <strong>Health</strong>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {flags.map(([n, ok]) => <span key={n} style={{ fontSize: 12, padding: '3px 8px', borderRadius: 12, border: '1px solid var(--border2)', color: ok ? 'var(--text)' : 'var(--red-text)' }}>{ok ? '✓' : '✗'} {n}</span>)}
      </div>
      <div><strong>Recent problems</strong> <span style={{ color: 'var(--muted2)', fontSize: 11 }}>({problems.today} today)</span>
        {problems.recent.length === 0 ? <div style={{ color: 'var(--muted)' }}>Nothing has gone wrong lately.</div>
          : <ul style={{ margin: '4px 0 0', paddingLeft: 18, fontSize: 12 }}>{problems.recent.slice(0, 10).map((p, i) => <li key={i}><code>{p.kind}</code> {p.msg} {p.ref && <span style={{ color: 'var(--muted2)' }}>({p.ref})</span>} <span style={{ color: 'var(--muted2)' }}>{new Date(p.t).toLocaleString()}</span></li>)}</ul>}
      </div>
      <div><button type="button" className="btn" disabled={busy} onClick={backup} style={{ minHeight: 40 }}>{busy ? 'Preparing…' : 'Download a backup'}</button>
        {note && <span role="status" style={{ marginLeft: 10, fontSize: 12 }}>{note}</span>}</div>
    </div>
  );
}

export function Dashboard({ call, fail }) {
  const [d, setD] = useState(null);
  useEffect(() => { call('GET', null, '?view=dashboard').then(setD).catch(e => fail(e.message)); /* eslint-disable-next-line */ }, []);
  if (!d) return <section style={box} aria-label="Dashboard"><strong>Dashboard</strong><span style={{ color: 'var(--muted)' }}>Loading…</span></section>;
  const max = Math.max(1, ...d.series.map(s => s.revenue));
  const t = d.totals;
  return (
    <section style={box} aria-label="Dashboard">
      {d.health && <Health h={d.health} problems={d.problems} call={call} fail={fail} />}
      <strong>Dashboard · last 30 days</strong>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <Stat label="Orders" value={t.orders} /><Stat label="Revenue" value={inr(t.revenue)} sub="after refunds" /><Stat label="Average order" value={inr(t.aov)} />
        <Stat label="COD to collect" value={inr(t.codToCollect)} /><Stat label="Refunded" value={inr(t.refunded)} /><Stat label="To ship" value={d.needsAttention.toShip} />
      </div>
      <figure style={{ margin: 0 }}>
        <svg viewBox="0 0 300 70" role="img" aria-label={`Daily revenue for the last 30 days, highest ${inr(max)}`} style={{ width: '100%', height: 90 }} preserveAspectRatio="none">
          {d.series.map((s, i) => { const h = Math.round((s.revenue / max) * 62); return <rect key={s.day} x={i * 10 + 1} y={68 - h} width={8} height={Math.max(h, s.revenue ? 1 : 0)} fill="currentColor" opacity="0.75"><title>{s.day}: {inr(s.revenue)} · {s.orders} orders</title></rect>; })}
          <line x1="0" y1="68.5" x2="300" y2="68.5" stroke="currentColor" opacity="0.25" />
        </svg>
        <figcaption style={{ color: 'var(--muted2)', fontSize: 11 }}>{d.series[0].day} to {d.series.at(-1).day} · hover a bar for the day</figcaption>
      </figure>
      {d.traffic && <Traffic t={d.traffic} orders={t.orders} />}
      {d.top.length > 0 && <div><strong>Best sellers</strong>{d.top.map(x => <div key={x.id}>{x.name}: {x.units} sold · {inr(x.revenue)}</div>)}</div>}
      {d.lowStock.length > 0 && <div><strong>Running low</strong>{d.lowStock.map(x => <div key={x.id + x.size}>{x.name} · {x.size}: {x.available === 0 ? 'sold out' : `${x.available} left`}</div>)}</div>}
    </section>
  );
}

function Row({ p, call, done, fail }) {
  const [price, setPrice] = useState(String(p.price)); const [mrp, setMrp] = useState(p.mrp ? String(p.mrp) : '');
  const [stock, setStock] = useState(() => Object.fromEntries(p.sizes.map(s => [s.size, String(s.available)])));
  async function save() {
    const available = {};
    for (const s of p.sizes) if (String(s.available) !== stock[s.size]) available[s.size] = stock[s.size];
    try {
      await call('POST', { action: 'product-update', id: p.id, ...(String(p.price) !== price ? { price } : {}), ...(mrp !== (p.mrp ? String(p.mrp) : '') ? (mrp ? { mrp } : { clearMrp: true }) : {}), ...(Object.keys(available).length ? { available } : {}) });
      done(`Saved ${p.name}.`);
    } catch (e) { fail(e.message); }
  }
  async function reset() {
    if (!window.confirm('Go back to the price and stock in catalog.js for this product?')) return;
    try { await call('POST', { action: 'product-reset', id: p.id }); done('Reset.'); } catch (e) { fail(e.message); }
  }
  return (
    <div style={{ borderTop: '1px solid var(--border)', paddingTop: 8, display: 'grid', gap: 6 }}>
      <strong>{p.name}{p.sample ? ' (sample)' : ''}{p.edited ? ' · edited' : ''}</strong>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <label>Price ₹ <input style={{ ...field, width: 80 }} inputMode="numeric" value={price} onChange={e => setPrice(e.target.value)} aria-label={`Price for ${p.name}`} /></label>
        <label>MRP ₹ <input style={{ ...field, width: 80 }} inputMode="numeric" value={mrp} onChange={e => setMrp(e.target.value)} aria-label={`MRP for ${p.name}`} placeholder="none" /></label>
        {p.edited && <span style={{ color: 'var(--muted2)' }}>file: ₹{p.basePrice}</span>}
      </div>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        {p.sizes.map(s => (
          <label key={s.size}>{s.size} <input style={{ ...field, width: 56 }} inputMode="numeric" value={stock[s.size]} onChange={e => setStock(v => ({ ...v, [s.size]: e.target.value }))} aria-label={`Available ${s.size} for ${p.name}`} />
            <span style={{ color: 'var(--muted2)' }}> {s.sold} sold{s.held ? `, ${s.held} held` : ''}</span></label>
        ))}
      </div>
      <div style={{ display: 'flex', gap: 6 }}><button className="btn-ghost" style={btn} onClick={save}>Save</button>{p.edited && <button className="btn-ghost" style={btn} onClick={reset}>Reset to file</button>}</div>
    </div>
  );
}

export function Products({ call, done, fail }) {
  const [list, setList] = useState(null); const [csv, setCsv] = useState(''); const [preview, setPreview] = useState(null);
  const load = () => call('GET', null, '?view=products').then(r => setList(r.products)).catch(e => fail(e.message));
  useEffect(() => { load(); /* eslint-disable-next-line */ }, []);
  const refreshAfter = (m) => { done(m); load(); };
  async function exportCsv() { try { download('shonowear-products.csv', (await call('GET', null, '?view=export-products')).csv); } catch (e) { fail(e.message); } }
  async function check() {
    try { const r = await call('POST', { action: 'csv-import', csv, dryRun: true }); setPreview(r.products); done(`Looks good: ${r.products.length} product(s) would change. Press Apply to save.`); }
    catch (e) { setPreview(null); fail(e.message); }
  }
  async function apply() { try { await call('POST', { action: 'csv-import', csv, dryRun: false }); setCsv(''); setPreview(null); refreshAfter('Applied.'); } catch (e) { fail(e.message); } }
  return (
    <section style={box} aria-label="Products">
      <strong>Price and stock</strong>
      <span style={{ color: 'var(--muted)' }}>Changes apply at once, on top of catalog.js. "Available" is what customers can buy now. New products and sizes are added in catalog.js (or with the CSV script, see the README).</span>
      {!list ? 'Loading…' : list.map(p => <Row key={p.id + JSON.stringify(p.sizes.map(s => s.available)) + p.price} p={p} call={call} done={refreshAfter} fail={fail} />)}
      <details><summary style={{ cursor: 'pointer' }}>Bulk edit with a spreadsheet (CSV)</summary>
        <div style={{ display: 'grid', gap: 8, marginTop: 8 }}>
          <div><button className="btn-ghost" style={btn} onClick={exportCsv}>Download current prices and stock</button></div>
          <span style={{ color: 'var(--muted)' }}>Edit the file, then paste it (or choose it) below. Columns: id, size, stock, price, mrp. Empty cells are left alone. Nothing is saved if any line is wrong.</span>
          <input type="file" accept=".csv,text/csv" aria-label="CSV file" onChange={async e => { const f = e.target.files?.[0]; if (f && f.size < 40000) setCsv(await f.text()); else if (f) fail('That file is too big (40 KB max).'); }} />
          <textarea aria-label="CSV text" value={csv} onChange={e => { setCsv(e.target.value); setPreview(null); }} rows={5} style={{ ...field, width: '100%' }} />
          <div style={{ display: 'flex', gap: 6 }}><button className="btn-ghost" style={btn} disabled={!csv.trim()} onClick={check}>Check</button>{preview && <button className="btn-primary" style={btn} onClick={apply}>Apply {preview.length} product(s)</button>}</div>
        </div>
      </details>
    </section>
  );
}

export function Customers({ call, done, fail }) {
  const [d, setD] = useState(null); const [subject, setSubject] = useState(''); const [body, setBody] = useState(''); const [busy, setBusy] = useState(false);
  const load = () => call('GET', null, '?view=customers').then(setD).catch(e => fail(e.message));
  useEffect(() => { load(); /* eslint-disable-next-line */ }, []);
  const subs = d ? d.customers.filter(c => c.marketing && !c.unsubscribed).length : 0;
  async function send(test) {
    if (!test && !window.confirm(`Send this to ${subs} customer(s) who agreed to offers? This cannot be undone.`)) return;
    setBusy(true);
    try { const r = await call('POST', { action: 'campaign', subject, body, test }); done(test ? 'Test sent to you.' : `Sent to ${r.sent}${r.failed ? `, ${r.failed} failed` : ''}.`); if (!test) { setSubject(''); setBody(''); load(); } } catch (e) { fail(e.message); }
    setBusy(false);
  }
  async function exportCsv() { try { download('shonowear-customers.csv', (await call('GET', null, '?view=export-customers')).csv); } catch (e) { fail(e.message); } }
  return (
    <section style={box} aria-label="Customers">
      <strong>Customers ({d?.customers.length ?? '…'}) · {subs} agreed to offers</strong>
      <div><button className="btn-ghost" style={btn} onClick={exportCsv}>Download customer list (CSV)</button></div>
      {d?.customers.slice(0, 25).map(c => <div key={c.email} style={{ borderTop: '1px solid var(--border)', paddingTop: 4 }}>{c.name} · {c.email} · {c.orders} order(s) · {inr(c.spent)} · {c.marketing ? (c.unsubscribed ? 'unsubscribed' : 'offers: yes') : 'offers: no'}</div>)}
      <details><summary style={{ cursor: 'pointer' }}>Send an offer email</summary>
        <div style={{ display: 'grid', gap: 8, marginTop: 8 }}>
          <span style={{ color: 'var(--muted)' }}>Goes only to customers who ticked the offers box and have not unsubscribed. Every email carries an unsubscribe link. One campaign per 10 minutes, up to 200 people.</span>
          <input aria-label="Subject" placeholder="Subject" value={subject} maxLength={120} onChange={e => setSubject(e.target.value)} style={field} />
          <textarea aria-label="Message" placeholder="Your message (plain text)" rows={6} value={body} maxLength={3000} onChange={e => setBody(e.target.value)} style={field} />
          <div style={{ display: 'flex', gap: 6 }}><button className="btn-ghost" style={btn} disabled={busy || !subject || !body} onClick={() => send(true)}>Send me a test</button><button className="btn-primary" style={btn} disabled={busy || !subject || !body || !subs} onClick={() => send(false)}>Send to {subs}</button></div>
          {d?.campaigns.length > 0 && <div style={{ color: 'var(--muted2)' }}>Last: {d.campaigns.map(c => `${new Date(c.at).toLocaleDateString('en-IN')} "${c.subject}" (${c.sent})`).join(' · ')}</div>}
        </div>
      </details>
    </section>
  );
}
