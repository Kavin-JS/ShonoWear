# Shonowear: shop + style assistant

A complete small online shop for India. React + Vite frontend, Vercel serverless API, **Razorpay** payments, **Upstash Redis** for orders and stock, **Resend** for emails.

Two kinds of products live side by side in `src/data/catalog.js`:

| Kind | How it sells | Fields |
|---|---|---|
| **Own stock** | Customer pays you on this site; you ship it. | `fulfilment: 'own'`, `platform: 'Shonowear'`, `sizes: { M: 8, L: 5 }`, no `affiliateUrl` |
| **Affiliate** | "Buy" opens Amazon/Myntra through your affiliate link; you earn a commission. | `affiliateUrl`, `platform` |

Look and feel: a light, app-style shop that follows the device's dark mode: announcement strip, sticky header with live search suggestions, category bar, banner carousel, product rails, filter sidebar (bottom sheet on phones), wishlist hearts, a mobile bottom tab bar, and a sticky buy bar on phones. No fake ratings or discounts are shown; the strike-through price appears only if you add a real `mrp` to a product.

Also included: search and filters, product pages with live per-size stock, bag, "Shono" style assistant (rule-based, not an AI model, no API cost), outfit finder, an original WebGL hero (Three.js, desktop only), order pages, order tracking, policies, and a token-protected `/admin` page.

## What is and isn't verified

- **Tested here (91 unit/integration tests + a 20-step browser run):** price/amount computed on the server, forged payment signatures rejected, overselling prevented, holds expire, webhook idempotency, crash recovery, customer privacy, admin throttling, mobile layout. Razorpay itself was **simulated** (fake order API and a stubbed checkout popup that signs payments the way Razorpay does).
- **Not verified, because it can't be from here:** a real Razorpay payment, the real webhook delivery to Vercel, the exact domains Razorpay's popup needs under the Content-Security-Policy, and Vercel's header behaviour. **Do the test-mode checklist below before going live.** If the payment popup is blocked, open the browser console, look for a "Refused to ..." CSP message and add that domain in `vercel.json`.
- **Not legal advice.** The policy pages are sensible starting text, not reviewed by a lawyer. Selling goods needs a business registration, and GST registration/invoicing if you cross the threshold or sell inter-state through marketplaces. Check with an accountant and a lawyer.

## Run it locally

```fish
npm install
npm run dev            # website only (checkout needs the API)
cp .env.example .env.local   # fill in Razorpay TEST keys; Upstash is optional locally
npm run build; and npm run dev:api   # site + API on http://localhost:8787 (in-memory store without Upstash)
npm run verify         # tests + catalogue check + build
```

Browser test (needs `npm i -D playwright` and `npx playwright install chromium`): `npm run e2e`.

## Go live

1. **Fill `src/data/storeConfig.js`**: legal name, address, support email/phone, GSTIN, shipping fee and times, return days.
2. **Catalogue**: delete the three `[SAMPLE]` products, add your own with real photos (put images in `public/`), real prices and per-size stock. Replace the placeholder Amazon tag `shonowear-21` with your Associates tag. Add `public/og-image.jpg` (1200×630).
3. `npm run check:launch` must pass. It fails on samples, placeholders and the placeholder tag.
4. **Accounts**
   - **Upstash**: create a Redis database (region near you), copy the REST URL and token.
   - **Razorpay**: finish KYC. Start with **Test mode** keys. In *Settings → Payment capture* keep **auto-capture on** (the site treats a verified payment as paid).
   - **Resend**: verify your sending domain.
5. **Vercel**: import the repo, add every variable from `.env.example`, deploy. Vercel's free Hobby plan is for non-commercial use, so check Vercel's terms and use a paid plan for a real business. This project uses 9 of Hobby's 12 functions.
6. **Webhook**: Razorpay Dashboard → Webhooks → URL `https://YOUR-DOMAIN/api/razorpay-webhook`, events `payment.captured` and `order.paid`, secret = `RAZORPAY_WEBHOOK_SECRET`. It is what confirms orders when a customer closes the tab after paying.

### Test-mode checklist (do all of it)
- [ ] Pay with a Razorpay test UPI/card. Order page shows "Thank you"; you and the customer get emails.
- [ ] Close the popup mid-payment: stock is released, bag is kept.
- [ ] Pay, then close the tab before the redirect: the webhook still marks the order paid (Razorpay Dashboard → Webhooks shows 200).
- [ ] `/admin`: enter your token, mark an order shipped with a tracking number; the customer's order page shows it.
- [ ] Browser console on `/checkout` shows no CSP errors while the popup opens.
- [ ] Only then switch to **live keys**. Samples are refused under live keys as a safety net.

## Running the shop

- **Orders**: `/admin` (token kept in memory only). Orders flagged `paid-after-hold-expired`, `paid-after-cancel` or `oversold-needs-review` need a human decision: ship, or refund.
- **Refunds** are manual in the Razorpay dashboard. Cancelling a paid order in `/admin` does **not** refund the customer and does **not** restock.
- **Stock** comes from the catalogue file. Changing it means editing `catalog.js` and redeploying. Units already sold are tracked separately in Redis, so editing totals is safe.
- **Stock holds**: 15 minutes while paying, one open hold per visitor. Someone with many IPs could still tie up stock briefly; keep an eye on abandoned orders.
- **Emails are best-effort.** If Resend is down, the order is still recorded; the admin page is the source of truth.
- Order links are unguessable 96-bit tokens; the public page hides phone, email and street address.

## Shopping features (section A)
- **Gallery**: add `images: [url, url, ...]` to a product. Swipe on phones, hover-zoom and a full-screen viewer on desktop.
- **Size guide**: set `sizeChart: 'tops' | 'bottoms' | 'footwear'` or your own `{title, columns, rows}`. The built-in charts are generic. **Replace them with your real measurements** before launch. "Find my size" is an estimate.
- **Colour variants**: give products of the same design the same `colorGroup`; swatches link between them.
- **Bundle discount**: buying 2 or more own-stock items takes 10% off, calculated on the server. Edit or disable it (`percent: 0`) in `storeConfig.js`.
- **Delivery estimate**: business-day estimate from the pincode using `deliveryDays`. It is not a courier serviceability check; connect a courier API later for exact dates.
- **Back-in-stock and low-stock alerts**: customers sign up on sold-out sizes. Open `/admin` to see the waitlist and send alerts (only sent for sizes that are back in stock). A low-stock email goes to you when a size falls to `lowStockThreshold`. Both need Resend configured.
- **Collections, filters, quick view, recently viewed, "New" badge** (`addedAt`, 30 days) work from catalogue data with no setup.
- Optional `mrp` shows a strike-through price only when it is a real integer above the price.

## Known limits
- `npm audit` reports a moderate react-router 6 advisory (open redirect via backslash in `<Link>`). The site never passes user input to links or `navigate`, so it isn't reachable here; upgrading to v7 is a later job.
- Order list in `/admin` shows the latest 200 orders (Redis keeps 1,000).
- Product images from Unsplash are placeholders; use your own photos.
- The assistant is keyword-based and says so when it doesn't understand.
- No discount codes, accounts or inventory sync with marketplaces yet (coupons arrive in section B, accounts in C).
