import type { NextConfig } from "next";
import { PHASE_DEVELOPMENT_SERVER } from "next/constants";

const nextConfig: NextConfig = {
  async redirects() {
    return [
      {
        source: '/onlyfans-search',
        destination: '/search',
        permanent: true,
      },
      {
        source: '/onlyfans-search/:path*',
        destination: '/search',
        permanent: true,
      },
    ];
  },
  images: {
    // Was images.weserv.nl, which policy-blocked every *.onlyfans.com host and returned
    // HTTP 400 for every creator photo. Next optimises them in this project instead.
    remotePatterns: [
      { protocol: "https", hostname: "**.onlyfans.com" },
    ],
    // The /_next/image width allowlist, clamped to the creator card's 1x/2x pair in
    // src/lib/image.ts. Nothing here imports next/image, so these lists are purely that
    // allowlist: any other ?w= 400s instead of billing a transformation.
    deviceSizes: [720],
    imageSizes: [360],
    // Next 16's default, pinned so it stays in lockstep with IMAGE_QUALITY in src/lib/image.ts.
    qualities: [75],
    // One year. OnlyFans photo URLs are immutable (hash + upload timestamp in the path; a new
    // avatar gets a new URL), so there is nothing to refresh, and every expiry re-bills.
    minimumCacheTTL: 31536000,
  },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-XSS-Protection", value: "1; mode=block" },
        ],
      },
      {
        source: "/:locationSlug([a-z-]+-onlyfans)/:path*",
        headers: [
          { key: "Cache-Control", value: "public, s-maxage=300, stale-while-revalidate=60" },
        ],
      },
      {
        source: "/categories/:slug/:path*",
        headers: [
          { key: "Cache-Control", value: "public, s-maxage=300, stale-while-revalidate=60" },
        ],
      },
    ];
  },
};

// Local `next dev` only — production builds use nextConfig unchanged.
// Turbopack's default runs PostCSS in a separate node.exe per job, and on Windows it started
// 200+ of them at once compiling a single page; across several dev servers that reached 1,386
// processes / 18.5 GB and froze the machine (2026-09-19). Worker threads keep that work inside
// the one dev-server process.
export default function config(phase: string): NextConfig {
  if (phase !== PHASE_DEVELOPMENT_SERVER) return nextConfig;
  return {
    ...nextConfig,
    experimental: { ...nextConfig.experimental, turbopackPluginRuntimeStrategy: "workerThreads" },
  };
}
