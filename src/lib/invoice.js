/**
 * SHONOWEAR — invoice maths and printable pages (shared by the server tests and the admin screen).
 * Prices on the site include GST. An invoice splits each line into taxable value + tax, allocating order discounts pro-rata.
 * All arithmetic is in whole paise so the lines always add up to the invoice total.
 * Without a GSTIN in storeConfig this produces a plain invoice with no tax lines.
 */
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const rs = (paise) => (paise / 100).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function slabRate(unitRupees, slabs) {
  for (const s of slabs) if (s.upTo === undefined || unitRupees <= s.upTo) return s.rate;
  return slabs[slabs.length - 1].rate;
}

/** Split `total` across weights, whole units, remainder to the largest share so the parts add up exactly. */
export function allocate(total, weights) {
  const sum = weights.reduce((a, b) => a + b, 0);
  if (!sum || total <= 0) return weights.map(() => 0);
  const parts = weights.map(w => Math.floor(total * w / sum));
  let rest = total - parts.reduce((a, b) => a + b, 0);
  const order = weights.map((w, i) => i).sort((a, b) => weights[b] - weights[a]);
  for (let k = 0; rest > 0; k = (k + 1) % order.length) { parts[order[k]] += 1; rest -= 1; }
  return parts;
}

/**
 * @param order  stored order (items, totals, customer.state)
 * @param opts   { gstin, gst: {sellerState, slabs, hsn}, categoryOf(id) }
 */
export function buildInvoice(order, { gstin = '', gst, categoryOf = () => 'top' }) {
  const t = order.totals || {};
  const registered = Boolean(gstin);
  const gross = order.items.map(i => Math.round(i.price * i.qty * 100));
  const discount = Math.round(Number(t.discount || 0) * 100);
  const disc = allocate(discount, gross);
  const goods = order.items.map((i, k) => {
    const incl = gross[k] - disc[k];
    const unit = incl / 100 / i.qty;
    return { name: i.name, size: i.size, qty: i.qty, id: i.id, hsn: gst?.hsn?.[categoryOf(i.id)] || '', incl, grossPaise: gross[k], discPaise: disc[k], rate: registered ? slabRate(unit, gst.slabs) : 0 };
  });
  const maxRate = goods.reduce((m, g) => Math.max(m, g.rate), 0);
  const service = Math.round((Number(t.shipping || 0) + Number(t.codFee || 0)) * 100);
  const lines = [...goods];
  if (service > 0) lines.push({ name: 'Shipping and handling', size: '', qty: 1, hsn: '', incl: service, grossPaise: service, discPaise: 0, rate: registered ? maxRate : 0, service: true });
  const intra = registered && String(order.customer?.state || '').toLowerCase() === String(gst?.sellerState || '').toLowerCase();
  let cgst = 0, sgst = 0, igst = 0, taxable = 0, total = 0;
  for (const l of lines) {
    l.taxable = registered ? Math.round(l.incl / (1 + l.rate / 100)) : l.incl;
    const tax = l.incl - l.taxable;
    if (intra) { l.cgst = Math.floor(tax / 2); l.sgst = tax - l.cgst; l.igst = 0; } else { l.cgst = 0; l.sgst = 0; l.igst = registered ? tax : 0; }
    cgst += l.cgst; sgst += l.sgst; igst += l.igst; taxable += l.taxable; total += l.incl;
  }
  return { registered, intra, lines, taxable, cgst, sgst, igst, total, giftApplied: Math.round(Number(t.giftApplied || 0) * 100) };
}

/** Standalone printable HTML for one invoice. `inv` = { number, date, seller, order, calc }. */
export function invoiceHtml(inv) {
  const { calc, order, seller } = inv, c = order.customer || {};
  const tax = calc.registered;
  const head = tax ? '<th>HSN</th><th class="r">Taxable</th>' + (calc.intra ? '<th class="r">CGST</th><th class="r">SGST</th>' : '<th class="r">IGST</th>') : '';
  const rows = calc.lines.map(l => `<tr><td>${esc(l.name)}${l.size ? ` (${esc(l.size)})` : ''}</td><td class="r">${l.qty}</td>${tax ? `<td>${esc(l.hsn)}</td><td class="r">${rs(l.taxable)}</td>${calc.intra ? `<td class="r">${rs(l.cgst)} <small>@${l.rate / 2}%</small></td><td class="r">${rs(l.sgst)} <small>@${l.rate / 2}%</small></td>` : `<td class="r">${rs(l.igst)} <small>@${l.rate}%</small></td>`}` : ''}<td class="r">${rs(l.incl)}</td></tr>`).join('');
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${tax ? 'Tax invoice' : 'Invoice'} ${esc(inv.number)}</title><style>
body{font:13px/1.5 system-ui,sans-serif;color:#111;max-width:780px;margin:24px auto;padding:0 16px}h1{font-size:20px;margin:0}table{width:100%;border-collapse:collapse;margin:14px 0}
th,td{border-bottom:1px solid #ccc;padding:6px 4px;text-align:left;vertical-align:top}.r{text-align:right}small{color:#555}.two{display:flex;justify-content:space-between;gap:16px;flex-wrap:wrap}
@media print{body{margin:0}button{display:none}}</style></head><body>
<button onclick="print()">Print</button>
<div class="two"><div><h1>${tax ? 'TAX INVOICE' : 'INVOICE'}</h1><div>No. <strong>${esc(inv.number)}</strong><br>Date ${esc(inv.date)}<br>Order ${esc(order.number)}</div></div>
<div class="r"><strong>${esc(seller.legalName)}</strong><br>${esc(seller.address)}${seller.gstin ? `<br>GSTIN ${esc(seller.gstin)}` : ''}<br>${esc(seller.email)}</div></div>
<p><strong>Bill to / ship to</strong><br>${esc(c.name)}<br>${esc(c.line1)}${c.line2 ? ', ' + esc(c.line2) : ''}<br>${esc(c.city)}, ${esc(c.state)} ${esc(c.pincode)}<br>${esc(c.phone)}</p>
<table><thead><tr><th>Item</th><th class="r">Qty</th>${head}<th class="r">Amount (₹)</th></tr></thead><tbody>${rows}</tbody></table>
<table style="width:auto;margin-left:auto">${tax ? `<tr><td>Taxable value</td><td class="r">${rs(calc.taxable)}</td></tr>${calc.intra ? `<tr><td>CGST</td><td class="r">${rs(calc.cgst)}</td></tr><tr><td>SGST</td><td class="r">${rs(calc.sgst)}</td></tr>` : `<tr><td>IGST</td><td class="r">${rs(calc.igst)}</td></tr>`}` : ''}
<tr><td><strong>Invoice total</strong></td><td class="r"><strong>${rs(calc.total)}</strong></td></tr>${calc.giftApplied ? `<tr><td>Paid by gift card</td><td class="r">${rs(calc.giftApplied)}</td></tr>` : ''}
<tr><td>${order.payment?.method === 'cod' ? 'To pay on delivery' : 'Paid online'}</td><td class="r">${rs(calc.total - calc.giftApplied)}</td></tr></table>
<p><small>${tax ? 'Prices include GST. ' : 'Seller is not registered under GST: no tax is charged or collected. '}Amount in rupees. This is a computer-generated invoice.</small></p></body></html>`;
}

export function slipHtml({ order, seller }) {
  const c = order.customer || {};
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Packing slip ${esc(order.number)}</title><style>
body{font:14px/1.5 system-ui,sans-serif;color:#111;max-width:520px;margin:20px auto;padding:0 14px}h1{font-size:18px;margin:0 0 6px}table{width:100%;border-collapse:collapse;margin:10px 0}td,th{border-bottom:1px solid #bbb;padding:6px 3px;text-align:left}
.box{border:2px solid #111;padding:8px;margin:8px 0}@media print{button{display:none}}</style></head><body><button onclick="print()">Print</button>
<h1>Packing slip · ${esc(order.number)}</h1>
<div class="box"><strong>Ship to</strong><br>${esc(c.name)} · ${esc(c.phone)}<br>${esc(c.line1)}${c.line2 ? ', ' + esc(c.line2) : ''}<br>${esc(c.city)}, ${esc(c.state)} ${esc(c.pincode)}</div>
${order.payment?.method === 'cod' ? `<div class="box"><strong>CASH ON DELIVERY: collect ₹${Number(order.totals.total).toLocaleString('en-IN')}</strong></div>` : ''}
<table><thead><tr><th>Item</th><th>Size</th><th>Qty</th><th>✓</th></tr></thead><tbody>${order.items.map(i => `<tr><td>${esc(i.name)}${i.preorder ? ` <small>(pre-order, ships ${esc(i.preorder)})</small>` : ''}</td><td>${esc(i.size)}</td><td>${i.qty}</td><td>☐</td></tr>`).join('')}</tbody></table>
<p>Return within the return window from delivery. Questions: ${esc(seller.email)}${seller.whatsapp ? ` · WhatsApp ${esc(seller.whatsapp)}` : ''}</p></body></html>`;
}
