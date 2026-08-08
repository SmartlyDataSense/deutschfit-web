import { test, expect } from "@playwright/test";

/**
 * Learner login — password mode (the dev default; `NEXT_PUBLIC_AUTH_MODE`
 * is unset in `.env.local`, and `getAuthMode()` falls back to `"password"`
 * for anything other than the literal `"otp"`). Runs against the real dev
 * Supabase backend (`.env.local` → `ocqoqnifzlkrgcyjljpl`), using the
 * seeded QA account (see `reference_dev_test_account` memory).
 *
 * The config's `webServer` boots a production build (`next build && next
 * start`), so this exercises the actual browser → Supabase auth call, not
 * a mock.
 */
const TEST_EMAIL = "qa1@df.dev";
const TEST_PASSWORD = "test1234567890";

test.describe("learner login (password mode, dev backend)", () => {
  test("valid credentials redirect to /fr/app and protected content renders", async ({
    page,
  }) => {
    await page.goto("/fr/app/login");

    await page.locator("#login-email").fill(TEST_EMAIL);
    await page.locator("#login-password").fill(TEST_PASSWORD);
    await page.getByTestId("login-submit").click();

    await page.waitForURL("**/fr/app", { timeout: 15_000 });
    expect(page.url()).toMatch(/\/fr\/app$/);
    await expect(page.getByRole("heading", { name: "Accueil" })).toBeVisible();
  });

  test("invalid password shows the friendly FR error, never a raw Supabase message", async ({
    page,
  }) => {
    await page.goto("/fr/app/login");

    await page.locator("#login-email").fill(TEST_EMAIL);
    await page.locator("#login-password").fill("definitely-the-wrong-password");
    await page.getByTestId("login-submit").click();

    const error = page.getByTestId("login-error");
    await expect(error).toBeVisible();
    await expect(error).toHaveText("E-mail ou mot de passe incorrect.");
    // Never the raw Supabase rejection string.
    await expect(error).not.toHaveText(/invalid login credentials/i);
    // Still on the login route — no redirect on failure.
    expect(page.url()).toContain("/fr/app/login");
  });

  test("renders as a single centered column with a max-width constraint on desktop", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/fr/app/login");

    const box = await page.locator("main").boundingBox();
    expect(box).not.toBeNull();
    // `max-w-md` = 28rem = 448px. The centered column must stay well under
    // the 1440px viewport instead of stretching full-bleed.
    expect(box!.width).toBeLessThanOrEqual(448);
    // Centered: roughly equal space on both sides of the 1440px viewport.
    const leftGap = box!.x;
    const rightGap = 1440 - (box!.x + box!.width);
    expect(Math.abs(leftGap - rightGap)).toBeLessThan(2);
  });

  test("renders the login form at mobile viewport", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/fr/app/login");

    await expect(page.locator("#login-email")).toBeVisible();
    await expect(page.getByTestId("login-submit")).toBeVisible();
  });
});
