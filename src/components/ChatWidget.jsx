import { useState, useEffect, useRef, useCallback } from 'react';
import { useLocation } from 'react-router-dom';
import { loadLastProfile, loadLastResults } from '../lib/session.js';
import { Analytics } from '../lib/analytics.js';

/*
  SHONO — floating AI stylist chat
  ─────────────────────────────────────────────────────────────
  - Talks to /api/chat (rate limited, capped, kill-switchable server-side)
  - Sends the saved style profile + ids of products currently shown,
    so answers are personal without the user retyping anything
  - Product cards come from the server, validated against the real
    catalog, so every link is a real affiliate link
  - History lives in sessionStorage only (clears when the tab closes)
  - All text is rendered as plain text. No HTML injection path.
*/

const STORAGE_KEY = 'shonowear_chat';
const MAX_STORED  = 30;
const MAX_CHARS   = 500;
const CLIENT_TIMEOUT_MS = 20_000;

const SUGGESTIONS = [
  'What should I wear for a date night?',
  'How do I style an oversized tee?',
  'Which colours suit my skin tone?',
  'Build me a look under ₹3,000',
];

/* ── storage helpers ───────────────────────────────────────── */
function loadChat() {
  try {
    const parsed = JSON.parse(sessionStorage.getItem(STORAGE_KEY) || '[]');
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(m => m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string');
  } catch {
    return [];
  }
}

function saveChat(messages) {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(messages.slice(-MAX_STORED)));
  } catch { /* storage full or blocked: chat still works, it just won't persist */ }
}

function buildContext() {
  let profile = null;
  try {
    const raw = sessionStorage.getItem('shonowear_profile');
    profile = raw ? JSON.parse(raw) : null;
  } catch { /* ignore */ }
  profile = profile || loadLastProfile();

  const ids = new Set();
  const results = loadLastResults();
  (results?.outfits || []).forEach(o => (o.items || []).forEach(i => i?.id && ids.add(i.id)));

  return { profile, outfitItemIds: [...ids].slice(0, 16) };
}

/* ── small pieces ──────────────────────────────────────────── */
function ProductCard({ product }) {
  const [imgOk, setImgOk] = useState(true);

  function shop() {
    Analytics.chatProductClicked(product.id, product.name, product.platform, product.price);
    window.open(product.affiliateUrl, '_blank', 'noopener,noreferrer');
  }

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: '10px',
      background: 'var(--bg3)', border: '1px solid var(--border)',
      borderRadius: '8px', padding: '8px',
    }}>
      {imgOk && (
        <img
          src={product.image} alt="" width="44" height="56"
          onError={() => setImgOk(false)}
          style={{ width: '44px', height: '56px', objectFit: 'cover', borderRadius: '4px', flexShrink: 0 }}
        />
      )}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: '9px', letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--red)' }}>
          {product.brand}
        </div>
        <div style={{
          fontSize: '12px', color: 'var(--text)', lineHeight: 1.3,
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>
          {product.name}
        </div>
        <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: '17px', letterSpacing: '0.02em', lineHeight: 1.1 }}>
          ₹{Number(product.price).toLocaleString('en-IN')}
        </div>
      </div>
      <button
        type="button" onClick={shop}
        style={{
          background: 'var(--red)', color: '#fff', border: 'none', borderRadius: '3px',
          padding: '8px 12px', fontSize: '10px', fontWeight: 600, letterSpacing: '0.08em',
          textTransform: 'uppercase', cursor: 'pointer', flexShrink: 0,
          fontFamily: "'Poppins', sans-serif",
        }}
      >
        Shop
      </button>
    </div>
  );
}

function Bubble({ message, onRetry }) {
  const isUser = message.role === 'user';
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: isUser ? 'flex-end' : 'flex-start', gap: '8px' }}>
      <div style={{
        maxWidth: '88%', padding: '10px 14px', fontSize: '13px', lineHeight: 1.6,
        whiteSpace: 'pre-wrap', wordBreak: 'break-word',
        borderRadius: isUser ? '14px 14px 3px 14px' : '14px 14px 14px 3px',
        background: isUser ? 'var(--red)' : 'var(--surface)',
        color: isUser ? '#fff' : 'var(--text)',
        border: isUser ? 'none' : `1px solid ${message.error ? 'rgba(232,21,58,0.35)' : 'var(--border)'}`,
      }}>
        {message.content}
      </div>

      {!isUser && message.products?.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', width: '92%' }}>
          {message.products.map(p => <ProductCard key={p.id} product={p} />)}
        </div>
      )}

      {!isUser && message.retryable && (
        <button
          type="button" onClick={onRetry}
          style={{
            background: 'none', border: '1px solid var(--border2)', color: 'var(--muted)',
            borderRadius: '3px', padding: '5px 12px', fontSize: '11px', cursor: 'pointer',
            letterSpacing: '0.06em', textTransform: 'uppercase', fontFamily: "'Poppins', sans-serif",
          }}
        >
          Try again
        </button>
      )}
    </div>
  );
}

/* ── main widget ───────────────────────────────────────────── */
export default function ChatWidget() {
  const location = useLocation();
  const [open, setOpen]         = useState(false);
  const [messages, setMessages] = useState(loadChat);
  const [input, setInput]       = useState('');
  const [loading, setLoading]   = useState(false);
  const endRef    = useRef(null);
  const inputRef  = useRef(null);
  const openedRef = useRef(false);

  // persist history
  useEffect(() => { saveChat(messages); }, [messages]);

  // keep newest message in view
  useEffect(() => {
    if (open) endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages, loading, open]);

  // focus input + analytics on open, close on Escape, lock page scroll on phones
  useEffect(() => {
    if (!open) return undefined;

    if (!openedRef.current) { openedRef.current = true; Analytics.chatOpened(); }
    const focusTimer = setTimeout(() => inputRef.current?.focus(), 80);

    const onKey = e => { if (e.key === 'Escape') setOpen(false); };
    window.addEventListener('keydown', onKey);

    const isPhone = window.matchMedia('(max-width: 600px)').matches;
    const prevOverflow = document.body.style.overflow;
    if (isPhone) document.body.style.overflow = 'hidden';

    return () => {
      clearTimeout(focusTimer);
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [open]);

  const send = useCallback(async (text, base) => {
    const content = String(text).trim().slice(0, MAX_CHARS);
    const history = base ?? messages;
    if (!content || loading) return;

    const next = [...history, { role: 'user', content }];
    setMessages(next);
    setInput('');
    setLoading(true);
    Analytics.chatMessageSent(next.filter(m => m.role === 'user').length);

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), CLIENT_TIMEOUT_MS);

    let assistant;
    try {
      const res = await fetch('/api/chat', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          // error bubbles never go back to the model as if it had said them
          messages: next.filter(m => !m.error).map(({ role, content: c }) => ({ role, content: c })),
          context:  buildContext(),
        }),
        signal: controller.signal,
      });
      const data = await res.json().catch(() => ({}));

      if (res.status === 429) {
        const mins = Math.max(1, Math.ceil((data.retryAfter || 600) / 60));
        assistant = {
          role: 'assistant', error: true,
          content: `You're sending messages quickly. Give me about ${mins} minute${mins > 1 ? 's' : ''} and ask again.`,
        };
      } else if (!res.ok) {
        assistant = { role: 'assistant', error: true, retryable: true, content: data.error || 'Something went wrong on my side.' };
      } else if (data.unavailable) {
        assistant = { role: 'assistant', error: true, content: data.reply };
      } else {
        assistant = { role: 'assistant', content: data.reply, products: Array.isArray(data.products) ? data.products : [] };
      }
    } catch (err) {
      assistant = {
        role: 'assistant', error: true, retryable: true,
        content: err?.name === 'AbortError'
          ? 'That took too long. Please try again.'
          : 'I could not connect. Check your internet and try again.',
      };
    } finally {
      clearTimeout(timer);
      setLoading(false);
    }

    setMessages(m => [...m, assistant]);
  }, [messages, loading]);

  function retryLast() {
    const idx = messages.map(m => m.role).lastIndexOf('user');
    if (idx < 0) return;
    send(messages[idx].content, messages.slice(0, idx));
  }

  function onSubmit(e) {
    e.preventDefault();
    send(input);
  }

  function onKeyDown(e) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(input); }
  }

  const hideLauncherOnPhone = location.pathname === '/upload'; // keeps it off the form's submit button

  return (
    <>
      {/* Launcher */}
      <button
        type="button"
        className={`sw-chat-launcher${open ? ' sw-open' : ''}${hideLauncherOnPhone ? ' sw-hide-phone' : ''}`}
        onClick={() => setOpen(v => !v)}
        aria-label={open ? 'Close AI stylist chat' : 'Open AI stylist chat'}
        aria-expanded={open}
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          {open
            ? <><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></>
            : <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />}
        </svg>
        <span className="sw-chat-launcher-label">{open ? 'Close' : 'Ask Shono'}</span>
      </button>

      {/* Panel */}
      {open && (
        <section className="sw-chat-panel" role="dialog" aria-label="Shono, AI stylist">
          <header style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '14px 16px', borderBottom: '1px solid var(--border)', flexShrink: 0,
          }}>
            <div>
              <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: '22px', letterSpacing: '0.06em', lineHeight: 1 }}>
                SHONO<span style={{ color: 'var(--red)' }}> · AI STYLIST</span>
              </div>
              <div style={{ fontSize: '11px', color: 'var(--muted)', marginTop: '3px' }}>
                Ask about fits, colours, occasions, budgets
              </div>
            </div>
            <div style={{ display: 'flex', gap: '4px' }}>
              {messages.length > 0 && (
                <button
                  type="button" onClick={() => setMessages([])}
                  style={{ background: 'none', border: 'none', color: 'var(--muted)', fontSize: '11px', cursor: 'pointer', padding: '8px', letterSpacing: '0.06em', textTransform: 'uppercase', fontFamily: "'Poppins', sans-serif" }}
                >
                  Clear
                </button>
              )}
              <button
                type="button" onClick={() => setOpen(false)} aria-label="Close chat"
                className="sw-chat-close"
                style={{ background: 'none', border: 'none', color: 'var(--text)', cursor: 'pointer', padding: '8px', fontSize: '20px', lineHeight: 1 }}
              >
                ✕
              </button>
            </div>
          </header>

          <div
            style={{ flex: 1, overflowY: 'auto', padding: '16px', display: 'flex', flexDirection: 'column', gap: '12px' }}
            aria-live="polite"
          >
            {messages.length === 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                <Bubble message={{
                  role: 'assistant',
                  content: "Hi, I'm Shono. Tell me what you're dressing for and I'll help you put it together. I can also pull real picks from the Shonowear catalog.",
                }} />
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                  {SUGGESTIONS.map(s => (
                    <button
                      key={s} type="button" onClick={() => send(s)}
                      style={{
                        background: 'var(--red-dim)', border: '1px solid rgba(232,21,58,0.25)',
                        color: 'var(--text)', borderRadius: '999px', padding: '7px 13px',
                        fontSize: '12px', cursor: 'pointer', textAlign: 'left',
                        fontFamily: "'Poppins', sans-serif",
                      }}
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {messages.map((m, i) => (
              <Bubble key={i} message={m} onRetry={retryLast} />
            ))}

            {loading && (
              <div className="sw-typing" aria-label="Shono is typing">
                <span /><span /><span />
              </div>
            )}
            <div ref={endRef} />
          </div>

          <form onSubmit={onSubmit} style={{ borderTop: '1px solid var(--border)', padding: '12px 14px 10px', flexShrink: 0 }}>
            <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-end' }}>
              <textarea
                ref={inputRef}
                value={input}
                onChange={e => setInput(e.target.value.slice(0, MAX_CHARS))}
                onKeyDown={onKeyDown}
                rows={1}
                placeholder="Ask Shono anything about style…"
                aria-label="Message to Shono"
                style={{
                  flex: 1, resize: 'none', maxHeight: '96px',
                  background: 'var(--surface)', border: '1px solid var(--border2)',
                  borderRadius: '8px', padding: '11px 12px', color: 'var(--text)',
                  fontSize: '16px', /* 16px stops iOS zooming into the field */
                  fontFamily: "'Poppins', sans-serif", outline: 'none',
                }}
                onFocus={e => { e.target.style.borderColor = 'rgba(232,21,58,0.5)'; }}
                onBlur={e => { e.target.style.borderColor = 'var(--border2)'; }}
              />
              <button
                type="submit" disabled={loading || !input.trim()} aria-label="Send message"
                style={{
                  background: 'var(--red)', border: 'none', color: '#fff', borderRadius: '8px',
                  width: '44px', height: '44px', cursor: loading || !input.trim() ? 'not-allowed' : 'pointer',
                  opacity: loading || !input.trim() ? 0.45 : 1, display: 'flex',
                  alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                }}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <line x1="22" y1="2" x2="11" y2="13" /><polygon points="22 2 15 22 11 13 2 9 22 2" />
                </svg>
              </button>
            </div>
            <p style={{ fontSize: '10px', color: 'var(--muted2)', marginTop: '8px', lineHeight: 1.5, textAlign: 'center' }}>
              AI stylist. Can make mistakes. Product links may be affiliate links.
            </p>
          </form>
        </section>
      )}

      <style>{`
        .sw-chat-launcher {
          position: fixed; right: 20px; bottom: 20px; z-index: 200;
          display: flex; align-items: center; gap: 8px;
          background: var(--red); color: #fff; border: none; cursor: pointer;
          height: 52px; padding: 0 20px; border-radius: 999px;
          font-family: 'Poppins', sans-serif; font-size: 12px; font-weight: 600;
          letter-spacing: 0.08em; text-transform: uppercase;
          box-shadow: 0 8px 28px rgba(232,21,58,0.35);
          transition: background 0.2s, transform 0.15s;
        }
        .sw-chat-launcher:hover { background: var(--red-hover); transform: translateY(-2px); }

        .sw-chat-panel {
          position: fixed; right: 20px; bottom: 84px; z-index: 200;
          width: 384px; height: min(580px, calc(100dvh - 110px));
          display: flex; flex-direction: column;
          background: var(--bg2); border: 1px solid var(--border2);
          border-radius: 14px; overflow: hidden;
          box-shadow: 0 24px 64px rgba(0,0,0,0.55);
          animation: sw-chat-in 0.18s ease-out;
        }
        .sw-chat-close { display: none !important; }

        @keyframes sw-chat-in { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: none; } }

        .sw-typing {
          display: inline-flex; gap: 5px; padding: 12px 14px; align-self: flex-start;
          background: var(--surface); border: 1px solid var(--border); border-radius: 14px 14px 14px 3px;
        }
        .sw-typing span {
          width: 6px; height: 6px; border-radius: 50%; background: var(--muted);
          animation: sw-bounce 1.1s infinite ease-in-out;
        }
        .sw-typing span:nth-child(2) { animation-delay: 0.15s; }
        .sw-typing span:nth-child(3) { animation-delay: 0.3s; }
        @keyframes sw-bounce { 0%, 80%, 100% { opacity: 0.3; transform: translateY(0); } 40% { opacity: 1; transform: translateY(-4px); } }

        @media (max-width: 600px) {
          .sw-chat-launcher { right: 16px; bottom: 16px; width: 52px; padding: 0; justify-content: center; }
          .sw-chat-launcher-label { display: none; }
          .sw-chat-launcher.sw-open { display: none; }       /* panel is full screen; it has its own close */
          .sw-chat-launcher.sw-hide-phone { display: none; }
          .sw-chat-panel { inset: 0; width: 100%; height: 100dvh; border-radius: 0; border: none; }
          .sw-chat-close { display: block !important; }
        }

        @media (prefers-reduced-motion: reduce) {
          .sw-chat-panel, .sw-typing span { animation: none; }
        }
      `}</style>
    </>
  );
}
