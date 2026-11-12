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

export default function Privacy() {
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
            PRIVACY{' '}
            <em style={{ fontFamily: "'DM Serif Display', serif", color: 'var(--red)', fontStyle: 'italic' }}>
              Policy
            </em>
          </h1>
          <p style={{ color: 'var(--muted)', fontSize: '13px', marginTop: '12px' }}>
            Last updated: 7 November 2026
          </p>
        </div>

        <Section title="Overview">
          Shonowear ("we", "our", "us") is committed to protecting your privacy. This policy explains what data
          we collect, how we use it, and your rights.
        </Section>

        <Section title="Photos">
          <p>A photo is optional. If you choose one, it is shown as a preview in your browser only. It is <strong style={{ color: 'var(--text)', fontWeight: 500 }}>not uploaded to our servers</strong>, not sent to any AI service, and not used to choose outfits at the moment. It is discarded when you close or refresh the page.</p>
        </Section>

        <Section title="Data we collect">
          <p>Browsing, the style assistant and your profile are handled inside your browser. Only when you place an order or subscribe to emails does information reach our server:</p>
          <ul style={{ paddingLeft: '20px', marginTop: '8px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <li>Your profile (gender, height, weight, body type, skin tone, style, occasion, budget) stays in your tab's sessionStorage and is cleared when you close it. It is not sent anywhere.</li>
            <li>Style preferences (style, occasion, budget) and the outfits shown are kept in localStorage for 24 hours. Saved outfits and your shopping bag stay in localStorage until you remove them. The bag only holds product ids.</li>
            <li><strong style={{ color: 'var(--text)', fontWeight: 500 }}>Orders</strong> — if you buy an item we ship, we store your name, phone number, email, delivery address, the items and amounts, and the payment reference. We use it only to take payment, deliver your order, send order emails, handle returns and meet tax and legal obligations. Order records are kept for as long as the law requires.</li>
            <li>Email address — only if the newsletter box is shown and you submit it. It goes to our form provider.</li>
            <li><strong style={{ color: 'var(--text)', fontWeight: 500 }}>Back-in-stock alerts</strong> — if you ask to be told when a size returns, we store your email, the product and size. We use it only to send that one alert and then remove it. Your recently viewed items and delivery pincode stay in your browser and are not sent to us until you check delivery, and the pincode is not stored.</li>
            <li>Analytics — page views and button clicks through Vercel Web Analytics, which does not use cookies.</li>
          </ul>
        </Section>

        <Section title="Affiliate links">
          <p>Shonowear participates in the Amazon Associates Programme and may participate in other affiliate programmes.
          When you click a product link and make a purchase, we may earn a small commission at no additional cost to you.
          These commissions help us keep the service free.</p>
          <p style={{ marginTop: '8px' }}>Affiliate partners may set their own cookies when you click through. Their privacy
          policies govern any data they collect.</p>
        </Section>

        <Section title="Third-party services">
          <ul style={{ paddingLeft: '20px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <li><strong style={{ color: 'var(--text)', fontWeight: 500 }}>Vercel</strong> — hosts the application and provides analytics. See <a href="https://vercel.com/legal/privacy-policy" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--red)' }}>Vercel's Privacy Policy</a>.</li>
            <li><strong style={{ color: 'var(--text)', fontWeight: 500 }}>Razorpay</strong> — processes payments. Card, UPI and bank details are entered in Razorpay's window and never reach us. See Razorpay's privacy policy.</li>
            <li><strong style={{ color: 'var(--text)', fontWeight: 500 }}>Upstash</strong> — database where we keep order records and rate-limit counters (stored as hashed IPs).</li>
            <li><strong style={{ color: 'var(--text)', fontWeight: 500 }}>Resend</strong> — sends order confirmation emails.</li>
            <li><strong style={{ color: 'var(--text)', fontWeight: 500 }}>Google Fonts</strong> — loads display fonts. Google may log font requests.</li>
          </ul>
        </Section>

        <Section title="Cookies and storage">
          We do not set tracking cookies. We use your browser's localStorage and sessionStorage as described above. You can erase everything the app stores on your device with the "Clear my data from this device" button on the results page, or by clearing your browser's site data.
        </Section>

        <Section title="Children">
          Shonowear is not directed at children under 13. We do not knowingly collect data from children.
        </Section>

        <Section title="Your rights">
          We do not store your style profile or chats on a server. We do hold order records as described above. Data on your device can be cleared at any time as described above. To be removed from our mailing list, use the unsubscribe link in any email, or write to us and we will delete your address from our provider. You may also ask what we hold about you, ask for corrections, or ask for deletion; we will delete what we are not legally required to keep.
        </Section>

        <Section title="Changes">
          We may update this policy. Changes will be reflected with a new "Last updated" date at the top.
          Continued use of the service after changes constitutes acceptance.
        </Section>

        <Section title="Contact">
          Questions? Email us at <a href={`mailto:${STORE.supportEmail}`} style={{ color: 'var(--red)' }}>{STORE.supportEmail}</a>.
        </Section>
      </div>
    </main>
  );
}
