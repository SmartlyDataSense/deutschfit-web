import { test, expect, type Page } from "@playwright/test";

/**
 * S13 whole-branch review, final-fixes finding 4 — zero e2e coverage of a
 * FRESH `/en` boot, the exact path S13 changed most (17 EN catalogs moved
 * to lazy `import()`).
 *
 * None of the existing specs cover this:
 *   - `learner-a11y.spec.ts` sweeps 34 routes, every one of them `/fr/*`.
 *   - `learner-guard.spec.ts:20-23` only asserts the `/en/app` redirect
 *     URL for an UNAUTHENTICATED visitor — that assertion would pass
 *     identically against a blank page, since a redirect URL says
 *     nothing about what renders once you land there.
 *   - `learner-profil.spec.ts:90-101` reaches `/en` via a client-side
 *     `router.replace` from `/fr/app/profil/settings`, with
 *     `LearnerI18nProvider` already mounted (as `fr`) and `enReady`
 *     already `true` from the FR boot's background EN load — a WARM /en
 *     transition, not a fresh mount.
 *
 * A fresh mount is exactly what the S13 EN lazy-load regression broke:
 * `whenEnReady()` had no `.catch`, so a rejected chunk load left
 * `LearnerI18nProvider` rendering `null` forever on a cold `lng="en"`
 * mount — see `src/learner/core/i18n/index.ts` and
 * `LearnerI18nProvider.tsx`. `page.goto()` below is a REAL full-page
 * navigation (new document, cold i18next module state), not a client-side
 * transition, so it's the only way an e2e spec can actually exercise that
 * boot path.
 *
 * Navigation-only: logs in once via `/fr/app/login` (the same
 * credentialed entry point every other `learner-*.spec.ts` uses), then
 * only ever `page.goto`s/waits — ZERO metered POSTs (sprechen/dialogue/
 * ai-coach/consume-trial untouched). Login helper shape copied verbatim
 * from `learner-a11y.spec.ts` / `learner-profil.spec.ts` rather than
 * inventing a new one.
 */
const TEST_EMAIL = "qa1@df.dev";
const TEST_PASSWORD = "test1234567890";

async function login(page: Page): Promise<void> {
  await page.goto("/fr/app/login");
  await page.locator("#login-email").fill(TEST_EMAIL);
  await page.locator("#login-password").fill(TEST_PASSWORD);
  await page.getByTestId("login-submit").click();
  await page.waitForURL("**/fr/app", { timeout: 15_000 });
}

test.describe("learner /en boot — fresh full-page navigation (qa1, dev backend)", () => {
  test("a fresh /en/app page load renders real EN content, not a blank page", async ({ page }) => {
    await login(page);

    // The regression this pins depends on a COLD mount: a real full-page
    // navigation to /en/app, not a same-tab client-side route change from
    // the already-warm /fr session above.
    await page.goto("/en/app");
    await page.waitForURL("**/en/app");

    // A stuck-blank provider (LearnerI18nProvider rendering `null`
    // forever) still returns 200 and a non-empty <html> shell, so assert
    // actual translated content rather than just the response status.
    // `dashboard:greeting.hi` is "Hi, {{name}}" in EN vs "Bonjour,
    // {{name}}" in FR — a real catalog string, not a raw i18n key and not
    // a French fallback leaking through on an /en boot.
    const greeting = page.getByTestId("accueil-greeting");
    await expect(greeting).toBeVisible({ timeout: 15_000 });
    await expect(greeting).toHaveText(/^Hi,/);

    // The rest of the app-shell chrome around it must also have mounted
    // — not just one lucky text node — confirming `children` rendered
    // rather than the provider having returned `null`.
    await expect(page.getByTestId("accueil-header")).toBeVisible();
  });
});
