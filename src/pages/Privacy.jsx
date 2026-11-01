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
    <main className="page" style={{ paddingTop: '100px' }}>
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
            Last updated: {new Date().toLocaleDateString('en-IN', { year: 'numeric', month: 'long', day: 'numeric' })}
          </p>
        </div>

        <Section title="Overview">
          Shonowear ("we", "our", "us") is committed to protecting your privacy. This policy explains what data
          we collect, how we use it, and your rights.
        </Section>

        <Section title="Photos">
          <p>Your photo is <strong style={{ color: 'var(--text)', fontWeight: 500 }}>never uploaded to our servers</strong>. It is
          processed entirely within your browser as a local object URL and is discarded when you close or refresh the page.
          We do not store, transmit, or share your photo with any third party.</p>
        </Section>

        <Section title="Data we collect">
          <p>We collect minimal data to operate the service:</p>
          <ul style={{ paddingLeft: '20px', marginTop: '8px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <li>Style preferences you enter (aesthetic, occasion, budget, body type) — stored in your browser's sessionStorage and cleared when your session ends.</li>
            <li>Outfits you save — stored in your browser's localStorage on your device only. We cannot access this data.</li>
            <li>Email address — only if you voluntarily submit it via our newsletter form.</li>
            <li>Basic analytics — page views and button clicks via our analytics provider (anonymous, no personal identifiers).</li>
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
            <li><strong style={{ color: 'var(--text)', fontWeight: 500 }}>Anthropic (Claude API)</strong> — processes your style profile to generate recommendations. No personal identifiers are sent. See <a href="https://www.anthropic.com/privacy" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--red)' }}>Anthropic's Privacy Policy</a>.</li>
            <li><strong style={{ color: 'var(--text)', fontWeight: 500 }}>Vercel</strong> — hosts the application. See <a href="https://vercel.com/legal/privacy-policy" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--red)' }}>Vercel's Privacy Policy</a>.</li>
            <li><strong style={{ color: 'var(--text)', fontWeight: 500 }}>Google Fonts</strong> — loads display fonts. Google may log font requests.</li>
          </ul>
        </Section>

        <Section title="Cookies">
          We do not set tracking cookies. Your browser's localStorage and sessionStorage are used only for
          session state and saved outfits, and are not accessible to us.
        </Section>

        <Section title="Children">
          Shonowear is not directed at children under 13. We do not knowingly collect data from children.
        </Section>

        <Section title="Your rights">
          Since we store no personal data server-side, there is nothing to delete or export on our end.
          You can clear saved outfits at any time by clearing your browser's localStorage.
          To remove your email from our mailing list, click the unsubscribe link in any email we send.
        </Section>

        <Section title="Changes">
          We may update this policy. Changes will be reflected with a new "Last updated" date at the top.
          Continued use of the service after changes constitutes acceptance.
        </Section>

        <Section title="Contact">
          Questions? Email us at <a href="mailto:hello@shonowear.com" style={{ color: 'var(--red)' }}>hello@shonowear.com</a>.
        </Section>
      </div>
    </main>
  );
}
