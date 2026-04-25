import { test, expect } from "@playwright/test";

/**
 * Admin gate. The dashboard URL must 404 for an unauthenticated visitor —
 * `requireOperator()` calls `notFound()` so we never leak the existence of
 * `/admin` to anyone who isn't signed in as an operator.
 *
 * The "operator sees dashboard" half of this test depends on session-cookie
 * seeding that needs a service-role-minted JWT for a known test user. We
 * don't have that in the harness yet, so the positive scenario is a `skip`
 * placeholder until W4 follow-up wires up Playwright auth fixtures.
 */
test.describe("admin gate", () => {
  test("non-operator (anonymous) gets 404 on /en/admin", async ({ page }) => {
    const response = await page.goto("/en/admin");
    expect(response?.status()).toBe(404);
  });

  test("non-operator (anonymous) gets 404 on /fr/admin", async ({ page }) => {
    const response = await page.goto("/fr/admin");
    expect(response?.status()).toBe(404);
  });

  test.skip("operator sees the dashboard heading", async ({ page }) => {
    // Requires a Playwright auth fixture that mints a Supabase session cookie
    // for a seeded operator. Wire this up in a follow-up — left as `skip` so
    // the spec still documents the expectation.
    await page.goto("/en/admin");
    await expect(page.getByRole("heading", { name: /dashboard/i })).toBeVisible();
  });
});
