import { test, expect } from "@playwright/test";

/**
 * `LearnerGuard` redirect. `(protected)/layout.tsx` gates the `/app`
 * segment client-side (session resolution happens in the browser, via
 * `bootstrapLearnerSession()`), so an anonymous visitor should end up
 * navigated to `/{locale}/app/login` once the "loading" splash resolves
 * to "unauthenticated".
 *
 * `/app/login` itself doesn't exist yet (Task 1.2) — this only asserts the
 * redirect target, not what renders there.
 */
test.describe("learner guard", () => {
  test("unauthenticated visit to /fr/app redirects to /fr/app/login", async ({ page }) => {
    await page.goto("/fr/app");
    await page.waitForURL("**/fr/app/login");
    expect(page.url()).toContain("/fr/app/login");
  });

  test("unauthenticated visit to /en/app redirects to /en/app/login", async ({ page }) => {
    await page.goto("/en/app");
    await page.waitForURL("**/en/app/login");
    expect(page.url()).toContain("/en/app/login");
  });
});
