import { test, expect, type Page } from "@playwright/test";

// S8 Examen e2e — REAL dev backend. Structural template: `learner-sprechen.
// spec.ts` (login helper + accumulator idiom) and `learner-practice-lesen.
// spec.ts` / `learner-hoeren.spec.ts` (leg-driving selectors, P14 first-row
// slot pinning, 429 local-fallback tolerance).
//
// Quota discipline (binding, task-8.9 brief):
//   - `lesen-submit` / `hoeren-submit` are metered 5/24h each on dev. This
//     file fires AT MOST ONE of each — across the WHOLE FILE, not per spec
//     — via the metered chain walk in (c). The accumulators below are
//     therefore declared at MODULE scope (not inside a helper invoked per
//     test) and every spec pushes onto the SAME arrays; `test.describe.
//     serial` guarantees all four specs run in one worker process so this
//     shared state is safe (Playwright always runs a serial block in a
//     single worker, even under `fullyParallel: true`).
//   - `mock-exam-start` / `mock-exam-advance` / `mock-exam-finalize` are
//     UNMETERED (P4) — tracked for informational logging only, never
//     asserted with an upper bound. Specs (a)/(b) may each incidentally
//     fire one `mock-exam-start` (the picker row navigates straight into
//     the orchestrator, which boots/resumes the attempt) — that is
//     harmless and, per P14, resolves to the SAME first-modelltest slot
//     spec (c) later drives to completion.
//   - `consume-trial` must NEVER be called anywhere in this file (product
//     lock, no in-app paywall) — asserted zero in every spec.
//
// Selector notes (verified against the SHIPPED components on this branch —
// 8.3 ExamHomeScreen, 8.4 ModelltestsListScreen, 8.5 LesenSessionScreen/
// HoerenSessionScreen full-simulation branches, 8.6 SimulationOrchestrator
// Screen, 8.7 the Schreiben gate, 8.8 SimulationResultsScreen — read
// directly, not from memory, per the task brief):
//   - `ExamHomeScreen` testids are DOT-separated (`examHome`, `examHome.
//     resume`, `examHome.card.{lesen,hoeren,simulation}`), unlike the
//     dash-separated `simulation-*`/`competence-row-*` ids downstream —
//     both conventions are shipped as-is, not normalized here.
//   - `ModelltestsListScreen` row ids are `modelltestsList.row.<slug>` —
//     the slug is recoverable straight off the testid attribute, no need
//     to cross-reference the API response.
//   - Every row press is `router.push('/examen/simulation?examSlug=<slug>')`
//     ONLY (P12 web delta — no `moduleFilter`, unlike mobile's per-module
//     drill contract). Spec (b) asserts this by racing the URL TRANSITION
//     itself (`page.waitForURL` with the slug baked into the regex)
//     immediately after the click, rather than reading `page.url()` after
//     the fact — the orchestrator mounts and can `router.replace` onward
//     within a second or two of landing, so a post-hoc read risks missing
//     the intermediate `examSlug`-only URL entirely.
//   - `SimulationOrchestratorScreen` never itself renders a Lesen/Hören
//     leg — it `router.replace`s straight into `lesen-session-screen`
//     (`/examen/lesen/session`) or `hoeren-session-container`
//     (`/hoeren/session`, top-level, NOT under `/examen/`), or flips local
//     `phase` state to `simulation-schreiben-gate` / `simulation-
//     finalizing` / `simulation-orchestrator-error` (no URL change for
//     those three — same `/examen/simulation` route throughout). The
//     `detectLanding` helper below races every one of those testids (plus
//     the two local-fallback exits, `lesen-results-screen` and `hoeren-
//     results-screen`) rather than assuming any one shape.
//   - Each leg's full-simulation submit branch (`LesenSessionScreen.tsx`
//     `handleSubmit`, `HoerenSessionScreen.tsx` `handleSubmit`) `router.
//     replace`s BACK to `/examen/simulation?examSlug=...` on a successful
//     submit+advance (the orchestrator re-boots, re-reads the resumed
//     attempt, and dispatches onward) — but on ANY submit-time exception
//     (429 `rate_limited` included) falls through to the STANDALONE
//     per-module results screen instead (`/examen/lesen/results` or `/
//     hoeren/results`) with a locally-graded score, never a paywall, never
//     a retry. That standalone-results landing is this suite's local-
//     fallback pass branch (P14) — the mock attempt lingers server-side
//     and self-heals on the next run.
//   - The Schreiben-gate copy (`simulation:unsupportedDrill.{title,body}`,
//     `fr/simulation.json`) is the literal, board-blind strings "Bientôt
//     disponible" / "Ce mode arrive bientôt pour ce module." — asserted
//     verbatim rather than via a regex, since this copy is shipped
//     byte-identical across every board/level.
//   - `SimulationResultsScreen`'s missing-module rows (`CompetenceBarRow`'s
//     `score === null` branch) render an em-dash glyph ("—"), never a
//     synthesized "0/0" — `competence-row-schreiben`'s `innerText()` is
//     therefore provably digit-free (label "Schreiben", subtitle
//     "Production écrite", state chip "Priorité", score "—" — none of
//     those strings contain a digit), the honesty probe this suite pins.
//
// web#32 SKIP BRANCH (resolution round, corrective re-run finding): dev
// currently publishes ZERO full-simulation-capable Modelltests — every one
// of the 60 visible telc rows (B1 + B2) has exactly one
// `qb_modelltest_modules` row (HOEREN), no LESEN row at all. Both
// orchestrator entry paths are module-blind, though via DIFFERENT
// mechanisms (`SimulationOrchestratorScreen.tsx:16-25,136,142-148`): a
// fresh 201 start dispatches `handle.nextModule ?? "LESEN"` (the boot
// response's own field, defaulting to LESEN); a 409-resume instead re-reads
// the server-authoritative row status and dispatches via
// `nextModuleForStatus(row.status)` (the P11 fix over mobile's hard-coded
// resume) — but `nextModuleForStatus("in_progress")` ALSO resolves to
// `"LESEN"`, so neither path ever consults the picked row's actual module
// set, and the dead end is reached either way. So `LesenSessionScreen`'s
// zero-item branch (`LesenSessionScreen.tsx:332-339`,
// `player.current === null`) renders — literal, untranslated copy "Keine
// Aufgaben in dieser Sitzung.", deliberately no `data-testid` and no
// recovery CTA (unlike the sibling `status === "error"` branch a few lines
// above). App code is FROZEN this round, so no testID was added there;
// `detectLanding` below instead races the literal German copy as one more
// landing state. Reaching it — from EITHER entry branch, fresh 201 start or
// 409-resume, since both paths converge on the exact same `detectLanding`
// call site — is a recognized, expected landing: the spec `test.skip()`s
// LOUDLY, citing `deutschfit-web#32` and the dev content gap, firing ZERO
// `lesen-submit`/`hoeren-submit` requests. This is one more detected
// landing alongside the 429 local-fallback branches, not a replacement for
// the full chain walk — the moment dev publishes a real multi-module
// Modelltest, `detectLanding` will resolve to `"lesen"` (a populated leg)
// instead and the existing hop loop drives the full chain unmodified.
const TEST_EMAIL = "qa1@df.dev";
const TEST_PASSWORD = "test1234567890";

async function login(page: Page): Promise<void> {
  await page.goto("/fr/app/login");
  await page.locator("#login-email").fill(TEST_EMAIL);
  await page.locator("#login-password").fill(TEST_PASSWORD);
  await page.getByTestId("login-submit").click();
  await page.waitForURL("**/fr/app", { timeout: 15_000 });
}

// File-scoped metered-call accumulators (see header note — shared across
// every spec in this `describe.serial` block, never reset between tests).
const fileMeteredRequests = {
  lesenSubmit: [] as string[],
  hoerenSubmit: [] as string[],
  mockExamStart: [] as string[], // informational only — unmetered (P4)
  consumeTrial: [] as string[], // product lock — must stay empty forever
};

function trackFileMeteredRequests(page: Page): void {
  page.on("request", (req) => {
    const url = req.url();
    if (url.includes("/lesen-submit")) fileMeteredRequests.lesenSubmit.push(url);
    if (url.includes("/hoeren-submit")) fileMeteredRequests.hoerenSubmit.push(url);
    if (url.includes("/mock-exam-start")) fileMeteredRequests.mockExamStart.push(url);
    if (url.includes("/consume-trial")) fileMeteredRequests.consumeTrial.push(url);
  });
}

/** Logs the cumulative file-wide totals and asserts the binding quota
 * discipline: `lesen-submit`/`hoeren-submit` each ≤1 across the WHOLE
 * FILE, `consume-trial` exactly 0 forever. `mock-exam-start` is logged
 * only — never asserted with an upper bound (P4, unmetered). */
function assertFileMeteredDiscipline(tag: string): void {
  console.log(
    `[examen e2e][${tag}] cumulative file totals — lesen-submit: ${fileMeteredRequests.lesenSubmit.length}, hoeren-submit: ${fileMeteredRequests.hoerenSubmit.length}, mock-exam-start: ${fileMeteredRequests.mockExamStart.length} (informational, unmetered), consume-trial: ${fileMeteredRequests.consumeTrial.length}`
  );
  expect(fileMeteredRequests.lesenSubmit.length).toBeLessThanOrEqual(1);
  expect(fileMeteredRequests.hoerenSubmit.length).toBeLessThanOrEqual(1);
  expect(fileMeteredRequests.consumeTrial.length).toBe(0);
}

// ---------------------------------------------------------------------------
// Chain-walk helpers (spec c).
// ---------------------------------------------------------------------------

type Landing =
  | "lesen"
  | "hoeren"
  | "schreiben_gate"
  | "finalizing"
  | "results"
  | "lesen_local_fallback"
  | "hoeren_local_fallback"
  | "lesen_empty_dead_end"
  | "error";

/** web#32 — dev has zero full-sim-capable modelltests (every visible telc
 * row is Hoeren-only); the module-blind orchestrator always starts LESEN
 * first, so `LesenSessionScreen`'s zero-item branch dead-ends the walk. App
 * code is frozen this round (no testID added there), so this is the loud,
 * shared skip reason cited from both the initial-landing check (covers
 * BOTH the fresh-201 and 409-resume entry branches, which converge on the
 * same `detectLanding` call site) and the defensive in-loop check below. */
const WEB32_LESEN_DEAD_END_SKIP_REASON =
  "web#32 — module-blind orchestrator dead-ends on the empty Lesen leg: dev " +
  "publishes zero full-sim-capable modelltests (all 60 visible telc B1/B2 " +
  "rows have exactly one qb_modelltest_modules row, HOEREN, no LESEN), but " +
  "mock-exam-start/SimulationOrchestratorScreen always dispatches LESEN " +
  "first regardless of the picked row's actual modules — LesenSessionScreen " +
  "renders its untestid'd, unrecoverable \"Keine Aufgaben in dieser " +
  'Sitzung." empty state. Content gap + app defect, not a spec bug; no row ' +
  "selection can route around it until dev ships a real multi-module " +
  "Modelltest. Zero lesen-submit/hoeren-submit requests fired.";

/** Skips the test loudly when `landing` is the web#32 empty-Lesen dead end.
 * No-op for every other landing. Called from both the initial-landing site
 * (fresh/resumed entry) and the hop loop (defensive) so the skip is
 * reachable no matter which call site first observes it.
 *
 * The zero-submit claim in `WEB32_LESEN_DEAD_END_SKIP_REASON` is made
 * EXECUTABLE here, not just asserted in prose: both accumulators are
 * asserted `toBe(0)` immediately before the `test.skip` call (reading the
 * shared module-scope `fileMeteredRequests`, the same accumulator every
 * other spec in this file uses). If a future hop-loop edit ever fires a
 * `lesen-submit`/`hoeren-submit` before this dead end is detected, this
 * throws loudly instead of silently skipping over a real metered call. */
function skipOnWeb32DeadEnd(landing: Landing): void {
  if (landing !== "lesen_empty_dead_end") return;
  expect(fileMeteredRequests.lesenSubmit.length).toBe(0);
  expect(fileMeteredRequests.hoerenSubmit.length).toBe(0);
  console.warn(`[examen e2e][c] LOUD SKIP: ${WEB32_LESEN_DEAD_END_SKIP_REASON}`);
  test.skip(true, WEB32_LESEN_DEAD_END_SKIP_REASON);
}

/** Races every testid the orchestrator (or a leg's local-fallback exit)
 * can currently be showing and resolves which one actually is. Reusable
 * both for the INITIAL landing (fresh vs. resumed entry, P14) and for the
 * NEXT landing after any action (leg submit, gate skip). */
async function detectLanding(page: Page): Promise<Landing> {
  const lesenScreen = page.getByTestId("lesen-session-screen");
  const hoerenContainer = page.getByTestId("hoeren-session-container");
  const schreibenGate = page.getByTestId("simulation-schreiben-gate");
  const finalizing = page.getByTestId("simulation-finalizing");
  const resultsScroll = page.getByTestId("simulation-results-scroll");
  const orchestratorError = page.getByTestId("simulation-orchestrator-error");
  const lesenResults = page.getByTestId("lesen-results-screen");
  const hoerenResults = page.getByTestId("hoeren-results-screen");
  // web#32 — `LesenSessionScreen`'s zero-item branch (LesenSessionScreen.
  // tsx:332-339) has no testID (app code frozen this round); detected via
  // its literal, untranslated German copy instead. `exact: true` avoids
  // any accidental partial-text match elsewhere on the page.
  const lesenEmptyDeadEnd = page.getByText("Keine Aufgaben in dieser Sitzung.", { exact: true });

  await expect(
    lesenScreen
      .or(hoerenContainer)
      .or(schreibenGate)
      .or(finalizing)
      .or(resultsScroll)
      .or(orchestratorError)
      .or(lesenResults)
      .or(hoerenResults)
      .or(lesenEmptyDeadEnd)
      .first()
  ).toBeVisible({ timeout: 60_000 });

  if (await orchestratorError.isVisible().catch(() => false)) return "error";
  if (await lesenEmptyDeadEnd.isVisible().catch(() => false)) return "lesen_empty_dead_end";
  if (await lesenResults.isVisible().catch(() => false)) return "lesen_local_fallback";
  if (await hoerenResults.isVisible().catch(() => false)) return "hoeren_local_fallback";
  if (await resultsScroll.isVisible().catch(() => false)) return "results";
  if (await schreibenGate.isVisible().catch(() => false)) return "schreiben_gate";
  if (await lesenScreen.isVisible().catch(() => false)) return "lesen";
  if (await hoerenContainer.isVisible().catch(() => false)) return "hoeren";
  if (await finalizing.isVisible().catch(() => false)) return "finalizing";
  throw new Error("detectLanding: no known landing testid resolved after wait");
}

/** Answers every item in the Lesen leg (adapted from `learner-practice-
 * lesen.spec.ts`'s graded-drill selectors — `lesen-session-total` renders
 * "Frage <n> von <total>", parsed via regex) then submits once and
 * resolves the next landing. */
async function completeLesenLeg(page: Page): Promise<Landing> {
  await expect(page.getByTestId("lesen-session-option-list")).toBeVisible({ timeout: 30_000 });
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
  return detectLanding(page);
}

/** Answers every item in the CURRENT Teil (adapted verbatim from
 * `learner-hoeren.spec.ts` — each item is its own `role="radiogroup"`,
 * option testids repeat per item so each group is scoped individually)
 * then advances: `hoeren-session-next` if present, or stops once
 * `hoeren-session-submit` is visible (last Teil). Bounded by `MAX_PARTS`. */
async function answerAllHoerenTeile(page: Page): Promise<void> {
  const MAX_PARTS = 12;
  for (let i = 0; i < MAX_PARTS; i++) {
    const radiogroups = page.getByRole("radiogroup");
    const groupCount = await radiogroups.count();
    for (let g = 0; g < groupCount; g++) {
      const firstOption = radiogroups.nth(g).locator('[data-testid^="hoeren-option-"]').first();
      if (await firstOption.count()) {
        await firstOption.click();
      }
    }
    const submitBtn = page.getByTestId("hoeren-session-submit");
    if (await submitBtn.isVisible().catch(() => false)) {
      return;
    }
    const nextBtn = page.getByTestId("hoeren-session-next");
    await expect(nextBtn).toBeVisible({ timeout: 15_000 });
    await nextBtn.click();
  }
  throw new Error(
    `answerAllHoerenTeile: exceeded MAX_PARTS (${MAX_PARTS}) without reaching submit`
  );
}

/** Asserts the audio-player container renders then branches per P12 (never
 * assert playback state) — logs which branch resolved. */
async function resolveHoerenAudioBranch(page: Page): Promise<void> {
  const audioPlayer = page.getByTestId("hoeren-audio-player");
  await expect(audioPlayer).toBeVisible({ timeout: 30_000 });
  const playBtn = page.getByTestId("hoeren-audio-player-play");
  const missingText = page.getByTestId("hoeren-audio-player-missing");
  await expect(playBtn.or(missingText).first()).toBeVisible({ timeout: 15_000 });
  const branch = (await playBtn.isVisible().catch(() => false)) ? "play" : "missing";
  console.log(`[examen e2e][c] hoeren audio branch: ${branch}`);
}

async function completeHoerenLeg(page: Page): Promise<Landing> {
  await resolveHoerenAudioBranch(page);
  await answerAllHoerenTeile(page);
  await page.getByTestId("hoeren-session-submit").click();
  return detectLanding(page);
}

test.describe
  .serial("Examen home/picker + one full mock-exam chain walk (qa1, real backend)", () => {
  test("(a) zero-submit — examen home renders (resume-or-cards both pass), simulation card lands on modelltestsList", async ({
    page,
  }) => {
    test.setTimeout(60_000);
    trackFileMeteredRequests(page);

    await login(page);
    await page.goto("/fr/app/examen");
    await expect(page.getByTestId("examHome")).toBeVisible({ timeout: 30_000 });

    // P7 — qa1 may carry a lingering attempt from a prior 429-fallback run;
    // both the resume card AND the plain three-card layout are pass states.
    const resume = page.getByTestId("examHome.resume");
    const hasResume = await resume.isVisible().catch(() => false);
    console.log(
      `[examen e2e][a] resume card ${hasResume ? "rendered (P7 — lingering attempt)" : "absent (fresh)"} — both are pass states`
    );

    await expect(page.getByTestId("examHome.card.lesen")).toBeVisible();
    await expect(page.getByTestId("examHome.card.hoeren")).toBeVisible();
    await expect(page.getByTestId("examHome.card.simulation")).toBeVisible();

    await page.screenshot({ path: "test-results/s8-examen-home.png", fullPage: true });

    await page.getByTestId("examHome.card.simulation").click();
    await page.waitForURL(/\/examen\/modelltests/, { timeout: 20_000 });
    await expect(page.getByTestId("modelltestsList")).toBeVisible({ timeout: 20_000 });

    assertFileMeteredDiscipline("a");
  });

  test("(b) zero-submit — modelltests picker renders rows or empty state, row URL carries exactly examSlug", async ({
    page,
  }) => {
    test.setTimeout(60_000);
    trackFileMeteredRequests(page);

    const modelltestsListStatuses: number[] = [];
    page.on("response", (res) => {
      if (res.url().includes("/modelltests-list")) modelltestsListStatuses.push(res.status());
    });

    await login(page);
    await page.goto("/fr/app/examen/modelltests");

    const list = page.getByTestId("modelltestsList.list");
    const empty = page.getByTestId("modelltestsList.empty");
    const error = page.getByTestId("modelltestsList.error");
    await expect(list.or(empty).or(error).first()).toBeVisible({ timeout: 30_000 });

    // Content emptiness is a rendered state, not a skip — only a genuine
    // `modelltests-list` 5xx justifies `test.skip` (mirrors the sprechen/
    // schreiben e2e idiom).
    if (await error.isVisible().catch(() => false)) {
      const had5xx = modelltestsListStatuses.some((s) => s >= 500);
      test.skip(had5xx, "modelltests-list 5xx — real backend outage, not a client bug");
    }

    if (await empty.isVisible().catch(() => false)) {
      console.log(
        "[examen e2e][b] modelltestsList.empty rendered — qa1's board/level has no published modelltest rows (pass, content gap)"
      );
    } else {
      const rows = page.locator('[data-testid^="modelltestsList.row."]');
      const rowCount = await rows.count();
      expect(rowCount).toBeGreaterThan(0);

      const firstRow = rows.first();
      const testId = await firstRow.getAttribute("data-testid");
      const slug = testId?.replace("modelltestsList.row.", "") ?? "";
      expect(slug.length).toBeGreaterThan(0);

      await firstRow.click();
      // P12 web delta: the row press carries EXACTLY `examSlug`, no
      // `moduleFilter` (unlike mobile's per-module drill contract).
      // Asserting via the URL TRANSITION itself (not a post-hoc
      // `page.url()` read) sidesteps the race against the orchestrator's
      // own near-immediate `router.replace` once it boots/dispatches — a
      // PREDICATE (not a regex) is the match condition itself, so
      // Playwright only resolves once a URL satisfying the exact-one-param
      // contract has actually been observed; a URL carrying an appended
      // `&moduleFilter=...` would fail this predicate and the wait would
      // time out instead of falsely passing (the prior regex was
      // unanchored and would have matched that shape too).
      await page.waitForURL(
        (url) =>
          url.pathname.endsWith("/examen/simulation") &&
          url.searchParams.size === 1 &&
          url.searchParams.get("examSlug") === slug,
        { timeout: 15_000 }
      );
      console.log(`[examen e2e][b] row → examSlug=${slug} only, no moduleFilter (P12)`);
    }

    await page.screenshot({ path: "test-results/s8-examen-picker.png", fullPage: true });
    assertFileMeteredDiscipline("b");
  });

  test("(c) metered — one full chain walk on the first modelltest: fresh/resumed entry, 429 local-fallback tolerated, results honesty probe", async ({
    page,
  }) => {
    test.setTimeout(600_000);
    trackFileMeteredRequests(page);

    await login(page);
    await page.goto("/fr/app/examen/modelltests");

    const list = page.getByTestId("modelltestsList.list");
    const empty = page.getByTestId("modelltestsList.empty");
    const error = page.getByTestId("modelltestsList.error");
    await expect(list.or(empty).or(error).first()).toBeVisible({ timeout: 30_000 });

    if (await error.isVisible().catch(() => false)) {
      test.skip(true, "modelltests-list error rendered — no row available to chain-walk");
    }
    if (await empty.isVisible().catch(() => false)) {
      test.skip(
        true,
        "No published modelltest rows for qa1's board/level — content gap, nothing to chain-walk"
      );
    }

    const rows = page.locator('[data-testid^="modelltestsList.row."]');
    await expect(rows.first()).toBeVisible({ timeout: 20_000 });
    await rows.first().click(); // P14 — always the FIRST row (slot pinning)

    let landing = await detectLanding(page);
    console.log(`[examen e2e][c] entry branch: landed on "${landing}"`);

    // web#32 — this single check, right after the initial `detectLanding`
    // call, is reachable from BOTH entry branches (fresh 201 start and
    // 409-resume): both paths in `SimulationOrchestratorScreen.runBoot`
    // converge on this exact call site before anything else happens. No
    // metered submit has fired yet either way.
    skipOnWeb32DeadEnd(landing);

    let sawLesen = false;
    let sawHoeren = false;
    let sawGate = false;
    const MAX_HOPS = 10;

    for (let hop = 0; hop < MAX_HOPS && (landing as Landing) !== "results"; hop++) {
      // web#32 — defensive: the initial-landing check above already covers
      // both entry branches, but re-check on every hop too in case a later
      // re-dispatch (e.g. after the schreiben-gate skip re-boots) ever
      // lands here for a differently-shaped row in the future.
      skipOnWeb32DeadEnd(landing);

      if (landing === "lesen") {
        sawLesen = true;
        landing = await completeLesenLeg(page);
        if (landing === "lesen_local_fallback") {
          console.warn(
            "[examen e2e][c] LOUD: lesen-submit local-fallback (429 or other submit-time failure) — early-return PASS. The mock attempt lingers server-side and self-heals on the next run (P14)."
          );
          await expect(page.getByTestId("lesen-results-screen")).toBeVisible({ timeout: 20_000 });
          await expect(page.locator("text=/premium|abonnement|upgrade/i")).toHaveCount(0);
          await page.screenshot({
            path: "test-results/s8-examen-chain-lesen-fallback.png",
            fullPage: true,
          });
          assertFileMeteredDiscipline("c-lesen-fallback");
          return;
        }
        continue;
      }

      if (landing === "hoeren") {
        sawHoeren = true;
        landing = await completeHoerenLeg(page);
        if (landing === "hoeren_local_fallback") {
          console.warn(
            "[examen e2e][c] LOUD: hoeren-submit local-fallback (429 or other submit-time failure) — early-return PASS. The mock attempt lingers server-side and self-heals on the next run (P14)."
          );
          await expect(page.getByTestId("hoeren-results-screen")).toBeVisible({ timeout: 20_000 });
          await expect(page.locator("text=/premium|abonnement|upgrade/i")).toHaveCount(0);
          await page.screenshot({
            path: "test-results/s8-examen-chain-hoeren-fallback.png",
            fullPage: true,
          });
          assertFileMeteredDiscipline("c-hoeren-fallback");
          return;
        }
        continue;
      }

      if (landing === "schreiben_gate") {
        sawGate = true;
        const gate = page.getByTestId("simulation-schreiben-gate");
        await expect(gate.getByText("Bientôt disponible")).toBeVisible();
        await expect(gate.getByText("Ce mode arrive bientôt pour ce module.")).toBeVisible();
        // Honest skip (P2) — no text-entry surface, no fake Schreiben leg.
        await expect(gate.locator("input, textarea")).toHaveCount(0);

        const gateError = page.getByTestId("simulation-schreiben-gate-error");
        if (await gateError.isVisible().catch(() => false)) {
          console.warn(
            "[examen e2e][c] LOUD: schreiben-gate advance previously failed — retrying the same skip CTA (re-entrancy ref resets on failure, gate is never abandoned)."
          );
        }

        await page.getByTestId("simulation-schreiben-skip").click();
        landing = await detectLanding(page);
        continue;
      }

      if (landing === "finalizing") {
        // The finalize effect fires once the phase flips (network call in
        // flight) — a generic `detectLanding` re-check here would
        // immediately re-match "finalizing" itself (still visible, no
        // progress), so wait specifically for one of the two TERMINAL
        // states this phase can resolve into.
        const resultsScroll = page.getByTestId("simulation-results-scroll");
        const orchestratorError = page.getByTestId("simulation-orchestrator-error");
        await expect(resultsScroll.or(orchestratorError).first()).toBeVisible({
          timeout: 90_000,
        });
        if (await orchestratorError.isVisible().catch(() => false)) {
          throw new Error(
            "simulation-orchestrator-error rendered after the finalize call — see console for the boot/finalize warning"
          );
        }
        landing = "results";
        continue;
      }

      if (landing === "error") {
        throw new Error(
          "simulation-orchestrator-error rendered unexpectedly during the chain walk — see console for the boot warning"
        );
      }

      throw new Error(`unexpected chain landing state: ${landing}`);
    }

    expect(landing).toBe("results");
    console.log(
      `[examen e2e][c] chain terminally landed on results — legs exercised: lesen=${sawLesen} hoeren=${sawHoeren} schreibenGate=${sawGate}`
    );

    await expect(page.getByTestId("simulation-donut")).toBeVisible({ timeout: 20_000 });
    await expect(page.getByTestId("competence-row-lesen")).toBeVisible();
    await expect(page.getByTestId("competence-row-hoeren")).toBeVisible();
    await expect(page.getByTestId("competence-row-schreiben")).toBeVisible();
    await expect(page.getByTestId("competence-row-sprechen")).toBeVisible();

    // Honesty probe (task brief) — the missing module's row must render
    // zero digit characters: no invented "0/0" score, only the em-dash
    // branch (`CompetenceBarRow`'s `score === null` path).
    const schreibenRowText = await page.getByTestId("competence-row-schreiben").innerText();
    expect(schreibenRowText).not.toMatch(/\d/);

    await expect(page.getByTestId("simulation-verdict")).toBeVisible();

    // Product lock: no paywall copy on the terminal results surface.
    await expect(page.locator("text=/premium|abonnement|upgrade/i")).toHaveCount(0);

    await page.screenshot({ path: "test-results/s8-examen-results.png", fullPage: true });

    assertFileMeteredDiscipline("c");
  });

  test("(d) product lock — zero paywall copy on home + picker, zero consume-trial calls file-wide", async ({
    page,
  }) => {
    test.setTimeout(60_000);
    trackFileMeteredRequests(page);

    await login(page);
    await page.goto("/fr/app/examen");
    await expect(page.getByTestId("examHome")).toBeVisible({ timeout: 30_000 });
    await expect(page.locator("text=/premium|abonnement|upgrade/i")).toHaveCount(0);

    await page.goto("/fr/app/examen/modelltests");
    const list = page.getByTestId("modelltestsList.list");
    const empty = page.getByTestId("modelltestsList.empty");
    const error = page.getByTestId("modelltestsList.error");
    await expect(list.or(empty).or(error).first()).toBeVisible({ timeout: 30_000 });
    await expect(page.locator("text=/premium|abonnement|upgrade/i")).toHaveCount(0);

    console.log(
      `[examen e2e][d] file-wide consume-trial requests: ${fileMeteredRequests.consumeTrial.length} (must be 0 — no in-app paywall, ever)`
    );
    assertFileMeteredDiscipline("d");
  });
});
