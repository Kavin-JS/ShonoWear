import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { getSavedOutfits, unsaveOutfit } from '../lib/savedOutfits.js';
import OutfitCard from '../components/OutfitCard.jsx';

export default function SavedOutfits() {
  const [saved, setSaved] = useState([]);

  useEffect(() => {
    setSaved(getSavedOutfits());
  }, []);

  function handleRemove(productId) {
    const updated = unsaveOutfit(productId);
    setSaved(updated);
  }

  return (
    <main id="main" className="page" style={{ paddingTop: '100px' }}>
      <div className="container">

        {/* Header */}
        <div style={{ marginBottom: '56px' }}>
          <div className="eyebrow fade-up">Your Wardrobe</div>
          <h1
            className="fade-up fade-up-1"
            style={{
              fontFamily: "'Bebas Neue', sans-serif",
              fontSize: 'clamp(44px, 7vw, 88px)',
              lineHeight: 0.95,
            }}
          >
            SAVED
            <br />
            <em style={{ fontFamily: "'DM Serif Display', serif", color: 'var(--red-text)', fontStyle: 'italic' }}>
              Looks
            </em>
          </h1>
        </div>

        {/* Empty state */}
        {saved.length === 0 ? (
          <div
            style={{
              textAlign: 'center',
              padding: '80px 40px',
              border: '1px dashed var(--border2)',
              borderRadius: '8px',
              background: 'var(--surface)',
            }}
          >
            <div style={{ fontSize: '56px', marginBottom: '24px' }}>🗂️</div>
            <h2
              style={{
                fontFamily: "'Bebas Neue', sans-serif",
                fontSize: '40px',
                marginBottom: '16px',
              }}
            >
              WARDROBE IS EMPTY
            </h2>
            <p style={{ color: 'var(--muted)', marginBottom: '32px', maxWidth: '360px', margin: '0 auto 32px' }}>
              Get outfit recommendations and tap the ♡ on any outfit to save it here.
            </p>
            <Link to="/upload" className="btn-primary">
              Get My Outfits
            </Link>
          </div>
        ) : (
          <>
            <p style={{ color: 'var(--muted)', marginBottom: '32px', fontSize: '14px' }}>
              {saved.length} {saved.length === 1 ? 'outfit' : 'outfits'} saved
            </p>

            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))',
                gap: '20px',
                marginBottom: '48px',
              }}
            >
              {saved.map((outfit, index) => (
                <OutfitCard
                  key={outfit.id}
                  product={outfit}
                  animationDelay={index * 0.08}
                />
              ))}
            </div>

            <div style={{ textAlign: 'center' }}>
              <Link to="/upload" className="btn-ghost">
                Get More Recommendations
              </Link>
            </div>
          </>
        )}

      </div>
    </main>
  );
}
