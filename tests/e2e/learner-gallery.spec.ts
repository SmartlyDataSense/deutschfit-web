import { test, expect } from "@playwright/test";

/**
 * Dev gallery visual smoke. `GalleryPage` 404s in production builds unless
 * `NEXT_PUBLIC_ENABLE_GALLERY=1` — the config's `webServer` runs a
 * production build (`npm run build && npm run start`, same pattern as
 * `admin-gate.spec.ts`), so this spec only passes when
 * `NEXT_PUBLIC_ENABLE_GALLERY=1` is set in the environment that launches
 * Playwright (it's inherited by the spawned build/start process — see
 * `package.json`'s `e2e:gallery` script).
 */
const SECTIONS = [
  "gallery-apptext",
  "gallery-appbutton",
  "gallery-chip",
  "gallery-card",
  "gallery-progressbar",
  "gallery-timerpill",
  "gallery-scorebadge",
  "gallery-donut",
  "gallery-segmentedcontrol",
  "gallery-input",
  "gallery-skeleton",
  "gallery-waveform",
  "gallery-glasssurface",
];

const VIEWPORTS: Array<{ name: "mobile" | "desktop"; width: number; height: number }> = [
  { name: "mobile", width: 390, height: 844 },
  { name: "desktop", width: 1440, height: 900 },
];

test.describe("learner primitives gallery", () => {
  // The gallery route 404s unless the build that `webServer` produced was
  // given `NEXT_PUBLIC_ENABLE_GALLERY=1` — and that value is inlined at
  // build time, so it must be present in the environment that launches
  // Playwright, not just at request time. A plain `npm run e2e` does not
  // set it, so without this guard both tests fail on a 404 that says
  // nothing about the primitives. Run `npm run e2e:gallery` to exercise
  // them for real.
  test.skip(
    process.env.NEXT_PUBLIC_ENABLE_GALLERY !== "1",
    "NEXT_PUBLIC_ENABLE_GALLERY is not set — the gallery route 404s in this build. By design: run `npm run e2e:gallery` to cover it."
  );

  for (const viewport of VIEWPORTS) {
    test(`renders every primitive section at ${viewport.name} (${viewport.width}x${viewport.height})`, async ({
      page,
    }) => {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      const response = await page.goto("/fr/app/dev/gallery");
      expect(response?.status()).toBe(200);

      for (const testId of SECTIONS) {
        await expect(page.getByTestId(testId)).toBeVisible();
      }

      await page.screenshot({
        path: `test-results/gallery-${viewport.name}.png`,
        fullPage: true,
      });
    });
  }
});
