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
// Port is configurable so e2e runs never collide with an already-running
// dev server on the default port (`reuseExistingServer` would otherwise
// happily attach to whatever is listening on 3000 and test the wrong code).
// Node/config context — dynamic string composition is fine here; the
// literal-dot-notation `process.env.NEXT_PUBLIC_*` rule applies to reads in
// `src/`, not to this config file.
const port = process.env.PLAYWRIGHT_PORT ?? "3000";
const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? `http://localhost:${port}`;

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: "html",
  use: {
    baseURL,
    trace: "on-first-retry",
  },
  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        // S7 Sprechen (task 7.12) — fake mic device + auto-playing fake
        // audio, so the recorder/mic-check flows run headlessly against
        // the real dev backend without a physical microphone. No-op for
        // every pre-existing spec (none of them touch `getUserMedia`).
        launchOptions: {
          args: [
            "--use-fake-ui-for-media-stream",
            "--use-fake-device-for-media-stream",
            "--autoplay-policy=no-user-gesture-required",
          ],
        },
      },
    },
  ],
  webServer: {
    command: `npm run build && npm run start -- --port ${port}`,
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
