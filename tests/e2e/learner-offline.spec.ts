import { test, expect } from "@playwright/test";

/**
 * Learner analytics/offline/error-boundary shell (Task 1.4) — authenticated,
 * real dev backend (same login precedent as `learner-nav.spec.ts`).
 *
 * Covers:
 *   - the app shell (providers, nav, protected content) still renders with
 *     `LearnerErrorBoundary` + `OfflineBanner` mounted — no regression from
 *     wrapping `LearnerProviders`'s children.
 *   - `OfflineBanner` reacts to real browser offline/online transitions via
 *     `browserContext.setOffline()` (Chromium emulates `navigator.onLine` +
 *     fires `window` `online`/`offline` events for this).
 *
 * PostHog isn't asserted here — `.env.local` has no
 * `NEXT_PUBLIC_POSTHOG_KEY`, so the client is a no-op by design (see
 * `learner-analytics.test.ts` for the gating unit coverage); there's
 * nothing observable in the browser to assert against without a real key.
 */
const TEST_EMAIL = "qa1@df.dev";
const TEST_PASSWORD = "test1234567890";

test.describe("learner shell — offline banner + error boundary (dev backend)", () => {
  test("app shell renders under the new providers, and the offline banner appears/disappears with real connectivity changes", async ({
    page,
    context,
  }) => {
    await page.goto("/fr/app/login");
    await page.locator("#login-email").fill(TEST_EMAIL);
    await page.locator("#login-password").fill(TEST_PASSWORD);
    await page.getByTestId("login-submit").click();
    await page.waitForURL("**/fr/app", { timeout: 15_000 });

    // Shell still renders: nav chrome + protected content, unaffected by
    // LearnerErrorBoundary/OfflineBanner now wrapping the provider tree.
    // Both TabBar and Sidebar always mount (Tailwind's `lg:` variant toggles
    // which is visible — see `learner-nav.spec.ts`); default Playwright
    // viewport (1280×720) is above the 1024px breakpoint, so Sidebar is the
    // visible one here.
    await expect(page.getByTestId("accueil-greeting")).toBeVisible();
    await expect(page.getByTestId("learner-sidebar")).toBeVisible();

    // Online: banner absent.
    await expect(page.getByTestId("learner-offline-banner")).toHaveCount(0);

    // Go offline: banner appears with the FR copy, alert semantics.
    await context.setOffline(true);
    const banner = page.getByTestId("learner-offline-banner");
    await expect(banner).toBeVisible();
    await expect(banner).toHaveAttribute("role", "alert");
    await expect(banner).toHaveText("Hors ligne — certaines fonctionnalités sont indisponibles");

    // Back online: banner disappears, shell still intact underneath.
    await context.setOffline(false);
    await expect(page.getByTestId("learner-offline-banner")).toHaveCount(0);
    await expect(page.getByTestId("accueil-greeting")).toBeVisible();
  });
});
