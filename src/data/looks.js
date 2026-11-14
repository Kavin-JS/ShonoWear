/*
  Curated looks ("Shop the look", /looks). Edit freely.
    slug         url piece, lowercase letters, digits and dashes
    title/blurb  shown on the card and the page
    occasion     a short label
    items        product ids from the catalogue (2 to 6). Ids that no longer exist are skipped; a look with fewer than 2 left is hidden.
  Looks that use own-stock products let the customer pick sizes and add the whole look to the bag in one tap.
  Looks with only partner (Amazon/Myntra) items show a "buy on" link per piece.
  The look that uses [SAMPLE] products disappears on its own once you delete those samples.
*/
export const LOOKS = [
  { slug: 'campus-streetwear', title: 'Campus streetwear', occasion: 'College', blurb: 'Oversized tee, cargos, high-tops. Easy to wear all day, easy on the wallet.', items: ['sw-001', 'sw-002', 'sw-004'] },
  { slug: 'boxy-tee-and-cargo', title: 'Boxy tee and cargo, from us', occasion: 'Everyday', blurb: 'Heavyweight tee, relaxed cargo pants and a cap. All shipped by Shonowear, with cash on delivery.', items: ['own-sample-tee', 'own-sample-pants', 'own-sample-cap'] },
  { slug: 'clean-office', title: 'Clean office', occasion: 'Work', blurb: 'A crisp white shirt, chinos and derbies: quiet, sharp, no effort.', items: ['mn-003', 'mn-002', 'mn-004'] },
  { slug: 'date-night-layered', title: 'Date night, layered', occasion: 'Date night', blurb: 'Linen shirt under a slim blazer, dark trousers, Chelsea boots.', items: ['mn-006', 'mn-001', 'cl-001', 'cl-004'] },
  { slug: 'festival-bold', title: 'Festival bold', occasion: 'Festival', blurb: 'Colour, a bomber and chunky soles for the loud days.', items: ['sw-005', 'bd-004', 'bd-003', 'sw-007'] },
];
