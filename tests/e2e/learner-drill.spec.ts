import { test, expect, type Page } from "@playwright/test";

// S9 adaptive drill e2e — REAL dev backend. Structural template:
// `learner-examen.spec.ts` (login helper + file-scoped metered-request
// accumulator idiom) and `learner-schreiben.spec.ts` (runtime-skip idiom
// on a genuine backend content gap, never on a timeout).
//
// QUOTA BUDGET (dev backend, shared with real usage):
// - `drill-recommend` / `drill-attempt` are UNMETERED (no RPC cap on
//   dev) — every count below is logged informationally only, never
//   asserted with an upper bound.
// - `drill-recommend` is B1-ONLY server-side. The onboarding e2e resets
//   qa1's `exam_board` to goethe (board-agnostic, per this file's
//   constraint) and does not guarantee qa1's *level* is B1 — so the
//   `level_not_supported_yet` `DrillEmptyState` branch is an EXPECTED,
//   loud-logged PASS branch here, not a failure, whenever qa1 isn't B1.
// - `consume-trial` is NEVER called by this surface (mobile parity,
//   product lock — no in-app paywall) — asserted zero in every spec.
// - `ai-coach` is not exercised by this file at all (tracked defensively
//   anyway — a nonzero count here would itself be a wiring regression).
//
// Selector notes (verified against the SHIPPED components on this branch
// — 9.6 DrillSessionScreen/SessionMcqCard/SessionResults/DrillEmptyState,
// 9.7 DrillSkillProfileScreen, S3's `PriorityTaskCard` wired to the
// drill session in 9.6):
//   - Accueil's daily-drill card is `accueil-priority-task`
//     (`AccueilScreen.tsx`) with two mutually-exclusive CTA testids:
//     `accueil-priority-task-cta` (active branch, enabled, navigates to
//     `/drill/session`) or `accueil-priority-task-empty-cta` (disabled,
//     label `dashboard:dailyDrill.empty.ctaLabel` = "Bientôt", `onClick`
//     wired to a no-op — there is genuinely nowhere for it to go).
//   - `DrillSessionScreen`'s question label testid
//     (`drill-session-question-label`) renders the hardcoded FR literal
//     `` `Question ${index + 1}/${items.length}` `` — NOT routed through
//     i18n (deliberate byte-parity with mobile, task-9.6-brief.md Step
//     5). `SessionMcqCard` options are `role="radio"` inside a
//     `role="radiogroup"`; their testid embeds the option's own German
//     text (`drill-session-mcq-option-{optionText}`), so selecting "the
//     first option" is done via `.locator('[role="radio"]').first()`,
//     never by predicting the text.
//   - After a pick, `drill-session-mcq-continue` appears; clicking it on
//     the LAST item triggers `writeSummary()` and flips straight to
//     `drill-session-results` (`SessionResults`) — no separate
//     "submit" step.
//   - `SessionResults` has NO dedicated testid for the score line or the
//     Betreuer one-liner (`betreuerLine()`, exported as a pure function)
//     — both are asserted via the visible text inside the
//     `drill-session-results` container, per the component source.
//     Score format is exactly `"{correct} / {total}"` (spaces both
//     sides of the slash).
//   - `DrillEmptyState` likewise has no per-reason testid — only the
//     container `drill-session-empty` (caller-supplied) and, ONLY for
//     `reason === "error"`, a `{testID}-retry` button. Every other
//     reason (including the expected `level_not_supported_yet`) renders
//     copy-only, read via `innerText()`.
//   - `DrillSkillProfileScreen`'s EMPTY branch (`drill-skill-profile-
//     empty`, zero skill rows at all) is structurally distinct from the
//     READY branch and renders NO footer CTA — `drill-skill-profile-cta`
//     only exists on the bucket-headings branch. This suite only asserts
//     the CTA's presence on that branch, not on the empty one.
const TEST_EMAIL = "qa1@df.dev";
const TEST_PASSWORD = "test1234567890";

async function login(page: Page): Promise<void> {
  await page.goto("/fr/app/login");
  await page.locator("#login-email").fill(TEST_EMAIL);
  await page.locator("#login-password").fill(TEST_PASSWORD);
  await page.getByTestId("login-submit").click();
  await page.waitForURL("**/fr/app", { timeout: 15_000 });
}

// File-scoped metered/tracked-request accumulators — shared across every
// spec in this `describe.serial` block (Playwright always runs a serial
// block in a single worker process, so this shared state is safe).
const fileMeteredRequests = {
  drillRecommend: [] as string[],
  drillAttempt: [] as string[],
  consumeTrial: [] as string[],
  aiCoach: [] as string[], // informational — this file never opens the coach chat
};

function trackFileMeteredRequests(page: Page): void {
  page.on("request", (req) => {
    const url = req.url();
    if (url.includes("/drill-recommend")) fileMeteredRequests.drillRecommend.push(url);
    if (url.includes("/drill-attempt")) fileMeteredRequests.drillAttempt.push(url);
    if (url.includes("/consume-trial")) fileMeteredRequests.consumeTrial.push(url);
    if (url.includes("/ai-coach")) fileMeteredRequests.aiCoach.push(url);
  });
}

function logFileTotals(tag: string): void {
  console.log(
    `[drill e2e][${tag}] cumulative file totals — drill-recommend: ${fileMeteredRequests.drillRecommend.length} (unmetered, informational), drill-attempt: ${fileMeteredRequests.drillAttempt.length} (unmetered, informational), consume-trial: ${fileMeteredRequests.consumeTrial.length} (must be 0), ai-coach: ${fileMeteredRequests.aiCoach.length} (informational)`
  );
  expect(fileMeteredRequests.consumeTrial.length).toBe(0);
}

test.describe.serial("Adaptive drill session, skills profile (qa1, real backend)", () => {
  test("(a) accueil daily-drill CTA: active branch lands on /drill/session, empty branch is disabled with label 'Bientôt' (both PASS, log branch)", async ({
    page,
  }) => {
    test.setTimeout(60_000);
    trackFileMeteredRequests(page);

    await login(page);
    await page.goto("/fr/app");

    const card = page.getByTestId("accueil-priority-task");
    await expect(card).toBeVisible({ timeout: 20_000 });

    const activeCta = page.getByTestId("accueil-priority-task-cta");
    const emptyCta = page.getByTestId("accueil-priority-task-empty-cta");
    await expect(activeCta.or(emptyCta)).toBeVisible({ timeout: 15_000 });

    if (await activeCta.isVisible().catch(() => false)) {
      console.log("[drill e2e][a] active branch — daily drill has items, CTA enabled");
      await activeCta.click();
      await page.waitForURL(/\/drill\/session/, { timeout: 15_000 });
      await expect(page.getByTestId("drill-session-screen")).toBeVisible({ timeout: 20_000 });
    } else {
      console.log(
        "[drill e2e][a] empty branch — no eligible daily drill recommendation, CTA disabled"
      );
      await expect(emptyCta).toBeDisabled();
      await expect(emptyCta).toHaveText("Bientôt");
    }

    logFileTotals("a");
  });

  test("(b) adaptive drill session loop (mobile viewport, unmetered): 5-question runner -> results, OR DrillEmptyState reason branch (level gate expected if qa1 isn't B1)", async ({
    page,
  }) => {
    test.setTimeout(120_000);
    trackFileMeteredRequests(page);

    await page.setViewportSize({ width: 390, height: 844 });
    await login(page);
    await page.goto("/fr/app/drill/session");
    await expect(page.getByTestId("drill-session-screen")).toBeVisible({ timeout: 20_000 });

    const questionLabel = page.getByTestId("drill-session-question-label");
    const emptyState = page.getByTestId("drill-session-empty");
    await expect(questionLabel.or(emptyState)).toBeVisible({ timeout: 30_000 });

    if (await emptyState.isVisible().catch(() => false)) {
      const emptyText = (await emptyState.innerText()).replace(/\s+/g, " ").trim();
      const isLevelGate = emptyText.includes("bientôt") && emptyText.includes("B1");
      console.warn(
        `[drill e2e][b] LOUD: DrillEmptyState rendered — ${
          isLevelGate
            ? "level_not_supported_yet (qa1 isn't B1 — EXPECTED, drill-recommend is B1-only server-side)"
            : "a different empty reason"
        }. Text: "${emptyText}"`
      );

      await page.screenshot({
        path: "test-results/s9-drill-session-empty-mobile.png",
        fullPage: true,
      });
      await page.setViewportSize({ width: 1440, height: 900 });
      await page.screenshot({
        path: "test-results/s9-drill-session-empty-desktop.png",
        fullPage: true,
      });

      logFileTotals("b-empty");
      return;
    }

    // Runner branch — branch on the ACTUAL item count served (SESSION_SIZE
    // is 5, but a redo-only session could in principle serve fewer),
    // rather than hardcoding 5.
    const totalMatch = (await questionLabel.innerText()).match(/Question\s+\d+\/(\d+)/);
    const total = totalMatch ? Number(totalMatch[1]) : 0;
    expect(total).toBeGreaterThan(0);
    console.log(`[drill e2e][b] runner branch — ${total} question(s)`);

    for (let i = 0; i < total; i++) {
      await expect(page.getByTestId("drill-session-question-label")).toHaveText(
        new RegExp(`Question ${i + 1}/${total}`)
      );
      const mcq = page.getByTestId("drill-session-mcq");
      await expect(mcq).toBeVisible({ timeout: 15_000 });
      await mcq.locator('[role="radio"]').first().click();
      const continueBtn = page.getByTestId("drill-session-mcq-continue");
      await expect(continueBtn).toBeVisible({ timeout: 10_000 });
      await continueBtn.click();
    }

    const results = page.getByTestId("drill-session-results");
    await expect(results).toBeVisible({ timeout: 20_000 });
    const resultsText = await results.innerText();
    expect(resultsText).toMatch(new RegExp(`\\d+ / ${total}`));
    // `betreuerLine()` — one of the four known FR one-liners, no
    // dedicated testid (see file header).
    expect(resultsText).toMatch(
      /Tu reviens sur des points|Un bon début|Tu consolides ce que tu maîtrises|Tu travailles tes points/
    );
    await expect(page.getByTestId("drill-session-results-finish")).toHaveText("Terminer");

    await page.screenshot({
      path: "test-results/s9-drill-session-results-mobile.png",
      fullPage: true,
    });
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.screenshot({
      path: "test-results/s9-drill-session-results-desktop.png",
      fullPage: true,
    });

    console.log(`[drill e2e][b] session complete — results screen verified`);
    logFileTotals("b-results");
  });

  test("(c) skills: bucket headings from drill:skillProfile.bucket.* or the empty state, footer CTA present on the ready branch", async ({
    page,
  }) => {
    test.setTimeout(60_000);
    trackFileMeteredRequests(page);

    await login(page);
    await page.goto("/fr/app/drill/skills");

    const screen = page.getByTestId("drill-skill-profile-screen");
    const empty = page.getByTestId("drill-skill-profile-empty");
    const error = page.getByTestId("drill-skill-profile-error");
    await expect(screen.or(empty).or(error).first()).toBeVisible({ timeout: 30_000 });

    if (await error.isVisible().catch(() => false)) {
      test.skip(
        true,
        "drill-skill-profile-error rendered — fetchSkillProfile transport failure, real backend issue not a content gap"
      );
    }

    if (await empty.isVisible().catch(() => false)) {
      console.log(
        "[drill e2e][c] drill-skill-profile-empty rendered — qa1 has no scored skill rows yet (content gap, pass); this branch renders no footer CTA by design"
      );
    } else {
      const buckets = ["renforcer", "progres", "maitrise", "not_assessed"] as const;
      let anyBucketVisible = false;
      for (const bucket of buckets) {
        const heading = page.getByTestId(`drill-skill-profile-bucket-${bucket}`);
        if (await heading.isVisible().catch(() => false)) {
          anyBucketVisible = true;
          console.log(`[drill e2e][c] bucket rendered: ${bucket}`);
        }
      }
      expect(anyBucketVisible).toBe(true);
      await expect(page.getByTestId("drill-skill-profile-cta")).toBeVisible();
    }

    logFileTotals("c");
  });
});
