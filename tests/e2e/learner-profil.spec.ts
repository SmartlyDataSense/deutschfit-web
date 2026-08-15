import { test, expect, type Page } from "@playwright/test";

// S11 profil/settings e2e — REAL dev backend for auth + user-stats +
// user_objectives reads.
//
// ⚠️⚠️ SAFETY — READ BEFORE EDITING ⚠️⚠️
// 1. The account-deletion leg must NEVER actually delete qa1@df.dev.
//    It types DELETE, asserts the confirm CTA becomes enabled, and
//    STOPS. It never clicks the CTA. An `account-delete` request count
//    of 0 is asserted at the end of every test.
// 2. The exam-track leg must NEVER save: qa1's exam context is shared
//    fixture state (the onboarding e2e resets it to goethe). The leg
//    opens the confirm modal, asserts its copy, then CANCELS. A
//    user_profiles PATCH/POST count of 0 is asserted.
// 3. The language leg flips fr → en and MUST flip back to fr before
//    finishing (localStorage lang + URL both).
//
// QUOTA BUDGET: zero metered calls (`consume-trial`, `ai-coach`) — both
// tracked and asserted 0.
const TEST_EMAIL = "qa1@df.dev";
const TEST_PASSWORD = "test1234567890";

async function login(page: Page): Promise<void> {
  await page.goto("/fr/app/login");
  await page.locator("#login-email").fill(TEST_EMAIL);
  await page.locator("#login-password").fill(TEST_PASSWORD);
  await page.getByTestId("login-submit").click();
  await page.waitForURL("**/fr/app", { timeout: 15_000 });
}

const fileGuardedRequests = {
  consumeTrial: [] as string[],
  aiCoach: [] as string[],
  accountDelete: [] as string[],
  profileWrites: [] as string[],
};

function trackGuardedRequests(page: Page): void {
  page.on("request", (req) => {
    const url = req.url();
    if (url.includes("/consume-trial")) fileGuardedRequests.consumeTrial.push(url);
    if (url.includes("/ai-coach")) fileGuardedRequests.aiCoach.push(url);
    if (url.includes("/account-delete")) fileGuardedRequests.accountDelete.push(url);
    if (url.includes("/rest/v1/user_profiles") && req.method() !== "GET") {
      fileGuardedRequests.profileWrites.push(`${req.method()} ${url}`);
    }
  });
}

test.describe("S11 profil + settings", () => {
  test.beforeEach(() => {
    // Module-level accumulators survive across tests in the same worker —
    // reset them so one test's traffic can't bleed into the next test's
    // afterEach assertions (false failures) or mask a real leak.
    fileGuardedRequests.consumeTrial.length = 0;
    fileGuardedRequests.aiCoach.length = 0;
    fileGuardedRequests.accountDelete.length = 0;
    fileGuardedRequests.profileWrites.length = 0;
  });

  test.afterEach(() => {
    // The hard safety gates — every test, not just the delete leg.
    expect(fileGuardedRequests.accountDelete, "account-delete must NEVER fire in e2e").toHaveLength(
      0
    );
    expect(fileGuardedRequests.profileWrites, "user_profiles must never be written").toHaveLength(
      0
    );
    expect(fileGuardedRequests.consumeTrial).toHaveLength(0);
    expect(fileGuardedRequests.aiCoach).toHaveLength(0);
  });

  test("profil renders identity + rows; settings sections render", async ({ page }) => {
    trackGuardedRequests(page);
    await login(page);
    await page.goto("/fr/app/profil");
    await expect(page.getByTestId("profil-identity-card")).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId("profil-settings-change-exam")).toBeVisible();
    await expect(page.getByTestId("profil-account-delete")).toBeVisible();
    // No paywall affordances, ever.
    await expect(page.getByText(/Full Prep/i)).toHaveCount(0);

    await page.getByTestId("profil-settings-button").click();
    await page.waitForURL("**/fr/app/profil/settings");
    await expect(page.getByTestId("settings-language-fr")).toBeVisible();
    await expect(page.getByTestId("settings-analytics-optout-switch")).toBeDisabled();
    await expect(page.getByTestId("settings-backend-env-row")).toBeVisible();
  });

  test("language radio flips locale prefix and back", async ({ page }) => {
    trackGuardedRequests(page);
    await login(page);
    await page.goto("/fr/app/profil/settings");
    try {
      await page.getByTestId("settings-language-en").click();
      await page.waitForURL("**/en/app/profil/settings");
    } finally {
      // SAFETY (header note 3): qa1 is a shared fixture — restore fr even
      // if the en assertion above throws, so a mid-test failure can't
      // strand the account in English for every later test/run. Belt and
      // braces: write the persisted key directly, then walk the UI back.
      await page.evaluate(() => localStorage.setItem("@deutschfit/lang", "fr"));
      await page.goto("/fr/app/profil/settings");
      await page.waitForURL("**/fr/app/profil/settings");
    }
  });

  test("exam track: beta gate + confirm modal asserted then CANCELLED (never saved)", async ({
    page,
  }) => {
    trackGuardedRequests(page);
    await login(page);
    await page.goto("/fr/app/profil/settings/exam-track");
    await expect(page.getByTestId("settings-exam-save")).toBeDisabled();

    await page.getByTestId("settings-exam-level-trigger").click();
    // c1 is outside the default beta set (b1,b2) → disabled with caveat.
    // M-3: this pins the DEFAULT `getBetaLevels()` CSV ("b1,b2" —
    // core/flags/betaLevels.ts) specifically. If the e2e host ever sets
    // `NEXT_PUBLIC_BETA_LEVELS_ENABLED` (e.g. to widen the beta set),
    // c1 may no longer be disabled here and this assertion breaks.
    await expect(page.getByTestId("settings-exam-level-c1")).toBeDisabled();
    // Pick a beta level different from qa1's current one. qa1's board is
    // goethe/b1 per fixture convention — pick b2, and if the save button
    // stays disabled (qa1 was already b2), pick b1 instead.
    await page.getByTestId("settings-exam-level-b2").click();
    const save = page.getByTestId("settings-exam-save");
    if (await save.isDisabled()) {
      await page.getByTestId("settings-exam-level-trigger").click();
      await page.getByTestId("settings-exam-level-b1").click();
    }
    await expect(save).toBeEnabled();
    await save.click();
    const modal = page.getByTestId("settings-confirm-exam-change-modal");
    await expect(modal).toBeVisible();
    await expect(page.getByTestId("settings-confirm-exam-change-modal-confirm")).toBeVisible();
    // SAFETY (header note 2): CANCEL — never confirm.
    await page.getByTestId("settings-confirm-exam-change-modal-cancel").click();
    await expect(modal).toHaveCount(0);
  });

  test("objectives: pickers hydrate, save stays disabled untouched (no mutation)", async ({
    page,
  }) => {
    trackGuardedRequests(page);
    await login(page);
    await page.goto("/fr/app/profil/settings/objectives");
    await expect(page.getByTestId("settings-objectives-motivation")).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByTestId("settings-objectives-schedule")).toBeVisible();
    // Not dirty → save disabled; we deliberately do NOT save (qa1 fixture).
    await expect(page.getByTestId("settings-objectives-save")).toBeDisabled();
  });

  test("account deletion: typed-DELETE gate asserted, STOPPING SHORT OF SUBMIT", async ({
    page,
  }) => {
    trackGuardedRequests(page);
    await login(page);
    await page.goto("/fr/app/profil/delete-account");
    const cta = page.getByTestId("delete-account-confirm-cta");
    await expect(cta).toBeDisabled();
    // `Input` puts data-testid on its wrapper DIV — filling by testID
    // would throw. Target the real <input> by id (see Task 8 note;
    // precedent: #login-email).
    await page.locator("#delete-account-confirm-input").fill("DELETE");
    await expect(cta).toBeEnabled();
    // ⚠️ STOP. Never click the CTA (header note 1). Leave via cancel.
    await page.getByTestId("delete-account-cancel").click();
    await page.waitForURL((url) => !url.pathname.endsWith("/delete-account"));
  });
});
