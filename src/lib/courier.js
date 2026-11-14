/* SHONOWEAR — courier tracking links. Free: we link to the courier's own tracking page (no paid tracking API). */
const COURIERS = [
  { match: /delhivery/i, url: (t) => `https://www.delhivery.com/track/package/${encodeURIComponent(t)}` },
  { match: /blue\s*dart/i, url: (t) => `https://www.bluedart.com/tracking?trackFor=0&trackNo=${encodeURIComponent(t)}` },
  { match: /dtdc/i, url: (t) => `https://www.dtdc.in/tracking/tracking_results.asp?strCnno=${encodeURIComponent(t)}` },
  { match: /india\s*post|speed\s*post/i, url: (t) => `https://www.indiapost.gov.in/_layouts/15/dop.portal.tracking/trackconsignment.aspx?id=${encodeURIComponent(t)}` },
  { match: /ecom/i, url: (t) => `https://ecomexpress.in/tracking/?awb_field=${encodeURIComponent(t)}` },
  { match: /xpress\s*bees/i, url: (t) => `https://www.xpressbees.com/shipment/tracking?awb=${encodeURIComponent(t)}` },
  { match: /shiprocket/i, url: (t) => `https://www.shiprocket.in/shipment-tracking/?awb=${encodeURIComponent(t)}` },
];
/** A tracking page for a courier name + number, or null when we don't know the courier (the number is still shown). */
export function trackUrl(courier, tracking) {
  const t = String(tracking || '').trim();
  if (!t || !/^[A-Za-z0-9-]{4,40}$/.test(t)) return null;
  const c = COURIERS.find(x => x.match.test(String(courier || '')));
  return c ? c.url(t) : null;
}
/** wa.me click-to-chat link for a number in digits with country code. No API needed; the customer starts the chat. */
export function waLink(number, text = '') {
  const n = String(number || '').replace(/\D/g, '');
  if (n.length < 10 || n.length > 15) return null;
  return `https://wa.me/${n}${text ? `?text=${encodeURIComponent(text)}` : ''}`;
}
