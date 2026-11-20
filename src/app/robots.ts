import type { MetadataRoute } from 'next';

// Search engines should not list the private areas. (The customers' menu pages say "noindex" in themselves,
// and their links are random, so nothing here points to them.)
export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: '*', disallow: ['/dashboard', '/admin', '/api/', '/login', '/signup', '/forgot', '/reset'] },
  };
}
