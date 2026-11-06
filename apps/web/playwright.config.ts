import { defineConfig, devices } from "@playwright/test";

const port = Number(process.env.E2E_PORT ?? 3100);
const gamePort = Number(process.env.E2E_GAME_PORT ?? 2568);
const baseURL = process.env.E2E_BASE_URL ?? `http://localhost:${port}`;
const DATABASE_URL = process.env.DATABASE_URL ?? "postgres://happyroom:happyroom@localhost:54329/happyroom";
// Test-only signing key shared by the two servers started below (never used outside E2E).
const JOIN_GRANT_SIGNING_KEY =
  process.env.E2E_JOIN_GRANT_SIGNING_KEY ?? "e2e-only-join-grant-signing-key-0123456789abcdef";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  // Each worker software-renders WebGL in headless Chromium; too many saturate the CPU.
  workers: Number(process.env.E2E_WORKERS ?? 2),
  expect: { timeout: 10_000 },
  timeout: 60_000,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL,
    trace: "retain-on-failure",
    // Multi-guest tests drive several pages at once; each simulates a person with their own
    // foreground browser, so background pages must keep rendering at full rate.
    launchOptions: {
      args: [
        "--disable-background-timer-throttling",
        "--disable-renderer-backgrounding",
        "--disable-backgrounding-occluded-windows",
      ],
    },
  },
  projects: [
    { name: "desktop-chromium", use: { ...devices["Desktop Chrome"] } },
    { name: "mobile-chromium", use: { ...devices["Pixel 7"] } },
  ],
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : [
        {
          // Authoritative game server (real Colyseus, real database).
          command: "pnpm --dir ../game-server exec tsx src/index.ts",
          url: `http://localhost:${gamePort}/health`,
          timeout: 180_000,
          reuseExistingServer: !process.env.CI,
          env: {
            GAME_SERVER_PORT: String(gamePort),
            DATABASE_URL,
            JOIN_GRANT_SIGNING_KEY,
            NODE_ENV: "production",
          },
        },
        {
          // Production build so tests exercise what ships.
          command: `pnpm build && pnpm exec next start --port ${port}`,
          url: `${baseURL}/api/health`,
          timeout: 240_000,
          reuseExistingServer: !process.env.CI,
          env: {
            DATABASE_URL,
            JOIN_GRANT_SIGNING_KEY,
            GAME_SERVER_PUBLIC_URL: `ws://localhost:${gamePort}`,
            // Invite links must point at this test server, not a local dev server on :3000.
            NEXT_PUBLIC_APP_URL: baseURL,
            NEXT_DIST_DIR: ".next-e2e",
            // Lets the Explore tests use the labelled demo fixtures in this production build.
            EXPLORE_DEMO_ENABLED: "true",
          },
        },
      ],
});
