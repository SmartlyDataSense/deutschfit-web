import { test, expect, type Page } from "@playwright/test";

// S9 Betreuer coach e2e — REAL dev backend. Structural template:
// `learner-examen.spec.ts` (login helper + file-scoped metered-request
// accumulator idiom, `test.describe.serial` so every spec shares one
// worker/state) and `learner-schreiben.spec.ts` (runtime-skip idiom on a
// genuine backend content gap, never on a timeout).
//
// QUOTA BUDGET (dev backend, shared with real usage):
// - ai-coach: RPC-capped 30/24h per user. EXACTLY ONE POST in this suite,
//   in spec (d) only, never retried. A 429 there is a PASS branch (banner
//   "Trop de messages d'affilée." + disabled composer) — the cap may
//   already be burned by real usage.
// - coach-threads / coach-thread-history / coach-weekly-plan: unmetered.
//   Counts logged informationally, never bounded.
// - consume-trial: NEVER called by this surface (mobile parity). Spec (a)
//   asserts zero consume-trial requests during coach flows.
// - Walkthrough uses EXISTING graded submissions from qa1 history — the
//   dev writing grader is broken (backend#415), so specs must NOT create
//   submissions. If qa1 has no graded row of a kind, runtime-skip loudly.
// - Board-agnostic: onboarding e2e resets qa1 to goethe; nothing here may
//   assume telc. ai-coach reads level/board from the profile server-side.
//
// Selector notes (verified against the SHIPPED components on this branch —
// 9.3 BetreuerHubScreen/hubTiles, 9.4 CoachChatScreen/CoachThreadPanel/
// CoachChatComposer, 9.8/9.9 correction picker + walkthrough):
//   - Hub tiles: `betreuer-hub-tile-{discuter|exercices|correction|oral}`,
//     status chip `betreuer-hub-tile-{id}-status`. The disabled `oral`
//     tile is a non-interactive `<div aria-disabled="true">` — no `href`
//     at all, unlike the three active tiles (real `<Link>`s).
//   - `CoachThreadPanel` is ONE component, always mounted for
//     `variant="persistent"` (testid `coach-thread-panel`, default) — CSS
//     (`hidden lg:flex`) hides it below the `lg` (1024px) breakpoint, it
//     never unmounts. So the correct viewport assertion is
//     `toBeVisible()`/`not.toBeVisible()`, never a DOM-presence check. The
//     mobile `variant="drawer"` instance only mounts once the header
//     hamburger (`coach-thread-header-menu`) is clicked, and carries an
//     explicit override testid `coach-thread-panel-drawer` (NOT the
//     shared default) so both can never collide if ever mounted together.
//     "Nouvelle conversation" is `{testID}-new` on whichever panel is
//     open; it `router.push`es a FRESH `/coach/chat/{newThreadId}` URL
//     (not the bare `/coach/chat`).
//   - The composer's input/send testids (`coach-chat-input`,
//     `coach-chat-send`) are HARDCODED in `CoachChatComposer` regardless
//     of any `testID` prop override — safe to select directly.
//   - Chat-content branching on mount: `coach-message-scripted-coach-
//     opener` (fresh thread, opener not yet seen) vs real
//     `coach-message-{server-id}` bubbles (resumed thread with history)
//     vs a genuinely empty transcript (fresh thread, opener already
//     marked seen by a prior run AND no observation signal) — all THREE
//     are legitimate mount states, only the first two are named in the
//     task brief; this suite treats the third as an equally valid PASS
//     branch (logged loudly), never a failure.
//   - 429 detection: `coach-chat-error-banner` (`role="alert"`) renders
//     the i18n string `coach:chat.errors.coach_rate_limited` =
//     "Trop de messages d'affilée. Réessaie dans {{seconds}} s." — the
//     composer's `disabled` prop (`isSending || rateLimitRemainingSec >
//     0`) sets the NATIVE `disabled` attribute on both `coach-chat-input`
//     and `coach-chat-send`, so `toBeDisabled()` is the correct check.
//   - Correction picker rows are `correction-row-{submissionId}` — there
//     is NO `{kind}` segment in the testid (confirmed by reading
//     `CorrectionPickerScreen.tsx`); the row's `kind` only surfaces in
//     the post-click URL (`/coach/correction/{kind}/{id}`) or in the
//     `history-get` response body itself. This suite reads `kind`
//     straight off the intercepted `history-get` JSON response (the same
//     data `fetchHistory()` parses) and navigates directly to
//     `/coach/correction/{kind}/{id}` per candidate — avoiding a click +
//     back-navigation dance for every retry.
//   - A submission that predates schema v2 makes `fetchCorrection()`
//     throw `correction_unavailable`
//     (`src/learner/coach/correction/correctionApi.ts`), which the
//     walkthrough screen renders as the generic `correction-walkthrough-
//     error` state — there is no dedicated "schema v2" testid, this IS
//     the branch the task brief calls "the error state if that row
//     predates schema v2".
//   - `DimensionCard`'s testid is self-derived from the dimension key:
//     `correction-dimension-{key}` (schreiben: erfuellung/kohaerenz/
//     wortschatz/strukturen; sprechen: aufgabe/kohaerenz/wortschatz/
//     grammatik/aussprache).
//   - `AnnotatedTranscriptView` only mounts for a sprechen dimension that
//     actually carries `evidence_spans.length > 0` — a perfectly-scored
//     dimension can legitimately carry zero spans, in which case NO
//     transcript/highlight exists for that dimension at all. This suite
//     tolerates that as one more content-gap branch (tries the next
//     candidate row, up to 3, same as the schema-v2 retry loop) rather
//     than failing when a highlight can't be found.
//   - The drill CTA on every `DimensionCard`/`ObservationCard` in this
//     branch's screens is deliberately INERT (issue #416 — no
//     server-generated launch payload from a read-only walkthrough) —
//     this suite never asserts it navigates anywhere.
const TEST_EMAIL = "qa1@df.dev";
const TEST_PASSWORD = "test1234567890";

async function login(page: Page): Promise<void> {
  await page.goto("/fr/app/login");
  await page.locator("#login-email").fill(TEST_EMAIL);
  await page.locator("#login-password").fill(TEST_PASSWORD);
  await page.getByTestId("login-submit").click();
  await page.waitForURL("**/fr/app", { timeout: 15_000 });
}

// File-scoped metered-request accumulators — shared across every spec in
// this `describe.serial` block (Playwright always runs a serial block in a
// single worker process, so this shared state is safe). `drillAttempt` is
// tracked defensively even though this file never launches a drill chain
// (the inert dimension-card CTAs guarantee that) — an unexpected nonzero
// count here would itself be a loud signal of a wiring regression.
const fileMeteredRequests = {
  aiCoach: [] as string[],
  consumeTrial: [] as string[],
  drillAttempt: [] as string[],
};

function trackFileMeteredRequests(page: Page): void {
  page.on("request", (req) => {
    const url = req.url();
    if (url.includes("/ai-coach")) fileMeteredRequests.aiCoach.push(url);
    if (url.includes("/consume-trial")) fileMeteredRequests.consumeTrial.push(url);
    if (url.includes("/drill-attempt")) fileMeteredRequests.drillAttempt.push(url);
  });
}

/** Logs cumulative file-wide totals and asserts the binding quota
 * discipline: `ai-coach` never exceeds 1 across the WHOLE FILE (spec (d)
 * is the only spec allowed to push it to exactly 1), `consume-trial`
 * exactly 0 forever. `drill-attempt` is logged only. */
function assertFileMeteredDiscipline(tag: string): void {
  console.log(
    `[coach e2e][${tag}] cumulative file totals — ai-coach: ${fileMeteredRequests.aiCoach.length} (<=1, exactly 1 only after spec d), consume-trial: ${fileMeteredRequests.consumeTrial.length} (must be 0), drill-attempt: ${fileMeteredRequests.drillAttempt.length} (informational — this file never launches a drill chain)`
  );
  expect(fileMeteredRequests.aiCoach.length).toBeLessThanOrEqual(1);
  expect(fileMeteredRequests.consumeTrial.length).toBe(0);
}

const CORRECTION_SKIP_MESSAGE = (kind: string): string =>
  `qa1 has no graded ${kind} submission on dev — backend#415 blocks creating one; re-run after grader fix`;

test.describe.serial("Betreuer hub, chat, correction walkthrough (qa1, real backend)", () => {
  test("(a) zero-quota — hub renders four tiles (oral disabled), discuter -> chat, back, correction -> picker, zero consume-trial", async ({
    page,
  }) => {
    test.setTimeout(60_000);
    trackFileMeteredRequests(page);

    await login(page);
    await page.goto("/fr/app/coach");
    await expect(page.getByTestId("betreuer-hub-screen")).toBeVisible({ timeout: 20_000 });

    await expect(page.getByTestId("betreuer-hub-tile-discuter")).toBeVisible();
    await expect(page.getByTestId("betreuer-hub-tile-exercices")).toBeVisible();
    await expect(page.getByTestId("betreuer-hub-tile-correction")).toBeVisible();

    const oralTile = page.getByTestId("betreuer-hub-tile-oral");
    await expect(oralTile).toBeVisible();
    await expect(oralTile).toHaveAttribute("aria-disabled", "true");
    await expect(page.getByTestId("betreuer-hub-tile-oral-status")).toHaveText("À venir");
    // The disabled tile renders as a plain <div>, never a real anchor.
    expect(await oralTile.evaluate((el) => el.tagName)).not.toBe("A");

    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({ path: "test-results/s9-coach-hub-mobile.png", fullPage: true });
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.screenshot({ path: "test-results/s9-coach-hub-desktop.png", fullPage: true });

    // discuter -> chat
    await page.getByTestId("betreuer-hub-tile-discuter").click();
    await page.waitForURL(/\/coach\/chat/, { timeout: 15_000 });
    await expect(page.getByTestId("coach-chat-screen")).toBeVisible({ timeout: 20_000 });

    // back -> hub again
    await page.goBack();
    await expect(page.getByTestId("betreuer-hub-screen")).toBeVisible({ timeout: 20_000 });

    // correction -> picker
    await page.getByTestId("betreuer-hub-tile-correction").click();
    await page.waitForURL(/\/coach\/correction$/, { timeout: 15_000 });
    await expect(page.getByTestId("correction-picker")).toBeVisible({ timeout: 20_000 });

    assertFileMeteredDiscipline("a");
  });

  test("(b) zero-quota — chat resolve branch (opener/resumed/quiet, log which), thread panel viewport behavior, new conversation", async ({
    page,
  }) => {
    test.setTimeout(60_000);
    trackFileMeteredRequests(page);

    await login(page);

    // Desktop first — persistent panel must be VISIBLE (always mounted,
    // CSS-hidden below `lg`, never DOM-absent).
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/fr/app/coach/chat");
    await expect(page.getByTestId("coach-chat-screen")).toBeVisible({ timeout: 20_000 });

    // Resolve which chat-content branch rendered — all three are PASS
    // states (see file header). Give the resolve effect + transcript memo
    // a moment to settle before reading.
    const opener = page.getByTestId("coach-message-scripted-coach-opener");
    const anyMessage = page.locator('[data-testid^="coach-message-"]');
    await page
      .waitForFunction(
        () => document.querySelector('[data-testid="coach-chat-loading-indicator"]') === null,
        { timeout: 20_000 }
      )
      .catch(() => {
        // Defensive — if the loading indicator testid is somehow never
        // observed at all, the branch check below still runs unguarded.
      });

    let branch: string;
    if (await opener.isVisible().catch(() => false)) {
      branch = "fresh-thread-scripted-opener";
    } else if ((await anyMessage.count()) > 0) {
      branch = "resumed-thread-history";
    } else {
      branch = "fresh-thread-quiet (opener already seen this account, no observation signal)";
    }
    console.log(`[coach e2e][b] chat-content branch: ${branch}`);

    await expect(page.getByTestId("coach-thread-panel")).toBeVisible({ timeout: 15_000 });
    await page.screenshot({ path: "test-results/s9-coach-chat-desktop.png", fullPage: true });

    // Mobile — persistent panel hidden until the header hamburger opens
    // the drawer variant.
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(page.getByTestId("coach-thread-panel")).not.toBeVisible({ timeout: 10_000 });
    await page.screenshot({ path: "test-results/s9-coach-chat-mobile.png", fullPage: true });

    await page.getByTestId("coach-thread-header-menu").click();
    await expect(page.getByTestId("coach-thread-panel-drawer")).toBeVisible({ timeout: 10_000 });
    await page.screenshot({
      path: "test-results/s9-coach-chat-mobile-drawer.png",
      fullPage: true,
    });

    // "Nouvelle conversation" (drawer variant) -> fresh /coach/chat/{id}
    await page.getByTestId("coach-thread-panel-drawer-new").click();
    await page.waitForURL(/\/coach\/chat\/[0-9a-f-]+$/, { timeout: 15_000 });
    await expect(page.getByTestId("coach-chat-screen")).toBeVisible({ timeout: 20_000 });

    assertFileMeteredDiscipline("b");
  });

  test("(c) zero-quota — correction walkthrough: picker rows, schreiben diff (or schema-v2 retry, max 3), sprechen dimension cards + highlight -> justification", async ({
    page,
  }) => {
    test.setTimeout(120_000);
    trackFileMeteredRequests(page);

    await login(page);

    // Capture history-get's real feed rows (id + kind) straight off the
    // response body — the picker's row testid carries no kind segment
    // (see file header), so this is the reliable way to find "the first
    // row of kind X" without guessing off an un-testid'd icon.
    const feedRows: { id: string; kind: "schreiben" | "sprechen" }[] = [];
    page.on("response", (res) => {
      if (!res.url().includes("/history-get")) return;
      void res
        .json()
        .then((body: unknown) => {
          const feed = (body as { feed?: unknown })?.feed;
          if (!Array.isArray(feed)) return;
          for (const row of feed) {
            const r = row as { id?: unknown; kind?: unknown };
            if (typeof r.id === "string" && (r.kind === "schreiben" || r.kind === "sprechen")) {
              feedRows.push({ id: r.id, kind: r.kind });
            }
          }
        })
        .catch(() => {
          // Non-JSON / already-consumed body — the DOM-visible gate below
          // still governs whether this spec proceeds or skips.
        });
    });

    await page.goto("/fr/app/coach/correction");
    const anyRow = page.locator('[data-testid^="correction-row-"]').first();
    const empty = page.getByTestId("correction-picker-empty");
    const error = page.getByTestId("correction-picker-error");
    await expect(anyRow.or(empty).or(error)).toBeVisible({ timeout: 30_000 });

    if (await error.isVisible().catch(() => false)) {
      test.skip(
        true,
        "correction-picker-error rendered — history-get failure, real backend issue not a content gap"
      );
    }
    if (await empty.isVisible().catch(() => false)) {
      test.skip(
        true,
        "qa1 has no graded submissions of any kind on dev — backend#415 blocks creating one; re-run after grader fix"
      );
    }

    const rowCount = await page.locator('[data-testid^="correction-row-"]').count();
    expect(rowCount).toBeGreaterThan(0);
    console.log(`[coach e2e][c] correction picker lists ${rowCount} row(s)`);

    // Let the response listener finish draining (fetchHistory already
    // resolved before the picker flipped to "ready", but the JSON parse
    // above is async) and dedupe by id (StrictMode can double-invoke the
    // mount effect in dev, firing two identical history-get calls).
    await page.waitForTimeout(300);
    const uniqueFeedRows = Array.from(new Map(feedRows.map((r) => [r.id, r])).values());
    const schreibenCandidates = uniqueFeedRows.filter((r) => r.kind === "schreiben").slice(0, 3);
    const sprechenCandidates = uniqueFeedRows.filter((r) => r.kind === "sprechen").slice(0, 3);
    console.log(
      `[coach e2e][c] history-get feed rows captured: ${uniqueFeedRows.length} (schreiben candidates=${schreibenCandidates.length}, sprechen candidates=${sprechenCandidates.length})`
    );

    // --- Schreiben: correction-diff, or schema-v2-predates retry (max 3) ---
    if (schreibenCandidates.length === 0) {
      console.warn(`[coach e2e][c] LOUD SKIP (schreiben): ${CORRECTION_SKIP_MESSAGE("schreiben")}`);
    } else {
      let schreibenRendered = false;
      for (const candidate of schreibenCandidates) {
        await page.goto(`/fr/app/coach/correction/schreiben/${candidate.id}`);
        const diff = page.getByTestId("correction-diff");
        const walkError = page.getByTestId("correction-walkthrough-error");
        await expect(diff.or(walkError)).toBeVisible({ timeout: 20_000 });
        if (await walkError.isVisible().catch(() => false)) {
          console.warn(
            `[coach e2e][c] schreiben submission ${candidate.id} predates schema v2 (correction-walkthrough-error) — trying next candidate`
          );
          continue;
        }
        await expect(diff).toBeVisible();
        await expect(page.getByTestId("correction-dimension-erfuellung")).toBeVisible();
        await expect(page.getByTestId("correction-dimension-strukturen")).toBeVisible();

        await page.setViewportSize({ width: 390, height: 844 });
        await page.screenshot({
          path: "test-results/s9-coach-correction-schreiben-diff-mobile.png",
          fullPage: true,
        });
        await page.setViewportSize({ width: 1440, height: 900 });
        await page.screenshot({
          path: "test-results/s9-coach-correction-schreiben-diff-desktop.png",
          fullPage: true,
        });

        schreibenRendered = true;
        console.log(
          `[coach e2e][c] schreiben walkthrough rendered correction-diff for submission ${candidate.id}`
        );
        break;
      }
      if (!schreibenRendered) {
        console.warn(
          `[coach e2e][c] LOUD: all ${schreibenCandidates.length} schreiben candidate(s) predate schema v2 — no correction-diff reachable this run`
        );
      }
    }

    // --- Sprechen: dimension cards, highlight -> justification panel ---
    if (sprechenCandidates.length === 0) {
      console.warn(`[coach e2e][c] LOUD SKIP (sprechen): ${CORRECTION_SKIP_MESSAGE("sprechen")}`);
    } else {
      let sprechenRendered = false;
      let highlightClicked = false;
      for (const candidate of sprechenCandidates) {
        await page.goto(`/fr/app/coach/correction/sprechen/${candidate.id}`);
        const dimCard = page.getByTestId("correction-dimension-aufgabe");
        const walkError = page.getByTestId("correction-walkthrough-error");
        await expect(dimCard.or(walkError)).toBeVisible({ timeout: 20_000 });
        if (await walkError.isVisible().catch(() => false)) {
          console.warn(
            `[coach e2e][c] sprechen submission ${candidate.id} predates schema v2 (correction-walkthrough-error) — trying next candidate`
          );
          continue;
        }
        sprechenRendered = true;
        await expect(dimCard).toBeVisible();
        await expect(page.getByTestId("correction-dimension-aussprache")).toBeVisible();

        const transcript = page.locator('[data-testid^="correction-transcript-"]').first();
        if ((await transcript.count()) === 0) {
          console.warn(
            `[coach e2e][c] sprechen submission ${candidate.id} carries zero evidence spans across all dimensions — no transcript/highlight to click; trying next candidate for the highlight assertion`
          );
          continue;
        }
        const transcriptTestId = await transcript.getAttribute("data-testid");
        if (!transcriptTestId) throw new Error("transcript element has no data-testid");
        const highlight = page.getByTestId(`${transcriptTestId}-highlight-0`);
        await expect(highlight).toBeVisible({ timeout: 10_000 });

        await page.setViewportSize({ width: 390, height: 844 });
        await page.screenshot({
          path: "test-results/s9-coach-correction-sprechen-transcript-mobile.png",
          fullPage: true,
        });
        await page.setViewportSize({ width: 1440, height: 900 });
        await page.screenshot({
          path: "test-results/s9-coach-correction-sprechen-transcript-desktop.png",
          fullPage: true,
        });

        await highlight.click();
        const notes = page.getByTestId(`${transcriptTestId}-notes`);
        await expect(notes).toBeVisible({ timeout: 10_000 });
        highlightClicked = true;
        console.log(
          `[coach e2e][c] sprechen walkthrough: clicked ${transcriptTestId}-highlight-0, justification panel rendered`
        );
        break;
      }
      if (!sprechenRendered) {
        console.warn(
          `[coach e2e][c] LOUD: all ${sprechenCandidates.length} sprechen candidate(s) predate schema v2 — no dimension cards reachable this run`
        );
      } else if (!highlightClicked) {
        console.warn(
          "[coach e2e][c] LOUD: none of the tried sprechen candidates carried evidence spans — dimension cards verified, highlight/justification assertion not exercised this run (content gap, not a defect)"
        );
      }
    }

    assertFileMeteredDiscipline("c");
  });

  test("(d) METERED — one coach message OR the designed 429 branch; ai-coach fires exactly once file-wide", async ({
    page,
  }) => {
    test.setTimeout(120_000);
    trackFileMeteredRequests(page);

    await login(page);
    await page.goto("/fr/app/coach/chat");
    await expect(page.getByTestId("coach-chat-screen")).toBeVisible({ timeout: 20_000 });

    const input = page.getByTestId("coach-chat-input");
    const send = page.getByTestId("coach-chat-send");
    await expect(input).toBeVisible({ timeout: 15_000 });
    await expect(send).toBeEnabled({ timeout: 10_000 });

    await input.fill("Peux-tu m'expliquer la différence entre 'weil' et 'da' ?");

    const aiCoachResponsePromise = page.waitForResponse((res) => res.url().includes("/ai-coach"), {
      timeout: 90_000,
    });
    await send.click(); // EXACTLY ONCE across this whole file — never retried.
    const aiCoachResponse = await aiCoachResponsePromise;

    console.log(
      `[coach e2e][d] ai-coach response status: ${aiCoachResponse.status()}, file-wide ai-coach requests: ${fileMeteredRequests.aiCoach.length}`
    );
    expect(fileMeteredRequests.aiCoach.length).toBe(1);

    if (aiCoachResponse.status() === 429) {
      console.warn(
        "[coach e2e][d] LOUD: 429 branch — ai-coach's 30/24h RPC cap is already burned (by this run or prior real usage). Asserting the rate-limit banner + disabled composer, NOT retrying."
      );
      const banner = page.getByTestId("coach-chat-error-banner");
      await expect(banner).toBeVisible({ timeout: 15_000 });
      await expect(banner).toContainText("Trop de messages d'affilée");
      await expect(input).toBeDisabled();
      await expect(send).toBeDisabled();
    } else if (aiCoachResponse.ok()) {
      console.log("[coach e2e][d] success branch — awaiting the assistant reply bubble");
      const assistantBubble = page.locator('[data-testid^="coach-message-"]').last();
      await expect(assistantBubble).toBeVisible({ timeout: 90_000 });
      console.log("[coach e2e][d] assistant bubble rendered — coach_message roundtrip complete");
    } else {
      throw new Error(
        `[coach e2e][d] ai-coach returned unexpected status ${aiCoachResponse.status()} — neither the success branch nor the tolerated 429 branch; this is a genuine defect, not a content gap`
      );
    }

    assertFileMeteredDiscipline("d");
  });
});
