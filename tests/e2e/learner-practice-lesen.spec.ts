import { test, expect, type Page } from "@playwright/test";

// S4 practice + Lesen e2e — REAL dev backend. Quota note: lesen-submit is
// gated by can_submit_reading (free tier: 5 per rolling 24h). The graded
// spec submits at most once per run and accepts the local-fallback results
// branch (parity P1/P3), so repeated CI runs can never wedge qa1's account.
// Slot note (P14): always the FIRST modelltest row — a 429-abandoned
// in-progress attempt stays confined to it and resumes on the next run.
//
// Selector note (adapted from the pre-4.7/4.8/4.9 brief against the SHIPPED
// components — see task-4.11-report.md for the full divergence list):
//   - `lesen-session-total` renders "Frage <n> von <total>" (not a bare
//     number as the brief predicted) — the total is extracted via regex.
//   - The untimed practice session's first visible answer surface can be
//     either `practice-option-<itemId>-<key>` (ItemListPartView — MC_SINGLE_*
//     / TRUE_FALSE / MATCH_TO_ITEM) or a `practice-gap-<itemId>` chip
//     (ClozePartView — CLOZE_RADIO / CLOZE_DRAG) that must be tapped first
//     to open its inline option popover. The spec tolerates both branches
//     rather than assuming the brief's ItemListPartView-only shape.
//   - `PracticeSetPickerScreen` testIDs all share the `practice-set-` root
//     (`practice-set-picker-loading/-screen/-title/-subtitle/-error/…` are
//     the SCREEN's own chrome; only the per-row cards are
//     `practice-set-<slug>`). A bare `[data-testid^="practice-set-"]`
//     locator (as the brief had it) matches the picker chrome too, and
//     `.first()` can land on `practice-set-picker-loading` instead of a
//     real row — confirmed empirically (click on the loading div is a
//     no-op, never navigates). Excluding the `practice-set-picker-` root
//     disambiguates down to the actual row cards.
const TEST_EMAIL = "qa1@df.dev";
const TEST_PASSWORD = "test1234567890";

async function login(page: Page) {
  await page.goto("/fr/app/login");
  await page.locator("#login-email").fill(TEST_EMAIL);
  await page.locator("#login-password").fill(TEST_PASSWORD);
  await page.getByTestId("login-submit").click();
  await page.waitForURL("**/fr/app", { timeout: 15_000 });
}

test.describe("Practice hub + Lesen (qa1, real backend)", () => {
  test("apprendre grid → practice hub renders rows with chips (IDB-only, tolerant of fresh browser)", async ({ page }) => {
    test.setTimeout(120_000);
    await login(page);
    await page.goto("/fr/app/apprendre");
    await expect(page.getByTestId("apprendre-retake-block")).toBeVisible({ timeout: 20_000 });
    await page.goto("/fr/app/apprendre/practice");
    await expect(page.getByTestId("practice-hub-row-lesen")).toBeVisible({ timeout: 20_000 });
    await expect(page.getByTestId("practice-hub-row-sprachbausteine")).toBeVisible();
    await page.screenshot({ path: "test-results/s4-practice-hub.png", fullPage: true });
  });

  test("untimed lesen practice: pick a set, first pick locks, progress persists across reload", async ({ page }) => {
    test.setTimeout(180_000);
    await login(page);
    await page.goto("/fr/app/apprendre/practice/lesen");
    // Either the picker (≥2 sets) or the auto-forwarded session (1 set).
    await page.waitForURL(/\/apprendre\/practice\/lesen(\/session|$|\?)/, { timeout: 30_000 });
    const setCard = page
      .locator('[data-testid^="practice-set-"]:not([data-testid^="practice-set-picker-"])')
      .first();
    // `usePracticeSets` fetches the set list asynchronously — on the
    // multi-set picker path, `practice-set-<slug>` cards can take a beat to
    // mount after the URL settles (the screen shows `practice-set-picker-
    // loading` until the fetch resolves). Confirmed empirically: an
    // unguarded `.count()` check here races the fetch, reads 0 mid-flight,
    // and silently skips the click, leaving the test stuck on the picker.
    // Wait for either a real card to mount (multi-set) or the auto-forward
    // to have already landed on `/session` (single-set — the picker never
    // renders a real card in that branch, see `PracticeSetPickerScreen`).
    if (!/\/session/.test(page.url())) {
      await setCard.waitFor({ state: "visible", timeout: 20_000 }).catch(() => {});
    }
    if (await setCard.count()) {
      await setCard.click();
      await page.waitForURL(/\/session/, { timeout: 20_000 });
    }
    // Answer the first visible option. The session's current Teil renders
    // through one of two part views (see header note): ItemListPartView
    // exposes `practice-option-*` buttons directly; ClozePartView renders
    // `practice-gap-*` chips that must be tapped to open the inline
    // popover before any `practice-option-*` button exists in the DOM.
    const directOption = page.locator('[data-testid^="practice-option-"]').first();
    const gap = page.locator('[data-testid^="practice-gap-"]').first();
    await expect(directOption.or(gap).first()).toBeVisible({ timeout: 30_000 });
    if ((await gap.count()) > 0 && (await directOption.count()) === 0) {
      await gap.click();
    }
    const firstOption = page.locator('[data-testid^="practice-option-"]').first();
    await expect(firstOption).toBeVisible({ timeout: 30_000 });
    const optionId = await firstOption.getAttribute("data-testid");
    await firstOption.click();
    await expect(page.locator(`[data-testid="${optionId}"][data-locked="true"]`)).toBeVisible();
    // Reload — the lock must rehydrate from IndexedDB.
    await page.reload();
    await expect(page.locator(`[data-testid="${optionId}"][data-locked="true"]`)).toBeVisible({
      timeout: 30_000,
    });
    await page.screenshot({ path: "test-results/s4-practice-session.png", fullPage: true });
  });

  test("graded lesen drill: modelltest picker → live session → results (429 local-fallback is a legitimate branch)", async ({ page }) => {
    test.setTimeout(240_000);
    await login(page);
    await page.goto("/fr/app/examen/lesen");
    // Content-gap guard (fix round 1): dev currently has zero published,
    // non-placeholder Lesen Modelltest rows (`qb_modelltests` — confirmed
    // via direct SQL, see task-4.11-report.md), so `LesenIntroScreen` renders
    // its `lesen-intro-empty` state instead of the picker. Race the two
    // known terminal states and skip gracefully on the empty branch rather
    // than fail — the live flow below stays intact, unmodified, ready to run
    // the day Lesen Modelltest content publishes (mirrors the Hören
    // backfill).
    const picker = page.getByText("Modelltest wählen");
    const emptyState = page.getByTestId("lesen-intro-empty");
    await expect(picker.or(emptyState).first()).toBeVisible({ timeout: 30_000 });
    if (await emptyState.isVisible().catch(() => false)) {
      test.skip(
        true,
        "No published Lesen Modelltest content on dev yet — see deutschfit-backend issue (Lesen mirror of the Hören backfill). Re-run once content lands; single metered submit."
      );
    }
    await expect(picker).toBeVisible({ timeout: 30_000 });
    await page.locator('[data-testid^="lesen-modelltest-"]').first().click(); // P14: always the first row
    await page.getByText("Test starten").click();
    await page.waitForURL(/\/examen\/lesen\/session/, { timeout: 30_000 });
    // Answer every item (single submit — quota discipline).
    await expect(page.getByTestId("lesen-session-option-list")).toBeVisible({ timeout: 30_000 });
    // Shipped contract: `lesen-session-total` renders "Frage <n> von <total>"
    // (not a bare number, as the pre-4.9 brief predicted) — extract the
    // total via regex rather than `Number(innerText)`.
    const totalText = await page.getByTestId("lesen-session-total").innerText();
    const totalMatch = totalText.match(/von\s+(\d+)/);
    const total = totalMatch ? Number(totalMatch[1]) : 0;
    expect(total).toBeGreaterThan(0);
    for (let i = 0; i < total; i++) {
      await page.locator('[data-testid^="lesen-option-"]').first().click();
      const next = page.getByTestId("lesen-session-next");
      if (await next.isEnabled().catch(() => false)) await next.click();
    }
    await page.getByTestId("lesen-session-submit").click();
    // Both branches land on results: server-graded OR local-fallback (429).
    await page.waitForURL(/\/examen\/lesen\/results/, { timeout: 60_000 });
    await expect(page.getByTestId("lesen-results-screen")).toBeVisible({ timeout: 20_000 });
    // Product lock: no paywall copy on any branch.
    await expect(page.locator("text=/premium|abonnement|upgrade/i")).toHaveCount(0);
    await page.screenshot({ path: "test-results/s4-lesen-results.png", fullPage: true });
  });
});
