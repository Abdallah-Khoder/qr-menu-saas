import type { MetadataRoute } from 'next';

// Search engines should not list the private areas. Pages that already say "noindex" in themselves (/forgot,
// /signup, /reset and the customers' menu pages) are NOT blocked here on purpose: a search engine that may not
// enter can not read their "noindex" and could still list the bare address.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: '*', disallow: ['/dashboard', '/admin', '/api/', '/login'] },
  };
}
