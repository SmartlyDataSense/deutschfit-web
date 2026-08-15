import { test, expect, type Page } from "@playwright/test";

/**
 * Learner responsive nav shell (Task 1.3) — authenticated, runs against
 * the real dev Supabase backend via the real login page (same precedent
 * as `learner-login.spec.ts`: seeded QA account, production build server).
 *
 * Covers: `TabBar` visible / `Sidebar` hidden below the `lg` breakpoint
 * (390×844 phone viewport), the inverse at `lg` and up (1440×900 desktop
 * viewport), active-tab highlighting following the route, and sign-out
 * from the sidebar returning to `/login`.
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

test.describe("learner nav — responsive shell (dev backend)", () => {
  test("mobile viewport (390x844): TabBar visible, Sidebar hidden, 5 tabs with Accueil active", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await login(page);

    await expect(page.getByTestId("learner-tabbar")).toBeVisible();
    await expect(page.getByTestId("learner-sidebar")).toBeHidden();

    for (const id of ["accueil", "apprendre", "coach", "examen", "profil"]) {
      await expect(page.getByTestId(`learner-tab-${id}`)).toBeVisible();
    }
    await expect(page.getByTestId("learner-tab-accueil")).toHaveAttribute("aria-current", "page");
    await expect(page.getByTestId("learner-tab-apprendre")).not.toHaveAttribute(
      "aria-current",
      "page"
    );
  });

  test("desktop viewport (1440x900): Sidebar visible, TabBar hidden, wordmark + 5 sections + sign-out", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await login(page);

    await expect(page.getByTestId("learner-sidebar")).toBeVisible();
    await expect(page.getByTestId("learner-tabbar")).toBeHidden();

    await expect(page.getByTestId("learner-sidebar-wordmark")).toContainText("DeutschFit");
    for (const id of ["accueil", "apprendre", "coach", "examen", "profil"]) {
      await expect(page.getByTestId(`learner-sidebar-${id}`)).toBeVisible();
    }
    await expect(page.getByTestId("learner-sidebar-signout")).toBeVisible();
  });

  test("active tab reflects the current route on both surfaces", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await login(page);

    await expect(page.getByTestId("learner-sidebar-accueil")).toHaveAttribute(
      "aria-current",
      "page"
    );

    await page.getByTestId("learner-sidebar-apprendre").click();
    await page.waitForURL("**/fr/app/apprendre");
    await expect(page.getByRole("heading", { name: "Pratique" })).toBeVisible();
    await expect(page.getByTestId("learner-sidebar-apprendre")).toHaveAttribute(
      "aria-current",
      "page"
    );
    await expect(page.getByTestId("learner-sidebar-accueil")).not.toHaveAttribute(
      "aria-current",
      "page"
    );

    // Same route, mobile surface: resize down and confirm TabBar agrees.
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(page.getByTestId("learner-tab-apprendre")).toHaveAttribute("aria-current", "page");
  });

  test("sign-out from the sidebar returns to /login", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await login(page);

    await page.getByTestId("learner-sidebar-signout").click();
    await page.waitForURL("**/fr/app/login", { timeout: 15_000 });
    expect(page.url()).toContain("/fr/app/login");
  });
});
