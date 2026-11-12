import { useState } from 'react';
import { Analytics } from '../lib/analytics.js';
import { useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import Hero3D from '../components/Hero3D.jsx';
import Rail from '../components/Rail.jsx';
import RecentlyViewed from '../components/RecentlyViewed.jsx';
import { Chevron, Truck, Shield, Return, Rupee } from '../components/Icons.jsx';
import { catalog } from '../data/catalog.js';
import { collections } from '../data/collections.js';
import { STORE } from '../data/storeConfig.js';
import { CATEGORY_LABELS } from '../lib/shopFilters.js';
import { inr } from '../lib/store.js';

// Sign-ups go to our own /api/subscribe (Mailchimp or Resend, see README).
const FORM_ENDPOINT = '/api/subscribe';

function EmailCapture() {
  const [email, setEmail]     = useState('');
  const [status, setStatus]   = useState('idle'); // idle | loading | done | error
  const [needsConfirm, setNeedsConfirm] = useState(false);
  const [errMsg, setErrMsg]     = useState('');

  async function handleSubmit(e) {
    e.preventDefault();
    if (!email || !email.includes('@')) return;
    setStatus('loading');
    setErrMsg('');
    // Honeypot: real users never see or fill this field; bots often do.
    const website = new FormData(e.currentTarget).get('website') || '';
    try {
      const res = await fetch(FORM_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, website }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setErrMsg(data.error || '');
        throw new Error('subscribe failed');
      }
      setNeedsConfirm(Boolean(data.confirm));
      setStatus('done');
      Analytics.emailSubscribed();
    } catch {
      setStatus('error');
    }
  }

  if (status === 'done') {
    return (
      <div style={{
        display: 'inline-flex', alignItems: 'center', gap: '10px',
        padding: '14px 24px', background: 'rgba(232,21,58,0.1)',
        border: '1px solid rgba(232,21,58,0.3)', borderRadius: '4px',
        fontSize: '13px', color: 'var(--text)',
      }}>
        <span style={{ color: 'var(--red)' }}>✓</span>{' '}
        {needsConfirm ? 'Almost done — check your inbox and confirm your email.' : "You're on the list — we'll be in touch."}
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', justifyContent: 'center', maxWidth: '460px', margin: '0 auto' }}>
      {/* Honeypot — hidden from users, filled only by bots */}
      <input
        type="text"
        name="website"
        autoComplete="off"
        tabIndex={-1}
        aria-hidden="true"
        style={{ position: 'absolute', left: '-9999px', opacity: 0, height: 0, width: 0 }}
      />
      <input
        type="email"
        value={email}
        onChange={e => setEmail(e.target.value)}
        placeholder="your@email.com"
        required
        style={{
          flex: 1, minWidth: '200px',
          background: 'var(--surface)', border: '1px solid var(--border2)',
          borderRadius: '4px', padding: '13px 16px',
          color: 'var(--text)', fontSize: '14px',
          fontFamily: "'Poppins', sans-serif", outline: 'none',
        }}
        onFocus={e  => e.target.style.borderColor = 'rgba(232,21,58,0.5)'}
        onBlur={e   => e.target.style.borderColor = 'var(--border2)'}
      />
      <button type="submit" className="btn-primary" disabled={status === 'loading'}
        style={{ padding: '13px 28px', fontSize: '12px' }}>
        {status === 'loading' ? 'Adding...' : 'Get Updates'}
      </button>
      {status === 'error' && (
        <p role="alert" style={{ width: '100%', fontSize: '12px', color: 'rgba(232,21,58,0.85)', margin: '4px 0 0' }}>
          {errMsg || 'Something went wrong. Please try again.'}
        </p>
      )}
    </form>
  );
}


const pickImg = (fn) => (catalog.find(fn) || catalog[0]).image;
const SLIDES = [
  { id: 'stylist', kicker: 'AI Stylist · free', title: ['Your body.', 'Your vibe.', 'Your outfit.'], text: 'Tell us your build, skin tone and budget. Get complete head-to-toe looks from real products.', cta: 'Get my outfits', to: '/upload', img: pickImg(p => p.tags.includes('streetwear')), bg: 'linear-gradient(120deg,#0b0b14 0%,#1a1030 60%,#3a0d1f 100%)', hero3d: true },
  { id: 'under', kicker: 'Budget picks', title: ['Looks under', '₹1,000.'], text: 'Tees, caps and more that don\'t cost the earth.', cta: 'Shop under ₹1,000', to: '/shop?max=1000', img: pickImg(p => p.price <= 1000 && p.category === 'top'), bg: 'linear-gradient(120deg,#e8153a 0%,#b50f2c 100%)' },
  { id: 'street', kicker: 'Streetwear', title: ['Street', 'essentials.'], text: 'Oversized fits, cargos and sneakers that go together.', cta: 'Shop streetwear', to: '/shop?style=streetwear', img: pickImg(p => p.category === 'footwear'), bg: 'linear-gradient(120deg,#10213f 0%,#0b0b14 100%)' },
];

function Banner() {
  const track = useRef(null);
  const [i, setI] = useState(0);
  const paused = useRef(false);
  const go = (n) => { const el = track.current; if (!el) return; const k = (n + SLIDES.length) % SLIDES.length; el.scrollTo({ left: k * el.clientWidth, behavior: 'smooth' }); };
  useEffect(() => {
    const el = track.current; if (!el) return undefined;
    const onScroll = () => setI(Math.round(el.scrollLeft / Math.max(1, el.clientWidth)));
    el.addEventListener('scroll', onScroll, { passive: true });
    const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const t = still ? null : setInterval(() => { if (!paused.current && !document.hidden) go(Math.round(el.scrollLeft / el.clientWidth) + 1); }, 6000);
    return () => { el.removeEventListener('scroll', onScroll); if (t) clearInterval(t); };
  }, []);
  return (
    <section aria-roledescription="carousel" aria-label="Featured" style={{ position: 'relative' }}
      onMouseEnter={() => { paused.current = true; }} onMouseLeave={() => { paused.current = false; }} onFocus={() => { paused.current = true; }} onBlur={() => { paused.current = false; }}>
      <div ref={track} className="hide-scroll" style={{ display: 'flex', overflowX: 'auto', scrollSnapType: 'x mandatory' }}>
        {SLIDES.map((s, k) => (
          <div key={s.id} role="group" aria-roledescription="slide" aria-label={`${k + 1} of ${SLIDES.length}`} className="banner-slide"
            style={{ flex: '0 0 100%', scrollSnapAlign: 'start', background: s.bg, color: '#fff', position: 'relative', overflow: 'hidden' }}>
            {s.hero3d && <Hero3D />}
            <div className="container banner-inner">
              <div style={{ position: 'relative', zIndex: 1, maxWidth: 520 }}>
                <div style={{ fontSize: 12, fontWeight: 600, letterSpacing: '0.14em', textTransform: 'uppercase', opacity: .85, marginBottom: 14 }}>{s.kicker}</div>
                {(() => { const H = k === 0 ? 'h1' : 'h2'; return <H style={{ fontSize: 'clamp(52px, 8vw, 104px)', lineHeight: .92, marginBottom: 16 }}>{s.title.map((t, n) => <span key={n} style={{ display: 'block' }}>{t}</span>)}</H>; })()}
                <p style={{ fontSize: 'clamp(14px, 1.6vw, 17px)', opacity: .9, maxWidth: 440, marginBottom: 24, lineHeight: 1.6 }}>{s.text}</p>
                <Link to={s.to} className="btn-primary" style={{ background: '#fff', color: '#14141f', borderColor: '#fff' }}>{s.cta} <Chevron /></Link>
              </div>
              <img src={s.img} alt="" className="banner-img" loading={k ? 'lazy' : 'eager'} />
            </div>
          </div>
        ))}
      </div>
      <div style={{ position: 'absolute', bottom: 14, left: 0, right: 0, display: 'flex', justifyContent: 'center', gap: 8 }}>
        {SLIDES.map((s, k) => <button key={s.id} type="button" aria-label={`Go to slide ${k + 1}`} aria-current={i === k} onClick={() => go(k)} style={{ width: i === k ? 24 : 8, height: 8, borderRadius: 4, border: 'none', cursor: 'pointer', background: i === k ? '#fff' : 'rgba(255,255,255,.5)', transition: 'width .25s' }} />)}
      </div>
      <style>{`
        .banner-inner { display: flex; align-items: center; justify-content: space-between; gap: 24px; min-height: 440px; padding-top: 40px; padding-bottom: 56px; }
        .banner-img { width: min(34vw, 380px); aspect-ratio: 3/4; object-fit: cover; border-radius: 20px; box-shadow: 0 30px 80px rgba(0,0,0,.45); transform: rotate(3deg); position: relative; z-index: 1; }
        @media (max-width: 768px) {
          .banner-inner { min-height: 0; padding-top: 28px; padding-bottom: 52px; }
          .banner-img { position: absolute !important; right: -34px; bottom: 30px; width: 44vw; opacity: .5; transform: rotate(6deg); z-index: 0 !important; }
        }
      `}</style>
    </section>
  );
}

const OCCASIONS = [
  ['casual', 'Everyday casual', p => p.occasion?.includes?.('casual') || p.tags.includes('casual')],
  ['datenight', 'Date night', p => p.tags.includes('datenight') || p.tags.includes('classic')],
  ['work', 'Work & smart', p => p.tags.includes('work') || p.tags.includes('minimal')],
  ['festival', 'Festival & bold', p => p.tags.includes('festival') || p.tags.includes('bold')],
];

const TRUST = [
  [<Truck key="t" />, 'Free shipping', `On items we ship over ${inr(STORE.freeShippingOver)}`],
  [<Return key="r" />, `${STORE.returnDays}-day returns`, 'On items we ship'],
  [<Shield key="s" />, 'Secure payments', 'UPI, cards, netbanking via Razorpay'],
  [<Rupee key="u" />, 'Prices in ₹', 'Made for shoppers in India'],
];

export default function Home() {
  const featured = catalog.slice(0, 10);
  const under = [...catalog].filter(p => p.price <= 1000).sort((a, b) => a.price - b.price).slice(0, 10);
  const own = catalog.filter(p => p.fulfilment === 'own');
  const cats = Object.entries(CATEGORY_LABELS).map(([k, label]) => [k, label, (catalog.find(p => p.category === k) || {}).image]);

  return (
    <main id="main">
      <Banner />

      <section className="container" style={{ marginTop: 28 }} aria-label="Shop by category">
        <div className="rail hide-scroll" style={{ gap: 18, justifyContent: 'flex-start' }}>
          {cats.map(([k, label, img]) => (
            <Link key={k} to={`/shop?cat=${k}`} style={{ textAlign: 'center', width: 86 }}>
              <span style={{ display: 'block', width: 76, height: 76, margin: '0 auto 8px', borderRadius: '50%', overflow: 'hidden', background: 'var(--bg3)', border: '2px solid var(--border)' }}>
                {img && <img src={img} alt="" loading="lazy" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />}
              </span>
              <span style={{ fontSize: 12, fontWeight: 500 }}>{label}</span>
            </Link>
          ))}
        </div>
      </section>

      <RecentlyViewed />
      <Rail title="Featured" hint="Hand-picked from the catalogue" to="/shop" items={featured} />
      {own.length > 0 && <Rail title="Ships from us" hint={`Delivered in ${STORE.deliveryEstimate}`} to="/shop?platform=Shonowear" items={own} />}
      <Rail title="Under ₹1,000" to="/shop?max=1000" items={under} />

      <section className="container" style={{ marginTop: 44 }} aria-label="Collections">
        <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: 14 }}>
          <h2 className="section-title" style={{ fontFamily: 'var(--font-body)' }}>Collections</h2>
          <Link to="/collections" style={{ fontSize: 13, fontWeight: 600, color: 'var(--red)' }}>View all</Link>
        </div>
        <div className="rail hide-scroll">
          {collections.map(c => ({ c, items: catalog.filter(c.match) })).filter(x => x.items.length).map(({ c, items }) => (
            <Link key={c.slug} to={`/collection/${c.slug}`} style={{ width: 200, position: 'relative', aspectRatio: '4 / 5', borderRadius: 16, overflow: 'hidden', background: 'var(--bg3)', color: '#fff', display: 'block' }}>
              <img src={items[0].image} alt="" loading="lazy" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              <span style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to top, rgba(0,0,0,.75), rgba(0,0,0,.05) 60%)' }} />
              <span style={{ position: 'absolute', left: 14, bottom: 12, right: 12, fontWeight: 700, fontSize: 16 }}>{c.title}</span>
            </Link>
          ))}
        </div>
      </section>

      <section className="container" style={{ marginTop: 44 }} aria-label="Shop by occasion">
        <h2 className="section-title" style={{ fontFamily: 'var(--font-body)', marginBottom: 14 }}>Shop by occasion</h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: 14 }}>
          {OCCASIONS.map(([k, label, fn]) => (
            <Link key={k} to={`/shop?occasion=${k}`} style={{ position: 'relative', aspectRatio: '4 / 3', borderRadius: 16, overflow: 'hidden', background: 'var(--bg3)', color: '#fff', display: 'block' }}>
              <img src={pickImg(fn)} alt="" loading="lazy" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              <span style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to top, rgba(0,0,0,.72), rgba(0,0,0,.05) 60%)' }} />
              <span style={{ position: 'absolute', left: 16, bottom: 14, fontWeight: 700, fontSize: 17 }}>{label}<br /><span style={{ fontSize: 12, fontWeight: 500, opacity: .85 }}>Shop now →</span></span>
            </Link>
          ))}
        </div>
      </section>

      <section className="container" style={{ marginTop: 44 }} aria-label="AI stylist">
        <div style={{ borderRadius: 20, background: 'linear-gradient(120deg,#0b0b14,#2a0f2a 70%,#4a0f24)', color: '#fff', padding: 'clamp(24px, 5vw, 48px)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 24, flexWrap: 'wrap' }}>
          <div style={{ maxWidth: 560 }}>
            <div style={{ fontSize: 12, letterSpacing: '0.14em', textTransform: 'uppercase', color: '#ff7a93', fontWeight: 600, marginBottom: 10 }}>✦ Not sure what to wear?</div>
            <h2 style={{ fontSize: 'clamp(34px, 5vw, 56px)', marginBottom: 12 }}>Let the stylist build it for you</h2>
            <p style={{ opacity: .85, lineHeight: 1.7, fontSize: 14 }}>Four complete outfits matched to your build, skin tone, occasion and budget. Photos never leave your device. Or just chat with Shono, the assistant in the corner.</p>
          </div>
          <Link to="/upload" className="btn-primary" style={{ background: '#fff', color: '#14141f', borderColor: '#fff' }}>Get my outfits — free</Link>
        </div>
      </section>

      <section className="container" style={{ marginTop: 44 }} aria-label="Why shop with us">
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 14 }}>
          {TRUST.map(([icon, t, d]) => (
            <div key={t} style={{ display: 'flex', gap: 14, alignItems: 'center', padding: '16px 18px', border: '1px solid var(--border)', borderRadius: 14, background: 'var(--bg2)' }}>
              <span style={{ color: 'var(--red)' }}>{icon}</span>
              <span style={{ fontSize: 13, lineHeight: 1.4 }}><strong style={{ display: 'block', fontSize: 14 }}>{t}</strong><span style={{ color: 'var(--muted)' }}>{d}</span></span>
            </div>
          ))}
        </div>
      </section>

      <section className="container" style={{ marginTop: 44, marginBottom: 56 }} aria-label="Email updates">
        <div style={{ border: '1px solid var(--border)', borderRadius: 20, padding: 'clamp(22px, 4vw, 40px)', background: 'var(--bg2)', textAlign: 'center' }}>
          <h2 className="section-title" style={{ fontFamily: 'var(--font-body)', marginBottom: 6 }}>New drops, straight to your inbox</h2>
          <p style={{ color: 'var(--muted)', fontSize: 13, marginBottom: 18 }}>No spam. Unsubscribe any time.</p>
          <div style={{ maxWidth: 480, margin: '0 auto' }}><EmailCapture /></div>
        </div>
      </section>
    </main>
  );
}
