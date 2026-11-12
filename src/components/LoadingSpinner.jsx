import { useState, useEffect } from 'react';

const MESSAGES = [
  'Reading your style profile...',
  'Analyzing body proportions...',
  'Matching your aesthetic...',
  'Checking your budget range...',
  'Curating 4 outfits...',
  'Almost ready...',
];

export default function LoadingSpinner() {
  const [messageIndex, setMessageIndex] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setMessageIndex((i) => (i + 1) % MESSAGES.length);
    }, 500);
    return () => clearInterval(interval);
  }, []);

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '32px',
        padding: '80px 40px',
        minHeight: '60vh',
        textAlign: 'center',
      }}
    >
      {/* Animated ring */}
      <div style={{ position: 'relative', width: '72px', height: '72px' }}>
        <div className="spinner" />
        <div
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '24px',
          }}
        >
          ✦
        </div>
      </div>

      {/* Processing text */}
      <div>
        <div
          style={{
            fontFamily: "'Bebas Neue', sans-serif",
            fontSize: '32px',
            letterSpacing: '0.04em',
            marginBottom: '12px',
          }}
        >
          STYLING YOU
        </div>
        <div
          key={messageIndex}
          style={{
            fontSize: '13px',
            color: 'var(--muted)',
            letterSpacing: '0.06em',
            animation: 'fadeUp 0.3s ease forwards',
            minHeight: '20px',
          }}
        >
          {MESSAGES[messageIndex]}
        </div>
      </div>

      {/* Progress dots */}
      <div style={{ display: 'flex', gap: '8px' }}>
        {[0, 1, 2, 3].map((i) => (
          <div
            key={i}
            style={{
              width: '6px',
              height: '6px',
              borderRadius: '50%',
              background: i === messageIndex % 4 ? 'var(--red)' : 'var(--muted2)',
              transition: 'background 0.3s',
            }}
          />
        ))}
      </div>
    </div>
  );
}
