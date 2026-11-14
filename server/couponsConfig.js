/*
  SHONOWEAR — your coupon codes (server only: customers never see this list)
  { code, label, kind: 'percent' | 'flat', value, minSubtotal?, maxDiscount?, startsAt?, endsAt?, usageLimit?,
    oncePerCustomer?, firstOrderOnly?, stackWithBundle?, active }
  - value is a percent (10 = 10%) or whole rupees for 'flat'.
  - minSubtotal counts only items that are not on flash sale.
  - By default a coupon does NOT stack with the bundle discount: the customer gets whichever is bigger.
    Set stackWithBundle: true to give both.
  - usageLimit is the total number of orders that can ever use it; oncePerCustomer uses the email and phone number.
  - Entries with sample: true work only in test mode; `npm run check:launch` fails until you remove them.
*/
export const COUPONS = [
  { code: 'WELCOME10', sample: true, label: '10% off your first order', kind: 'percent', value: 10, minSubtotal: 799, maxDiscount: 300, oncePerCustomer: true, firstOrderOnly: true, stackWithBundle: false, active: true },
  { code: 'FLAT150', sample: true, label: '₹150 off orders over ₹1,499', kind: 'flat', value: 150, minSubtotal: 1499, usageLimit: 25, stackWithBundle: false, active: true },
];
