/**
 * Admin API (Bearer ADMIN_TOKEN).
 *   GET  /api/admin/orders                         → latest orders (full details)
 *   GET  /api/admin/orders?view=waitlist           → back-in-stock sign-ups per product+size
 *   POST /api/admin/orders {action:'notify-waitlist', productId, size} → email the waiting customers (only if restocked)
 *   POST /api/admin/orders {id, action, courier?, tracking?}
 *        action: shipped | delivered | cancelled   (cancel of a paid order does NOT refund: refund in Razorpay)
 * Fails closed if ADMIN_TOKEN is unset or short. Wrong guesses are rate limited per IP.
 */
import { preflight, storeAvailable, rateLimit, ipKey, safeEqual, log } from '../../server/guard.js';
import { getOrder, saveOrder, listOrders, restockCod, closeCodSlot } from '../../server/orders.js';
import { listReviewsAdmin, moderateReview, listQuestionsAdmin, answerQuestion } from '../../server/reviews.js';
import { listReturnsAdmin, updateReturn } from '../../server/returns.js';
import { sendShippedEmail, sendDeliveredEmail, sendReturnUpdate } from '../../server/notify.js';
import { trackUrl } from '../../src/lib/courier.js';
import { funnel } from '../../server/analytics.js';
import { recentProblems, health } from '../../server/monitor.js';
import { dumpAll, seal, summarise } from '../../server/backup.js';
import { sendBackupEmail } from '../../server/notify.js';
import { dashboard, productsAdmin, updateProduct, resetProduct, importCsv, exportProductsCsv, exportCustomersCsv, customers, invoiceFor } from '../../server/adminOps.js';
import { refundOrder, refundList } from '../../server/refunds.js';
import { sendCampaign, campaignLog } from '../../server/marketing.js';
import { slipHtml } from '../../src/lib/invoice.js';
import { listWaitlist, notifyWaitlist, validEmail } from '../../server/waitlist.js';
import { issueGiftCard, listGiftCards, voidGift } from '../../server/giftcards.js';
import { sendGiftCardEmail } from '../../server/notify.js';
import { rewardReferrer } from '../../server/promos.js';
import { countDue, sendReminders } from '../../server/bags.js';
import { COUPONS } from '../../server/couponsConfig.js';
import { store } from '../../server/guard.js';
import { STORE } from '../../src/data/storeConfig.js';

const clean = (v, n) => String(v ?? '').replace(/[\u0000-\u001F\u007F]/g, ' ').trim().slice(0, n);

export default async function handler(req, res) {
  if (!preflight(req, res, { methods: ['GET', 'POST'], maxBytes: 48 * 1024 })) return;
  const token = process.env.ADMIN_TOKEN || '';
  if (token.length < 24 || !storeAvailable()) return res.status(503).json({ error: 'Admin is not configured.' });

  try {
    const rl = await rateLimit('admin', ipKey(req), 30, 600);
    if (rl.limited) return res.status(429).json({ error: 'Too many attempts.' });
  } catch { return res.status(503).json({ error: 'Unavailable.' }); }

  const given = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');

  // Daily backup e-mail, called by the Vercel cron job (it sends CRON_SECRET). Only ever e-mails an ENCRYPTED file.
  const cron = process.env.CRON_SECRET || '';
  if (req.method === 'GET' && req.query?.view === 'backup-cron' && cron.length >= 16 && safeEqual(given, cron)) {
    try {
      const pass = process.env.BACKUP_PASSPHRASE || '';
      if (pass.length < 12) { log('backup_error', { msg: 'BACKUP_PASSPHRASE missing or shorter than 12 characters: backup not emailed' }); return res.status(412).json({ error: 'Set BACKUP_PASSPHRASE (12+ characters) first.' }); }
      const dump = await dumpAll(); const buf = seal(dump, pass);
      await sendBackupEmail({ file: { name: `shonowear-backup-${dump.createdAt.slice(0, 10)}.swb`, base64: buf.toString('base64') }, summary: summarise(dump) });
      return res.status(200).json({ ok: true, ...summarise(dump), bytes: buf.length });
    } catch (e) { log('backup_error', { msg: String(e?.message || e) }); return res.status(500).json({ error: 'Backup failed.' }); }
  }

  if (!safeEqual(given, token)) { log('admin_bad_token'); return res.status(401).json({ error: 'Unauthorized' }); }

  try {
    if (req.method === 'GET') {
      const v = req.query?.view;
      if (v === 'dashboard') return res.status(200).json({ ...(await dashboard()), traffic: await funnel(), problems: await recentProblems(), health: await health() });
      if (v === 'backup') {
        const pass = process.env.BACKUP_PASSPHRASE || '';
        const dump = await dumpAll(); const buf = seal(dump, pass.length >= 12 ? pass : '');
        if (buf.length > 3 * 1024 * 1024) return res.status(413).json({ error: 'The backup is too big to download here. Run "node scripts/backup.mjs" on your computer instead (see the README).' });
        return res.status(200).json({ name: `shonowear-backup-${dump.createdAt.slice(0, 10)}${pass.length >= 12 ? '.swb' : '.json.gz'}`, base64: buf.toString('base64'), encrypted: pass.length >= 12, ...summarise(dump) });
      }
      if (v === 'products') return res.status(200).json({ products: await productsAdmin() });
      if (v === 'customers') return res.status(200).json({ customers: await customers(), campaigns: await campaignLog() });
      if (v === 'export-products') return res.status(200).json({ csv: await exportProductsCsv() });
      if (v === 'export-customers') return res.status(200).json({ csv: await exportCustomersCsv() });
      if (v === 'invoice' || v === 'slip') {
        const o = await getOrder(String(req.query.id || ''));
        if (!o) return res.status(404).json({ error: 'Order not found.' });
        if (v === 'slip') return res.status(200).json({ html: slipHtml({ order: o, seller: { email: STORE.supportEmail, whatsapp: STORE.whatsapp } }) });
        if (!['paid', 'cod_placed', 'shipped', 'delivered'].includes(o.status)) return res.status(409).json({ error: 'Only placed orders get an invoice.' });
        const { invoiceHtml } = await import('../../src/lib/invoice.js');
        return res.status(200).json({ html: invoiceHtml(await invoiceFor(o)), refunds: await refundList(o.id) });
      }
      if (req.query?.view === 'waitlist') return res.status(200).json({ waitlist: await listWaitlist() });
      if (req.query?.view === 'reviews') return res.status(200).json({ reviews: await listReviewsAdmin(), questions: await listQuestionsAdmin() });
      if (req.query?.view === 'returns') return res.status(200).json({ returns: await listReturnsAdmin() });
      if (req.query?.view === 'offers') {
        const coupons = [];
        for (const c of COUPONS) { const [used] = await store([['HLEN', `cpn:used:${c.code}`]]); coupons.push({ code: c.code, label: c.label, active: c.active, sample: Boolean(c.sample), used: Number(used), limit: c.usageLimit || null }); }
        return res.status(200).json({ coupons, giftCards: await listGiftCards(100), bagsDue: await countDue() });
      }
      return res.status(200).json({ orders: await listOrders(200) });
    }
    if (req.body?.action === 'notify-waitlist') {
      const r = await notifyWaitlist(String(req.body.productId || ''), req.body.size);
      return res.status(r.ok ? 200 : 409).json(r);
    }

    if (req.body?.action === 'issue-giftcard') {
      const amount = Number(req.body.amount), email = String(req.body.email || '').trim().toLowerCase();
      if (!Number.isInteger(amount) || amount < 1 || amount > 50000) return res.status(400).json({ error: 'Amount must be a whole number of rupees, up to 50,000.' });
      if (email && !validEmail(email)) return res.status(400).json({ error: 'That email address is not valid.' });
      const card = await issueGiftCard({ amount, source: 'admin', note: clean(req.body.note, 120), email });
      let emailed = false;
      if (email) { try { await sendGiftCardEmail({ to: email, amount, code: card.code, expiresAt: card.expiresAt, message: clean(req.body.note, 200), url: (process.env.SITE_URL || '').replace(/\/+$/, '') }); emailed = true; } catch { /* shown to the owner below */ } }
      return res.status(200).json({ card, emailed });
    }
    if (req.body?.action === 'product-update') {
      const b = req.body;
      const r = await updateProduct(String(b.id || ''), { price: b.price, mrp: b.mrp, available: b.available, clearMrp: Boolean(b.clearMrp) });
      return res.status(r.ok ? 200 : (r.status || 400)).json(r.ok ? { ok: true } : { error: r.error });
    }
    if (req.body?.action === 'product-reset') {
      const r = await resetProduct(String(req.body.id || ''));
      return res.status(r.ok ? 200 : (r.status || 400)).json(r.ok ? { ok: true } : { error: r.error });
    }
    if (req.body?.action === 'csv-import') {
      const r = await importCsv(String(req.body.csv || ''), { dryRun: req.body.dryRun !== false });
      return res.status(r.ok ? 200 : (r.status || 400)).json(r);
    }
    if (req.body?.action === 'refund') {
      const r = await refundOrder(String(req.body.id || ''), req.body.amount, { reason: clean(req.body.reason, 100) });
      if (r.ok && req.body.rid) {
        const u = await updateReturn(String(req.body.rid), 'refunded', { note: clean(req.body.note, 300), refundAmount: r.refund.amount });
        if (u.ok) sendReturnUpdate(u.request).catch(() => {});
        return res.status(200).json({ ...r, returnUpdated: u.ok });
      }
      return res.status(r.ok ? 200 : (r.status || 400)).json(r.ok ? r : { error: r.error });
    }
    if (req.body?.action === 'campaign') {
      const r = await sendCampaign({ subject: req.body.subject, body: req.body.body, test: Boolean(req.body.test) });
      return res.status(r.ok ? 200 : (r.status || 400)).json(r.ok ? r : { error: r.error });
    }
    if (req.body?.action === 'review-moderate') {
      const r = await moderateReview(String(req.body.productId || ''), String(req.body.key || ''), String(req.body.decision || ''));
      return res.status(r.ok ? 200 : 404).json(r);
    }
    if (req.body?.action === 'qa-answer') {
      const r = await answerQuestion(String(req.body.productId || ''), String(req.body.qid || ''), req.body.answer === null ? null : String(req.body.answer ?? ''));
      return res.status(r.ok ? 200 : 400).json(r);
    }
    if (req.body?.action === 'return-update') {
      const r = await updateReturn(String(req.body.rid || ''), String(req.body.status || ''), { note: req.body.note, refundAmount: req.body.refundAmount });
      if (r.ok) sendReturnUpdate(r.request).catch(() => {});
      return res.status(r.ok ? 200 : (r.status || 400)).json(r.ok ? { request: r.request } : { error: r.error });
    }
    if (req.body?.action === 'send-bag-reminders') {
      const r = await sendReminders();
      return res.status(r.ok ? 200 : 409).json(r);
    }

    const { id, action } = req.body || {};
    const order = await getOrder(String(id || ''));
    if (!order) return res.status(404).json({ error: 'Order not found.' });

    const allowed = {
      shipped:   ['paid', 'cod_placed'],
      delivered: ['paid', 'shipped', 'cod_placed'],
      cancelled: ['paid', 'pending_payment', 'expired', 'cod_placed', 'shipped'],
      'cod-collected': ['delivered'],
    };
    if (typeof action !== 'string' || !Object.hasOwn(allowed, action) || !allowed[action].includes(order.status)) return res.status(409).json({ error: `Cannot mark a ${order.status} order as ${action}.` });

    if (action === 'cod-collected') {
      if (order.payment?.method !== 'cod') return res.status(409).json({ error: 'Only cash-on-delivery orders have cash to collect.' });
      const done = { ...order, codCollectedAt: new Date().toISOString() };
      await saveOrder(done);
      return res.status(200).json({ order: done });
    }
    if (action === 'shipped' && order.status === 'shipped') return res.status(409).json({ error: 'Already shipped.' });
    const next = { ...order, status: action };
    if (action === 'cancelled') next.cancelledBy = 'admin';
    if (action === 'delivered') next.deliveredAt = new Date().toISOString();
    if (action === 'shipped') next.shipment = { courier: clean(req.body.courier, 40), tracking: clean(req.body.tracking, 60), shippedAt: new Date().toISOString() };
    await saveOrder(next);
    // Side effects after the status is saved. A COD order that never arrived puts its stock and coupon use back;
    // a cancelled gift-card purchase voids the card; a delivered referred order pays the referrer once.
    let reward = null;
    if (action === 'cancelled' && order.payment?.method === 'cod') await restockCod(order);
    else if (order.payment?.method === 'cod' && action === 'delivered') await closeCodSlot(order);
    if (action === 'cancelled' && order.kind === 'giftcard' && order.giftcardCode) await voidGift(order.giftcardCode);
    if (action === 'delivered') reward = await rewardReferrer(next).catch(() => null);
    // customer emails are best effort: a failed email never undoes the status change
    if (action === 'shipped' && order.kind !== 'giftcard') sendShippedEmail(next, trackUrl(next.shipment.courier, next.shipment.tracking)).catch(() => {});
    if (action === 'delivered' && order.kind !== 'giftcard') sendDeliveredEmail(next).catch(() => {});
    res.status(200).json({ order: next, ...(reward?.ok ? { referralReward: true } : {}) });
  } catch (err) {
    log('admin_error', { msg: err.message });
    res.status(500).json({ error: 'Failed.' });
  }
}
