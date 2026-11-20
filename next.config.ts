import type { NextConfig } from "next";

// Safety headers sent with every page and API answer.
const securityHeaders = [
  // The browser must trust the file type we send (a picture stays a picture, never run as a script).
  { key: "X-Content-Type-Options", value: "nosniff" },
  // Nobody can open our pages inside a frame of another site (stops "click hijacking").
  { key: "X-Frame-Options", value: "DENY" },
  // Other sites get only our address (not the full link) when a person clicks a link away from us.
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // We never need the camera, the microphone or the location of the person.
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
  // After the first visit the browser talks to us only over https (two years).
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
  // Same idea as X-Frame-Options for new browsers, plus: nothing can change the base address of a page,
  // no plugins (object), and forms can only send to us. (No "script-src" on purpose: Next.js needs inline scripts.)
  { key: "Content-Security-Policy", value: "frame-ancestors 'none'; base-uri 'self'; object-src 'none'; form-action 'self'" },
];

const nextConfig: NextConfig = {
  // Pages read the database and the login cookie on every request, so they are dynamic.
  // (Caching with "use cache" is an optional upgrade for later.)
  cacheComponents: false,
  partialPrefetching: false,
  // Do not tell everybody which framework runs the site.
  poweredByHeader: false,
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
