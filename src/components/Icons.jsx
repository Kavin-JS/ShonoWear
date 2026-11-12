// Small inline icons (stroke = currentColor). Decorative: aria-hidden; the button/link supplies the label.
const base = { width: 22, height: 22, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true, focusable: false };
export const Heart = ({ filled, size = 22 }) => (<svg {...base} width={size} height={size} fill={filled ? 'currentColor' : 'none'}><path d="M12 20.5s-7.5-4.6-9.2-9.3C1.7 8 3.6 4.8 6.9 4.8c1.9 0 3.5 1 5.1 3 1.6-2 3.2-3 5.1-3 3.3 0 5.2 3.2 4.1 6.4-1.7 4.7-9.2 9.3-9.2 9.3z" /></svg>);
export const Bag = ({ size = 22 }) => (<svg {...base} width={size} height={size}><path d="M5 8h14l-1 12H6L5 8z" /><path d="M9 8V6a3 3 0 0 1 6 0v2" /></svg>);
export const Search = ({ size = 20 }) => (<svg {...base} width={size} height={size}><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>);
export const Home = () => (<svg {...base}><path d="M3 11.5 12 4l9 7.5" /><path d="M5.5 10v10h13V10" /></svg>);
export const Grid = () => (<svg {...base}><rect x="4" y="4" width="7" height="7" rx="1.5" /><rect x="13" y="4" width="7" height="7" rx="1.5" /><rect x="4" y="13" width="7" height="7" rx="1.5" /><rect x="13" y="13" width="7" height="7" rx="1.5" /></svg>);
export const Sparkle = ({ size = 22 }) => (<svg {...base} width={size} height={size}><path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8L12 3z" /><path d="M19 16l.7 2 2 .7-2 .7-.7 2-.7-2-2-.7 2-.7.7-2z" /></svg>);
export const Close = ({ size = 20 }) => (<svg {...base} width={size} height={size}><path d="M6 6l12 12M18 6 6 18" /></svg>);
export const Filter = ({ size = 18 }) => (<svg {...base} width={size} height={size}><path d="M4 6h16M7 12h10M10 18h4" /></svg>);
export const Chevron = ({ dir = 'right', size = 18 }) => (<svg {...base} width={size} height={size} style={{ transform: `rotate(${{ right: 0, left: 180, down: 90, up: -90 }[dir]}deg)` }}><path d="m9 5 7 7-7 7" /></svg>);
export const Truck = () => (<svg {...base} width={26} height={26}><path d="M3 6h11v10H3zM14 9h4l3 3v4h-7" /><circle cx="7.5" cy="17.5" r="1.8" /><circle cx="17.5" cy="17.5" r="1.8" /></svg>);
export const Shield = () => (<svg {...base} width={26} height={26}><path d="M12 3l8 3v6c0 4.5-3.2 7.8-8 9-4.8-1.2-8-4.5-8-9V6l8-3z" /><path d="m9 12 2.2 2.2L15.5 10" /></svg>);
export const Return = () => (<svg {...base} width={26} height={26}><path d="M4 8h11a5 5 0 0 1 0 10H8" /><path d="m7 4-3 4 3 4" /></svg>);
export const Rupee = () => (<svg {...base} width={26} height={26}><path d="M7 5h10M7 9.5h10M7 5c5 0 7 1.5 7 4.5S11 14 7 14l8 6" /></svg>);
