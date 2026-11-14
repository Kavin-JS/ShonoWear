import { STORE } from '../data/storeConfig.js';
import { Link } from 'react-router-dom';

function Section({ title, children }) {
  return (
    <div style={{ marginBottom: '40px' }}>
      <h2 style={{
        fontFamily: "'Poppins', sans-serif", fontSize: '16px',
        fontWeight: 600, marginBottom: '12px', color: 'var(--text)',
      }}>{title}</h2>
      <div style={{ fontSize: '14px', color: 'var(--muted)', lineHeight: 1.8 }}>
        {children}
      </div>
    </div>
  );
}

export default function Terms() {
  return (
    <main id="main" className="page" style={{ paddingTop: '100px' }}>
      <div className="container" style={{ maxWidth: '720px' }}>
        <div style={{ marginBottom: '48px' }}>
          <Link to="/" style={{ fontSize: '12px', color: 'var(--muted)', letterSpacing: '0.06em' }}>← Back to Home</Link>
          <h1 style={{
            fontFamily: "'Bebas Neue', sans-serif",
            fontSize: 'clamp(44px, 7vw, 72px)',
            lineHeight: 0.95, marginTop: '20px',
          }}>
            TERMS OF{' '}
            <em style={{ fontFamily: "'DM Serif Display', serif", color: 'var(--red-text)', fontStyle: 'italic' }}>
              Service
            </em>
          </h1>
          <p style={{ color: 'var(--muted)', fontSize: '13px', marginTop: '12px' }}>
            Last updated: {new Date().toLocaleDateString('en-IN', { year: 'numeric', month: 'long', day: 'numeric' })}
          </p>
        </div>

        <Section title="Acceptance">
          By using Shonowear ("the Service"), you agree to these terms. If you do not agree, do not use the Service.
        </Section>

        <Section title="What Shonowear does">
          Shonowear is an online shop and outfit recommendation website. Items marked "Ships from us" are sold and shipped by
          us and paid for on this site through Razorpay; see our Shipping and Returns policies. Other items are sold by third-party
          stores such as Amazon and Myntra, and those purchases are completed there under their own terms.
          Suggestions come from a rule-based style assistant, not a human stylist, and are for informational and
          entertainment purposes only. We do not guarantee that any product will be suitable, available, or correctly
          priced, and prices shown may be out of date.
        </Section>

        <Section title="Orders and payment">
          Prices are in Indian rupees. An order is accepted when payment is confirmed. We hold stock for a short time while you pay;
          if payment is not completed, the hold is released. If an item cannot be supplied after payment, we will refund you in full.
          We may cancel orders we suspect are fraudulent or that were priced in error, and will refund any payment taken.
        </Section>

        <Section title="Affiliate disclosure">
          Product links on Shonowear may be affiliate links. When you purchase through these links, Shonowear may
          earn a commission from Amazon or other retailers at no additional cost to you. Prices and availability
          are controlled by the retailer, not Shonowear.
        </Section>

        <Section title="User content">
          You may optionally select a photo for an on-device preview. Please only use a photo you have the right to use.
          Photos stay in your browser and are not uploaded, stored or transmitted. You retain all rights to your photo.
        </Section>

        <Section title="Prohibited use">
          <p>You may not:</p>
          <ul style={{ paddingLeft: '20px', marginTop: '8px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <li>Use the Service to generate content that violates any law</li>
            <li>Attempt to reverse-engineer, scrape, or overload the Service</li>
            <li>Use automated systems to access the Service without our written permission</li>
            <li>Misrepresent your identity or upload content belonging to others</li>
          </ul>
        </Section>

        <Section title="Disclaimers">
          The Service is provided "as is" without warranties of any kind. We do not warrant that the Service
          will be uninterrupted, error-free, or that AI recommendations will be accurate. Fashion advice from AI
          is subjective and may not suit your personal needs.
        </Section>

        <Section title="Offers, codes and gift cards">
          <p>Promo codes, referral codes and flash-sale prices are subject to their stated dates, minimum order values and usage limits, and cannot be combined unless stated. Sale items may be excluded from other discounts. We may cancel orders obtained through misuse of codes. Referral rewards are issued as gift cards once the referred order is delivered. Gift cards expire after {STORE.giftCards?.validMonths} months, are for use on this store only and are not redeemable for cash.</p>
        </Section>

        <Section title="Limitation of liability">
          To the maximum extent permitted by law, Shonowear shall not be liable for any indirect, incidental,
          special, or consequential damages arising from use of the Service, including but not limited to
          purchases made through affiliate links. Nothing here limits your rights under the Consumer Protection Act, 2019 or other
          laws that cannot be limited.
        </Section>

        <Section title="Changes to the Service">
          We may modify or discontinue the Service at any time without notice. We may also update these Terms;
          continued use after changes constitutes acceptance of the updated Terms.
        </Section>

        <Section title="Governing law">
          These Terms are governed by the laws of India. Any disputes shall be subject to the exclusive
          jurisdiction of the courts of India.
        </Section>

        <Section title="Contact">
          Questions about these Terms? Email <a href={`mailto:${STORE.supportEmail}`} style={{ color: 'var(--red-text)' }}>{STORE.supportEmail}</a>.
        </Section>
      </div>
    </main>
  );
}
