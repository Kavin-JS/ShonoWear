import { imgProps } from '../lib/img.js';

/** <img> with responsive sources, lazy loading and async decoding. Use priority for the one big picture above the fold. */
export default function Img({ src, sizes, widths, priority = false, alt = '', ...rest }) {
  return <img {...imgProps(src, { sizes, widths })} alt={alt} decoding="async" {...(priority ? { loading: 'eager', fetchpriority: 'high' } : { loading: 'lazy' })} {...rest} />;
}
