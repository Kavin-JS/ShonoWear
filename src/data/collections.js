/*
  Curated collections (landing pages at /collection/<slug>). Edit freely.
    match(p)  decides which products belong. Collections with no products are hidden automatically.
    sort      'relevance' | 'newest' | 'price-asc' | 'price-desc'
*/
export const collections = [
  { slug: 'new-arrivals', title: 'New arrivals', blurb: 'The latest additions, newest first.', sort: 'newest', match: p => Boolean(p.addedAt) },
  { slug: 'ships-from-us', title: 'Ships from us', blurb: 'Sold and delivered by Shonowear. Easy returns, tracked delivery.', sort: 'relevance', match: p => p.fulfilment === 'own' },
  { slug: 'wedding-season', title: 'Wedding season', blurb: 'Sharp, classic and date-night pieces for functions and family events.', sort: 'price-desc', match: p => p.tags.includes('classic') || p.tags.includes('datenight') },
  { slug: 'college-fits', title: 'College fits', blurb: 'Easy, casual pieces that don\'t cost a semester\'s pocket money.', sort: 'price-asc', match: p => p.tags.includes('casual') && p.price <= 1500 },
  { slug: 'streetwear', title: 'Streetwear', blurb: 'Oversized fits, cargos and sneakers.', sort: 'relevance', match: p => p.tags.includes('streetwear') },
  { slug: 'office-ready', title: 'Office ready', blurb: 'Clean, minimal looks for work.', sort: 'relevance', match: p => p.tags.includes('work') || p.tags.includes('minimal') },
  { slug: 'under-1000', title: 'Under ₹1,000', blurb: 'Good-looking and easy on the wallet.', sort: 'price-asc', match: p => p.price <= 1000 },
];
