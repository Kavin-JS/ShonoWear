/*
  SHONOWEAR PRODUCT CATALOG — Phase 3
  ─────────────────────────────────────────────────────────────
  category: 'top' | 'bottom' | 'footwear' | 'outerwear' | 'set' | 'accessory'

  Every product has a dominant color tag for AI color-harmony scoring.
  One word, lowercase: white, black, grey, navy, beige, olive, indigo,
  brown, multicolour, silver.

  HOW TO ADD MORE PRODUCTS:
  Copy any object, give it a unique id, set the right category,
  add a color tag, and add your real affiliate URL.

  HOW TO GET AFFILIATE LINKS:
  Amazon:  affiliate-program.amazon.in → Get link → copy ?tag=YOUR-TAG-21
  Myntra:  admitad.com or vcommission.com → find Myntra advertiser → generate tracking link
*/

export const catalog = [

  /* ── STREETWEAR TOPS ── */
  {
    id: 'sw-001',
    name: 'Oversized Graphic Drop-Shoulder Tee',
    brand: 'Bewakoof',
    category: 'top',
    image: 'https://images.unsplash.com/photo-1576566588028-4147f3842f27?w=400&h=500&fit=crop',
    price: 849,
    affiliateUrl: 'https://www.amazon.in/s?k=oversized+graphic+tee+men&tag=shonowear-21',
    platform: 'Amazon',
    tags: ['streetwear', 'casual', 'festival', 'low', 'mid', 'black', 'oversized'],
    explanation: 'The dropped shoulder creates width at the top, balancing your frame naturally.',
  },
  {
    id: 'sw-003',
    name: 'Anime Print Hoodie',
    brand: 'Puma',
    category: 'top',
    image: 'https://images.unsplash.com/photo-1556821840-3a63f15732ce?w=400&h=500&fit=crop',
    price: 2499,
    affiliateUrl: 'https://www.myntra.com/hoodies?rawQuery=anime+hoodie',
    platform: 'Myntra',
    tags: ['streetwear', 'casual', 'festival', 'mid', 'black', 'oversized', 'graphic'],
    explanation: 'A statement hoodie anchors the whole outfit — bold, unapologetic, unmissable.',
  },
  {
    id: 'sw-005',
    name: 'Acid-Wash Oversized Tee',
    brand: 'H&M',
    category: 'top',
    image: 'https://images.unsplash.com/photo-1622445275576-721325763afe?w=400&h=500&fit=crop',
    price: 999,
    affiliateUrl: 'https://www.amazon.in/s?k=acid+wash+oversized+tee+men&tag=shonowear-21',
    platform: 'Amazon',
    tags: ['streetwear', 'bold', 'casual', 'festival', 'low', 'grey', 'oversized'],
    explanation: 'Acid-wash texture adds visual complexity without any extra effort.',
  },

  /* ── STREETWEAR BOTTOMS ── */
  {
    id: 'sw-002',
    name: 'Cargo Jogger Pants with Side Pockets',
    brand: 'H&M',
    category: 'bottom',
    image: 'https://images.unsplash.com/photo-1624378439575-d8705ad7ae80?w=400&h=500&fit=crop',
    price: 1299,
    affiliateUrl: 'https://www.amazon.in/s?k=cargo+jogger+pants+men&tag=shonowear-21',
    platform: 'Amazon',
    tags: ['streetwear', 'casual', 'festival', 'low', 'mid', 'olive', 'tapered'],
    explanation: 'Cargo joggers add visual weight at the bottom for a grounded streetwear look.',
  },
  {
    id: 'sw-006',
    name: 'Colourblock Track Pants',
    brand: 'Adidas',
    category: 'bottom',
    image: 'https://images.unsplash.com/photo-1506629082955-511b1aa562c8?w=400&h=500&fit=crop',
    price: 1999,
    affiliateUrl: 'https://www.amazon.in/s?k=adidas+colourblock+track+pants&tag=shonowear-21',
    platform: 'Amazon',
    tags: ['streetwear', 'bold', 'casual', 'festival', 'mid', 'black', 'tapered'],
    explanation: 'Colourblock panels break the silhouette in all the right places.',
  },

  /* ── STREETWEAR FOOTWEAR ── */
  {
    id: 'sw-004',
    name: 'High-Top Canvas Sneakers',
    brand: 'Converse',
    category: 'footwear',
    image: 'https://images.unsplash.com/photo-1542291026-7eec264c27ff?w=400&h=500&fit=crop',
    price: 3499,
    affiliateUrl: 'https://www.amazon.in/s?k=converse+high+top+sneakers&tag=shonowear-21',
    platform: 'Amazon',
    tags: ['streetwear', 'casual', 'festival', 'mid', 'white', 'high-top'],
    explanation: 'High-tops add height and a clean finishing line to any streetwear outfit.',
  },
  {
    id: 'sw-007',
    name: 'Chunky Sole Sneakers',
    brand: 'Puma',
    category: 'footwear',
    image: 'https://images.unsplash.com/photo-1608667508764-33cf0726b13a?w=400&h=500&fit=crop',
    price: 4499,
    affiliateUrl: 'https://www.myntra.com/sneakers?rawQuery=chunky+sole+sneakers+men',
    platform: 'Myntra',
    tags: ['streetwear', 'bold', 'casual', 'festival', 'mid', 'high', 'white', 'chunky'],
    explanation: 'Chunky soles add visual weight at the base, grounding a bold look.',
  },

  /* ── MINIMAL TOPS ── */
  {
    id: 'mn-003',
    name: 'White Oxford Button-Down Shirt',
    brand: 'Van Heusen',
    category: 'top',
    image: 'https://images.unsplash.com/photo-1602810318383-e386cc2a3ccf?w=400&h=500&fit=crop',
    price: 1499,
    affiliateUrl: 'https://www.amazon.in/s?k=white+oxford+shirt+men&tag=shonowear-21',
    platform: 'Amazon',
    tags: ['minimal', 'classic', 'work', 'mid', 'low', 'white', 'slim'],
    explanation: 'A white Oxford shirt is the cleanest canvas in menswear.',
  },
  {
    id: 'mn-005',
    name: 'Slim Crew-Neck Cotton Tee',
    brand: 'Uniqlo',
    category: 'top',
    image: 'https://images.unsplash.com/photo-1521572163474-6864f9cf17ab?w=400&h=500&fit=crop',
    price: 799,
    affiliateUrl: 'https://www.amazon.in/s?k=slim+crew+neck+cotton+tee+men&tag=shonowear-21',
    platform: 'Amazon',
    tags: ['minimal', 'casual', 'low', 'mid', 'white', 'slim'],
    explanation: 'The slim cut traces the body without clinging — effortlessly clean.',
  },
  {
    id: 'mn-006',
    name: 'Linen Half-Sleeve Shirt',
    brand: 'FabIndia',
    category: 'top',
    image: 'https://images.unsplash.com/photo-1607345366928-199ea26cfe3e?w=400&h=500&fit=crop',
    price: 1199,
    affiliateUrl: 'https://www.amazon.in/s?k=linen+half+sleeve+shirt+men&tag=shonowear-21',
    platform: 'Amazon',
    tags: ['minimal', 'classic', 'casual', 'datenight', 'low', 'mid', 'beige', 'regular'],
    explanation: 'Linen breathes well and drapes with natural ease — zero maintenance, full look.',
  },

  /* ── OUTERWEAR ── */
  {
    id: 'mn-001',
    name: 'Slim-Fit Linen Blazer',
    brand: 'Arrow',
    category: 'outerwear',
    image: 'https://images.unsplash.com/photo-1507679799987-c73779587ccf?w=400&h=500&fit=crop',
    price: 3299,
    affiliateUrl: 'https://www.myntra.com/blazers?rawQuery=slim+fit+linen+blazer+men',
    platform: 'Myntra',
    tags: ['minimal', 'classic', 'datenight', 'work', 'mid', 'high', 'beige', 'slim'],
    explanation: 'A slim-fit blazer creates a clean vertical line that elongates the silhouette.',
  },
  {
    id: 'bd-003',
    name: 'Oversized Satin Bomber Jacket',
    brand: 'Jack & Jones',
    category: 'outerwear',
    image: 'https://images.unsplash.com/photo-1551028719-00167b16eac5?w=400&h=500&fit=crop',
    price: 3999,
    affiliateUrl: 'https://www.myntra.com/jackets?rawQuery=satin+bomber+jacket+men+oversized',
    platform: 'Myntra',
    tags: ['bold', 'streetwear', 'festival', 'datenight', 'mid', 'high', 'black', 'oversized'],
    explanation: 'A satin bomber makes even basic jeans look intentional.',
  },

  /* ── BOTTOMS ── */
  {
    id: 'mn-002',
    name: 'Straight-Cut Chino Trousers',
    brand: 'Zara',
    category: 'bottom',
    image: 'https://images.unsplash.com/photo-1473966968600-fa801b869a1a?w=400&h=500&fit=crop',
    price: 2199,
    affiliateUrl: 'https://www.myntra.com/trousers?rawQuery=straight+cut+chino+men',
    platform: 'Myntra',
    tags: ['minimal', 'classic', 'work', 'datenight', 'mid', 'beige', 'straight'],
    explanation: 'Straight-cut chinos hit the sweet spot between casual and formal.',
  },
  {
    id: 'cl-001',
    name: 'Slim-Fit Formal Trousers',
    brand: 'Louis Philippe',
    category: 'bottom',
    image: 'https://images.unsplash.com/photo-1594938298603-c8148c4b4998?w=400&h=500&fit=crop',
    price: 1999,
    affiliateUrl: 'https://www.myntra.com/trousers?rawQuery=slim+fit+formal+trousers+men',
    platform: 'Myntra',
    tags: ['classic', 'work', 'datenight', 'mid', 'navy', 'slim'],
    explanation: 'Slim formal trousers define the leg line and create a polished look.',
  },
  {
    id: 'cl-003',
    name: 'Raw Denim Straight-Leg Jeans',
    brand: "Levi's",
    category: 'bottom',
    image: 'https://images.unsplash.com/photo-1542272604-787c3835535d?w=400&h=500&fit=crop',
    price: 2499,
    affiliateUrl: 'https://www.amazon.in/s?k=levi+s+raw+denim+straight+jeans&tag=shonowear-21',
    platform: 'Amazon',
    tags: ['classic', 'casual', 'datenight', 'mid', 'indigo', 'straight'],
    explanation: 'Raw denim straight-legs are the gold standard of classic casual.',
  },
  {
    id: 'bd-004',
    name: 'Colourblock Wide-Leg Trousers',
    brand: 'FabIndia',
    category: 'bottom',
    image: 'https://images.unsplash.com/photo-1506629082955-511b1aa562c8?w=400&h=500&fit=crop',
    price: 1799,
    affiliateUrl: 'https://www.amazon.in/s?k=colourblock+wide+leg+trousers+men&tag=shonowear-21',
    platform: 'Amazon',
    tags: ['bold', 'casual', 'festival', 'mid', 'low', 'multicolour', 'wide'],
    explanation: 'Wide-leg colourblock trousers create a strong horizontal at the waist.',
  },

  /* ── FOOTWEAR ── */
  {
    id: 'mn-004',
    name: 'Minimalist Leather Derby Shoes',
    brand: 'Hush Puppies',
    category: 'footwear',
    image: 'https://images.unsplash.com/photo-1614252369475-531eba835eb1?w=400&h=500&fit=crop',
    price: 2799,
    affiliateUrl: 'https://www.amazon.in/s?k=leather+derby+shoes+men+formal&tag=shonowear-21',
    platform: 'Amazon',
    tags: ['minimal', 'classic', 'work', 'datenight', 'mid', 'brown', 'slim'],
    explanation: 'Clean leather Derbies ground the minimal aesthetic perfectly.',
  },
  {
    id: 'cl-004',
    name: 'Leather Chelsea Boots',
    brand: 'Clarks',
    category: 'footwear',
    image: 'https://images.unsplash.com/photo-1608256246200-53e635b5b65f?w=400&h=500&fit=crop',
    price: 4999,
    affiliateUrl: 'https://www.amazon.in/s?k=leather+chelsea+boots+men&tag=shonowear-21',
    platform: 'Amazon',
    tags: ['classic', 'casual', 'datenight', 'work', 'high', 'black', 'slim'],
    explanation: 'Chelsea boots elevate any outfit from the ground up.',
  },
  {
    id: 'cl-005',
    name: 'White Leather Low-Top Sneakers',
    brand: 'Adidas',
    category: 'footwear',
    image: 'https://images.unsplash.com/photo-1585232350009-56db37c52fe6?w=400&h=500&fit=crop',
    price: 3999,
    affiliateUrl: 'https://www.amazon.in/s?k=adidas+white+leather+sneakers+men&tag=shonowear-21',
    platform: 'Amazon',
    tags: ['minimal', 'classic', 'casual', 'mid', 'high', 'white', 'slim'],
    explanation: 'White leather sneakers are the cleanest finishing piece for any minimal look.',
  },

  /* ── CLASSIC KNITS ── */
  {
    id: 'cl-002',
    name: 'Classic Crew-Neck Merino Sweater',
    brand: 'United Colors of Benetton',
    category: 'top',
    image: 'https://images.unsplash.com/photo-1576871337622-98d48d1cf531?w=400&h=500&fit=crop',
    price: 2799,
    affiliateUrl: 'https://www.amazon.in/s?k=crew+neck+merino+sweater+men&tag=shonowear-21',
    platform: 'Amazon',
    tags: ['classic', 'casual', 'work', 'datenight', 'mid', 'high', 'navy', 'slim'],
    explanation: 'A merino crew-neck is the most versatile piece in a classic wardrobe.',
  },

  /* ── BOLD SETS ── */
  {
    id: 'bd-001',
    name: 'Coord Set — Printed Shirt + Shorts',
    brand: 'Snitch',
    category: 'set',
    image: 'https://images.unsplash.com/photo-1515886657613-9f3515b0c78f?w=400&h=500&fit=crop',
    price: 2199,
    affiliateUrl: 'https://www.amazon.in/s?k=coord+set+men+printed&tag=shonowear-21',
    platform: 'Amazon',
    tags: ['bold', 'casual', 'festival', 'datenight', 'mid', 'multicolour', 'regular'],
    explanation: 'Matching coord sets create a cohesive, intentional silhouette effortlessly.',
  },

  /* ── ACCESSORIES ── */
  {
    id: 'bd-002',
    name: 'Statement Chain Necklace + Cuffs Set',
    brand: 'Accessorize',
    category: 'accessory',
    image: 'https://images.unsplash.com/photo-1599643478518-a784e5dc4c8f?w=400&h=500&fit=crop',
    price: 899,
    affiliateUrl: 'https://www.amazon.in/s?k=men+chain+necklace+cuff+set&tag=shonowear-21',
    platform: 'Amazon',
    tags: ['bold', 'streetwear', 'festival', 'casual', 'low', 'silver', 'statement'],
    explanation: 'Layered chains draw the eye upward and add dimension to any outfit.',
  },
];
