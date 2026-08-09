/**
 * Centralised edge-function facade for the mock-exam / practice flow
 * (S4 · Task 4.3). Ports `deutschfit-mobile/src/core/api/examApi.ts` —
 * re-exports the `mockExam.ts` surface plus `resumeMockExam` (thin
 * convenience wrapper around `startMockExam` that converts the 409
 * "mock_in_progress" resume signal into a full `StartMockExamResult`)
 * and the `lesen-submit` wrapper, `submitLesen`.
 *
 * Feature code should import from here, not `./mockExam` directly —
 * mirrors mobile's "one surface, stable wrapper signatures" rationale.
 */
import { ApiError, invokeFn } from "./client";
import type { AnswerMap } from "../exam/engine/scoring";
import {
  MockExamInProgressError,
  normaliseReport,
  advanceMockExam as mockExamAdvanceMockExam,
  finalizeMockExam as mockExamFinalizeMockExam,
  listModelltests as mockExamListModelltests,
  startMockExam as mockExamStartMockExam,
  type AdvanceMockExamArgs,
  type AdvanceMockExamResult,
  type CompetenceBar,
  type CompetenceSkills,
  type FetchHoerenSessionArgs,
  type FinalizeMockExamArgs,
  type FinalizeMockExamResult,
  type HoerenAudioTrack,
  type HoerenModule,
  type HoerenPart,
  type HoerenQuestion,
  type HoerenSessionPayload,
  type LesenManifestModule,
  type LesenModule,
  type LesenOption,
  type LesenPart,
  type LesenQuestion,
  type LesenReadingText,
  type LesenSessionPayload,
  type ListModelltestsArgs,
  type MockExamModule,
  type MockExamStatus,
  type ModelltestRow,
  type PracticeSetInfo,
  type RawManifest,
  type StartMockExamArgs,
  type StartMockExamResult,
} from "./mockExam";

// ---------------------------------------------------------------------------
// Re-exports — canonical types + functions live in `mockExam.ts`; new code
// imports from this facade so there's one stable surface to mock in tests.
// ---------------------------------------------------------------------------

export {
  MockExamInProgressError,
  normaliseReport,
  type AdvanceMockExamArgs,
  type AdvanceMockExamResult,
  type CompetenceBar,
  type CompetenceSkills,
  type FetchHoerenSessionArgs,
  type FinalizeMockExamArgs,
  type FinalizeMockExamResult,
  type HoerenAudioTrack,
  type HoerenModule,
  type HoerenPart,
  type HoerenQuestion,
  type HoerenSessionPayload,
  type LesenManifestModule,
  type LesenModule,
  type LesenOption,
  type LesenPart,
  type LesenQuestion,
  type LesenReadingText,
  type LesenSessionPayload,
  type ListModelltestsArgs,
  type MockExamModule,
  type MockExamStatus,
  type ModelltestRow,
  type PracticeSetInfo,
  type RawManifest,
  type StartMockExamArgs,
  type StartMockExamResult,
};
export {
  fetchHoerenPracticeSession,
  fetchHoerenSession,
  fetchLesenPracticeSession,
  fetchLesenSession,
  fetchPracticeSetsList,
  fetchSprachbausteinePracticeSession,
} from "./mockExam";

// ---------------------------------------------------------------------------
// Writing (S6 · Task 6.2) — re-exports canonical types + functions from
// `./writing` and `./writingErrors`, same "one stable surface" rationale as
// the mock-exam block above (Constraint 15: feature/screen code imports
// wire fns ONLY from this facade).
// ---------------------------------------------------------------------------

export {
  createPrompt,
  getWritingSubmission,
  listPrompts,
  promptsCacheKey,
  submitWriting,
  type CreatePromptInput,
  type CreateSubmissionResult,
  type DimensionScoresJson,
  type DimensionScoreWire,
  type Feedback,
  type PollingStatus,
  type SubmitWritingResult,
  type WritingPrompt,
  type WritingSubmission,
} from "./writing";

export {
  logSubmitError,
  mapSubmissionError,
  type SubmitError,
  type SubmitErrorKind,
} from "./writingErrors";

// ---------------------------------------------------------------------------
// Sprechen (S7 · Task 7.1) — re-exports canonical types + functions from
// `./sprechen` and `./sprechenTopics`, same "one stable surface" rationale
// as the blocks above (Constraint 15: feature code under
// `src/learner/sprechen/` imports wire fns/types ONLY from this facade;
// FeedbackV2 types come from `@/learner/core/feedback` instead).
// ---------------------------------------------------------------------------

export {
  finalize,
  getSprechenAudioUrl,
  getSprechenSubmission,
  putAudio,
  reserveUpload,
  type FinalizeResult,
  type ReserveUploadResult,
  type SprechenFeedbackJson,
  type SprechenPollingStatus,
  type SprechenStatus,
  type SprechenSubmission,
  type SprechenTeil,
} from "./sprechen";

export {
  createTopic,
  fetchTopics,
  sortTopicsByCert,
  SUBGENRE_BY_LEVEL,
  type CreateTopicInput,
  type FetchTopicsArgs,
  type OutlineStep,
  type SprechenCertCode,
  type SprechenPickerLevel,
  type SprechenSubgenre,
  type TopicCard,
} from "./sprechenTopics";

export const listModelltests = mockExamListModelltests;
export const startMockExam = mockExamStartMockExam;
export const advanceMockExam = mockExamAdvanceMockExam;
export const finalizeMockExam = mockExamFinalizeMockExam;

/**
 * Resume an existing mock attempt. Thin convenience around `startMockExam` —
 * the server only exposes the `start` endpoint, which returns a 409 with
 * the active `mock_attempt_id` when an attempt is already in progress. We
 * catch that 409, re-wrap it as a `StartMockExamResult` with `created:false`.
 *
 * This is NOT the same as `resumeSession` in
 * `@/learner/core/exam/mockExamSession` — that one reads the local Dexie
 * cache first (offline-friendly) and calls *this* when the cache is cold.
 */
export async function resumeMockExam(args: StartMockExamArgs): Promise<StartMockExamResult> {
  try {
    return await mockExamStartMockExam(args);
  } catch (err) {
    if (err instanceof MockExamInProgressError) {
      return {
        mockAttemptId: err.mockAttemptId,
        examSlug: args.examSlug,
        nextModule: nextModuleForStatus(err.status),
        lesenAttemptId: null,
        hoerenAttemptId: null,
        created: false,
        status: err.status,
      };
    }
    throw err;
  }
}

/**
 * Duplicated (not imported) from `mockExam.ts`, exactly as mobile
 * duplicates its own private `nextModuleForStatus` in `examApi.ts` — kept
 * private to this file.
 */
function nextModuleForStatus(s: MockExamStatus): MockExamModule | null {
  switch (s) {
    case "in_progress":
      return "LESEN";
    case "lesen_done":
      return "HOEREN";
    case "hoeren_done":
      return "SCHREIBEN";
    case "schreiben_done":
      return "SPRECHEN";
    case "sprechen_done":
    case "finalized":
    case "abandoned":
      return null;
  }
}

// ---------------------------------------------------------------------------
// Submit wrapper — used after Lesen is graded client-side. Server
// authoritative on `raw_score`; client re-grades for the per-part
// breakdown. `lesen-submit` also enforces the free-tier rate limit
// (`can_submit_reading`, 5/24h) — a 429 surfaces as `Error("rate_limited")`
// (P1 contract).
// ---------------------------------------------------------------------------

export interface SubmitLesenArgs {
  readonly attemptId: string;
  readonly answers: AnswerMap;
}

export interface SubmitModuleResponse {
  readonly attempt_id: string;
  readonly raw_score: number;
  readonly scaled_score?: number;
  readonly items?: readonly unknown[];
  /** Absent on a fresh submit — present only on an idempotent replay. */
  readonly replay?: boolean;
}

interface RawSubmitModuleResponse extends SubmitModuleResponse {
  readonly error?: string;
}

export async function submitLesen(args: SubmitLesenArgs): Promise<SubmitModuleResponse> {
  let raw: RawSubmitModuleResponse;
  try {
    raw = await invokeFn<RawSubmitModuleResponse>("lesen-submit", {
      method: "POST",
      body: { attempt_id: args.attemptId, answers: args.answers },
    });
  } catch (err) {
    if (err instanceof ApiError) {
      const body = err.bodyJson;
      const code =
        body !== null && typeof body === "object" && !Array.isArray(body)
          ? (body as Record<string, unknown>).error
          : undefined;
      throw new Error(typeof code === "string" ? code : "lesen_submit_failed");
    }
    throw err;
  }
  if (!raw) {
    throw new Error("lesen_submit_empty_response");
  }
  if (raw.error) {
    throw new Error(raw.error);
  }
  if (!raw.attempt_id || typeof raw.raw_score !== "number") {
    throw new Error("lesen_submit_malformed_response");
  }
  return raw;
}

// ---------------------------------------------------------------------------
// Hören submit wrapper (S5 · Task 5.1) — mirrors `submitLesen` above,
// implemented right beside it per Constraint 15 (mobile splits Hören
// wrappers into `examApi.ts:271–294`; web keeps the whole facade in one
// file). Same error-string taxonomy: server `error` codes (`rate_limited`,
// `attempt_not_submittable`) surface as `Error(code)` via `ApiError.bodyJson`.
// ---------------------------------------------------------------------------

export interface SubmitHoerenArgs {
  readonly attemptId: string;
  readonly answers: AnswerMap;
}

export async function submitHoeren(args: SubmitHoerenArgs): Promise<SubmitModuleResponse> {
  let raw: RawSubmitModuleResponse;
  try {
    raw = await invokeFn<RawSubmitModuleResponse>("hoeren-submit", {
      method: "POST",
      body: { attempt_id: args.attemptId, answers: args.answers },
    });
  } catch (err) {
    if (err instanceof ApiError) {
      const body = err.bodyJson;
      const code =
        body !== null && typeof body === "object" && !Array.isArray(body)
          ? (body as Record<string, unknown>).error
          : undefined;
      throw new Error(typeof code === "string" ? code : "hoeren_submit_failed");
    }
    throw err;
  }
  if (!raw) {
    throw new Error("hoeren_submit_empty_response");
  }
  if (raw.error) {
    throw new Error(raw.error);
  }
  if (!raw.attempt_id || typeof raw.raw_score !== "number") {
    throw new Error("hoeren_submit_malformed_response");
  }
  return raw;
}
