# Shonowear

AI outfit recommender and stylist chatbot for India. React + Vite frontend, Vercel serverless API, Claude for the AI, affiliate links for revenue.

---

## Deploy

1. Push to GitHub, then Vercel → New Project → import the repo (framework: Vite, auto-detected) → Deploy.
2. Set the environment variables below (Vercel → Settings → Environment Variables), then **redeploy**.
3. Enable Vercel Analytics (Dashboard → Analytics). The script is already in `index.html`.
4. Add `public/og-image.jpg` (1200×630) so WhatsApp/Instagram link previews work.

## Environment variables

| Variable | Required | What it does |
|---|---|---|
| `ANTHROPIC_API_KEY` | **Yes** | Claude API key. Server-side only, never sent to the browser. |
| `UPSTASH_REDIS_REST_URL` | **Strongly recommended** | From upstash.com (free tier is fine). |
| `UPSTASH_REDIS_REST_TOKEN` | **Strongly recommended** | Same. |
| `AI_ENABLED` | No | Set `false` to switch off ALL AI (outfits and chat) instantly. |
| `CHAT_ENABLED` | No | Set `false` to switch off only the chatbot. |
| `AI_DAILY_LIMIT` | No | Max AI outfit generations per day. Default 500. |
| `CHAT_DAILY_LIMIT` | No | Max chat messages per day. Default 1000. |
| `RECOMMEND_MODEL` / `CHAT_MODEL` | No | Override the Claude model per endpoint (see Cost). |
| `RESEND_API_KEY`, `RESEND_AUDIENCE_ID` | For email | Newsletter via Resend (double opt-in). |
| `MAILCHIMP_API_KEY`, `MAILCHIMP_LIST_ID` | For email | Alternative to Resend. |

**Without the two Upstash variables, per-IP rate limits and the daily caps are OFF.** The app still works, but nothing stops one person from running up your bill. Set them before you share the link publicly.

## Cost (read this before launch)

Rough figures at $3 per million input tokens and $15 per million output tokens (Sonnet-class list pricing; check the current pricing page, these change):

| Call | Typical tokens | Approx. cost |
|---|---|---|
| Outfit generation (`/api/recommend`) | ~3k in, ~1.5–2.5k out | ~$0.03–0.05 each |
| Chat message (`/api/chat`) | ~2.5–3k in, ≤450 out | ~$0.01 each |

Worst case per day at the default caps is roughly $25 for outfits plus $10 for chat. Start lower (`AI_DAILY_LIMIT=150`, `CHAT_DAILY_LIMIT=300`) and raise it as real affiliate clicks come in. Setting `CHAT_MODEL` to a smaller model cuts chat cost a lot; test the answer quality before switching.

## Revenue setup

Every Shop button is an affiliate link, and the chatbot's product cards use the same catalog links.

1. **Amazon Associates India** (affiliate-program.amazon.in): get your tag, then replace every `shonowear-21` in `src/data/catalog.js`.
2. **Myntra** via Admitad or vCommission: generate tracking links and replace the `myntra.com` URLs.
3. Add products by copying an object in `catalog.js` (unique `id`, correct `category`, one `color` tag). Both the outfit engine and the chatbot pick them up automatically.

Amazon requires an affiliate disclosure and a working Privacy page. Both exist (`/privacy`, `/terms`, and the chat footer note). Review the legal text with someone qualified before you rely on it.

## Chatbot ("Shono")

- Floating button on every page; full-screen on phones. Hidden on `/upload` on phones so it never covers the submit button.
- Answers are grounded on the real catalog. The model may tag a product as `{{sw-001}}`; the server validates each tag against the catalog, strips it from the text, and returns product cards with real affiliate links. It cannot invent a product or a link.
- Knows the user's saved style profile and which products are currently on screen (sent from the browser, validated server-side).
- Guards: 20 messages per IP per 10 min, daily cap, 15 s timeout, 500-char messages, 12-message history window, off-topic and prompt-injection refusal in the system prompt, plain-text rendering (no HTML injection path).
- History lives in `sessionStorage` only.

## Run locally

```bash
npm install
npm run dev            # frontend only (chat and AI fall back or show "unavailable")
npm i -g vercel
vercel dev             # frontend + /api/* ; put keys in .env.local
```

## Files

```
api/
  recommend.js     AI outfits (validation, Upstash limits, cost caps, timeout, fallback)
  chat.js          Stylist chatbot (same protections + catalog-grounded product cards)
  subscribe.js     Newsletter (honeypot, disposable-domain block, rate limit, double opt-in)
src/
  components/      Navbar, OutfitCard, ChatWidget, LoadingSpinner
  pages/           Home, Upload, Results, SavedOutfits, Privacy, Terms, NotFound
  lib/             recommendationEngine, session, savedOutfits, analytics
  data/catalog.js  Products (category + color tags + affiliate URLs)
```

## Analytics events (Vercel Analytics → Custom Events)

`form_completed`, `outfit_viewed`, `outfit_saved`, `outfit_buy_clicked`, `fallback_used`, `timeout_hit`, `email_subscribed`, `chat_opened`, `chat_message_sent`, `chat_product_clicked`.

The numbers that matter first: form_completed → outfit_viewed (funnel), outfit_buy_clicked per view (money), chat_product_clicked per chat_opened (does the bot sell).
