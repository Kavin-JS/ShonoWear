import { useState } from 'react';
import { Analytics } from '../lib/analytics.js';
import { Link } from 'react-router-dom';

function EmailCapture() {
  const [email, setEmail]     = useState('');
  const [status, setStatus]   = useState('idle'); // idle | loading | done | error

  async function handleSubmit(e) {
    e.preventDefault();
    if (!email || !email.includes('@')) return;
    setStatus('loading');
    try {
      const res = await fetch('/api/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, website: '' }), // honeypot always blank from real users
      });
      if (!res.ok) throw new Error('subscribe failed');
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
        <span style={{ color: 'var(--red)' }}>✓</span> You're on the list — we'll be in touch.
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
        readOnly
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
    </form>
  );
}

export default function Home() {
  return (
    <main>
      {/* ── HERO ── */}
      <section style={{
        minHeight: '100vh', display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
        textAlign: 'center', padding: '120px 40px 80px',
        position: 'relative', overflow: 'hidden',
      }}>
        {/* Background glow */}
        <div aria-hidden="true" style={{
          position: 'absolute', top: '30%', left: '50%',
          transform: 'translate(-50%, -50%)',
          width: '700px', height: '500px',
          background: 'radial-gradient(ellipse, rgba(232,21,58,0.08) 0%, transparent 70%)',
          pointerEvents: 'none',
        }} />
        {/* Grid lines */}
        <div aria-hidden="true" style={{
          position: 'absolute', inset: 0,
          backgroundImage: 'linear-gradient(rgba(255,255,255,0.025) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.025) 1px, transparent 1px)',
          backgroundSize: '72px 72px', pointerEvents: 'none',
        }} />

        <div style={{ position: 'relative', zIndex: 1, maxWidth: '720px' }}>
          <div className="eyebrow fade-up">AI-Powered Fashion for India</div>

          <h1 className="fade-up fade-up-1" style={{
            fontFamily: "'Bebas Neue', sans-serif",
            fontSize: 'clamp(72px, 12vw, 140px)',
            lineHeight: 0.9, letterSpacing: '0.02em', marginBottom: '24px',
          }}>
            YOUR BODY.<br />
            YOUR VIBE.<br />
            <em style={{ fontFamily: "'DM Serif Display', serif", color: 'var(--red)', fontStyle: 'italic' }}>
              Your Look.
            </em>
          </h1>

          <p className="fade-up fade-up-2" style={{
            fontSize: '16px', color: 'var(--muted)', lineHeight: 1.7,
            marginBottom: '44px', maxWidth: '500px', margin: '0 auto 44px',
          }}>
            Upload your photo. Answer 3 questions. Get{' '}
            <strong style={{ color: 'var(--text)', fontWeight: 500 }}>4 outfits curated by AI</strong>{' '}
            — styled for your frame, your aesthetic, your budget.
          </p>

          <div className="fade-up fade-up-3" style={{
            display: 'flex', gap: '16px', justifyContent: 'center', flexWrap: 'wrap',
          }}>
            <Link to="/upload" className="btn-primary">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="10"/><polygon points="10,8 16,12 10,16"/>
              </svg>
              Try AI Stylist — Free
            </Link>
            <a href="#how-it-works" className="btn-ghost">See how it works</a>
          </div>

          {/* Trust signals — honest, no fake numbers */}
          <div className="fade-up fade-up-4" style={{
            display: 'flex', gap: '40px', justifyContent: 'center',
            marginTop: '64px', paddingTop: '40px',
            borderTop: '1px solid var(--border)', flexWrap: 'wrap',
          }}>
            {[
              { icon: '🔒', label: 'Photo never stored' },
              { icon: '⚡', label: 'Results in ~30 seconds' },
              { icon: '🛍️', label: 'Ships via Amazon & Myntra' },
              { icon: '✦',  label: 'No account required' },
            ].map(({ icon, label }) => (
              <div key={label} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontSize: '14px' }}>{icon}</span>
                <span style={{ fontSize: '12px', color: 'var(--muted)', letterSpacing: '0.04em' }}>{label}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── HOW IT WORKS ── */}
      <section id="how-it-works" style={{ background: 'var(--bg2)', padding: '100px 40px' }}>
        <div className="container">
          <div className="eyebrow">The process</div>
          <h2 style={{
            fontFamily: "'Bebas Neue', sans-serif",
            fontSize: 'clamp(44px, 6vw, 80px)',
            marginBottom: '64px', lineHeight: 1,
          }}>
            FOUR STEPS.{' '}
            <em style={{ fontFamily: "'DM Serif Display', serif", color: 'var(--red)', fontStyle: 'italic' }}>
              Your outfit.
            </em>
          </h2>

          <div style={{
            display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
            gap: '1px', background: 'var(--border)',
            border: '1px solid var(--border)', borderRadius: '4px', overflow: 'hidden',
          }}>
            {[
              { icon: '📸', step: '01', title: 'Upload your photo',   desc: 'A full-length or half-body shot works. Your photo stays on your device — it is never uploaded.' },
              { icon: '🎯', step: '02', title: 'Answer 3 questions',  desc: 'Occasion, aesthetic, and budget. Takes 20 seconds. Shapes everything the AI recommends.' },
              { icon: '✨', step: '03', title: 'AI builds your look', desc: 'The engine reads your body type, skin tone, and preferences to curate 4 complete outfits.' },
              { icon: '🛍️', step: '04', title: 'Buy or save',        desc: 'Click through to Amazon or Myntra. Save looks to your wardrobe to revisit later.' },
            ].map(({ icon, step, title, desc }) => (
              <div key={step} style={{
                background: 'var(--bg)', padding: '36px 28px',
                position: 'relative', overflow: 'hidden', transition: 'background 0.2s',
              }}
                onMouseEnter={e => e.currentTarget.style.background = 'var(--bg2)'}
                onMouseLeave={e => e.currentTarget.style.background = 'var(--bg)'}
              >
                <div aria-hidden="true" style={{
                  position: 'absolute', right: '16px', top: '12px',
                  fontFamily: "'Bebas Neue', sans-serif", fontSize: '72px',
                  color: 'var(--border)', lineHeight: 1, pointerEvents: 'none',
                }}>{step}</div>
                <div style={{
                  width: '48px', height: '48px', borderRadius: '8px',
                  background: 'var(--red-dim)', border: '1px solid rgba(232,21,58,0.25)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: '22px', marginBottom: '20px',
                }}>{icon}</div>
                <h3 style={{
                  fontFamily: "'Poppins', sans-serif", fontSize: '16px',
                  fontWeight: 600, marginBottom: '10px', lineHeight: 1.3,
                }}>{title}</h3>
                <p style={{ fontSize: '13px', color: 'var(--muted)', lineHeight: 1.65 }}>{desc}</p>
              </div>
            ))}
          </div>

          <div style={{ textAlign: 'center', marginTop: '56px' }}>
            <Link to="/upload" className="btn-primary">Get My Outfits →</Link>
          </div>
        </div>
      </section>

      {/* ── EMAIL CAPTURE ── */}
      <section style={{ padding: '100px 40px', textAlign: 'center', background: 'var(--bg3)' }}>
        <div className="container" style={{ maxWidth: '640px' }}>
          <div className="eyebrow" style={{ justifyContent: 'center' }}>Stay in the loop</div>
          <h2 style={{
            fontFamily: "'Bebas Neue', sans-serif",
            fontSize: 'clamp(36px, 5vw, 64px)',
            marginBottom: '16px', lineHeight: 1,
          }}>
            NEW DROPS.{' '}
            <em style={{ fontFamily: "'DM Serif Display', serif", color: 'var(--red)', fontStyle: 'italic' }}>
              First.
            </em>
          </h2>
          <p style={{ color: 'var(--muted)', fontSize: '14px', marginBottom: '32px', lineHeight: 1.7 }}>
            New catalog items, feature updates, and style guides — straight to your inbox.
            No spam. Unsubscribe anytime.
          </p>
          <EmailCapture />
        </div>
      </section>

      {/* ── FOOTER ── */}
      <footer style={{
        padding: '40px',
        borderTop: '1px solid var(--border)',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        flexWrap: 'wrap', gap: '16px',
      }}>
        <div style={{
          fontFamily: "'Bebas Neue', sans-serif", fontSize: '18px', letterSpacing: '0.06em',
        }}>
          SHONO<span style={{ color: 'var(--red)' }}>WEAR</span>
        </div>
        <div style={{ display: 'flex', gap: '28px', flexWrap: 'wrap' }}>
          {[
            { label: 'Privacy Policy', to: '/privacy' },
            { label: 'Terms of Service', to: '/terms' },
          ].map(({ label, to }) => (
            <a key={to} href={to} style={{
              fontSize: '12px', color: 'var(--muted)',
              letterSpacing: '0.04em', transition: 'color 0.2s',
            }}
              onMouseEnter={e => e.currentTarget.style.color = 'var(--text)'}
              onMouseLeave={e => e.currentTarget.style.color = 'var(--muted)'}
            >{label}</a>
          ))}
        </div>
        <div style={{ fontSize: '12px', color: 'var(--muted2)' }}>
          © {new Date().getFullYear()} Shonowear
        </div>
      </footer>
    </main>
  );
}
