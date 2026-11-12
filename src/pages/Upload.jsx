import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Analytics } from '../lib/analytics.js';
import { saveLastProfile, loadLastProfile, saveSessionProfile, loadSessionProfile } from '../lib/session.js';

const AESTHETICS = [
  { value: 'streetwear', label: 'Streetwear',  emoji: '🧢', desc: 'Oversized, bold, graphic-heavy' },
  { value: 'minimal',    label: 'Minimal',      emoji: '⬜', desc: 'Clean lines, neutral tones' },
  { value: 'bold',       label: 'Bold',          emoji: '🔥', desc: 'Statement pieces, colour' },
  { value: 'classic',    label: 'Classic',       emoji: '🎩', desc: 'Timeless, polished fits' },
];
const OCCASIONS = [
  { value: 'casual',    label: 'Casual',     emoji: '☀️', desc: 'Everyday hangouts' },
  { value: 'datenight', label: 'Date Night', emoji: '🌙', desc: 'Evening plans' },
  { value: 'work',      label: 'Work',       emoji: '💼', desc: 'Office / meetings' },
  { value: 'festival',  label: 'Festival',   emoji: '🎉', desc: 'Events, parties, drops' },
];
const BUDGETS = [
  { value: 'low',  label: 'Under ₹1,500',    emoji: '💰' },
  { value: 'mid',  label: '₹1,500 – ₹5,000', emoji: '💳' },
  { value: 'high', label: '₹5,000+',          emoji: '✨' },
];
const BODY_TYPES = [
  { value: 'lean',      label: 'Lean',      desc: 'Slim frame, low bulk' },
  { value: 'athletic',  label: 'Athletic',  desc: 'Broad shoulders, defined' },
  { value: 'stocky',    label: 'Stocky',    desc: 'Compact, solid build' },
  { value: 'heavyset',  label: 'Heavyset',  desc: 'Larger, fuller frame' },
];
const SKIN_TONES = [
  { value: 'fair',          label: 'Fair',         hex: '#FDDBB4' },
  { value: 'light brown',   label: 'Light Brown',  hex: '#D4956A' },
  { value: 'medium brown',  label: 'Medium Brown', hex: '#A0522D' },
  { value: 'dark brown',    label: 'Dark Brown',   hex: '#6B3A2A' },
  { value: 'deep',          label: 'Deep',         hex: '#3B1F1A' },
];
const GENDERS = [
  { value: 'male',   label: 'Male' },
  { value: 'female', label: 'Female' },
  { value: 'other',  label: 'Other' },
];

/* ── Sub-components ──────────────────────────────────────── */

function StepBar({ current }) {
  return (
    <div style={{ display: 'flex', gap: '6px', marginBottom: '44px', justifyContent: 'center' }}>
      {[0, 1].map(i => (
        <div key={i} style={{
          height: '3px', borderRadius: '2px',
          width: i === current ? '40px' : '20px',
          background: i <= current ? 'var(--red)' : 'var(--border2)',
          opacity: i <= current ? 1 : 0.4,
          transition: 'all 0.3s',
        }} />
      ))}
    </div>
  );
}

function PageHeader({ eyebrow, title, italic, sub }) {
  return (
    <div style={{ marginBottom: '44px', textAlign: 'center' }}>
      <div className="eyebrow fade-up" style={{ justifyContent: 'center' }}>{eyebrow}</div>
      <h1 className="fade-up fade-up-1" style={{
        fontFamily: "'Bebas Neue', sans-serif",
        fontSize: 'clamp(40px, 7vw, 72px)',
        lineHeight: 0.95, marginBottom: '12px',
      }}>
        {title}{' '}
        <em style={{ fontFamily: "'DM Serif Display', serif", color: 'var(--red)', fontStyle: 'italic' }}>
          {italic}
        </em>
      </h1>
      <p style={{ color: 'var(--muted)', fontSize: '14px' }}>{sub}</p>
    </div>
  );
}

function Label({ children, sub }) {
  return (
    <div style={{ marginBottom: '14px' }}>
      <div style={{
        fontSize: '11px', fontWeight: 600, letterSpacing: '0.12em',
        textTransform: 'uppercase', color: 'var(--muted)',
      }}>{children}</div>
      {sub && <p style={{ fontSize: '12px', color: 'var(--muted2)', marginTop: '3px' }}>{sub}</p>}
    </div>
  );
}

function OptionBtn({ selected, onClick, emoji, label, desc, hex }) {
  return (
    <button type="button" onClick={onClick} style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      gap: '7px', padding: '18px 12px',
      background: selected ? 'var(--red-dim)' : 'var(--surface)',
      border: `1px solid ${selected ? 'rgba(232,21,58,0.5)' : 'var(--border)'}`,
      borderRadius: '6px', cursor: 'pointer', transition: 'all 0.15s',
      width: '100%', color: selected ? 'var(--text)' : 'var(--muted)',
    }}>
      {hex && (
        <div style={{
          width: '30px', height: '30px', borderRadius: '50%', background: hex,
          border: `2px solid ${selected ? 'var(--red)' : 'transparent'}`,
          transition: 'border-color 0.15s', flexShrink: 0,
        }} />
      )}
      {emoji && <span style={{ fontSize: '22px' }}>{emoji}</span>}
      <span style={{ fontWeight: 500, fontSize: '12px', color: 'var(--text)', textAlign: 'center' }}>{label}</span>
      {desc && <span style={{ fontSize: '11px', color: 'var(--muted)', textAlign: 'center', lineHeight: 1.4 }}>{desc}</span>}
    </button>
  );
}

function NumberField({ label, value, onChange, unit, min, max, placeholder }) {
  return (
    <div style={{ flex: 1 }}>
      <div style={{
        fontSize: '11px', fontWeight: 600, letterSpacing: '0.1em',
        textTransform: 'uppercase', color: 'var(--muted)', marginBottom: '8px',
      }}>{label}</div>
      <div style={{ position: 'relative' }}>
        <input
          type="number"
          value={value}
          onChange={e => onChange(e.target.value)}
          min={min} max={max} placeholder={placeholder}
          style={{
            width: '100%',
            background: 'var(--surface)',
            border: '1px solid var(--border2)',
            borderRadius: '6px',
            padding: '13px 40px 13px 14px',
            color: 'var(--text)', fontSize: '15px',
            fontFamily: "'Poppins', sans-serif",
            outline: 'none', transition: 'border-color 0.2s',
          }}
          onFocus={e => e.target.style.borderColor = 'rgba(232,21,58,0.5)'}
          onBlur={e => e.target.style.borderColor = 'var(--border2)'}
        />
        <span style={{
          position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)',
          fontSize: '11px', color: 'var(--muted)', pointerEvents: 'none',
        }}>{unit}</span>
      </div>
    </div>
  );
}

function ErrorBox({ msg }) {
  if (!msg) return null;
  return (
    <div style={{
      background: 'rgba(232,21,58,0.1)', border: '1px solid rgba(232,21,58,0.3)',
      borderRadius: '4px', padding: '11px 14px', color: 'var(--red)',
      fontSize: '13px', marginBottom: '22px',
    }}>{msg}</div>
  );
}

/* ── STEP 1 ───────────────────────────────────────────────── */
function StepPhysical({ data, onChange, onNext }) {
  const [error, setError] = useState('');

  function next() {
    if (!data.gender)                              return setError('Please select your gender.');
    if (!data.height || data.height < 100 || data.height > 250) return setError('Enter a valid height (100–250 cm).');
    if (!data.weight || data.weight < 30  || data.weight > 200) return setError('Enter a valid weight (30–200 kg).');
    if (!data.bodyType)                            return setError('Please select your body type.');
    if (!data.skinTone)                            return setError('Please select your skin tone.');
    setError('');
    onNext();
  }

  return (
    <div>
      <PageHeader eyebrow="Step 1 of 2" title="YOUR" italic="Body" sub="Helps the AI understand your frame. Shapes every pick." />

      <div className="fade-up fade-up-1" style={{ marginBottom: '32px' }}>
        <Label>Gender</Label>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px' }}>
          {GENDERS.map(g => (
            <OptionBtn key={g.value} selected={data.gender === g.value}
              onClick={() => onChange({ ...data, gender: g.value })} label={g.label} />
          ))}
        </div>
      </div>

      <div className="fade-up fade-up-2" style={{ display: 'flex', gap: '14px', marginBottom: '32px' }}>
        <NumberField label="Height" value={data.height}
          onChange={v => onChange({ ...data, height: v })} unit="cm" min={100} max={250} placeholder="175" />
        <NumberField label="Weight" value={data.weight}
          onChange={v => onChange({ ...data, weight: v })} unit="kg" min={30} max={200} placeholder="68" />
      </div>

      <div className="fade-up fade-up-3" style={{ marginBottom: '32px' }}>
        <Label sub="How would you describe your natural build?">Body Type</Label>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: '10px' }}>
          {BODY_TYPES.map(b => (
            <OptionBtn key={b.value} selected={data.bodyType === b.value}
              onClick={() => onChange({ ...data, bodyType: b.value })} label={b.label} desc={b.desc} />
          ))}
        </div>
      </div>

      <div className="fade-up fade-up-4" style={{ marginBottom: '36px' }}>
        <Label sub="Used for colour matching.">Skin Tone</Label>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(90px, 1fr))', gap: '10px' }}>
          {SKIN_TONES.map(s => (
            <OptionBtn key={s.value} selected={data.skinTone === s.value}
              onClick={() => onChange({ ...data, skinTone: s.value })} label={s.label} hex={s.hex} />
          ))}
        </div>
      </div>

      <ErrorBox msg={error} />
      <button type="button" className="btn-primary" onClick={next}
        style={{ width: '100%', justifyContent: 'center', padding: '17px' }}>
        Next: Style Preferences →
      </button>
    </div>
  );
}

/* ── STEP 2 ───────────────────────────────────────────────── */
function StepStyle({ data, onChange, preview, setPreview, fileName, setFileName, onSubmit, onBack }) {
  const fileRef = useRef(null);
  const [error, setError] = useState('');

  function handleFile(file) {
    if (!file) return;
    if (!file.type.startsWith('image/')) return setError('Please select a JPG, PNG, or WEBP image.');
    if (file.size > 10 * 1024 * 1024) return setError('Image must be under 10MB.');
    setError('');
    setFileName(file.name);
    if (preview) URL.revokeObjectURL(preview);
    setPreview(URL.createObjectURL(file));
  }

  function submit(e) {
    e.preventDefault();
    if (!data.aesthetic) return setError('Please select your aesthetic.');
    if (!data.occasion)  return setError('Please select an occasion.');
    if (!data.budget)    return setError('Please select your budget.');
    setError('');
    onSubmit();
  }

  const isReady = data.aesthetic && data.occasion && data.budget;

  return (
    <form onSubmit={submit}>
      <PageHeader eyebrow="Step 2 of 2" title="YOUR" italic="Vibe" sub="Three quick questions. A photo is optional." />

      {/* Photo upload */}
      <div className="fade-up fade-up-1" style={{ marginBottom: '32px' }}>
        <Label>Your Photo (optional)</Label>
        <div
          onClick={() => fileRef.current?.click()}
          onDrop={e => { e.preventDefault(); handleFile(e.dataTransfer.files[0]); }}
          onDragOver={e => e.preventDefault()}
          style={{
            border: `2px dashed ${preview ? 'rgba(232,21,58,0.5)' : 'var(--border2)'}`,
            borderRadius: '8px',
            padding: preview ? '0' : '44px 28px',
            textAlign: 'center', cursor: 'pointer',
            background: preview ? 'transparent' : 'var(--surface)',
            overflow: 'hidden', position: 'relative',
          }}
        >
          {preview ? (
            <div style={{ position: 'relative' }}>
              <img src={preview} alt="Upload preview"
                style={{ width: '100%', maxHeight: '300px', objectFit: 'cover', display: 'block' }} />
              <div style={{
                position: 'absolute', inset: 0, background: 'rgba(7,7,15,0.5)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                opacity: 0, transition: 'opacity 0.2s',
              }}
                onMouseEnter={e => e.currentTarget.style.opacity = 1}
                onMouseLeave={e => e.currentTarget.style.opacity = 0}
              >
                <span style={{
                  background: 'var(--red)', color: '#fff', padding: '9px 22px',
                  borderRadius: '3px', fontSize: '12px', fontWeight: 600,
                  letterSpacing: '0.08em', textTransform: 'uppercase',
                }}>Change Photo</span>
              </div>
            </div>
          ) : (
            <>
              <div style={{
                width: '48px', height: '48px', borderRadius: '50%',
                background: 'var(--red-dim)', border: '1px solid rgba(232,21,58,0.25)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                margin: '0 auto 14px',
              }}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--red)" strokeWidth="2">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                  <polyline points="17 8 12 3 7 8"/>
                  <line x1="12" y1="3" x2="12" y2="15"/>
                </svg>
              </div>
              <div style={{ fontWeight: 500, marginBottom: '5px', fontSize: '14px' }}>Drop your photo here</div>
              <div style={{ fontSize: '12px', color: 'var(--muted)' }}>JPG, PNG, WEBP · Max 10MB</div>
            </>
          )}
        </div>
        <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp"
          onChange={e => handleFile(e.target.files[0])} style={{ display: 'none' }} />
        {preview && <div style={{ marginTop: '7px', fontSize: '12px', color: 'var(--red)' }}>✓ {fileName}</div>}
      </div>

      {/* Aesthetic */}
      <div className="fade-up fade-up-2" style={{ marginBottom: '32px' }}>
        <Label sub="What style speaks to you?">Q1 — Your Aesthetic</Label>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: '10px' }}>
          {AESTHETICS.map(o => (
            <OptionBtn key={o.value} selected={data.aesthetic === o.value}
              onClick={() => onChange({ ...data, aesthetic: o.value })}
              emoji={o.emoji} label={o.label} desc={o.desc} />
          ))}
        </div>
      </div>

      {/* Occasion */}
      <div className="fade-up fade-up-3" style={{ marginBottom: '32px' }}>
        <Label sub="What are you dressing for?">Q2 — Occasion</Label>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: '10px' }}>
          {OCCASIONS.map(o => (
            <OptionBtn key={o.value} selected={data.occasion === o.value}
              onClick={() => onChange({ ...data, occasion: o.value })}
              emoji={o.emoji} label={o.label} desc={o.desc} />
          ))}
        </div>
      </div>

      {/* Budget */}
      <div className="fade-up fade-up-4" style={{ marginBottom: '40px' }}>
        <Label sub="Per outfit, roughly?">Q3 — Budget</Label>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: '10px' }}>
          {BUDGETS.map(o => (
            <OptionBtn key={o.value} selected={data.budget === o.value}
              onClick={() => onChange({ ...data, budget: o.value })}
              emoji={o.emoji} label={o.label} />
          ))}
        </div>
      </div>

      <ErrorBox msg={error} />

      <button type="submit" className="btn-primary" disabled={!isReady}
        style={{ width: '100%', justifyContent: 'center', padding: '17px' }}>
        {isReady ? 'Get My Outfits →' : 'Complete all fields above'}
      </button>
      <p style={{ textAlign: 'center', fontSize: '11px', color: 'var(--muted2)', marginTop: '12px' }}>
        Optional preview only. Your photo stays on your device and is not used to pick outfits yet.
      </p>

      <button type="button" onClick={onBack} style={{
        display: 'block', margin: '14px auto 0', background: 'none', border: 'none',
        color: 'var(--muted)', fontSize: '12px', cursor: 'pointer', letterSpacing: '0.04em',
      }}>← Back to body profile</button>
    </form>
  );
}

/* ── Main Upload Page ─────────────────────────────────────── */
export default function Upload() {
  const navigate = useNavigate();
  const [step, setStep] = useState(1);

  // Pre-fill from last session if available
  // Full profile only lives in this tab; across visits we only remember style preferences.
  const lastProfile = loadSessionProfile() || loadLastProfile();
  const [physical, setPhysical] = useState({
    gender:   lastProfile?.gender    || '',
    height:   lastProfile?.height    || '',
    weight:   lastProfile?.weight    || '',
    bodyType: lastProfile?.bodyType  || '',
    skinTone: lastProfile?.skinTone  || '',
  });
  const [style, setStyle] = useState({
    aesthetic: lastProfile?.aesthetic || '',
    occasion:  lastProfile?.occasion  || '',
    budget:    lastProfile?.budget    || '',
  });
  const [preview, setPreview] = useState(null);
  const [fileName, setFileName] = useState('');

  // Free the blob URL when the photo changes or the page closes.
  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview); }, [preview]);

  function handleSubmit() {
    Analytics.formCompleted(style.aesthetic, style.occasion, style.budget);
    const fullProfile = {
      gender:      physical.gender,
      height:      Number(physical.height),
      weight:      Number(physical.weight),
      bodyType:    physical.bodyType,
      skinTone:    physical.skinTone,
      aesthetic:   style.aesthetic,
      occasion:    style.occasion,
      budget:      style.budget,
      preferences: [style.aesthetic, style.occasion],
    };
    saveLastProfile(fullProfile);        // preferences only (24h)
    saveSessionProfile(fullProfile);     // everything, this tab only
    navigate('/results');
  }

  return (
    <main id="main" className="page" style={{ paddingTop: '100px' }}>
      <div className="container" style={{ maxWidth: '680px' }}>
        <StepBar current={step - 1} />
        {step === 1 && (
          <StepPhysical data={physical} onChange={setPhysical} onNext={() => setStep(2)} />
        )}
        {step === 2 && (
          <StepStyle
            data={style} onChange={setStyle}
            preview={preview} setPreview={setPreview}
            fileName={fileName} setFileName={setFileName}
            onSubmit={handleSubmit}
            onBack={() => setStep(1)}
          />
        )}
      </div>
    </main>
  );
}
