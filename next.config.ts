import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Silence the workspace root inference warning (we have a clean single-app project here)
  turbopack: {
    root: __dirname,
  },

  // Enable standalone output for smaller Docker images
  output: 'standalone',
};

export default nextConfig;
