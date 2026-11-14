/**
 * Customer account API (one function, to stay inside the 12-function limit on Vercel Hobby).
 *   GET  ?action=me | orders | reviewable | returns | reviews&product=ID | qa&product=ID
 *   POST {action:'login', email} | {action:'verify', token} | {action:'logout'}
 *        {action:'review', productId, rating, title, body, name} | {action:'ask', productId, question, name}
 *        {action:'return', orderId, kind, items:[{id,size,qty}], reason, note, newSize}
 */
import { preflight, storeAvailable, rateLimit, ipKey, hash, log, IS_PROD } from '../server/guard.js';
import { STORE } from '../src/data/storeConfig.js';
import { startLogin, consumeLogin, createSession, cookieHeader, sessionEmail, endSession, ordersFor, normEmail, COOKIE } from '../server/accounts.js';
import { publicView } from '../server/orders.js';
import { sendLoginEmail, emailConfigured, sendReturnUpdate } from '../server/notify.js';
import { validEmail } from '../server/waitlist.js';
import { submitReview, publicReviews, reviewable, askQuestion, publicQuestions } from '../server/reviews.js';
import { unsubscribe } from '../server/marketing.js';
import { requestReturn, returnsFor, returnWindow, publicReturn } from '../server/returns.js';

const err = (res, status, error) => res.status(status).json({ error });

export default async function handler(req, res) {
  if (!preflight(req, res, { methods: ['GET', 'POST'], maxBytes: 4 * 1024 })) return;
  if (!storeAvailable()) return err(res, 503, 'Unavailable.');
  if (STORE.accounts?.enabled === false) return err(res, 404, 'Accounts are off.');
  const action = String((req.method === 'GET' ? req.query?.action : req.body?.action) || '');
  const b = req.body || {};
  try {
    const ip = ipKey(req);
    const rl = await rateLimit('acct', ip, 120, 600);
    if (rl.limited) return err(res, 429, 'Too many requests. Please wait a few minutes.');

    /* public reads */
    if (req.method === 'GET' && action === 'reviews') return res.status(200).json(await publicReviews(String(req.query.product || '')));
    if (req.method === 'GET' && action === 'qa') return res.status(200).json({ questions: await publicQuestions(String(req.query.product || '')) });

    if (action === 'login') {
      const email = normEmail(b.email);
      if (!validEmail(email)) return err(res, 400, 'Enter a valid email address.');
      const a = await rateLimit('login-ip', ip, 6, 600), c = await rateLimit('login-mail', hash(email, 'lm').slice(0, 24), 4, 3600);
      if (a.limited || c.limited) return err(res, 429, 'Too many sign-in emails. Please wait a while and try again.');
      const token = await startLogin(email);
      let sent = false;
      if (emailConfigured() && process.env.SITE_URL) { try { await sendLoginEmail({ to: email, token }); sent = true; } catch (e) { log('login_email_failed', { msg: e.message }); } }
      // the same answer whether or not the email exists, and the link is never in the answer in production
      return res.status(200).json({ ok: true, ...(!IS_PROD && !sent ? { devToken: token } : {}), ...(IS_PROD && !sent ? { warning: 'Email is not set up on this site yet.' } : {}) });
    }
    if (action === 'verify') {
      const v = await rateLimit('login-verify', ip, 20, 600);
      if (v.limited) return err(res, 429, 'Too many attempts.');
      const email = await consumeLogin(b.token);
      if (!email) return err(res, 400, 'This sign-in link has expired or was already used. Ask for a new one.');
      const { sid, maxAge } = await createSession(email);
      res.setHeader('Set-Cookie', cookieHeader(sid, maxAge));
      return res.status(200).json({ ok: true, email });
    }
    if (action === 'logout') {
      await endSession(req);
      res.setHeader('Set-Cookie', `${COOKIE}=; HttpOnly; Path=/api; Max-Age=0; SameSite=Lax`);
      return res.status(200).json({ ok: true });
    }

    if (action === 'unsubscribe') {
      const u = await rateLimit('unsub', ip, 20, 600);
      if (u.limited) return err(res, 429, 'Too many attempts.');
      const done = await unsubscribe(normEmail(b.email), b.token);
      return done ? res.status(200).json({ ok: true }) : err(res, 400, 'This unsubscribe link is not valid. Write to us and we will remove you.');
    }

    /* everything below needs a signed-in customer */
    const email = await sessionEmail(req);
    if (action === 'me') return res.status(200).json({ email: email || null });
    if (!email) return err(res, 401, 'Please sign in.');

    if (req.method === 'GET' && action === 'orders') {
      const orders = await ordersFor(email);
      const rets = await returnsFor(email);
      return res.status(200).json({ email, orders: orders.map(o => ({ ...publicView(o), deliveredAt: o.deliveredAt || null, returnable: returnWindow(o), openReturn: rets.find(r => r.orderId === o.id && ['requested', 'approved', 'received'].includes(r.status)) || null })) });
    }
    if (req.method === 'GET' && action === 'reviewable') return res.status(200).json({ products: await reviewable(email) });
    if (req.method === 'GET' && action === 'returns') return res.status(200).json({ returns: await returnsFor(email) });

    if (action === 'review') {
      const l = await rateLimit('review', hash(email, 'rv').slice(0, 24), 10, 3600);
      if (l.limited) return err(res, 429, 'Too many reviews. Try again later.');
      const r = await submitReview(email, b);
      return r.ok ? res.status(200).json({ ok: true, pending: r.pending }) : err(res, r.status, r.error);
    }
    if (action === 'ask') {
      const l = await rateLimit('ask', hash(email, 'qa').slice(0, 24), 5, 86400);
      if (l.limited) return err(res, 429, 'You have asked a lot of questions today. Please try again tomorrow.');
      const r = await askQuestion(email, String(b.productId || ''), b.question, b.name);
      return r.ok ? res.status(200).json({ ok: true }) : err(res, r.status, r.error);
    }
    if (action === 'return') {
      const l = await rateLimit('return', hash(email, 'rt').slice(0, 24), 15, 3600);
      if (l.limited) return err(res, 429, 'Too many requests. Try again later.');
      const r = await requestReturn(email, b);
      if (!r.ok) return err(res, r.status, r.error);
      sendReturnUpdate(r.request).catch(() => {});
      return res.status(200).json({ ok: true, request: publicReturn(r.request) });
    }
    return err(res, 400, 'Unknown action.');
  } catch (e) {
    log('account_error', { msg: e.message });
    return err(res, 500, 'Something went wrong. Please try again.');
  }
}
