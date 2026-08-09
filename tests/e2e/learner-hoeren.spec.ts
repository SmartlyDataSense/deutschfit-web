import { test, expect, type Page } from "@playwright/test";

// S5 Hören e2e — REAL dev backend. Structural template: `learner-practice-
// lesen.spec.ts` (S4, review-hardened) — same login helper, runtime-skip
// idiom (skip on the genuine empty-state element racing against content,
// never on timeout), and `[data-testid^="…"]:not([data-testid^="…-picker-"])`
// selector discipline for picker rows.
//
// Quota note (Constraint 12): `hoeren-submit` enforces the free-tier rate
// limit server-side, same as `lesen-submit`. The graded spec below submits
// at most once and never retries, tolerating the 429 local-fallback branch
// (P1/P8). The practice spec (spec 1) ALSO reaches `HoerenSessionScreen`'s
// submit button and — per the shipped code
// (`src/learner/hoeren/api/submit.ts` → `submitHoerenSession` →
// `submitOnServer` → `examApi.submitHoeren`) — that DOES POST to
// `/functions/v1/hoeren-submit`, just with a synthesized
// `local-<sessionId>` attempt id (practice mode never has a real server
// attempt). Traced server-side (`hoeren-submit/index.ts`): `hoeren_attempts.id`
// is a `uuid` column, so a `local-<slug>` string fails the uuid cast on the
// attempt lookup and 500s (`attErr`, index.ts:61) BEFORE the 404 null-check
// and BEFORE the `can_submit_hoeren` quota RPC even runs — i.e. the request
// fails server-side ahead of the rate-limit check, not necessarily with a
// 404. The zero-quota conclusion is unchanged (the quota RPC never fires),
// so the practice run burns zero *quota* even though it does fire one
// `hoeren-submit` *request* that errors and falls back to local grading.
// Both tests capture their own `hoeren-submit` network count via
// `page.on("request")` and log/assert on it separately so this distinction
// is visible in the run output rather than silently assumed.
//
// Selector note (verified against the SHIPPED components on this branch —
// 5.5 PracticeHubScreen/PracticeSetPickerScreen, 5.7 HoerenSessionScreen,
// 5.8 HoerenResultsScreen, 5.9 HoerenIntroScreen — per the task-5.10 brief's
// warning that S4's e2e task hit 3 selector divergences by trusting the
// plan instead of the code):
//   - Practice-set picker rows share the `practice-set-` root with the
//     picker's OWN chrome (`practice-set-picker-loading/-screen/-title/…`),
//     exactly as S4 documented — the `:not([data-testid^="practice-set-
//     picker-"])` exclusion is required, not optional.
//   - `HoerenSessionScreen` has no per-item "next" — it steps one Teil at a
//     time. `hoeren-session-next` advances to the next Teil (only rendered
//     when the current Teil isn't the last); `hoeren-session-submit`
//     replaces it on the last Teil. Every item's options render inline in
//     the current Teil at once (no click-to-open gap chips like Lesen's
//     Cloze parts) — each item is its own `role="radiogroup"`, and because
//     option keys ("a"/"b"/"c"...) repeat across items in the same Teil,
//     `hoeren-option-<key>` testids are NOT unique DOM-wide within a Teil.
//     The answer loop below scopes to each `radiogroup` individually rather
//     than blindly clicking `[data-testid^="hoeren-option-"]` first-match.
//   - `HoerenAudioPlayer`'s branch testids are `hoeren-audio-player-play`
//     (playable branch) and `hoeren-audio-player-missing` (no/failed
//     signed URL) — confirmed in `HoerenAudioPlayer.tsx:59-72`. Per the
//     brief and P12 (never assert playback state), the spec only asserts
//     presence of the container then branches on which button/text
//     resolved, logging the branch to console.
//   - `HoerenIntroScreen`'s picker root is `hoeren-intro-screen` (used
//     directly here instead of the S4 template's `getByText("Modelltest
//     wählen")` — both work; the testid is less brittle against copy
//     changes and avoids any risk of matching stray text nodes).
//   - The graded intro applies a CLIENT-SIDE level filter on top of dev's
//     60 published rows (`useAvailableHoerenModelltests.ts`) — a learner
//     whose exam-context level has zero matching rows legitimately sees
//     `hoeren-intro-empty` even though content exists dev-wide. The
//     runtime-skip guard below is defensive for exactly that case, per the
//     brief (P12's skip idiom, not a timeout-based skip).
//   - Practice mode lands on `/hoeren/results` (shared route, P9); the
//     graded drill also lands on `/hoeren/results` — both modules share
//     `HoerenResultsScreen`, unlike Lesen which only has a graded results
//     route today.
const TEST_EMAIL = "qa1@df.dev";
const TEST_PASSWORD = "test1234567890";

async function login(page: Page) {
  await page.goto("/fr/app/login");
  await page.locator("#login-email").fill(TEST_EMAIL);
  await page.locator("#login-password").fill(TEST_PASSWORD);
  await page.getByTestId("login-submit").click();
  await page.waitForURL("**/fr/app", { timeout: 15_000 });
}

/**
 * Answers every item in the CURRENT Teil (each item is its own
 * `role="radiogroup"`; option testids repeat per item, so each group is
 * scoped individually — see the header selector note) then advances: click
 * `hoeren-session-next` if present, or stop (leaving `hoeren-session-submit`
 * visible for the caller to click once) once the last Teil is reached.
 * Bounded by `MAX_PARTS` so a wiring bug can't spin the loop forever.
 */
async function answerAllTeile(page: Page): Promise<void> {
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
  throw new Error(`answerAllTeile: exceeded MAX_PARTS (${MAX_PARTS}) without reaching submit`);
}

/**
 * Asserts the audio-player container renders, then branches per the run
 * contract (P12 — never assert playback state): `-play` (expected — dev's
 * Hören sets ship real audio) or `-missing` ("Audio indisponible" — a
 * legitimate best-effort branch when server-side signing fails). Logs the
 * branch to console so PR evidence states which one ran; never fails on the
 * missing branch alone.
 */
async function resolveAudioBranch(page: Page, label: string): Promise<"play" | "missing"> {
  const audioPlayer = page.getByTestId("hoeren-audio-player");
  await expect(audioPlayer).toBeVisible({ timeout: 30_000 });
  const playBtn = page.getByTestId("hoeren-audio-player-play");
  const missingText = page.getByTestId("hoeren-audio-player-missing");
  await expect(playBtn.or(missingText).first()).toBeVisible({ timeout: 15_000 });
  const branch: "play" | "missing" = (await playBtn.isVisible().catch(() => false))
    ? "play"
    : "missing";
  // eslint-disable-next-line no-console
  console.log(`[hoeren e2e][${label}] audio branch: ${branch}`);
  return branch;
}

test.describe("Hören practice + graded drill (qa1, real backend)", () => {
  test("untimed hoeren practice: picker -> session -> answer every Teil -> results (zero quota)", async ({
    page,
  }) => {
    test.setTimeout(240_000);

    const submitRequests: string[] = [];
    page.on("request", (req) => {
      if (req.url().includes("/hoeren-submit")) {
        submitRequests.push(req.url());
      }
    });

    await login(page);
    await page.goto("/fr/app/apprendre/practice");
    await expect(page.getByTestId("practice-hub-row-hoeren")).toBeVisible({ timeout: 20_000 });
    await page.getByTestId("practice-hub-row-hoeren").click();

    // Either the multi-set picker at /apprendre/practice/hoeren (dev: 60
    // sets) or — if the learner's level ever resolves to exactly one
    // published set — the auto-forwarded session. Unlike the text
    // modalities (Lesen/Sprachbausteine), whose auto-forward stays under
    // `/apprendre/practice/<modality>/session`, Hören's `sessionPath()`
    // (`PracticeSetPickerScreen.tsx:66-70`) forwards to its OWN session
    // surface at `/hoeren/session?slug=...` — structurally outside
    // `/apprendre/practice/hoeren/...` entirely, so both disjoint
    // destinations must be raced explicitly (a single "starts with
    // /apprendre/practice/hoeren" regex, as the S4 Lesen template uses,
    // would never match the auto-forward and would 30s-timeout instead of
    // gracefully falling through).
    await page.waitForURL(/\/apprendre\/practice\/hoeren(\?.*)?$|\/hoeren\/session\?slug=/, {
      timeout: 30_000,
    });
    const setCard = page
      .locator('[data-testid^="practice-set-"]:not([data-testid^="practice-set-picker-"])')
      .first();
    if (!/\/session/.test(page.url())) {
      await setCard.waitFor({ state: "visible", timeout: 20_000 }).catch(() => {});
    }
    if (await setCard.count()) {
      // P14: deterministic slug-asc — always the first row.
      await setCard.click();
    }
    // hoeren's picker forwards to its own session surface (/hoeren/session),
    // not the shared /apprendre/practice/<modality>/session route.
    await page.waitForURL(/\/hoeren\/session/, { timeout: 30_000 });
    await expect(page.getByTestId("hoeren-session-container")).toBeVisible({ timeout: 30_000 });

    await resolveAudioBranch(page, "practice");
    await page.screenshot({
      path: "test-results/s5-hoeren-practice-session.png",
      fullPage: true,
    });

    await answerAllTeile(page);
    await page.getByTestId("hoeren-session-submit").click();

    await page.waitForURL(/\/hoeren\/results/, { timeout: 60_000 });
    await expect(page.getByTestId("hoeren-results-screen")).toBeVisible({ timeout: 20_000 });
    await expect(page.getByTestId("hoeren-results-headline")).toBeVisible();
    // Product lock: no paywall copy on any branch (Constraint 11).
    await expect(page.locator("text=/premium|abonnement|upgrade/i")).toHaveCount(0);

    // See the header note: practice mode DOES fire one `hoeren-submit`
    // request (synthetic `local-<sessionId>` attempt id, fails server-side
    // before the quota check — zero rate-limit quota consumed) — log +
    // assert it never retries.
    // eslint-disable-next-line no-console
    console.log(`[hoeren e2e][practice] hoeren-submit requests fired: ${submitRequests.length}`);
    expect(submitRequests.length).toBeLessThanOrEqual(1);
  });

  test("graded hoeren drill: modelltest picker -> live session -> results (<=1 submit, 429 local-fallback tolerated)", async ({
    page,
  }) => {
    test.setTimeout(240_000);

    const submitRequests: string[] = [];
    page.on("request", (req) => {
      if (req.url().includes("/hoeren-submit")) {
        submitRequests.push(req.url());
      }
    });

    await login(page);
    await page.goto("/fr/app/examen/hoeren");

    // Content-gap guard (defensive only — dev has 60 published HOEREN
    // Modelltest rows, but `HoerenIntroScreen` filters them to qa1's
    // exam-context level client-side, so zero rows for that level is a
    // legitimate, if unexpected, terminal state). Race the two known
    // terminal states and skip on the empty branch rather than fail.
    const picker = page.getByTestId("hoeren-intro-screen");
    const emptyState = page.getByTestId("hoeren-intro-empty");
    await expect(picker.or(emptyState).first()).toBeVisible({ timeout: 30_000 });
    if (await emptyState.isVisible().catch(() => false)) {
      test.skip(
        true,
        "No published Hören Modelltest rows for qa1's exam-context level — dev has 60 rows total (B1+B2 mixed) but HoerenIntroScreen filters client-side. Re-run once qa1's level matches published content; single metered submit."
      );
    }

    await expect(picker).toBeVisible({ timeout: 30_000 });
    // P14: always the first row — deterministic, and an in-progress slot
    // from a prior 429-abandoned run stays confined to it.
    await page.locator('[data-testid^="hoeren-modelltest-"]').first().click();
    await page.getByTestId("hoeren-intro-start").click();

    // Tolerates the resume branch (P12/brief): a lingering `in_progress`
    // slot yields an examSlug-only bootstrap with no `attemptId` query
    // param — both that and a fresh attemptId+examSlug+mockAttemptId
    // bootstrap land on the same `hoeren-session-container`.
    await page.waitForURL(/\/hoeren\/session/, { timeout: 30_000 });
    await expect(page.getByTestId("hoeren-session-container")).toBeVisible({ timeout: 30_000 });

    await resolveAudioBranch(page, "graded");

    await answerAllTeile(page);
    // Single submit, never retried — quota discipline (Constraint 12).
    await page.getByTestId("hoeren-session-submit").click();

    // Both branches land on results: server-graded OR local-fallback (429
    // rate_limited is a legitimate branch per the brief/P1).
    await page.waitForURL(/\/hoeren\/results/, { timeout: 60_000 });
    await expect(page.getByTestId("hoeren-results-screen")).toBeVisible({ timeout: 20_000 });
    await expect(page.getByTestId("hoeren-results-headline")).toBeVisible();
    // Product lock: no paywall copy on any branch (Constraint 11).
    await expect(page.locator("text=/premium|abonnement|upgrade/i")).toHaveCount(0);

    // eslint-disable-next-line no-console
    console.log(`[hoeren e2e][graded] hoeren-submit requests fired: ${submitRequests.length}`);
    expect(submitRequests.length).toBeLessThanOrEqual(1);

    await page.screenshot({ path: "test-results/s5-hoeren-results.png", fullPage: true });
  });

  test("results deep-link redirect: fresh session with no store lands on apprendre practice hub (P9)", async ({
    page,
  }) => {
    test.setTimeout(60_000);
    await login(page);
    // Direct navigation, no prior session/store write — `useHoerenResultsStore`
    // is in-memory zustand, empty on a fresh page load either way.
    await page.goto("/fr/app/hoeren/results");
    await page.waitForURL(/\/apprendre\/practice\/?(\?.*)?$/, { timeout: 20_000 });
    await expect(page.getByTestId("practice-hub-row-hoeren")).toBeVisible({ timeout: 20_000 });
  });
});
