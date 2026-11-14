/* SHONOWEAR — content pages. Edit the text freely; it is plain data. `body` uses the small markdown subset described in src/lib/miniMd.jsx. */
export const PAGES = {
  about: {
    path: '/about', title: 'About Shonowear',
    description: 'Shonowear is an Indian streetwear label and outfit stylist: heavyweight basics, honest prices, and outfits built around your frame and budget.',
    body: `## What we do
Shonowear makes simple, heavyweight streetwear basics and helps you put outfits together around your build, skin tone and budget. The stylist is free and needs no account.

## How we work
- Our own pieces are priced in plain rupees, GST included. No fake "was" prices: a strike-through price only appears when it is a real earlier price.
- Stock is counted per size, so a size you can add to your bag is a size we have.
- Items from other brands are affiliate links. We say so on the product, and the price is the one that store shows.

## Contact
Write to us any time. We reply within 2 business days.`,
  },
  faq: {
    path: '/faq', title: 'Help and FAQ',
    description: 'Answers about sizing, delivery, cash on delivery, returns, exchanges, gift cards and payments at Shonowear.',
    faq: [
      ['How do I find my size?', 'Open any product we ship and use "Find my size": enter your height and weight and it suggests a size from the size chart.'],
      ['How long does delivery take?', 'Most orders reach you in 3 to 7 working days. The estimate on the product page uses your pincode. Pre-order items ship on the date shown on the product.'],
      ['Do you offer cash on delivery?', 'Yes, on orders up to the limit shown at checkout, for a small fee. Gift cards and pre-orders must be paid online.'],
      ['How do returns and exchanges work?', 'Sign in to My account, choose the delivered order, and ask for a return or a size exchange within the return window. We email you at every step.'],
      ['When do I get my refund?', 'After we receive the item. Online payments go back to the original payment method; banks can take 5 to 7 business days. Cash on delivery refunds are sent by UPI or bank transfer.'],
      ['Is my payment safe?', 'Payments are handled by Razorpay. We never see or store your card or UPI details.'],
      ['How do gift cards work?', 'Buy one on the Gift cards page. The code is emailed to the recipient and can be used at checkout for 12 months, on this store only.'],
      ['I did not get my sign-in email.', 'Check your spam folder, then ask for a new link. A link works once and lasts 15 minutes.'],
    ],
  },
  care: {
    path: '/care', title: 'Care guide',
    description: 'How to wash and care for heavyweight cotton tees, hoodies, denim and sneakers so they last.',
    body: `## Heavyweight cotton tees and hoodies
- Wash inside out in cold water with a gentle cycle.
- Dry in the shade. Direct sun fades dark colours.
- Avoid high-heat dryers: they cause most shrinkage.

## Denim and cargos
- Wash less often, and inside out, to keep the colour.
- Cold wash, and hang to dry.

## Sneakers
- Brush off dust, then clean with a damp cloth and mild soap.
- Stuff with paper and dry in the shade, never on a heater.

## Printed and embroidered pieces
- Wash inside out, and iron on the reverse side.`,
  },
};
