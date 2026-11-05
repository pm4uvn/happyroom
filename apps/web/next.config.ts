import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";
import { existsSync } from "node:fs";
import path from "node:path";

// Single source of truth for shared secrets (e.g. JOIN_GRANT_SIGNING_KEY, also read by the game
// server): the monorepo root .env. Values already set (apps/web/.env*, real env) take precedence.
const rootEnv = path.resolve(process.cwd(), "../../.env");
if (existsSync(rootEnv)) process.loadEnvFile(rootEnv);

const withNextIntl = createNextIntlPlugin("./i18n/request.ts");

const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  // Camera/microphone stay off until the opt-in features that need them exist.
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()",
  },
  ...(process.env.NODE_ENV === "production"
    ? [{ key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" }]
    : []),
];

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // E2E builds use their own output folder so they never disturb a running `next dev` (.next).
  distDir: process.env.NEXT_DIST_DIR || ".next",
  poweredByHeader: false,
  experimental: {
    // The dev MCP server mirrors every browser console line into .next/dev/logs; that write
    // re-triggers a compile → HMR reload → new console line, an endless reload loop on /login.
    mcpServer: false,
  },
  transpilePackages: ["@happyroom/ui"],
  async headers() {
    return [
      { source: "/:path*", headers: securityHeaders },
      // Room pages and APIs must never be indexed or cached by shared caches.
      {
        source: "/r/:path*",
        headers: [
          { key: "X-Robots-Tag", value: "noindex, nofollow, noarchive" },
          { key: "Cache-Control", value: "private, no-store" },
        ],
      },
      { source: "/api/:path*", headers: [{ key: "Cache-Control", value: "no-store" }] },
    ];
  },
};

export default withNextIntl(nextConfig);
