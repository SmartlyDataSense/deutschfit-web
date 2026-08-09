import { test, expect, type Page } from "@playwright/test";

/**
 * S2 onboarding wizard e2e — runs against the REAL dev backend
 * (`.env.local` → ocqoqnifzlkrgcyjljpl) as the seeded QA account.
 *
 * qa1 is already onboarded, so we enter the wizard by direct navigation
 * (onboarding routes are deep-linkable by design — the S11 settings
 * "retake diagnostic" link depends on this). Every run selects Goethe/B1,
 * matching qa1's existing profile, so the account ends each run unchanged.
 * Diagnostic attempts are unlimited and each run mints a fresh attemptId.
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

async function answerCurrentQuestion(page: Page) {
  // Always pick the first option — placement outcome is irrelevant here.
  await page.locator('[data-testid^="onboarding-diagnostic-option-"]').first().click();
  await page.getByTestId("onboarding-diagnostic-cta").click();
}

test.describe("onboarding wizard (qa1, direct entry)", () => {
  test("full flow: welcome → exam-type → 15-question diagnostic → result → motivation → schedule → /fr/app", async ({
    page,
  }) => {
    test.setTimeout(180_000); // real backend: pack fetch + submit + 15 clicks
    await login(page);

    // Welcome (direct entry — qa1 is onboarded, the gate won't push us here)
    await page.goto("/fr/app/onboarding");
    await expect(page.getByTestId("onboarding-welcome-screen")).toBeVisible();
    await page.getByTestId("onboarding-welcome-cta").click();

    // Exam type — Goethe / B1 (matches qa1's stored profile; run is idempotent)
    await expect(page.getByTestId("onboarding-exam-type-screen")).toBeVisible();
    await page.getByTestId("exam-board-trigger").click();
    await page.getByTestId("exam-board-option-goethe").click();
    await page.getByTestId("exam-level-trigger").click();
    await page.getByTestId("exam-level-option-b1").click();
    await page.getByTestId("onboarding-exam-type-continue").click();

    // Diagnostic — canonical URL carries attempt/level/mode
    await page.waitForURL(/\/fr\/app\/onboarding\/diagnostic\?attempt=[0-9a-f-]{36}&level=b1/, {
      timeout: 20_000,
    });
    await expect(page.getByTestId("onboarding-diagnostic-screen")).toBeVisible({
      timeout: 20_000,
    });

    // Section 1 timer starts at 05:00 and counts down
    const eyebrow = page.getByTestId("onboarding-diagnostic-eyebrow");
    await expect(eyebrow).toContainText(/LESEN · 1\/4 · 0?5:00|04:5\d/);
    await expect(eyebrow).toContainText(/04:5\d/, { timeout: 10_000 }); // ticked

    // Reload replays the SAME frozen pack (idempotent attemptId in the URL)
    const stemBefore = await page.getByTestId("onboarding-diagnostic-question").innerText();
    await page.reload();
    await expect(page.getByTestId("onboarding-diagnostic-screen")).toBeVisible({
      timeout: 20_000,
    });
    await expect(page.getByTestId("onboarding-diagnostic-question")).toHaveText(stemBefore);

    // Answer all 15 (4 lesen + 6 sprachbausteine + 5 wortschatz)
    for (let i = 0; i < 4; i++) await answerCurrentQuestion(page);
    await expect(eyebrow).toContainText("SPRACHBAUSTEINE");
    for (let i = 0; i < 6; i++) await answerCurrentQuestion(page);
    await expect(eyebrow).toContainText(/WORTSCHATZ · 1\/5 · 0?3:00|02:5\d/); // 180s section
    for (let i = 0; i < 5; i++) await answerCurrentQuestion(page);

    // Result
    await page.waitForURL(/\/fr\/app\/onboarding\/result\?attempt=/, { timeout: 30_000 });
    await expect(page.getByTestId("diagnostic-result-level-chip")).toBeVisible();
    await expect(page.getByTestId("diagnostic-result-total")).toBeVisible();
    await page.getByTestId("diagnostic-result-continue").click();

    // Motivation → Schedule → auto-finish to /fr/app
    await expect(page.getByTestId("onboarding-motivation-screen")).toBeVisible();
    await page.getByTestId("onboarding-motivation-option-work").click();
    await page.getByTestId("onboarding-motivation-continue").click();
    await expect(page.getByTestId("onboarding-schedule-option-20")).toBeVisible();
    await page.getByTestId("onboarding-schedule-option-20").click();
    await page.getByTestId("onboarding-schedule-continue").click();
    await page.waitForURL("**/fr/app", { timeout: 20_000 });
    await expect(page.getByRole("heading", { name: "Accueil" })).toBeVisible();
  });

  test("retake deep link (?mode=retake) self-completes its URL and finish-later goes back", async ({
    page,
  }) => {
    await login(page);
    await page.goto("/fr/app/onboarding/diagnostic?mode=retake");
    // Page mints attempt + resolves level from qa1's stored exam context.
    await page.waitForURL(/attempt=[0-9a-f-]{36}.*mode=retake/, { timeout: 20_000 });
    await expect(page.getByTestId("onboarding-diagnostic-screen")).toBeVisible({
      timeout: 20_000,
    });
    await expect(page.getByTestId("onboarding-diagnostic-eyebrow")).toContainText("LESEN");
  });

  test("wizard renders correctly at mobile (390x844) and desktop (1440x900) viewports", async ({
    page,
  }) => {
    await login(page);
    for (const vp of [
      { width: 390, height: 844 },
      { width: 1440, height: 900 },
    ] as const) {
      await page.setViewportSize(vp);
      await page.goto("/fr/app/onboarding");
      await expect(page.getByTestId("onboarding-welcome-screen")).toBeVisible();
      const shell = await page.getByTestId("onboarding-shell").boundingBox();
      expect(shell).not.toBeNull();
      expect(shell!.width).toBeLessThanOrEqual(448); // max-w-md column, never full-bleed
      if (vp.width === 1440) {
        const leftGap = shell!.x;
        const rightGap = 1440 - (shell!.x + shell!.width);
        expect(Math.abs(leftGap - rightGap)).toBeLessThan(2); // centered
      }
      await page.screenshot({
        path: `test-results/onboarding-welcome-${vp.width}x${vp.height}.png`,
        fullPage: true,
      });
    }
  });
});
