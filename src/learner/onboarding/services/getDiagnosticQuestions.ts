/**
 * `getDiagnosticQuestions` — fetches the 15-item exam-shaped question pack
 * via the `diagnostic-questions-get` edge function (spec §3.6.1).
 *
 * Port of `deutschfit-mobile/src/features/onboarding/services/getDiagnosticQuestions.ts`
 * with `supabase.functions.invoke` replaced by `invokeFn` — the web
 * client's own retry/error handling means `ApiError` from `invokeFn`
 * propagates unchanged instead of being re-wrapped as a transport error.
 *
 * Wire format documented in
 * `deutschfit-meta/docs/release/2026-05-04-beta-ux-refinements-spec.md` §3.6.1.
 * The response is idempotent on `(user, attemptId)`: a retry with the same
 * `attemptId` returns the cached question set so transient network drops are
 * safe to recover from.
 *
 * `correct_answer` is intentionally absent — server retains the keys, the
 * client only ever ships option keys back to `diagnostic-submit`.
 */
import { invokeFn } from "@/learner/core/api/client";

export type DiagnosticLevel = "b1" | "b2";
export type DiagnosticSectionKind = "lesen" | "sprachbausteine" | "wortschatz";

export interface DiagnosticOption {
  readonly key: string;
  readonly label_de: string;
}

export interface DiagnosticItem {
  readonly questionId: string;
  readonly stemDe: string;
  readonly options: readonly DiagnosticOption[];
  readonly tags: readonly string[];
  readonly categoryPillLabel: string;
}

export interface DiagnosticReadingText {
  readonly id: string;
  readonly title_de: string | null;
  readonly body_de: string;
}

export interface DiagnosticSection {
  readonly kind: DiagnosticSectionKind;
  readonly durationSec: number;
  readonly readingText: DiagnosticReadingText | null;
  readonly items: readonly DiagnosticItem[];
}

export interface DiagnosticQuestionsResponse {
  readonly attemptId: string;
  readonly level: DiagnosticLevel;
  readonly issuedAt: string;
  readonly expiresAt: string;
  readonly bankExhausted: boolean;
  readonly sections: readonly DiagnosticSection[];
}

export interface GetDiagnosticQuestionsArgs {
  readonly attemptId: string;
  readonly level: DiagnosticLevel;
}

const EDGE_FUNCTION_NAME = "diagnostic-questions-get";

export async function getDiagnosticQuestions(
  args: GetDiagnosticQuestionsArgs
): Promise<DiagnosticQuestionsResponse> {
  const data = await invokeFn<unknown>(EDGE_FUNCTION_NAME, {
    method: "POST",
    body: { attemptId: args.attemptId, level: args.level },
  });

  if (!data || typeof data !== "object") {
    throw new Error("diagnostic_questions_empty_response");
  }
  const payload = data as Record<string, unknown>;
  if (typeof payload.error === "string") {
    throw new Error(payload.error);
  }
  if (
    typeof payload.attemptId !== "string" ||
    typeof payload.level !== "string" ||
    !Array.isArray(payload.sections)
  ) {
    throw new Error("diagnostic_questions_malformed_response");
  }
  return payload as unknown as DiagnosticQuestionsResponse;
}
