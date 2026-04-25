import { defineConfig, devices } from "@playwright/test";

/**
 * Playwright config scaffold. Real e2e specs land in W4 once auth + checkout
 * surfaces exist. For W1 we only need the config so `npm run e2e` doesn't
 * fail on resolution and CI can wire it later without churn.
 *
 * The webServer entry boots `next start` after `next build` so tests run
 * against a production-mode build rather than the dev server (which would
 * use Turbopack and slow tests down).
 */
export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: "html",
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000",
    trace: "on-first-retry",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: {
    command: "npm run build && npm run start",
    url: "http://localhost:3000",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
