/**
 * Accueil edge-function client (S3 · Task 3.4).
 *
 * Ports `deutschfit-mobile/src/features/accueil/api.ts` verbatim (runtime
 * guards, error-code strings, JSDoc contracts) with only the transport
 * swapped: `supabase.functions.invoke` → `invokeFn` (`@/learner/core/api/client`).
 * `invokeFn` throws `ApiError` on transport/HTTP failure instead of
 * returning `{ data, error }`, so the `{ error }` branch below is a
 * try/catch that rethrows with the mobile transport-error message the
 * caller's guard tables expect.
 *
 * Wraps the single endpoint that backs the Accueil home screen:
 *
 *   - `accueil-home` (GET) — returns the `AccueilHome` payload keyed on the
 *     caller's JWT. The edge function verifies the Supabase access token,
 *     joins `auth.users.user_metadata` + `user_profiles` + `user_stats`,
 *     and returns the shape the mobile screen consumes verbatim.
 *
 * Errors bubble up as thrown `Error`s with either the server `error` code
 * or a transport identifier as the message, so the hook can pattern match
 * and decide between showing a skeleton retry vs. a hard error state.
 *
 * SHAPE IS FROZEN — see
 * `deutschfit-backend/supabase/functions/accueil-home/index.ts` for the
 * contract. Any change to the payload must ship in lock-step on both sides.
 */
import { getBrowserClient } from "@/lib/supabase/browser";
import { useLearnerSession } from "@/learner/core/auth/useLearnerSession";
import { invokeFn } from "@/learner/core/api/client";

export interface AccueilCountdown {
  /**
   * Days remaining until the user's exam.
   *
   * `null` when the user has not set an exam date yet — the home screen
   * renders a "no exam date set" placeholder in that case (Wave B1, MVP
   * Final Spec §1.2 / Spec #2 + #13).
   */
  readonly daysRemaining: number | null;
  /**
   * Pre-formatted exam-date label (e.g. "17 juin 2026").
   *
   * `null` when the user has not set an exam date yet. The dynamic-state
   * placeholder is rendered by `CountdownHeroCard` and reads from the
   * `dashboard:exam.noDateSet` i18n key — single source of truth for the
   * Profil screen too (§5.1 sync, scoped follow-up — see TODO(WaveB) in
   * `ProfilScreen`).
   */
  readonly examDateLabel: string | null;
  readonly preparationPct: number;
  readonly targetScore: number;
}

export interface AccueilPriorityTask {
  readonly skill: string;
  readonly title: string;
  readonly level: string;
  readonly teil: string;
  readonly body: string;
  readonly durationMinutes: number;
  readonly pointsDelta: number;
  readonly attempts: number;
  readonly bestScore: number;
}

export interface AccueilTodayStats {
  readonly taskCount: number;
  readonly minutes: number;
}

export interface AccueilHomePayload {
  readonly currentLevel: string;
  readonly targetLevel: string;
  readonly countdown: AccueilCountdown;
  readonly priorityTask: AccueilPriorityTask;
  readonly todayStats: AccueilTodayStats;
}

interface ServerErrorPayload {
  readonly error?: string;
}

const EDGE_FUNCTION_NAME = "accueil-home";

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isCountdown(value: unknown): value is AccueilCountdown {
  if (!isRecord(value)) return false;
  // `daysRemaining` and `examDateLabel` may be `null` when the user has
  // not set an exam date yet (Wave B1). The remaining numeric fields stay
  // required — they're driven by the user's prep progress, not the date.
  const daysOk = value.daysRemaining === null || typeof value.daysRemaining === "number";
  const labelOk = value.examDateLabel === null || typeof value.examDateLabel === "string";
  return (
    daysOk &&
    labelOk &&
    typeof value.preparationPct === "number" &&
    typeof value.targetScore === "number"
  );
}

function isPriorityTask(value: unknown): value is AccueilPriorityTask {
  if (!isRecord(value)) return false;
  return (
    typeof value.skill === "string" &&
    typeof value.title === "string" &&
    typeof value.level === "string" &&
    typeof value.teil === "string" &&
    typeof value.body === "string" &&
    typeof value.durationMinutes === "number" &&
    typeof value.pointsDelta === "number" &&
    typeof value.attempts === "number" &&
    typeof value.bestScore === "number"
  );
}

function isTodayStats(value: unknown): value is AccueilTodayStats {
  if (!isRecord(value)) return false;
  return typeof value.taskCount === "number" && typeof value.minutes === "number";
}

function isPayload(value: unknown): value is AccueilHomePayload {
  if (!isRecord(value)) return false;
  return (
    typeof value.currentLevel === "string" &&
    typeof value.targetLevel === "string" &&
    isCountdown(value.countdown) &&
    isPriorityTask(value.priorityTask) &&
    isTodayStats(value.todayStats)
  );
}

export async function fetchAccueilHome(): Promise<AccueilHomePayload> {
  let data: AccueilHomePayload | ServerErrorPayload;
  try {
    data = await invokeFn<AccueilHomePayload | ServerErrorPayload>(EDGE_FUNCTION_NAME, {
      method: "GET",
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : undefined;
    throw new Error(message || "accueil_home_transport_error");
  }

  if (!isRecord(data)) {
    throw new Error("accueil_home_empty_response");
  }
  const maybeServerError = (data as ServerErrorPayload).error;
  if (typeof maybeServerError === "string") {
    throw new Error(maybeServerError);
  }
  if (!isPayload(data)) {
    throw new Error("accueil_home_malformed_response");
  }
  return data;
}

/**
 * Wave C1 — persist the learner's chosen exam date.
 *
 * Writes `user_profiles.exam_date` for the authenticated user; the
 * `accueil-home` edge function reads from the same column on the next
 * fetch and recomputes `daysRemaining` + `examDateLabel`. RLS on
 * `user_profiles` (`update_own`) restricts the update to the caller's
 * row — no `user_id` filter needed in the client query.
 *
 * `isoDate` must be a `YYYY-MM-DD` local-tz string. The mini-calendar
 * builds it via `toLocalIsoDate(date)` so the day matches what the user
 * tapped on their device, regardless of the device's UTC offset.
 *
 * Errors bubble up so the caller can decide between toast / inline
 * banner. The accueil home query is the source of truth; callers should
 * `refetch()` after a successful update so the countdown re-renders.
 *
 * Web note: mobile reads the caller's id via `supabase.auth.getSession()`;
 * the web learner app keeps auth state in `useLearnerSession` (S1), so
 * this reads `useLearnerSession.getState().session?.user.id` instead.
 */
export async function updateExamDate(isoDate: string): Promise<void> {
  const userId = useLearnerSession.getState().session?.user.id;
  if (!userId) {
    throw new Error("update_exam_date_unauthenticated");
  }
  const supabase = getBrowserClient();
  const { error } = await supabase
    .from("user_profiles")
    .update({ exam_date: isoDate })
    .eq("user_id", userId);
  if (error) {
    throw new Error(error.message || "update_exam_date_failed");
  }
}
