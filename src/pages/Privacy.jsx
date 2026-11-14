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
            <em style={{ fontFamily: "'DM Serif Display', serif", color: 'var(--red-text)', fontStyle: 'italic' }}>
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
            <li>Visit counts — we keep anonymous totals (for example how many times a page or product was viewed, and how many people added to the bag) on our own server. They contain no name, email, IP address or cookie and cannot be tied back to you. If your browser sends Do Not Track or Global Privacy Control, nothing is counted.</li>
          </ul>
        </Section>

        <Section title="Saved addresses, bag reminders, referrals and gift cards">
          <p>Saved addresses stay in your browser's localStorage on your device; we never receive them until you place an order. If you tick "remind me" at checkout, we keep your email and bag for up to {STORE.abandonedBag?.maxDays} days and send at most one reminder, then delete the bag. Withdraw consent any time by emailing us. Referral and gift-card codes are stored with a hash of the email address they relate to, so we can enforce one-per-customer rules and check balances. Coupon use is tracked against hashed email and phone, not in plain text.</p>
        </Section>

        <Section title="Accounts, reviews and questions">
          <p>If you sign in, we keep your email address, a hashed index of your orders, and a sign-in cookie (HttpOnly, strictly for keeping you signed in, {STORE.accounts?.sessionDays} days). There is no password. A review shows your first name and last initial and "verified buyer"; never your email. Questions you ask are shown with your first name once we answer them. You can ask us to delete your reviews, questions or account data at any time. Return and exchange requests are kept with the order for our records and tax purposes.</p>
        </Section>

        <Section title="Offer emails">
          <p>Only if you tick "Email me new drops and offers" at checkout, we keep your name, email and the time you agreed, and may send you offers. Every email has an unsubscribe link; after you use it we do not send you offers again unless you tick the box on a later order. Order and delivery emails are separate and are not affected. Invoices are generated from your order and kept for our tax records.</p>
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
            <li><strong style={{ color: 'var(--text)', fontWeight: 500 }}>Vercel</strong> — hosts the application. See <a href="https://vercel.com/legal/privacy-policy" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--red-text)' }}>Vercel's Privacy Policy</a>.</li>
            <li><strong style={{ color: 'var(--text)', fontWeight: 500 }}>Razorpay</strong> — processes payments. Card, UPI and bank details are entered in Razorpay's window and never reach us. See Razorpay's privacy policy.</li>
            <li><strong style={{ color: 'var(--text)', fontWeight: 500 }}>Upstash</strong> — database where we keep order records and rate-limit counters (stored as hashed IPs).</li>
            <li><strong style={{ color: 'var(--text)', fontWeight: 500 }}>Resend</strong> — sends order confirmation emails.</li>
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
          Questions? Email us at <a href={`mailto:${STORE.supportEmail}`} style={{ color: 'var(--red-text)' }}>{STORE.supportEmail}</a>.
        </Section>
      </div>
    </main>
  );
}
