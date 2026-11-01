import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { getRecommendationsAsync } from '../lib/recommendationEngine.js';
import { Analytics } from '../lib/analytics.js';
import { saveLastResults, loadLastResults } from '../lib/session.js';
import OutfitCard from '../components/OutfitCard.jsx';
import LoadingSpinner from '../components/LoadingSpinner.jsx';

function StyleDNA({ rules }) {
  if (!rules) return null;
  const sections = [
    { key: 'fitRules',   label: 'Fit',    icon: '📐' },
    { key: 'colorRules', label: 'Colour', icon: '🎨' },
    { key: 'styleRules', label: 'Style',  icon: '✦' },
    { key: 'avoidRules', label: 'Avoid',  icon: '✕' },
  ].filter(s => rules[s.key]?.length > 0);
  if (!sections.length) return null;

  return (
    <div style={{
      background: 'var(--bg2)', border: '1px solid var(--border)',
      borderRadius: '8px', padding: '24px', marginBottom: '52px',
    }}>
      <div className="eyebrow" style={{ marginBottom: '18px' }}>Your Style DNA</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '20px' }}>
        {sections.map(({ key, label, icon }) => (
          <div key={key}>
            <div style={{
              fontSize: '11px', fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase',
              color: 'var(--muted)', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '5px',
            }}>
              <span>{icon}</span>{label}
            </div>
            <ul style={{ listStyle: 'none', display: 'flex', flexDirection: 'column', gap: '5px' }}>
              {rules[key].map((rule, i) => (
                <li key={i} style={{
                  fontSize: '12px', lineHeight: 1.55, paddingLeft: '10px',
                  color: key === 'avoidRules' ? 'rgba(232,21,58,0.8)' : 'var(--muted)',
                  borderLeft: `2px solid ${key === 'avoidRules' ? 'rgba(232,21,58,0.4)' : 'var(--border2)'}`,
                }}>
                  {rule}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </div>
  );
}

function FallbackNotice() {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: '10px',
      background: 'rgba(255,200,0,0.06)', border: '1px solid rgba(255,200,0,0.15)',
      borderRadius: '4px', padding: '10px 14px', marginBottom: '28px',
      fontSize: '12px', color: 'rgba(255,200,0,0.7)',
    }}>
      <span>⚡</span>
      Quick-match mode — AI personalisation was unavailable. Results are based on your style tags.
    </div>
  );
}

const AESTHETIC_LABELS = {
  streetwear: 'Streetwear 🧢', minimal: 'Minimal ⬜', bold: 'Bold 🔥', classic: 'Classic 🎩',
};
const OCCASION_LABELS = {
  casual: 'Casual ☀️', datenight: 'Date Night 🌙', work: 'Work 💼', festival: 'Festival 🎉',
};
const BUDGET_LABELS = {
  low: 'Under ₹1,500', mid: '₹1,500 – ₹5,000', high: '₹5,000+',
};

export default function Results() {
  const [loading, setLoading]           = useState(true);
  const [outfits, setOutfits]           = useState([]);
  const [stylingRules, setStylingRules] = useState(null);
  const [profile, setProfile]           = useState(null);
  const [source, setSource]             = useState('ai');
  const [error, setError]               = useState('');
  const [timedOut, setTimedOut]         = useState(false);
  const [elapsed, setElapsed]           = useState(0);
  const [warning, setWarning]           = useState('');

  useEffect(() => {
    const raw = sessionStorage.getItem('shonowear_profile');

    // No active session — try loading cached results from last visit
    if (!raw) {
      const cached = loadLastResults();
      if (cached?.outfits?.length) {
        setOutfits(cached.outfits);
        setStylingRules(cached.stylingRules);
        setSource(cached.source);
        setWarning('Showing your last session. Start a new one to refresh.');
        setLoading(false);
        return;
      }
      setError('No style profile found. Please start from the beginning.');
      setLoading(false);
      return;
    }

    const p = JSON.parse(raw);
    setProfile(p);

    // Elapsed time counter — shows user something is happening
    const ticker = setInterval(() => setElapsed(s => s + 1), 1000);

    // 25-second hard timeout — falls back gracefully rather than hanging
    const timeout = setTimeout(() => {
      setTimedOut(true);
      Analytics.timeoutHit();
    }, 25000);

    getRecommendationsAsync(p)
      .then((res) => {
        const { outfits: o, stylingRules: r, source: s } = res;
        clearTimeout(timeout);
        clearInterval(ticker);
        setOutfits(o);
        setStylingRules(r);
        setSource(s);
        if (res?.warning || res?.notice) setWarning(res.warning || res.notice);
        setLoading(false);
        saveLastResults({ outfits: o, stylingRules: r, source: s });
        Analytics.outfitViewed(p);
        if (s === 'fallback') Analytics.fallbackUsed('api_error');
      })
      .catch(() => {
        clearTimeout(timeout);
        clearInterval(ticker);
        setError('Something went wrong. Please try again.');
        setLoading(false);
      });

    return () => { clearTimeout(timeout); clearInterval(ticker); };
  }, []);

  if (error) return (
    <main className="page" style={{ paddingTop: '100px', textAlign: 'center' }}>
      <div className="container" style={{ maxWidth: '480px' }}>
        <div style={{ fontSize: '48px', marginBottom: '24px' }}>⚠️</div>
        <h2 style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: '40px', marginBottom: '16px' }}>OOPS</h2>
        <p style={{ color: 'var(--muted)', marginBottom: '32px' }}>{error}</p>
        <Link to="/upload" className="btn-primary">Start Over</Link>
      </div>
    </main>
  );

  if (loading) return (
    <main className="page" style={{ paddingTop: '100px' }}>
      <div className="container">
        {timedOut ? (
          /* Timeout state — show retry instead of spinning forever */
          <div style={{ textAlign: 'center', padding: '80px 40px' }}>
            <div style={{ fontSize: '48px', marginBottom: '24px' }}>⏱</div>
            <h2 style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: '40px', marginBottom: '16px' }}>
              TAKING LONGER THAN USUAL
            </h2>
            <p style={{ color: 'var(--muted)', marginBottom: '32px', maxWidth: '380px', margin: '0 auto 32px', fontSize: '14px', lineHeight: 1.7 }}>
              The AI is busy. Your style profile is saved — try again and it'll be faster.
            </p>
            <div style={{ display: 'flex', gap: '16px', justifyContent: 'center', flexWrap: 'wrap' }}>
              <button
                className="btn-primary"
                onClick={() => { setTimedOut(false); setLoading(true); setElapsed(0); window.location.reload(); }}
              >
                Try Again
              </button>
              <a href="/upload" className="btn-ghost">Change Style Profile</a>
            </div>
          </div>
        ) : (
          <div>
            <LoadingSpinner />
            {elapsed >= 8 && (
              <p style={{
                textAlign: 'center', fontSize: '12px', color: 'var(--muted2)',
                marginTop: '-20px', letterSpacing: '0.04em',
              }}>
                This can take up to 20 seconds — AI is working on it…
              </p>
            )}
          </div>
        )}
      </div>
    </main>
  );

  return (
    <main className="page" style={{ paddingTop: '100px' }}>
      <div className="container">

        <div style={{ marginBottom: '44px' }}>
          <div className="eyebrow fade-up">
            {source === 'ai' ? 'AI Personalised' : 'Recommendations'}
          </div>
          <h1 className="fade-up fade-up-1" style={{
            fontFamily: "'Bebas Neue', sans-serif",
            fontSize: 'clamp(44px, 7vw, 88px)',
            lineHeight: 0.95, marginBottom: '16px',
          }}>
            YOUR 4<br />
            <em style={{ fontFamily: "'DM Serif Display', serif", color: 'var(--red)', fontStyle: 'italic' }}>
              Curated Looks
            </em>
          </h1>

          {profile && (
            <div className="fade-up fade-up-2" style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginTop: '16px' }}>
              {[
                AESTHETIC_LABELS[profile.aesthetic],
                OCCASION_LABELS[profile.occasion],
                BUDGET_LABELS[profile.budget],
                profile.bodyType && `${profile.bodyType} frame`,
                profile.skinTone && profile.skinTone,
              ].filter(Boolean).map(tag => (
                <span key={tag} style={{
                  fontSize: '10px', letterSpacing: '0.1em', textTransform: 'uppercase',
                  color: 'var(--red)', background: 'var(--red-dim)',
                  border: '1px solid rgba(232,21,58,0.2)', padding: '4px 12px', borderRadius: '2px',
                }}>
                  {tag}
                </span>
              ))}
            </div>
          )}
        </div>

        {source === 'fallback' && <FallbackNotice />}

        {warning && source !== 'fallback' && (
          <div style={{
            display: 'flex', alignItems: 'center', gap: '10px',
            background: 'rgba(255,200,0,0.06)', border: '1px solid rgba(255,200,0,0.15)',
            borderRadius: '4px', padding: '10px 14px', marginBottom: '24px',
            fontSize: '12px', color: 'rgba(255,200,0,0.75)',
          }}>
            <span>⚠</span> {warning}
          </div>
        )}

        <StyleDNA rules={stylingRules} />

        <div style={{
          display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))',
          gap: '20px', marginBottom: '64px',
        }}>
          {outfits.map((outfit, i) => (
            <OutfitCard key={outfit.id} product={outfit} animationDelay={i * 0.1} />
          ))}
        </div>

        <div style={{
          display: 'flex', flexDirection: 'column', alignItems: 'center',
          gap: '20px', paddingTop: '48px', borderTop: '1px solid var(--border)', textAlign: 'center',
        }}>
          <h3 style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: '36px' }}>NOT QUITE RIGHT?</h3>
          <p style={{ color: 'var(--muted)', maxWidth: '400px', fontSize: '14px' }}>
            Tweak your profile and get a fresh set of personalised recommendations.
          </p>
          <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap', justifyContent: 'center' }}>
            <Link to="/upload" className="btn-primary">Try Different Style</Link>
            <Link to="/saved" className="btn-ghost">View Saved Outfits</Link>
          </div>
        </div>

      </div>
    </main>
  );
}
