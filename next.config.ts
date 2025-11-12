import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  eslint: {
    // Warning: This allows production builds to successfully complete even if
    // your project has ESLint errors.
    ignoreDuringBuilds: true,
  },
  // Force unique build ID to bypass caching
  generateBuildId: async () => {
    return `build-${Date.now()}`;
  },
};

export default nextConfig;
