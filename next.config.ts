import type { NextConfig } from "next";

const withBundleAnalyzer = require("@next/bundle-analyzer")({
  enabled: process.env.ANALYZE === "true",
});

const nextConfig: NextConfig = {
  // Silence the workspace root inference warning (we have a clean single-app project here)
  turbopack: {
    root: __dirname,
  },

  experimental: {
    optimizePackageImports: ['framer-motion'],
  },

  // Enable standalone output for smaller Docker images
  output: "standalone",

  // === VELVET PERFORMANCE 2026 ===
  // experimental: { cacheComponents: true },

  async redirects() {
    return [
      { source: "/today", destination: "/shiftbuilder", permanent: false },
      { source: "/today/:path*", destination: "/shiftbuilder", permanent: false },
      { source: "/nightwatch", destination: "/shiftbuilder", permanent: false },
      { source: "/nightwatch/:path*", destination: "/shiftbuilder", permanent: false },
      { source: "/people", destination: "/shiftbuilder", permanent: false },
      { source: "/people/:path*", destination: "/shiftbuilder", permanent: false },
      { source: "/mail", destination: "/shiftbuilder", permanent: false },
      { source: "/mail/:path*", destination: "/shiftbuilder", permanent: false },
      { source: "/logs", destination: "/shiftbuilder", permanent: false },
      { source: "/logs/:path*", destination: "/shiftbuilder", permanent: false },
    ];
  },

  // === Aggressive immutable caching for all fingerprinted assets ===
  // These are served with content hashes by Next — safe for 1 year.
  // Only apply in production to avoid breaking Turbopack HMR revalidation in dev
  // (the custom headers cause "module factory is not available" errors for large
  // files like ShiftBuilderClient.tsx and its dynamic imports of the Supabase data layer).
  async headers() {
    if (process.env.NODE_ENV !== 'production') {
      return [];
    }
    return [
      {
        source: "/_next/static/:path*",
        headers: [
          {
            key: "Cache-Control",
            value: "public, max-age=31536000, immutable",
          },
        ],
      },
      {
        source: "/fonts/:path*",
        headers: [
          {
            key: "Cache-Control",
            value: "public, max-age=31536000, immutable",
          },
        ],
      },
      {
        source: "/icons/:path*",
        headers: [
          {
            key: "Cache-Control",
            value: "public, max-age=31536000, immutable",
          },
        ],
      },
      // Material Symbols (self-hosted via npm) — long cache + immutable
      {
        source: "/material-symbols/:path*",
        headers: [
          {
            key: "Cache-Control",
            value: "public, max-age=31536000, immutable",
          },
        ],
      },
    ];
  },
};

export default withBundleAnalyzer(nextConfig);
