// Plain-JS helper (no React) so build scripts can use it in Node.
export const toText = (src) => String(src || '').replace(/\[([^\]]+)\]\([^)]+\)/g, '$1').replace(/\*\*([^*]+)\*\*/g, '$1').replace(/^##\s+/gm, '').replace(/^-\s+/gm, '').replace(/\s+/g, ' ').trim();
