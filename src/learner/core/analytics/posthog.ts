/**
 * PostHog analytics — web learner surface.
 *
 * Ports `deutschfit-mobile/src/core/analytics/{client,events}.ts` into a
 * single module (S1 brief names only `posthog.ts` as the file to create).
 * Two responsibilities mobile splits across two files live here together:
 *
 *   1. A lazy-singleton `posthog-js` client, gated on
 *      `NEXT_PUBLIC_POSTHOG_KEY` being set. Missing key → every export
 *      below becomes a silent no-op (dev/test safety — Vitest, local dev
 *      without secrets, and CI never construct a real client or touch the
 *      network).
 *   2. `AnalyticsEvent` — the same closed, discriminated-union event
 *      catalogue as mobile's `events.ts`, copied field-for-field so event
 *      names and payload shapes never drift between the two clients (spec
 *      §2: "posthog-js with mobile's typed event catalogue … and same
 *      event names"). No web-only events are added here; if a web slice
 *      needs a new funnel event, add it to mobile's `events.ts` first,
 *      then port it here — mobile stays the single source of truth until
 *      a shared package exists.
 *
 * Deliberate deviations from mobile's `client.ts`:
 *   - `posthog-react-native`'s `capture`/`identify`/`reset` are async;
 *     `posthog-js`'s are synchronous. The exports below are sync to match
 *     the underlying SDK instead of wrapping them in unnecessary Promises.
 *   - Opt-out (web#52): mirrors mobile's `optOut.ts`/`client.ts` split —
 *     `LEARNER_ANALYTICS_OPT_OUT_KEY` (`core/storage/flags.ts`, "true" =
 *     opted out, same key string as mobile's `ANALYTICS_OPT_OUT_KEY`) is
 *     the persistence, `loadClient()`'s gate is the enforcement. Opted
 *     out → the client is never constructed at all (no dynamic import, no
 *     network) — same "fail closed" posture mobile's `ensureClient()`
 *     gate has. `setAnalyticsOptOut()` also calls PostHog's own
 *     `opt_out_capturing()`/`opt_in_capturing()` on an already-constructed
 *     client (mobile: `client.optOut()`/`optIn()`) rather than a
 *     hand-rolled suppression flag around `capture` — PostHog's SDK
 *     already refuses to send anything once opted out, so this is
 *     defense-in-depth for the case where a client was constructed before
 *     the toggle flipped.
 *   - Named-instance isolation: `posthog.init(token, config, "learner")`
 *     (not the default `posthog.init(token, config)`) so this client never
 *     shares state with a future marketing-pages PostHog integration in
 *     this same repo (no cross-contamination of pageview/autocapture
 *     config between the two surfaces). `autocapture` and `capture_pageview`
 *     are both off — the learner app only ever emits the explicit,
 *     typed events below, same discipline as mobile.
 */
import type { PostHog } from "posthog-js"; // type-only — erased at build time, never bundled

import {
  getFlag,
  LEARNER_ANALYTICS_OPT_OUT_KEY,
  removeFlag,
  setFlag,
} from "@/learner/core/storage/flags";

// ─── Event catalogue (mirrors mobile's events.ts) ──────────────────────────

export type SigninMethod = "password" | "otp" | "magic-link";

export type ExamBoardTag = "goethe" | "telc" | "oesd" | "testdaf" | "ecl";
export type ExamLevelTag = "A1" | "A2" | "B1" | "B2" | "C1" | "C2";

/**
 * Mock-exam module code. Kept local (no outgoing dependency on feature /
 * API layers) — the string literals are a stable contract shared with the
 * backend, same rationale as mobile.
 */
export type ExamModuleTag = "LESEN" | "HOEREN" | "SCHREIBEN" | "SPRECHEN";

/**
 * Discriminated union of every event the product emits, across mobile and
 * web. Web S1 doesn't call most of these yet (no onboarding, no exam
 * modules built) — they're here so a later slice never has to invent a
 * name or shape mobile already defined. When adding a new event: append
 * to mobile's `events.ts` first, use `snake_case`, keep payloads flat and
 * primitive-valued.
 */
export type AnalyticsEvent =
  | { name: "app_opened"; properties?: { cold_start?: boolean } }
  | {
      name: "onboarding_step_completed";
      properties: {
        step: string;
        index?: number;
      };
    }
  | { name: "onboarding_finished"; properties?: { took_ms?: number } }
  | {
      name: "signin_succeeded";
      properties: { method: SigninMethod };
    }
  | {
      name: "signin_failed";
      properties: { method: SigninMethod; reason?: string };
    }
  | {
      name: "simulation_started";
      properties: { modelltest_id?: string; board?: ExamBoardTag };
    }
  | {
      name: "simulation_submitted";
      properties: {
        modelltest_id?: string;
        board?: ExamBoardTag;
        duration_ms?: number;
      };
    }
  | {
      name: "writing_draft_submitted";
      properties: {
        prompt_id?: string;
        word_count?: number;
        action?: "submitted-optimistic";
      };
    }
  | {
      name: "transcription_review_downgrade_empty_blackout";
      properties: {
        submission_id: string;
        original_blackout_reason: string | null;
      };
    }
  | {
      name: "sprechen_recorded";
      properties: {
        prompt_id?: string;
        teil?: 1 | 2 | 3;
        duration_ms?: number;
      };
    }
  | {
      name: "sprechen_submit_no_recording";
      properties: {
        prompt_id: string;
        teil: 1 | 2 | 3;
        duration_ms: number;
      };
    }
  | {
      name: "sprechen_session_start";
      properties: {
        teil: 1 | 2 | 3;
        board: ExamBoardTag | string;
        level: string;
        source: "apprendre" | "coach" | "modelltests-single" | "mock-leg";
      };
    }
  | {
      name: "sprechen_session_resolve";
      properties: {
        teil: 1 | 2 | 3;
        source: "apprendre" | "coach" | "modelltests-single" | "mock-leg";
        action:
          | "submitted-optimistic"
          | "failed-optimistic"
          | "continue-learning"
          | "go-home"
          | "continue-simulation";
        had_submission: boolean;
        error_code?: string;
      };
    }
  | {
      name: "coach_observation_viewed";
      properties?: { observation_id?: string };
    }
  | {
      name: "coach_drill_chain_started";
      properties: {
        observation_id?: string;
        chain_length?: number;
      };
    }
  | {
      name: "coach_drill_chain_completed";
      properties: {
        observation_id?: string;
        chain_length?: number;
        completed_count?: number;
      };
    }
  | {
      name: "coach_message_sent";
      properties: {
        thread_id: string;
        message_length: number;
      };
    }
  | {
      name: "coach_message_received";
      properties: {
        thread_id: string;
        duration_ms: number;
        outcome: "success" | "error" | "offline" | "rate_limited";
      };
    }
  | {
      name: "exam_home_card_tapped";
      properties: {
        card: "full_simulation" | "module" | "resume";
        module?: ExamModuleTag;
      };
    }
  | {
      name: "exam_module_started";
      properties: {
        attempt_id: string;
        module: ExamModuleTag;
        resumed?: boolean;
      };
    }
  | {
      name: "exam_module_submitted";
      properties: {
        attempt_id: string;
        module: ExamModuleTag;
        duration_ms?: number;
      };
    }
  | {
      name: "exam_advance";
      properties: {
        attempt_id: string;
        finished_module: ExamModuleTag;
        next_module: ExamModuleTag | null;
      };
    }
  | {
      name: "exam_finalized";
      properties: {
        attempt_id: string;
        duration_ms?: number;
      };
    }
  | {
      name: "exam_drill_unsupported";
      properties: {
        module: ExamModuleTag;
      };
    }
  | {
      name: "exam_module_drill_finalized";
      properties: {
        attempt_id: string;
        module: ExamModuleTag;
      };
    }
  | {
      name: "exam_history_opened";
      properties: {
        module: ExamModuleTag;
      };
    }
  | {
      name: "exam_retake_tapped";
      properties: {
        module: ExamModuleTag;
        exam_slug: string;
        source_attempt_id: string;
      };
    }
  | {
      name: "exam_review_opened";
      properties: {
        attempt_id: string;
        module: ExamModuleTag;
        raw_score: number | null;
        total: number;
      };
    }
  | {
      name: "exam_review_item_expanded";
      properties: {
        attempt_id: string;
        item_id: string;
        item_number: number;
        is_correct: boolean;
      };
    }
  | {
      name: "schreiben_handwritten_capture_opened";
      properties?: {
        prompt_id?: string;
      };
    }
  | {
      name: "schreiben_handwritten_photo_taken";
      properties?: {
        prompt_id?: string;
        size_bytes?: number;
      };
    }
  | {
      name: "schreiben_handwritten_upload_started";
      properties: {
        submission_id: string;
        prompt_id?: string;
        is_regrade?: boolean;
      };
    }
  | {
      name: "schreiben_handwritten_upload_completed";
      properties: {
        submission_id: string;
        prompt_id?: string;
        duration_ms?: number;
        is_regrade?: boolean;
      };
    }
  | {
      name: "schreiben_handwritten_upload_failed";
      properties: {
        reason: string;
        submission_id?: string;
        prompt_id?: string;
        is_regrade?: boolean;
      };
    }
  | {
      name: "schreiben_handwritten_regrade_started";
      properties: {
        submission_id: string;
        phase?: "pending" | "graded" | "unreadable" | "failed" | "error";
      };
    }
  | {
      name: "schreiben_handwritten_transcription_viewed";
      properties: {
        submission_id: string;
        phase?: "pending" | "graded" | "unreadable" | "failed" | "error";
      };
    }
  | {
      name: "schreiben_handwritten_transcription_confirmed";
      properties: {
        submission_id: string;
      };
    }
  | {
      name: "schreiben_handwritten_transcription_edited";
      properties: {
        submission_id: string;
        edit_distance: number;
      };
    }
  | {
      name: "schreiben_handwritten_re_graded_with_corrections";
      properties: {
        submission_id: string;
        edit_distance: number;
      };
    }
  | {
      name: "schreiben_handwritten_re_transcribed";
      properties: {
        submission_id: string;
      };
    }
  | {
      name: "schreiben_session_started";
      properties: {
        exam_board: string;
        level: string;
        teil: 1 | 2 | 3;
        attempt_id: string;
        source: "apprendre" | "coach" | "modelltests-single" | "mock-leg";
      };
    }
  | {
      name: "schreiben_result_retake_tapped";
      properties?: {
        prompt_id?: string;
      };
    }
  | {
      name: "schreiben_result_home_tapped";
      properties?: {
        prompt_id?: string;
      };
    }
  | {
      name: "account_delete_requested";
      properties: { source: "mobile" | "web" };
    }
  | {
      name: "account_delete_confirmed";
      properties: { source: "mobile" | "web" };
    }
  | {
      name: "account_delete_failed";
      properties: { source: "mobile" | "web"; reason: string };
    }
  | {
      /**
       * Server-side deletion already succeeded (`account-delete` returned
       * 2xx) but a best-effort post-delete cleanup step (local wipe,
       * analytics reset, or sign-out) rejected. Distinct from
       * `account_delete_failed` — the account IS gone; this only signals
       * a possibly-dirty client. Web-only for now (S11.8): mobile's
       * `useAuth.deleteAccount()` has no equivalent split.
       */
      name: "account_delete_cleanup_failed";
      properties: { source: "web"; reason: string };
    }
  | {
      name: "topic_picker_opened";
      properties: {
        subgenre: string;
        level: string;
      };
    }
  | {
      name: "topic_subgenre_filtered";
      properties: {
        subgenre: string;
        level: string;
      };
    }
  | {
      name: "topic_searched";
      properties: {
        subgenre: string;
        level: string;
        query_length: number;
        result_count: number;
      };
    }
  | {
      name: "topic_picker_fallback_triggered";
      properties: {
        board: string;
        level: string;
        subgenre: string;
      };
    }
  | {
      name: "topic_card_started";
      properties: {
        topic_id: string;
        subgenre: string;
        level: string;
      };
    }
  | {
      name: "level_chip_changed";
      properties: {
        previous_level: string;
        new_level: string;
      };
    }
  | {
      name: "topic_scope_changed";
      properties: {
        scope: string;
      };
    }
  | {
      name: "custom_theme_opened";
      properties: {
        subgenre: string;
        level: string;
      };
    }
  | {
      name: "custom_theme_submitted";
      properties: {
        subgenre: string;
        level: string;
        title_length: number;
        description_length: number;
      };
    }
  | {
      name: "strip_shown";
      properties: {
        submission_id: string;
        module: "sprechen" | "schreiben";
      };
    }
  | {
      name: "strip_ready";
      properties: {
        submission_id: string;
        module: "sprechen" | "schreiben";
        latency_ms_since_strip_shown: number;
      };
    }
  | {
      name: "length_warning_shown";
      properties: {
        subgenre: string | null;
        level: string | null;
        actual_sec: number;
        target_sec: number;
      };
    }
  | {
      name: "length_warning_retry";
      properties: {
        subgenre: string | null;
        level: string | null;
        actual_sec: number;
        target_sec: number;
      };
    }
  | {
      name: "length_warning_dismissed";
      properties: {
        subgenre: string | null;
        level: string | null;
        actual_sec: number;
        target_sec: number;
      };
    }
  | {
      name: "hydrate_failed";
      properties: {
        phase: "boot" | "foreground";
        reason: string;
      };
    };

export type AnalyticsEventName = AnalyticsEvent["name"];

/** Extract the payload shape for a specific event name. */
export type AnalyticsEventProperties<N extends AnalyticsEventName> =
  Extract<AnalyticsEvent, { name: N }> extends { properties: infer P }
    ? P
    : Extract<AnalyticsEvent, { name: N }> extends { properties?: infer P }
      ? P | undefined
      : undefined;

/** Traits attached on `identify()`. Mirrors mobile's `IdentifyTraits`. */
export interface IdentifyTraits {
  email?: string;
  exam_board?: ExamBoardTag;
  exam_level?: ExamLevelTag;
  preferred_language?: "fr" | "en";
}

// ─── Client lifecycle ───────────────────────────────────────────────────────

/** Named instance so this client never shares state with a future default-singleton (marketing) integration. */
const POSTHOG_INSTANCE_NAME = "learner";

let client: PostHog | null = null;
let initialised = false;
let missingKeyLogged = false;

/**
 * Shared load-and-init promise for the lazily-imported `posthog-js` chunk.
 *
 * `posthog-js` is a heavy dependency (~76 kB gz) that every export below
 * used to pull into the first-load bundle of every learner route via a
 * top-level `import posthog from "posthog-js"`. It's now loaded on demand
 * via dynamic `import()`, split into its own chunk, and fetched only once
 * `initPostHog()` (or any tracking call) actually runs client-side.
 *
 * All five exports below — `initPostHog`, `trackEvent`, `identifyUser`,
 * `resetAnalyticsUser` — stay synchronous, fire-and-forget, at the call
 * site (no `await` anywhere in ~30 call sites changes). Internally they all
 * funnel through this *one* shared `loadClient()` promise. Because
 * `.then()` callbacks on the same promise run in the order they were
 * registered, this preserves relative ordering for free: if
 * `identifyUser("u1")` is called before `trackEvent(...)`, `identify()`
 * lands before `capture()` on the real client once the chunk resolves —
 * same guarantee the old synchronous code gave implicitly.
 *
 * This also closes what would otherwise be a sign-out race:
 * `resetAnalyticsUser()` funnels through this exact same promise instead of
 * checking `if (!client) return`. If `identifyUser("u1")` and
 * `resetAnalyticsUser()` are called back-to-back before the chunk has
 * resolved, an early-return-on-`!client` reset would silently no-op — the
 * queued `identify` would then land *after* "sign-out", leaving a
 * shared-device session identified as the previous user. Funneling through
 * `loadClient()` guarantees `reset()` is queued after `identify()` and
 * still runs — a reset on a freshly-loaded client is harmless, dropping a
 * queued reset is not.
 */
let loadPromise: Promise<PostHog | null> | null = null;

export function getPostHogKey(): string | undefined {
  const key = process.env.NEXT_PUBLIC_POSTHOG_KEY;
  return typeof key === "string" && key.length > 0 ? key : undefined;
}

export function getPostHogHost(): string {
  const host = process.env.NEXT_PUBLIC_POSTHOG_HOST;
  return typeof host === "string" && host.length > 0 ? host : "https://eu.i.posthog.com";
}

/**
 * web#52 — the analytics-opt-out accessor. `LEARNER_ANALYTICS_OPT_OUT_KEY`
 * (`core/storage/flags.ts`) is a browser-global preference, not user-scoped
 * (see `core/storage/wipe.ts`'s doc comment on why it deliberately survives
 * a local wipe). `"true"` is the only opted-out value — key absent or any
 * other value reads as opted in, same convention as mobile's `optOut.ts`.
 */
export function isAnalyticsOptedOut(): boolean {
  return getFlag(LEARNER_ANALYTICS_OPT_OUT_KEY) === "true";
}

/**
 * Resolves to the singleton `posthog-js` client, lazily importing and
 * initialising it on first call. Every subsequent call (whether or not the
 * first has settled yet) returns the same promise/client — see the
 * `loadPromise` doc comment above for why every export funnels through
 * this one function.
 *
 * web#52: opted out short-circuits before the dynamic `import("posthog-js")`
 * — the client is never constructed, no chunk is fetched, no network call
 * is made. This is the enforcement half of the opt-out; `setAnalyticsOptOut`
 * below is the toggle half.
 */
function loadClient(): Promise<PostHog | null> {
  if (client) return Promise.resolve(client);
  if (loadPromise) return loadPromise;
  if (typeof window === "undefined") return Promise.resolve(null);
  if (isAnalyticsOptedOut()) return Promise.resolve(null);

  const apiKey = getPostHogKey();
  if (!apiKey) {
    if (!missingKeyLogged) {
      console.warn(
        "[analytics] NEXT_PUBLIC_POSTHOG_KEY is not set — events will be dropped. " +
          "Set it in .env.local for local testing, or the deploy env for staging/prod."
      );
      missingKeyLogged = true;
    }
    return Promise.resolve(null);
  }

  loadPromise = import("posthog-js")
    .then(({ default: posthog }) => {
      client = posthog.init(
        apiKey,
        {
          api_host: getPostHogHost(),
          // Explicit-track-only, same discipline as mobile: no autocapture, no
          // automatic pageview events. Isolation from any future marketing
          // PostHog integration is via the named instance above, not this flag,
          // but keeping both off avoids noisy defaults regardless.
          autocapture: false,
          capture_pageview: false,
        },
        POSTHOG_INSTANCE_NAME
      );
      return client;
    })
    .catch((err: unknown) => {
      console.warn("[analytics] posthog-js failed to load:", err);
      loadPromise = null;
      return null;
    });
  return loadPromise;
}

/**
 * Called once from `LearnerProviders` on app boot. Kicks off the lazy
 * `posthog-js` chunk load (if a key is configured) so the first
 * `identifyUser()` / `trackEvent()` call doesn't have to trigger it itself.
 * No-ops (including no console noise beyond the one-time missing-key
 * warning) when `NEXT_PUBLIC_POSTHOG_KEY` is unset — dev/test safety. Also
 * a no-op, silently, when the learner has opted out (web#52) — `loadClient`
 * is the shared gate for both cases.
 */
export function initPostHog(): void {
  if (initialised) return;
  initialised = true;
  void loadClient();
}

/**
 * web#52 — flips the persisted opt-out preference and propagates it to
 * PostHog immediately, both directions:
 *
 *   - Opting out: persists the flag first (so a concurrent `loadClient()`
 *     call — e.g. a `trackEvent` mid-flight — sees it and refuses to
 *     construct a client), then tells an already-constructed client to
 *     stop via its own `opt_out_capturing()` (mirrors mobile's
 *     `client.optOut()`) rather than a hand-rolled suppression flag around
 *     `capture`.
 *   - Opting in: removes the flag, then funnels through `loadClient()` —
 *     which will now actually construct the client if the opt-out gate had
 *     previously refused to — and calls `opt_in_capturing()` on it (mirrors
 *     mobile's `client.optIn()`).
 *
 * Called from the Settings toggle (`SettingsScreen`) after it persists the
 * preference; the preference itself survives a reload because it lives in
 * `localStorage`, not component state.
 */
export function setAnalyticsOptOut(optedOut: boolean): void {
  if (optedOut) {
    setFlag(LEARNER_ANALYTICS_OPT_OUT_KEY, "true");
    if (client) {
      try {
        client.opt_out_capturing();
      } catch (err) {
        console.warn("[analytics] opt_out_capturing failed:", err);
      }
    }
    return;
  }

  removeFlag(LEARNER_ANALYTICS_OPT_OUT_KEY);
  void loadClient().then((c) => {
    if (!c) return;
    try {
      c.opt_in_capturing();
    } catch (err) {
      console.warn("[analytics] opt_in_capturing failed:", err);
    }
  });
}

export function trackEvent<N extends AnalyticsEventName>(
  name: N,
  properties?: AnalyticsEventProperties<N>
): void {
  void loadClient().then((c) => {
    if (!c) return;
    try {
      c.capture(name, properties as Record<string, unknown> | undefined);
    } catch (err) {
      console.warn("[analytics] capture failed:", err);
    }
  });
}

/** Attaches a stable Supabase user id to the analytics session. Called on sign-in / warm-start with an authenticated session. */
export function identifyUser(userId: string, traits?: IdentifyTraits): void {
  void loadClient().then((c) => {
    if (!c) return;
    try {
      c.identify(userId, traits as Record<string, unknown> | undefined);
    } catch (err) {
      console.warn("[analytics] identify failed:", err);
    }
  });
}

/**
 * Drops the current identified user. Called on sign-out so the anon session
 * is clean for the next user on a shared device.
 *
 * Deliberately funnels through the same `loadClient()` promise as
 * `identifyUser`/`trackEvent` rather than short-circuiting on `!client` —
 * see the `loadPromise` doc comment above for the sign-out race this
 * avoids.
 */
export function resetAnalyticsUser(): void {
  void loadClient().then((c) => {
    if (!c) return;
    try {
      c.reset();
    } catch (err) {
      console.warn("[analytics] reset failed:", err);
    }
  });
}

/** Test-only: forget everything so each test case starts clean. */
export function __resetPostHogForTests(): void {
  client = null;
  loadPromise = null;
  initialised = false;
  missingKeyLogged = false;
}
