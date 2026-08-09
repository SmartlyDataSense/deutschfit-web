/**
 * Submit-for-grading helper for Hören (S5 · Task 5.6).
 *
 * Verbatim port of `deutschfit-mobile/src/features/hoeren/api/submit.ts`
 * (`submitHoerenSession`, the practice/standalone-mode helper — mobile's
 * live-mode branch calls the raw `submitHoeren` wrapper directly instead of
 * going through this helper; see `HoerenSessionScreen.tsx` there).
 *
 * This client tries the network first. If the server call fails (offline,
 * 5xx, rate-limited, a synthetic/never-issued attempt id), it falls back to
 * local grading via `scoreSession` so the UX stays end-to-end. The caller
 * sees one error-free `HoerenSubmissionResult` in both cases; `serverGraded`
 * tells the results screen whether to surface the "graded offline" badge.
 *
 * The server only returns `raw_score` + per-item verdicts (no part
 * breakdown), so `SessionScore` is always (re-)computed locally from
 * `req.session` + `req.answers` — the server's role is just to confirm the
 * grade is canonical, matching how the rest of the player surfaces part
 * breakdowns in the results screen.
 *
 * Constraint 15 (web delta): mobile calls `supabase.functions.invoke`
 * directly inside a private `submitOnServer`. Web routes the same call
 * through the Task 5.1 `submitHoeren` facade in
 * `@/learner/core/api/examApi` instead — feature code imports wire
 * functions ONLY from that facade. The facade already owns the
 * `hoeren-submit` error taxonomy (`hoeren_submit_failed` /
 * `_empty_response` / `_malformed_response` — mobile's private helper used
 * `hoeren_submit_transport_error` for the no-message transport case, a
 * name only mobile's un-ported internal used) and throws a plain `Error`
 * on any of those, so this module doesn't re-validate the response shape —
 * any thrown `Error` (transport, empty, malformed, or a server-side
 * `{ error }` code) falls straight through to the same local-fallback
 * branch below, exactly as mobile's single `catch` does.
 *
 * `attemptId` is a required `string`, matching mobile's field exactly (NOT
 * `string | null`): mobile has no null-attempt-id branch inside
 * `submitHoerenSession` because its only caller (the practice/standalone
 * branch of `HoerenSessionScreen`) synthesizes a `local-<sessionId>` id
 * upstream when no live server attempt exists yet, rather than passing
 * `null` in. Web callers follow the same convention.
 */
import { submitHoeren } from "@/learner/core/api/examApi";
import {
  scoreSession,
  type AnswerMap,
  type SessionScore,
} from "@/learner/core/exam/engine/scoring";
import type { ExamSession } from "@/learner/core/exam/engine/types";

export interface HoerenSubmissionRequest {
  /**
   * Server-issued `mock_exam_attempts.id` UUID. Required because the
   * `hoeren-submit` edge function looks everything else up (user, exam_slug,
   * module_code) from this row. For standalone Hören fixture flows that
   * haven't started a mock attempt, callers pass a synthetic id — the
   * server 404s and local grading kicks in.
   */
  readonly attemptId: string;
  readonly session: ExamSession;
  /** Keyed by `qb_questions.id` UUID. */
  readonly answers: AnswerMap;
  /**
   * Wall-clock seconds the candidate spent on this attempt. Not sent to the
   * server under the current contract, but kept on the request so callers
   * don't have to plumb it through a separate channel if we later want
   * analytics.
   */
  readonly elapsedSeconds: number;
  readonly submittedAt: string;
}

export interface HoerenSubmissionResult {
  readonly submissionId: string;
  readonly score: SessionScore;
  readonly serverGraded: boolean;
}

/**
 * Attempt a server grade via the `submitHoeren` facade. Returns the parsed
 * result or lets the facade's thrown `Error` propagate so the outer
 * function can catch + fall back. Kept internal so callers see one
 * total-surface result.
 */
async function submitOnServer(req: HoerenSubmissionRequest): Promise<HoerenSubmissionResult> {
  const server = await submitHoeren({ attemptId: req.attemptId, answers: req.answers });

  // The backend only returns raw scores + per-item verdicts. We still need
  // the part-level breakdown for the results screen, so re-grade locally
  // over the answers we just submitted. The server's `raw_score` and the
  // local `correct` count should always match — if they drift, the local
  // count wins for display purposes (the server remains authoritative for
  // replay eligibility + analytics, which are separate fields).
  const score = scoreSession(req.session, req.answers);

  return {
    submissionId: server.attempt_id,
    score,
    serverGraded: true,
  };
}

export async function submitHoerenSession(
  req: HoerenSubmissionRequest
): Promise<HoerenSubmissionResult> {
  try {
    return await submitOnServer(req);
  } catch (err) {
    // Web delta: mobile guards this log behind `__DEV__`, a React Native
    // runtime global with no web equivalent (and no `NODE_ENV` idiom is
    // used for this purpose elsewhere in this repo — see
    // `examContext.ts`/`posthog.ts`'s unconditional `console.warn`s).
    console.warn("[hoeren] server submit failed, falling back to local grade:", err);
    const score = scoreSession(req.session, req.answers);
    return {
      submissionId: `local-${req.session.id}-${Date.now()}`,
      score,
      serverGraded: false,
    };
  }
}
