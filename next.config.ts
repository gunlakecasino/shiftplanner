// v1.0.0 — Production Release — UI frozen & shipped June 24 2026
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
      { source: "/shiftbuilder", destination: "/sheetbuilder", permanent: false },
      { source: "/shiftbuilder/:path*", destination: "/sheetbuilder/:path*", permanent: false },
      { source: "/today", destination: "/sheetbuilder", permanent: false },
      { source: "/today/:path*", destination: "/sheetbuilder", permanent: false },
      { source: "/nightwatch", destination: "/sheetbuilder", permanent: false },
      { source: "/nightwatch/:path*", destination: "/sheetbuilder", permanent: false },
      { source: "/people", destination: "/sheetbuilder", permanent: false },
      { source: "/people/:path*", destination: "/sheetbuilder", permanent: false },
      { source: "/mail", destination: "/sheetbuilder", permanent: false },
      { source: "/mail/:path*", destination: "/sheetbuilder", permanent: false },
      { source: "/logs", destination: "/sheetbuilder", permanent: false },
      { source: "/logs/:path*", destination: "/sheetbuilder", permanent: false },
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
      // Card-level vector SVGs — cache a week, but not immutable so Brian's
      // artwork updates land without a hard cache bust.
      {
        source: "/card-vectors/:path*",
        headers: [
          {
            key: "Cache-Control",
            value: "public, max-age=604800",
          },
        ],
      },
      // Print preview CSS is already ?v= busted (PRINT_PREVIEW_STYLESHEET_HREF).
      {
        source: "/shiftbuilder-print-preview.css",
        headers: [
          {
            key: "Cache-Control",
            value: "public, max-age=31536000, immutable",
          },
        ],
      },
      // Live board + mutation APIs — never let a CDN or browser reuse a
      // pre-drag night bundle after an assignment write.
      {
        source: "/api/shiftbuilder/:path*",
        headers: [
          {
            key: "Cache-Control",
            value: "private, no-cache, no-store, must-revalidate",
          },
        ],
      },
    ];
  },
};

export default withBundleAnalyzer(nextConfig);
