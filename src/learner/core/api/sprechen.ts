/**
 * Sprechen edge-function client (S7 · Task 7.1).
 *
 * Ports `deutschfit-mobile/src/features/sprechen/{api,types}.ts`. Wraps
 * the three-step Sprechen submission flow:
 *   1. `reserveUpload` — POST `sprechen-upload`
 *       → `{ submission_id, signed_put_url, storage_path, expires_in }`
 *       Reserves an `awaiting_upload` row and hands back a 15-minute TTL
 *       signed PUT URL against the `user-speech` bucket.
 *   2. `putAudio` — uploads the recorded blob directly to the signed URL
 *       via a plain `fetch(PUT)`. Web delta (P3): the `content-type`
 *       header is always the negotiated blob type the recorder adapter
 *       produced — never mobile's hardcoded `"audio/mp4"`.
 *   3. `finalize` — POST `sprechen-finalize`
 *       → `{ submission_id, status, replay }` — flips `awaiting_upload`
 *       → `queued` atomically and enqueues a grading job. Web never
 *       sends a `custom_theme` member (P14 / anti-requirement 6 — the
 *       ephemeral custom-theme finalize path is dead server-side).
 *
 * `getSprechenSubmission` delegates to the shared
 * `submissions-get?kind=speaking` client (`./submissions::getSubmission`)
 * so the writing + speaking flows share one transport (mirrors mobile's
 * post-#185 unification).
 *
 * Errors bubble up as thrown `Error`s whose message is the server `error`
 * code, so callers can `catch` and pattern-match — same taxonomy as
 * `./writing.ts`.
 */
import { ApiError, invokeFn } from "./client";
import { getSubmission } from "./submissions";
import type { DimensionScoresJson } from "./submissions";

/** Sprechen has three Teile (parts) on Goethe B1. Only Teil 1/2/3 exist. */
export type SprechenTeil = 1 | 2 | 3;

/**
 * Server status values come from the `sprechen_submissions.status` enum:
 * `awaiting_upload` → `queued` → `in_progress` → `graded` (or `failed` /
 * `error` / `rejected`). Deliberately narrower than the full backend row
 * status set — omits `"uploaded"`/`"abandoned"` for mobile parity
 * (mobile `types.ts`); do NOT "correct" this against migration 0061.
 */
export type SprechenStatus =
  | "awaiting_upload"
  | "queued"
  | "in_progress"
  | "graded"
  | "failed"
  | "error"
  | "rejected";

/**
 * `timeout` is a **client-local** status emitted by the polling hook
 * when the wall-clock budget elapses without reaching a terminal state.
 */
export type SprechenPollingStatus = SprechenStatus | "timeout";

/**
 * Response from `sprechen-upload`. The `signed_put_url` is valid for
 * `expires_in` seconds (900 at the time of writing); callers must PUT
 * the audio blob to it before calling `finalize`.
 */
export type ReserveUploadResult = {
  submission_id: string;
  signed_put_url: string;
  storage_path: string;
  expires_in: number;
};

/**
 * Response from `sprechen-finalize`. Returns `replay: true` when the
 * submission was already past `awaiting_upload` (idempotent replay).
 */
export type FinalizeResult = {
  submission_id: string;
  status: SprechenStatus;
  replay: boolean;
};

/**
 * Sprechen grader payload persisted on `sprechen_submissions.feedback_json`.
 *
 * v1 (legacy Goethe holistic): `feedback_de`, `feedback_fr`,
 * `pronunciation_notes`, `rubric_version`.
 *
 * v2 (unified grader, schema_version 2): the row's `feedback_json` carries
 * the verbatim `FeedbackV2` envelope (`@/learner/core/feedback/feedbackV2`,
 * P8) — this type only covers the legacy shape plus the pre-P8 v2 field
 * names mobile also carries for back-compat with older rows.
 */
export type SprechenFeedbackJson = {
  // v1 legacy fields (Goethe holistic grader)
  feedback_de?: string;
  feedback_fr?: string;
  pronunciation_notes?: readonly string[];
  rubric_version?: string;
  // v2 unified fields (schema_version 2) — pre-P8 back-compat field names
  examiner_feedback_de?: string | null;
  coach_feedback_fr?: string | null;
  next_drill_fr?: string | null;
  focus_areas?: string[] | null;
  model_answer_de?: string | null;
  dimension_notes?: Record<string, string> | null;
};

/**
 * A single `sprechen_submissions` row as surfaced back to the client
 * (verbatim from mobile `types.ts:117–157`), including the v2 optional
 * fields (`schema_version`, `dimension_scores_json`, `normalized_total_pct`,
 * `pass_status`, `asr_quality_status`, `aussprache_status`).
 */
export type SprechenSubmission = {
  id: string;
  user_id: string;
  exam_slug: string;
  teil: SprechenTeil;
  cert?: string;
  level?: string;
  status: SprechenStatus;
  audio_storage_path: string | null;
  audio_duration_ms: number | null;
  transcript_de: string | null;
  feedback_json: SprechenFeedbackJson | null;
  /** Holistic Sprechen score (0..100). Null until graded. */
  score: number | null;
  uploaded_at: string | null;
  graded_at: string | null;
  error_message: string | null;
  created_at: string;
  // Unified grading fields (schema_version 2+); optional on wire (legacy rows omit them)
  schema_version?: number;
  exam_product?: string | null;
  rubric_profile?: string | null;
  dimension_scores_json?: DimensionScoresJson | null;
  dimension_notes_json?: Record<string, string> | null;
  normalized_total_pct?: number | null;
  grading_confidence?: "high" | "medium" | "low" | null;
  pass_status?: "pass" | "fail" | "not_evaluated" | null;
  limitations_json?: string[] | null;
  asr_quality_status?: "reliable" | "partially_reliable" | "unreliable" | null;
  aussprache_status?: "not_assessable_from_transcript" | "assessed" | null;
};

export async function reserveUpload(args: {
  examSlug: string;
  teil: SprechenTeil;
  clientSubmissionId: string;
  /** Upper-case cert code — callers uppercase before calling (mobile `types.ts:23–31`). */
  cert?: string;
  /** Upper-case CEFR level. */
  level?: string;
}): Promise<ReserveUploadResult> {
  const body: Record<string, unknown> = {
    exam_slug: args.examSlug,
    teil: args.teil,
    client_submission_id: args.clientSubmissionId,
  };
  if (args.cert !== undefined) body.cert = args.cert;
  if (args.level !== undefined) body.level = args.level;
  try {
    return await invokeFn<ReserveUploadResult>("sprechen-upload", { method: "POST", body });
  } catch (err) {
    if (err instanceof ApiError) {
      throw new Error(err.code);
    }
    throw err;
  }
}

/**
 * Upload the recorded audio blob to the signed PUT URL. Plain
 * `fetch(PUT)` — the signed URL already carries its own credentials.
 *
 * Web delta (P3): `contentType` is always the negotiated blob type the
 * recorder adapter produced (`audio/webm;codecs=opus` → `audio/webm` →
 * `audio/mp4`), never mobile's hardcoded `"audio/mp4"`.
 */
export async function putAudio(
  signedPutUrl: string,
  blob: Blob,
  contentType: string
): Promise<void> {
  const res = await fetch(signedPutUrl, {
    method: "PUT",
    headers: { "content-type": contentType },
    body: blob,
  });
  if (!res.ok) {
    throw new Error("audio_upload_failed");
  }
}

/**
 * Finalize a submission.
 *
 * `subgenre`/`level`/`topicId` are the picker tuple — when present, sent
 * as `{ subgenre, level, topic_id }` on the wire so the grader can route
 * on the curated topic. `durationSec` is always floored to an integer
 * second when provided. No `custom_theme` member ships on web (P14 /
 * anti-requirement 6 — the ephemeral custom-theme finalize path is dead
 * server-side; community theme authoring goes through `topic-create`
 * instead, see `./sprechenTopics.ts::createTopic`).
 */
export async function finalize(args: {
  submissionId: string;
  subgenre?: "praesentation" | "vortrag";
  level?: string;
  topicId?: string;
  durationSec?: number;
}): Promise<FinalizeResult> {
  const body: Record<string, unknown> = { submission_id: args.submissionId };
  if (args.subgenre !== undefined) body.subgenre = args.subgenre;
  if (args.level !== undefined) body.level = args.level;
  if (args.topicId !== undefined) body.topic_id = args.topicId;
  if (typeof args.durationSec === "number" && args.durationSec >= 0) {
    body.duration_sec = Math.floor(args.durationSec);
  }
  try {
    return await invokeFn<FinalizeResult>("sprechen-finalize", { method: "POST", body });
  } catch (err) {
    if (err instanceof ApiError) {
      throw new Error(err.code);
    }
    throw err;
  }
}

/**
 * Resolve a short-lived signed GET URL for the caller's own Sprechen
 * recording so the Feedback screen can replay the submitted audio.
 */
export async function getSprechenAudioUrl(
  submissionId: string
): Promise<{ url: string; ttl_sec: number }> {
  try {
    const data = await invokeFn<{ submission_id: string; url: string; ttl_sec: number }>(
      "sprechen-audio-url",
      { method: "POST", body: { submission_id: submissionId } }
    );
    return { url: data.url, ttl_sec: data.ttl_sec };
  } catch (err) {
    if (err instanceof ApiError) {
      throw new Error(err.code);
    }
    throw err;
  }
}

/**
 * Poll the single submission row.
 *
 * Delegates to `./submissions::getSubmission(id, "speaking")`. Error
 * semantics: a 404 `ApiError` is translated to `Error("sprechen_not_found")`
 * to preserve the call-site contract (mobile `api.ts` translation); every
 * other `ApiError` surfaces its own server code unchanged.
 */
export async function getSprechenSubmission(id: string): Promise<SprechenSubmission> {
  try {
    const remote = await getSubmission(id, "speaking");
    return remote as unknown as SprechenSubmission;
  } catch (err) {
    if (err instanceof ApiError) {
      if (err.status === 404) {
        throw new Error("sprechen_not_found");
      }
      throw new Error(err.code);
    }
    throw err;
  }
}
