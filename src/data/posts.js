/* SHONOWEAR — blog posts. Add yours at the top. `date` is YYYY-MM-DD. `body` uses the small markdown subset (see src/lib/miniMd.jsx).
   These three are general starter articles: rewrite them in your own voice before launch. */
export const POSTS = [
  {
    slug: 'how-to-pick-your-size-in-oversized-fits',
    title: 'How to pick your size in oversized fits',
    description: 'Oversized does not mean "buy two sizes up". A simple way to choose the right size for boxy tees, hoodies and baggy trousers.',
    date: '2026-11-01', image: 'https://images.unsplash.com/photo-1576566588028-4147f3842f27?w=1200&h=630&fit=crop',
    body: `Oversized is a cut, not a size. A boxy tee is already designed with extra room, so most people should **stay in their usual size** and only go up one size if they want a very loose look.

## Start from the size chart, not the label
Measure the widest part of your chest and compare it with the chest column on the product's size chart. If you are between two sizes, ask yourself how you want it to fall.

## A quick rule
- Want the look as designed: take your usual size.
- Want it slouchier: go one size up.
- Layering under a jacket: stay in your usual size.

## Trousers
Check the waist and the length. Baggy trousers can be worn low or high, so the waist matters more than the label.

Not sure? Use "Find my size" on any product page.`,
  },
  {
    slug: 'wash-and-care-for-heavyweight-cotton',
    title: 'How to wash heavyweight cotton so it lasts',
    description: 'Cold water, inside out, and shade-drying: the three habits that keep heavyweight tees and hoodies from shrinking and fading.',
    date: '2026-11-05', image: 'https://images.unsplash.com/photo-1622445275576-721325763afe?w=1200&h=630&fit=crop',
    body: `Heavyweight cotton is built to last, and a few small habits keep it that way.

## Three habits
- **Wash cold and inside out.** It protects prints and keeps the colour.
- **Dry in the shade.** Sun fades dark colours quickly.
- **Skip the hot dryer.** Heat is the main cause of shrinkage.

## Stains
Rinse in cold water straight away and dab with mild soap. Hot water can set a stain.

Full instructions for every kind of piece are on our [care guide](/care).`,
  },
  {
    slug: 'build-a-capsule-wardrobe-under-5000',
    title: 'Build a small wardrobe of outfits under ₹5,000',
    description: 'Five pieces, many outfits: how to choose a tee, a hoodie, trousers, shoes and one extra so everything goes together.',
    date: '2026-11-10', image: 'https://images.unsplash.com/photo-1523381210434-271e8be1f52b?w=1200&h=630&fit=crop',
    body: `A small set of pieces that all work together gives you more outfits than a full wardrobe of things that do not match.

## The five pieces
- A plain **tee** in black or white.
- A **hoodie** or overshirt for layering.
- One pair of **trousers** that fits well.
- A pair of clean **sneakers**.
- One **accessory** such as a cap.

## Why it works
Stay with two or three colours and everything combines. Our stylist uses the same idea: tell it your budget and it builds complete outfits from pieces that match.

Try the [stylist](/upload) or browse the [shop](/shop).`,
  },
];
export const postBySlug = (s) => POSTS.find(p => p.slug === s);
