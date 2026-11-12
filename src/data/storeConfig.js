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
  lowStockThreshold: 2,            // you get an email when a size drops to this many or fewer
  maxQtyPerLine:    5,

  // How long stock is held while the customer pays (minutes)
  holdMinutes: 15,
};

export const hasPlaceholders = () =>
  Object.values(STORE).some(v => typeof v === 'string' && /YOUR/.test(v));
