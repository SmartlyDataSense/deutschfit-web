/**
 * `submitDiagnostic` — posts the v2 diagnostic submission to the
 * `diagnostic-submit` edge function (spec 2026-05-04 §3.6.2).
 *
 * Port of `deutschfit-mobile/src/features/onboarding/services/submitDiagnostic.ts`
 * with `supabase.functions.invoke` replaced by `invokeFn` — the web
 * client's own retry/error handling means `ApiError` from `invokeFn`
 * propagates unchanged instead of being re-wrapped as a transport error.
 * `DiagnosticLevel`/`DiagnosticSectionKind` are imported from
 * `./getDiagnosticQuestions` rather than re-declared (mobile re-declares
 * them in both files; on web that's DRY'd up since both live in the same
 * package).
 *
 * Wire format:
 *   request:
 *     {
 *       attemptId: "<uuid>",
 *       answers:   { [questionId]: optionKey },
 *       clientMeta?: {
 *         elapsedSecPerSection?: { lesen, sprachbausteine, wortschatz },
 *         skippedQuestionIds?: string[]
 *       }
 *     }
 *   response:
 *     {
 *       attemptId, estimatedLevel,
 *       scorePerSection, totalScore, weaknessTags, perQuestionResults
 *     }
 *
 * Idempotency: re-submitting the same `attemptId` after the first
 * successful round-trip returns the same payload (server reads from
 * `user_diagnostic_answers`). Failed attempts (server 5xx) leave the
 * attempt in `'started'` state and may be retried with the same id.
 */
import { invokeFn } from "@/learner/core/api/client";
import type { DiagnosticLevel, DiagnosticSectionKind } from "./getDiagnosticQuestions";

export type { DiagnosticLevel, DiagnosticSectionKind };

/**
 * Server-derived estimated level. Includes sub-tier suffixes (b1.0,
 * b1.1, b1.2, b2.0, b2.1, b2.2). The bare CEFR codes are mirrored into
 * `user_profiles.exam_level`; the suffixed variant only ever appears on
 * the result screen.
 */
export type EstimatedLevel = "b1.0" | "b1.1" | "b1.2" | "b2.0" | "b2.1" | "b2.2" | "b1" | "b2";

export interface ScorePerSection {
  readonly lesen: number;
  readonly sprachbausteine: number;
  readonly wortschatz: number;
}

export interface PerQuestionResult {
  readonly questionId: string;
  readonly wasCorrect: boolean;
  readonly correctOption: string;
  readonly selectedOption: string | null;
  readonly explanationDe: string | null;
  readonly explanationEn: string | null;
}

export interface SubmitDiagnosticArgs {
  readonly attemptId: string;
  readonly answers: Readonly<Record<string, string>>;
  readonly clientMeta?: {
    readonly elapsedSecPerSection?: Readonly<Partial<ScorePerSection>>;
    readonly skippedQuestionIds?: readonly string[];
  };
}

export interface SubmitDiagnosticResult {
  readonly attemptId: string;
  readonly estimatedLevel: EstimatedLevel;
  readonly scorePerSection: ScorePerSection;
  readonly totalScore: number;
  readonly weaknessTags: readonly string[];
  readonly perQuestionResults: readonly PerQuestionResult[];
}

const EDGE_FUNCTION_NAME = "diagnostic-submit";

export async function submitDiagnostic(
  args: SubmitDiagnosticArgs
): Promise<SubmitDiagnosticResult> {
  const body: Record<string, unknown> = {
    attemptId: args.attemptId,
    answers: args.answers,
  };
  if (args.clientMeta) body.clientMeta = args.clientMeta;

  const data = await invokeFn<unknown>(EDGE_FUNCTION_NAME, {
    method: "POST",
    body,
  });

  if (!data || typeof data !== "object") {
    throw new Error("diagnostic_submit_empty_response");
  }
  const payload = data as Record<string, unknown>;
  if (typeof payload.error === "string") throw new Error(payload.error);
  if (
    typeof payload.attemptId !== "string" ||
    typeof payload.estimatedLevel !== "string" ||
    typeof payload.totalScore !== "number" ||
    !payload.scorePerSection ||
    typeof payload.scorePerSection !== "object" ||
    !Array.isArray(payload.weaknessTags) ||
    !Array.isArray(payload.perQuestionResults)
  ) {
    throw new Error("diagnostic_submit_malformed_response");
  }

  const sps = payload.scorePerSection as Record<string, unknown>;
  const score: ScorePerSection = {
    lesen: typeof sps.lesen === "number" ? sps.lesen : 0,
    sprachbausteine: typeof sps.sprachbausteine === "number" ? sps.sprachbausteine : 0,
    wortschatz: typeof sps.wortschatz === "number" ? sps.wortschatz : 0,
  };

  return {
    attemptId: payload.attemptId,
    estimatedLevel: payload.estimatedLevel as EstimatedLevel,
    scorePerSection: score,
    totalScore: payload.totalScore,
    weaknessTags: (payload.weaknessTags as unknown[]).map(String),
    perQuestionResults: (payload.perQuestionResults as PerQuestionResult[]).map((r) => ({
      questionId: String(r.questionId),
      wasCorrect: !!r.wasCorrect,
      correctOption: String(r.correctOption ?? ""),
      selectedOption: typeof r.selectedOption === "string" ? r.selectedOption : null,
      explanationDe: typeof r.explanationDe === "string" ? r.explanationDe : null,
      explanationEn: typeof r.explanationEn === "string" ? r.explanationEn : null,
    })),
  };
}
