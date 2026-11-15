import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Pages read the database and the login cookie on every request, so they are dynamic.
  // (Caching with "use cache" is an optional upgrade for later.)
  cacheComponents: false,
  partialPrefetching: false,
};

export default nextConfig;
