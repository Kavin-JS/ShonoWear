/*
  SHONOWEAR — store settings (shared by the website and the server)
  Edit this file before launch. Anything containing "YOUR" is a placeholder:
  `npm run check:launch` fails until they are replaced.
*/
export const STORE = {
  name: 'Shonowear',

  // Shown on the Contact / Policies pages and in order emails. Payment gateways require them.
  legalName:    'YOUR LEGAL BUSINESS NAME',
  gstin:        '',                              // leave empty if not GST-registered
  address:      'YOUR REGISTERED BUSINESS ADDRESS',
  supportEmail: 'support@YOUR-DOMAIN.com',
  supportPhone: '',

  // Pricing and fulfilment (rupees)
  freeShippingOver: 999,      // orders at or above this ship free
  shippingFee:      79,
  deliveryDays: [4, 7],            // business days, standard areas (keep in sync with deliveryEstimate)
  remoteExtraDays: 3,              // extra business days for remote pincodes
  deliveryEstimate: '4–7 business days',
  returnDays:       7,        // days after delivery
  // Buy minQty or more items we ship, get percent off the items (not shipping). Set percent: 0 to turn it off.
  bundleDiscount: { minQty: 2, percent: 10 },
  // Customer accounts: passwordless sign-in by an emailed link (needs Resend). Reviews are only from customers whose order was delivered.
  accounts: { enabled: true, loginMinutes: 15, sessionDays: 30 },
  reviews: { enabled: true, moderate: true },   // moderate: true = you approve each review in /admin before it shows
  returns: { enabled: true, reasons: ['Does not fit', 'Not as described', 'Damaged or defective', 'Wrong item received', 'Changed my mind'], allowExchange: true },
  whatsapp: '',                                 // your number with country code, digits only, e.g. '919876543210'. Adds a "Chat on WhatsApp" button. Leave empty to hide.
  // GST on invoices. ONLY used when `gstin` above is filled in. The rates below follow the rule for garments and footwear
  // (5% up to ₹2,500 per piece, 18% above). Rates and HSN codes change: have your accountant confirm them before you issue real invoices.
  gst: {
    sellerState: 'Tamil Nadu',                   // where you are registered; decides CGST+SGST (same state) or IGST (other state)
    slabs: [{ upTo: 2500, rate: 5 }, { rate: 18 }],
    hsn: { top: '6109', bottom: '6203', footwear: '6403', outerwear: '6201', set: '6211', accessory: '6217' },
    invoicePrefix: 'SW',
  },
  // Sale-priced items are left out of bundle and coupon discounts unless this is true.
  stackOnSale: false,
  // Cash on delivery. The customer pays the courier; you carry the risk of refused parcels, so keep limits sensible.
  cod: { enabled: true, fee: 49, maxOrder: 5000, maxOpenPerPhone: 2, blockedPincodePrefixes: [] },
  // Gift cards you sell and customers redeem on this site only (a closed, store-only voucher).
  giftCards: { enabled: true, amounts: [500, 1000, 2000, 5000], validMonths: 12 },
  // Friend gets friendOff on a first order of minSubtotal+; the referrer gets store credit once that order is delivered.
  referral: { enabled: true, friendOff: 100, minSubtotal: 999, referrerReward: 100, maxRewardsPerReferrer: 10 },
  // Reminder email for customers who tick the box at checkout and then leave. You send them from /admin.
  abandonedBag: { enabled: true, minHours: 2, maxDays: 7 },
  lowStockThreshold: 2,            // you get an email when a size drops to this many or fewer
  maxQtyPerLine:    5,

  // How long stock is held while the customer pays (minutes)
  holdMinutes: 15,
};

export const hasPlaceholders = () =>
  Object.values(STORE).some(v => typeof v === 'string' && /YOUR/.test(v));
