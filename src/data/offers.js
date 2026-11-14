/*
  SHONOWEAR — flash sales (edit this file; it is public, it ships to the browser)
  A sale lowers the unit price of your own products between two moments. The server prices every order itself,
  so a sale ends exactly when `endsAt` passes, whatever the customer's clock says.
    { id, title, startsAt, endsAt, percent (5–80), productIds: ['id', ...] or null for all own products }
  Use +05:30 for India time. Sale-priced items are left out of bundle and coupon discounts (see STORE.stackOnSale).
  Entries with `sample: true` are for testing: `npm run check:launch` fails until they are removed.
*/
export const FLASH_SALES = [
  { id: 'sample-sale', sample: true, title: 'Sample flash sale', startsAt: '2026-01-01T00:00:00+05:30', endsAt: '2099-01-01T00:00:00+05:30', percent: 20, productIds: ['own-sample-cap'] },
];
