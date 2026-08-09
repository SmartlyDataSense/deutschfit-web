import { test, expect, type Page } from "@playwright/test";

// S6 Schreiben e2e — REAL dev backend. Structural template: `learner-hoeren.
// spec.ts` / `learner-practice-lesen.spec.ts` (same login helper, runtime-skip
// idiom on a genuine backend content gap — never on a timeout — and a
// `page.on("request")` listener asserting an exact metered-call count).
//
// Quota discipline (binding, per the task-6.10 brief): the writing quota is
// 10/24h free tier on dev. ONLY spec (c) may call `submissions-create`, and
// exactly once — never retried. A 429 there is a PASS branch (quota already
// burned today by a prior run), not a failure. Specs (a) and (b) assert ZERO
// `prompt-create` / `submissions-create` calls respectively, so re-running
// this file never burns quota by accident.
//
// Selector notes (verified against the SHIPPED components on this branch —
// 6.6 PromptListScreen, 6.7 CustomPromptScreen, 6.8 SchreibenEditorScreen,
// 6.9 FeedbackScreen):
//   - `Input`/`Textarea` (`src/learner/ui/primitives/{Input,Textarea}.tsx`)
//     put `data-testid` on the WRAPPER `<div>`, not the underlying
//     `<input>`/`<textarea>` — confirmed by reading both primitives; no
//     prior e2e spec in this repo fills a testid'd Input/Textarea (the login
//     helper uses `#login-email`/`#login-password` CSS ids instead), so this
//     is the first place that divergence bites. Every fill below chains
//     `.locator("input" | "textarea")` off the testid'd wrapper.
//   - `AppButton` puts `data-testid` directly on the `<button>` — no such
//     unwrap needed for `schreiben-submit` / `schreiben-confirm-confirm` /
//     `schreiben-custom-prompt-submit` etc.
//   - Prompt-card testids share the `schreiben-prompt-` root with the LIST
//     SCREEN's own chrome (`schreiben-prompt-list-screen/-empty/-error/…`,
//     which also start with `schreiben-prompt-` since "list" follows
//     immediately) — same trap `practice-set-` / `practice-set-picker-`
//     documented in `learner-practice-lesen.spec.ts`. Rather than exclude a
//     prefix, this spec counts/selects prompt rows via the CTA's OWN unique
//     suffix instead: `[data-testid$="-keyboard"]` only ever matches a
//     prompt row's "Au clavier" button, never the screen chrome.
//   - `schreiben-word-pill` renders `"{count} / {min}–{max}"` as plain text
//     (an en dash, not a hyphen) — `extractWordBounds` below parses it to
//     size an in-range draft deterministically instead of guessing.
//   - `FeedbackScreen` puts its root testid (`schreiben-feedback-screen`) on
//     EVERY branch — pending/timeout/failed/graded (F10, a deliberate Web
//     delta from mobile) — so the root is always locatable regardless of
//     which polling state a run lands on.
//   - The NEW-format graded testid is `schreiben-feedback-module-result`
//     (not a bare `module-result`, and not `-module-result` appended to the
//     screen root as the brief's parenthetical loosely suggested) — read
//     directly off `FeedbackScreen.tsx`'s `ModuleResultLayout` `testID` prop.
//     `schreiben-feedback-score-card` (legacy `pruefer_text === null` rows)
//     is included as a defensive alternate graded indicator, though every
//     row this spec creates goes through the shipped v2 text grader and is
//     expected to hit the new-format testid.
//
// F9 budget: `useSubmissionPolling`'s poller (`useSubmissionPolling.ts`,
// `MAX_DURATION_MS`) flips to a client-local `timeout` status at EXACTLY
// 240s. Spec (c)'s terminal-state wait uses a 260s `expect(...).toBeVisible
// ({ timeout })` override on that ONE assertion (never a change to the
// global/test-level timeout policy beyond `test.setTimeout` for that spec).
const TEST_EMAIL = "qa1@df.dev";
const TEST_PASSWORD = "test1234567890";

async function login(page: Page): Promise<void> {
  await page.goto("/fr/app/login");
  await page.locator("#login-email").fill(TEST_EMAIL);
  await page.locator("#login-password").fill(TEST_PASSWORD);
  await page.getByTestId("login-submit").click();
  await page.waitForURL("**/fr/app", { timeout: 15_000 });
}

// Genuine German prose (377 words — comfortably above the widest possible
// prompt range, C2's 230-280) so `germanText(n)` can slice an exact,
// grammatically real in-range draft for any board/level without risking the
// `body_language_not_german` 400 guard a word-salad generator could trip.
const GERMAN_CORPUS = `
Marie steht jeden Morgen um sieben Uhr auf und geht zuerst ins Badezimmer, um
sich zu waschen und die Zähne zu putzen. Danach zieht sie sich an und geht in
die Küche, wo sie sich einen starken Kaffee kocht und ein Stück Brot mit
Marmelade isst. Sie liest oft kurz die Nachrichten auf ihrem Telefon, bevor
sie das Haus verlässt. Der Weg zur Arbeit dauert ungefähr dreißig Minuten mit
der Straßenbahn, und sie nutzt diese Zeit gern, um ein Buch zu lesen oder
Musik zu hören. Am Arbeitsplatz begrüßt sie ihre Kollegen freundlich und
setzt sich an ihren Schreibtisch, um die E-Mails vom Vortag zu beantworten.
Gegen Mittag trifft sie sich oft mit ihren Kollegen in der Kantine, wo sie
gemeinsam zu Mittag essen und über verschiedene Themen sprechen. Nach der
Arbeit geht Marie manchmal einkaufen, weil sie gern frisches Gemüse und Obst
für das Abendessen kauft. Zu Hause kocht sie meistens etwas Einfaches, zum
Beispiel eine Suppe oder einen Salat, und isst dabei fern vom Fernseher, um
sich zu entspannen. An den Wochenenden trifft sich Marie gern mit Freunden,
macht lange Spaziergänge im Park oder fährt mit dem Fahrrad durch die Stadt.
Sie interessiert sich sehr für Fotografie und macht gern Bilder von der
Natur, den Gebäuden und den Menschen in ihrer Umgebung. Manchmal besucht sie
auch Museen oder geht ins Kino, wenn ein interessanter Film läuft. Am Abend
liest sie gern ein paar Seiten in einem Roman, bevor sie schlafen geht, weil
ihr das hilft, den Tag ruhig ausklingen zu lassen. Sie findet es wichtig,
jeden Tag ein bisschen Zeit für sich selbst zu haben, auch wenn der Alltag
oft stressig ist. Außerdem versucht sie, mindestens zweimal pro Woche Sport
zu treiben, entweder im Fitnessstudio oder beim Joggen im Park in der Nähe
ihrer Wohnung. Für sie ist es wichtig, eine gute Balance zwischen Arbeit und
Freizeit zu finden, damit sie sich langfristig wohlfühlt und motiviert
bleibt. Sie plant außerdem, im nächsten Jahr eine Reise nach Süddeutschland
zu machen, um dort die Berge und die schöne Landschaft zu entdecken. Am
liebsten würde sie auch einmal in Österreich wandern gehen, denn sie hat
gehört, dass die Alpen dort besonders schön im Herbst sind, wenn sich die
Blätter bunt verfärben und die Luft klar und frisch ist.
`
  .trim()
  .split(/\s+/);

/** Slices the corpus to an exact word count — always real, grammatical German. */
function germanText(wordCount: number): string {
  const n = Math.max(1, Math.min(wordCount, GERMAN_CORPUS.length));
  return GERMAN_CORPUS.slice(0, n).join(" ");
}

/** Parses `schreiben-word-pill`'s `"{count} / {min}–{max}"` text (en dash). */
function extractWordBounds(pillText: string): { min: number; max: number } {
  const match = pillText.match(/(\d+)\D+(\d+)[–-](\d+)/);
  if (!match) {
    throw new Error(`schreiben-word-pill: unparsable text "${pillText}"`);
  }
  return { min: Number(match[2]), max: Number(match[3]) };
}

/**
 * Prompt rows share the `schreiben-prompt-` testid root with the list
 * screen's own chrome (see header note) — the "Au clavier" CTA suffix is
 * the only collision-free way to count/select rows.
 */
function firstPromptIdFromCta(testId: string): string {
  return testId.replace(/^schreiben-prompt-/, "").replace(/-keyboard$/, "");
}

/**
 * Navigates to the unfiltered `/schreiben` prompt list and returns the first
 * row's promptId + total row count, or runtime-skips (P11's idiom, same
 * posture as S4's #414 skip) when dev genuinely has zero writing prompts —
 * a real backend content gap, distinct from a client-side board/level filter
 * narrowing the list (which this helper never applies — no `?board=` param).
 */
async function loadPromptListOrSkip(
  page: Page
): Promise<{ promptId: string; promptCount: number }> {
  await page.goto("/fr/app/schreiben");
  const screen = page.getByTestId("schreiben-prompt-list-screen");
  const empty = page.getByTestId("schreiben-prompt-list-empty");
  await expect(screen.or(empty).first()).toBeVisible({ timeout: 30_000 });

  const promptCount = await page.locator('[data-testid$="-keyboard"]').count();
  test.skip(promptCount === 0, "dev has no writing prompts — backend content gap");

  const firstCta = page.locator('[data-testid$="-keyboard"]').first();
  const testId = await firstCta.getAttribute("data-testid");
  if (!testId) {
    throw new Error("first prompt CTA has no data-testid");
  }
  return { promptId: firstPromptIdFromCta(testId), promptCount };
}

test.describe
  .serial("Schreiben prompt list, draft persistence, graded submit (qa1, real backend)", () => {
  test("(a) hub -> prompt list entry, custom-prompt over-long title guard, zero prompt-create calls", async ({
    page,
  }) => {
    test.setTimeout(60_000);

    const promptCreateRequests: string[] = [];
    page.on("request", (req) => {
      if (req.url().includes("/prompt-create")) {
        promptCreateRequests.push(req.url());
      }
    });

    await login(page);
    await page.goto("/fr/app/apprendre/practice");
    await expect(page.getByTestId("practice-hub-row-schreiben")).toBeVisible({ timeout: 20_000 });
    await page.getByTestId("practice-hub-row-schreiben").click();

    // `PracticeHubScreen` seeds `?board=<board>-<level>`
    // (`PracticeHubScreen.tsx:136`), which `PromptListScreen` consumes as a
    // ONE-SHOT board-filter seed before clearing the query string via
    // `router.replace` (see that screen's doc comment) — wait for the bare
    // `/schreiben` URL rather than the transient `?board=` one.
    await page.waitForURL(/\/schreiben(\?.*)?$/, { timeout: 20_000 });

    const screen = page.getByTestId("schreiben-prompt-list-screen");
    const empty = page.getByTestId("schreiben-prompt-list-empty");
    await expect(screen.or(empty).first()).toBeVisible({ timeout: 30_000 });
    if (await empty.isVisible().catch(() => false)) {
      test.skip(true, "dev has no writing prompts — backend content gap");
    }

    await expect(page.getByTestId("schreiben-prompt-list-chip-all")).toBeVisible();
    // Defensive reset: the hub's seeded board filter could legitimately
    // narrow the list to zero rows for a board/level pairing that just
    // doesn't have prompts yet — a DIFFERENT condition from "dev has zero
    // prompts at all" (the only case this spec skips on). Resetting to "Tous
    // les niveaux" before counting keeps the assertions below tied to the
    // genuine backend content-gap check, not an incidental filter miss.
    await page.getByTestId("schreiben-prompt-list-chip-all").click();

    const promptCount = await page.locator('[data-testid$="-keyboard"]').count();
    test.skip(promptCount === 0, "dev has no writing prompts — backend content gap");

    await expect(page.getByText("Au clavier").first()).toBeVisible();

    await page.screenshot({ path: "test-results/s6-schreiben-prompt-list.png", fullPage: true });

    // Custom-prompt form: over-long title disables submit, then navigate
    // away WITHOUT submitting (P11 — zero `prompt-create` calls this spec;
    // community prompts are global, so this spec must never create one).
    await page.getByTestId("schreiben-add-prompt").click();
    await expect(page.getByTestId("schreiben-custom-prompt-screen")).toBeVisible({
      timeout: 20_000,
    });

    // See header note: `Input`'s testid is on the wrapper div, not the
    // `<input>` — the fillable element is the nested `input`.
    //
    // `maxLength={200}` on the underlying `<input>` exactly equals
    // `CustomPromptScreen.TITLE_MAX` (200) — confirmed empirically: `.fill()`
    // (and a real paste) is clamped to 200 chars by the native attribute
    // BEFORE React ever sees a value long enough to trip
    // `trimmedTitle.length > TITLE_MAX`. That guard is therefore
    // unreachable through any real keyboard/paste interaction as currently
    // wired — a defense-in-depth check against a value arriving via some
    // other path (e.g. programmatic state), not a user-reachable branch.
    // To still exercise `canSubmit`'s over-long branch per the brief, this
    // bypasses the native constraint the same way React-Testing-Library's
    // `fireEvent` does: write through the prototype's value setter, then
    // dispatch a real `input` event so React's controlled `onChange` picks
    // it up with the full 220-char string.
    await page.evaluate(() => {
      const input = document.querySelector<HTMLInputElement>(
        '[data-testid="schreiben-custom-prompt-theme"] input'
      );
      if (!input) throw new Error("schreiben-custom-prompt-theme input not found");
      const setter = Object.getOwnPropertyDescriptor(
        window.HTMLInputElement.prototype,
        "value"
      )?.set;
      setter?.call(input, "x".repeat(220));
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await expect(page.getByTestId("schreiben-custom-prompt-submit")).toBeDisabled();

    await page.getByTestId("schreiben-custom-prompt-cancel").click();
    await page.waitForURL(/\/schreiben(\?.*)?$/, { timeout: 20_000 });

    // eslint-disable-next-line no-console
    console.log(`[schreiben e2e][a] prompt-create requests fired: ${promptCreateRequests.length}`);
    expect(promptCreateRequests.length).toBe(0);
  });

  test("(b) draft autosave: below-min disables submit, in-range draft survives >3s reload, zero submissions-create", async ({
    page,
  }) => {
    test.setTimeout(90_000);

    const submitRequests: string[] = [];
    page.on("request", (req) => {
      if (req.url().includes("/submissions-create")) {
        submitRequests.push(req.url());
      }
    });

    await login(page);
    const { promptId } = await loadPromptListOrSkip(page);

    await page.goto(`/fr/app/schreiben/compose/${promptId}`);
    await expect(page.getByTestId("schreiben-editor")).toBeVisible({ timeout: 30_000 });

    const pillText = await page.getByTestId("schreiben-word-pill").innerText();
    const { min, max } = extractWordBounds(pillText);
    // eslint-disable-next-line no-console
    console.log(`[schreiben e2e][b] prompt ${promptId} word bounds: ${min}-${max}`);

    // See header note: `Textarea`'s testid is on the wrapper div — the
    // fillable element is the nested `textarea`.
    const draftInput = page.getByTestId("schreiben-draft-input").locator("textarea");

    // Below-min draft — every level's `min_words` is >= 20
    // (`CustomPromptScreen.LEVEL_DEFAULTS`), so a 2-word phrase is always
    // short enough to keep `canSubmit` false.
    await draftInput.fill("Hallo zusammen.");
    await expect(page.getByTestId("schreiben-submit")).toBeDisabled();

    // In-range draft, mid-range to stay clear of both boundaries.
    const target = Math.min(Math.round((min + max) / 2), GERMAN_CORPUS.length);
    const draftText = germanText(target);
    await draftInput.fill(draftText);
    await expect(page.getByTestId("schreiben-submit")).toBeEnabled();

    // Draft autosave debounces 3s (`useDraft.ts` DEBOUNCE_MS) — wait past it
    // with a fixed margin before reloading. There is no network-idle signal
    // for a local IndexedDB write, so a deterministic timeout is the correct
    // wait here (not a smell): 3.5s clears the 3s debounce with headroom for
    // the fake-timer-free CI clock.
    await page.waitForTimeout(3_500);

    await page.reload();
    await expect(page.getByTestId("schreiben-editor")).toBeVisible({ timeout: 30_000 });
    const rehydratedInput = page.getByTestId("schreiben-draft-input").locator("textarea");
    await expect(rehydratedInput).toHaveValue(draftText, { timeout: 15_000 });

    // No submit anywhere in this spec — zero quota burn.
    // eslint-disable-next-line no-console
    console.log(`[schreiben e2e][b] submissions-create requests fired: ${submitRequests.length}`);
    expect(submitRequests.length).toBe(0);
  });

  test("(c) graded submit: exactly one submissions-create, terminal feedback branch reached", async ({
    page,
  }) => {
    // F9: the 260s per-assertion budget below needs matching headroom on the
    // test's own timeout, or Playwright kills the test at its default 30s
    // regardless of the inner `expect(...).toBeVisible({ timeout: 260_000 })`
    // override.
    test.setTimeout(300_000);

    const submitRequests: string[] = [];
    page.on("request", (req) => {
      if (req.url().includes("/submissions-create")) {
        submitRequests.push(req.url());
      }
    });

    await login(page);
    const { promptId } = await loadPromptListOrSkip(page);

    await page.goto(`/fr/app/schreiben/compose/${promptId}`);
    await expect(page.getByTestId("schreiben-editor")).toBeVisible({ timeout: 30_000 });

    const pillText = await page.getByTestId("schreiben-word-pill").innerText();
    const { min, max } = extractWordBounds(pillText);
    const target = Math.min(Math.round((min + max) / 2), GERMAN_CORPUS.length);
    const draftText = germanText(target);
    // eslint-disable-next-line no-console
    console.log(
      `[schreiben e2e][c] prompt ${promptId} word bounds: ${min}-${max}, submitting ${target} words`
    );

    const draftInput = page.getByTestId("schreiben-draft-input").locator("textarea");
    await draftInput.fill(draftText);
    await expect(page.getByTestId("schreiben-submit")).toBeEnabled();

    // Single submit through the confirm dialog, NEVER retried — quota
    // discipline. `page.waitForResponse` starts listening before the click
    // so the network round-trip can't race past it.
    await page.getByTestId("schreiben-submit").click();
    await expect(page.getByTestId("schreiben-confirm-submit")).toBeVisible({ timeout: 10_000 });

    const submitResponsePromise = page.waitForResponse(
      (res) => res.url().includes("/submissions-create"),
      { timeout: 30_000 }
    );
    await page.getByTestId("schreiben-confirm-confirm").click();
    const submitResponse = await submitResponsePromise;

    // eslint-disable-next-line no-console
    console.log(
      `[schreiben e2e][c] submissions-create requests fired: ${submitRequests.length}, response status: ${submitResponse.status()}`
    );
    expect(submitRequests.length).toBe(1);

    if (submitResponse.status() === 429) {
      // Quota already burned today by a prior run — a legitimate, tolerated
      // terminal branch (brief P1). Assert the rate-limit banner and stop;
      // NEVER retry the submit.
      await expect(page.getByTestId("schreiben-error-rate_limit_exceeded")).toBeVisible({
        timeout: 15_000,
      });
      // eslint-disable-next-line no-console
      console.log("[schreiben e2e][c] terminal branch: 429 rate_limited (submit-time)");
      return;
    }

    expect(submitResponse.ok()).toBe(true);
    const body = (await submitResponse.json()) as { id: string; status: string };
    const submissionId = body.id;
    expect(submissionId).toBeTruthy();

    await page.waitForURL(/\/schreiben\?submitted=1/, { timeout: 20_000 });
    await expect(page.getByTestId("schreiben-submitted-toast")).toBeVisible({ timeout: 10_000 });

    // The editor redirects to the prompt list on success, NOT to feedback —
    // navigate to the feedback route for the created id manually (mirrors
    // what a learner tapping the Accueil "en cours" card would do).
    await page.goto(`/fr/app/schreiben/feedback/${submissionId}`);
    await expect(page.getByTestId("schreiben-feedback-screen")).toBeVisible({ timeout: 20_000 });

    // F9: wait for ANY of the three tolerated terminal surfaces. Still
    // `pending`/`grading` at 260s would mean the poller's timeout flip is
    // broken and this `expect` throws — a genuine failure, not a 4th branch.
    const graded = page.getByTestId("schreiben-feedback-module-result");
    const legacyGraded = page.getByTestId("schreiben-feedback-score-card"); // defensive: pre-v2 rows
    const failed = page.getByTestId("schreiben-feedback-failed");
    const timedOut = page.getByTestId("schreiben-feedback-timeout");
    await expect(graded.or(legacyGraded).or(failed).or(timedOut).first()).toBeVisible({
      timeout: 260_000,
    });

    const branch = (await graded.isVisible().catch(() => false))
      ? "graded"
      : (await legacyGraded.isVisible().catch(() => false))
        ? "graded-legacy"
        : (await failed.isVisible().catch(() => false))
          ? "failed"
          : "timeout";
    // eslint-disable-next-line no-console
    console.log(`[schreiben e2e][c] terminal feedback branch: ${branch}`);

    // Product lock: no paywall copy on any branch (Constraint 11).
    await expect(page.locator("text=/premium|abonnement|upgrade/i")).toHaveCount(0);

    await page.screenshot({ path: "test-results/s6-schreiben-feedback.png", fullPage: true });
  });
});
