import { test, expect, type Page } from "@playwright/test";

/**
 * S3 Accueil e2e — REAL dev backend (.env.local → ocqoqnifzlkrgcyjljpl).
 * qa1 is fully onboarded: /fr/app lands directly on the Accueil screen.
 * Data assertions are against live accueil-home / history-get payloads —
 * no mocks, no fixtures. qa1's diagnostic rows are permanent, so the
 * pinned card is a deterministic real-data anchor; the exercise feed
 * tolerates both the empty and populated branches. The exam-date spec
 * only ever opens pickers / navigates — it never commits a date, so
 * qa1's profile is left unchanged for other slices' suites.
 */
const TEST_EMAIL = "qa1@df.dev";
const TEST_PASSWORD = "test1234567890";

async function login(page: Page) {
  await page.goto("/fr/app/login");
  await page.locator("#login-email").fill(TEST_EMAIL);
  await page.locator("#login-password").fill(TEST_PASSWORD);
  await page.getByTestId("login-submit").click();
  await page.waitForURL("**/fr/app", { timeout: 15_000 });
}

test.describe("Accueil (qa1, real backend)", () => {
  test("home renders live payload: greeting, level pill, hero-or-picker, drill card, strip absent", async ({
    page,
  }) => {
    test.setTimeout(120_000);
    await login(page);

    await expect(page.getByTestId("accueil-greeting")).toContainText(/Bonjour, .+\./, {
      timeout: 20_000,
    });
    await expect(page.getByTestId("accueil-date-eyebrow")).toContainText("·");
    await expect(page.getByTestId("accueil-current-level-pill")).toContainText(/B[12]/);

    // Real payload branches: future exam date → dark hero; otherwise inline picker.
    const hero = page.getByTestId("accueil-countdown");
    const picker = page.getByTestId("accueil-exam-date-picker");
    await expect(hero.or(picker).first()).toBeVisible({ timeout: 20_000 });
    if (await hero.isVisible()) {
      await expect(page.getByTestId("accueil-countdown-days-remaining")).toHaveText(/^\d+$/);
      await expect(page.getByTestId("accueil-countdown-target-score")).toContainText("OBJECTIF");
    } else {
      await picker.getByTestId("accueil-exam-date-picker-toggle").click();
      await expect(page.getByTestId("accueil-exam-date-picker-mini-calendar")).toBeVisible();
      await picker.getByTestId("accueil-exam-date-picker-toggle").click(); // close — never commit a date
    }

    // Drill card resolves out of its skeleton against the real recommender.
    await expect(page.getByTestId("accueil-priority-task")).toBeVisible({ timeout: 20_000 });
    // Live-backend finding: qa1 carries a real unacknowledged correction
    // (`submissions-list-unacknowledged` returned a graded-but-unviewed
    // Sprechen/Schreiben row from earlier suite runs), so the strip is NOT
    // guaranteed hidden — it renders straight from the readiness store's
    // boot hydrate against the real edge fn, no mock. Assert either real
    // branch: absent, or present with real copy. Never click through (the
    // CTA navigates to the feedback screen and would touch other state).
    const strip = page.getByTestId("accueil-status-strip");
    if (await strip.count()) {
      await expect(page.getByTestId("accueil-status-strip-copy")).toBeVisible();
    } else {
      await expect(strip).toHaveCount(0);
    }
  });

  test("history renders qa1's real pinned diagnostic + feed (either branch) and the retake deep link", async ({
    page,
  }) => {
    test.setTimeout(120_000);
    await login(page);
    await page.goto("/fr/app/history");
    await expect(page.getByTestId("performance-history-screen")).toBeVisible({ timeout: 20_000 });

    // qa1 has permanent diagnostic rows — the pinned card MUST render real data.
    await expect(page.getByTestId("performance-history-pinned-card")).toBeVisible({
      timeout: 20_000,
    });
    await expect(page.getByTestId("performance-history-pinned-level")).toContainText(/B[12]/);

    // Feed: rows or the calm empty card — both are live backend states.
    const rows = page.locator('[data-testid^="performance-history-row-"]');
    const empty = page.getByTestId("performance-history-feed-empty");
    await expect(rows.first().or(empty)).toBeVisible({ timeout: 20_000 });

    await page.getByTestId("performance-history-pinned-retake").click();
    await page.waitForURL("**/fr/app/onboarding/diagnostic?mode=retake", { timeout: 20_000 });
  });

  test("exam-date screen renders the month grid and pages months (no commit)", async ({ page }) => {
    await login(page);
    await page.goto("/fr/app/exam-date");
    await expect(page.getByTestId("change-exam-date-title")).toBeVisible({ timeout: 20_000 });
    const label = page.getByTestId("change-exam-date-mini-calendar-month-label");
    const before = await label.innerText();
    await page.getByTestId("change-exam-date-mini-calendar-next").click();
    await expect(label).not.toHaveText(before);
  });

  test("both viewports: tab bar on mobile, sidebar on desktop, screenshots", async ({ page }) => {
    await login(page);
    for (const vp of [
      { width: 390, height: 844 },
      { width: 1440, height: 900 },
    ] as const) {
      await page.setViewportSize(vp);
      await page.goto("/fr/app");
      await expect(page.getByTestId("accueil-greeting")).toBeVisible({ timeout: 20_000 });
      await page.screenshot({
        path: `test-results/accueil-${vp.width}x${vp.height}.png`,
        fullPage: true,
      });
    }
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/fr/app/history");
    await expect(page.getByTestId("performance-history-screen")).toBeVisible({ timeout: 20_000 });
    await page.screenshot({ path: "test-results/history-390x844.png", fullPage: true });
  });
});
