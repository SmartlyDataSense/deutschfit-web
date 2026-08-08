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
 *   - No opt-out toggle here yet — mobile's Settings opt-out switch has no
 *     web equivalent until Profil/Settings (S11) ships. Init is gated on
 *     the env key only for this slice.
 *   - Named-instance isolation: `posthog.init(token, config, "learner")`
 *     (not the default `posthog.init(token, config)`) so this client never
 *     shares state with a future marketing-pages PostHog integration in
 *     this same repo (no cross-contamination of pageview/autocapture
 *     config between the two surfaces). `autocapture` and `capture_pageview`
 *     are both off — the learner app only ever emits the explicit,
 *     typed events below, same discipline as mobile.
 */
import posthog, { type PostHog } from "posthog-js";

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

export function getPostHogKey(): string | undefined {
  const key = process.env.NEXT_PUBLIC_POSTHOG_KEY;
  return typeof key === "string" && key.length > 0 ? key : undefined;
}

export function getPostHogHost(): string {
  const host = process.env.NEXT_PUBLIC_POSTHOG_HOST;
  return typeof host === "string" && host.length > 0 ? host : "https://eu.i.posthog.com";
}

function ensureClient(): PostHog | null {
  if (client) return client;
  if (typeof window === "undefined") return null;

  const apiKey = getPostHogKey();
  if (!apiKey) {
    if (!missingKeyLogged) {
      console.warn(
        "[analytics] NEXT_PUBLIC_POSTHOG_KEY is not set — events will be dropped. " +
          "Set it in .env.local for local testing, or the deploy env for staging/prod."
      );
      missingKeyLogged = true;
    }
    return null;
  }

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
}

/**
 * Called once from `LearnerProviders` on app boot. Eagerly constructs the
 * client (if a key is configured) so the first `identifyUser()` /
 * `trackEvent()` call doesn't pay the cold-start cost. No-ops (including no
 * console noise beyond the one-time missing-key warning) when
 * `NEXT_PUBLIC_POSTHOG_KEY` is unset — dev/test safety.
 */
export function initPostHog(): void {
  if (initialised) return;
  initialised = true;
  ensureClient();
}

export function trackEvent<N extends AnalyticsEventName>(
  name: N,
  properties?: AnalyticsEventProperties<N>
): void {
  const c = ensureClient();
  if (!c) return;
  try {
    c.capture(name, properties as Record<string, unknown> | undefined);
  } catch (err) {
    console.warn("[analytics] capture failed:", err);
  }
}

/** Attaches a stable Supabase user id to the analytics session. Called on sign-in / warm-start with an authenticated session. */
export function identifyUser(userId: string, traits?: IdentifyTraits): void {
  const c = ensureClient();
  if (!c) return;
  try {
    c.identify(userId, traits as Record<string, unknown> | undefined);
  } catch (err) {
    console.warn("[analytics] identify failed:", err);
  }
}

/** Drops the current identified user. Called on sign-out so the anon session is clean for the next user on a shared device. */
export function resetAnalyticsUser(): void {
  if (!client) return;
  try {
    client.reset();
  } catch (err) {
    console.warn("[analytics] reset failed:", err);
  }
}

/** Test-only: forget everything so each test case starts clean. */
export function __resetPostHogForTests(): void {
  client = null;
  initialised = false;
  missingKeyLogged = false;
}
