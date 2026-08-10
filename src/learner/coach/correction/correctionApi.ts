/**
 * Walkthrough-detail adapter. Wraps `@/learner/core/api/submissions`'s
 * `getSubmission` and narrows its untyped `feedback_json` (and, for
 * Schreiben, its flat top-level columns) into the two correction shapes
 * the walkthrough renders. No grader call — read-only over stored data.
 *
 * Note: `getSubmission` accepts `SubmissionKind` ("writing" | "speaking"),
 * which differs from the UI-facing `Modality` ("schreiben" | "sprechen").
 * This module maps between the two at the boundary (`MODALITY_TO_KIND`).
 *
 * Verbatim port of `deutschfit-mobile/src/features/coach/correction/correctionApi.ts`
 * (S9 · Task 9.8), adapted to this app's `getSubmission(id, kind)` /
 * `RemoteSubmission` (`@/learner/core/api/submissions`) and `isFeedbackV2`
 * / `FeedbackV2` (`@/learner/core/feedback/feedbackV2`) — same field
 * names, same error string, same schema-version gate.
 *
 * INVARIANT (see `sprechenSpans.ts` header): the `feedback.dimension_scores.*.evidence_spans`
 * arrays returned here must reach `resolveSpans` un-cloned. This module
 * does no cloning/mapping of `payload` — it returns the parsed
 * `FeedbackV2` object as-is — so the invariant holds as long as no
 * caller between here and `resolveSpans` clones it either.
 */
import { getSubmission, type SubmissionKind } from "@/learner/core/api/submissions";
import { isFeedbackV2, type FeedbackV2 } from "@/learner/core/feedback/feedbackV2";

export type Modality = "schreiben" | "sprechen";

/**
 * Board-blind by construction (issue #41): the writing pipeline's
 * `dimension_scores` column carries whatever facet set the board's rubric
 * defines — 4 keys for Goethe (`erfuellung`/`kohaerenz`/`wortschatz`/
 * `strukturen`), 3 for telc (`inhalt`/`formale_richtigkeit`/
 * `kommunikative_gestaltung`), a different set again for ÖSD/ECL. A fixed
 * 4-field shape here is what silently dropped every telc row's dimensions
 * to zero. Never widen this back to a closed set of fields.
 */
export type SchreibenDimensionScores = Readonly<Record<string, number>>;

export interface SprechenCorrection {
  readonly modality: "sprechen";
  readonly feedback: FeedbackV2;
}

export interface SchreibenCorrection {
  readonly modality: "schreiben";
  readonly bodyDe: string;
  readonly prueferText: string;
  readonly betreuerText: string;
  readonly overallScore: number;
  /**
   * Board-native points denominator (migration 0119: Goethe-B1 → 100,
   * telc-B1/B2 → 45, …). `overallScore` is RAW POINTS out of this
   * denominator, not a percentage — never feed it to `scoreToBand`
   * directly (issue #41 defect 2). Null on rows that predate the column;
   * `GlobalScoreBlock` documents the fallback for that case.
   */
  readonly scoreMax: number | null;
  /** Server-derived overall percentage (0-100), when the grader emits one.
   * Preferred over `overallScore / scoreMax` for band derivation when
   * present — see `GlobalScoreBlock`. */
  readonly normalizedTotalPct: number | null;
  readonly summaryFr: string;
  readonly dimensionScores: SchreibenDimensionScores;
}

export type Correction = SprechenCorrection | SchreibenCorrection;

/** Map UI-facing modality to the backend's SubmissionKind discriminator. */
const MODALITY_TO_KIND: Record<Modality, SubmissionKind> = {
  schreiben: "writing",
  sprechen: "speaking",
};

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}

function num(v: unknown): number {
  return typeof v === "number" ? v : 0;
}

function str(v: unknown): string {
  return typeof v === "string" ? v : "";
}

export async function fetchCorrection(
  submissionId: string,
  modality: Modality
): Promise<Correction> {
  const kind = MODALITY_TO_KIND[modality];
  const submission = await getSubmission(submissionId, kind);
  const payload = submission.feedback_json;

  if (modality === "sprechen") {
    if (!isFeedbackV2(payload)) {
      throw new Error("correction_unavailable");
    }
    return { modality: "sprechen", feedback: payload };
  }

  // Schreiben — the writing pipeline stores grading data as flat top-level
  // columns; `feedback_json` is always null on writing rows (backend#418).
  // Shape verified against the dev `submissions-get` response.
  if (submission.schema_version !== 2) {
    throw new Error("correction_unavailable");
  }
  const dims = isRecord(submission.dimension_scores) ? submission.dimension_scores : {};
  // Board-blind by construction (issue #41 defect 1): render exactly the
  // keys the row carries, in the payload's own key order. `Object.entries`
  // on a JSON-parsed object preserves the source's insertion order for
  // string keys, so this is the grader's own canonical facet order (e.g.
  // telc: inhalt -> formale_richtigkeit -> kommunikative_gestaltung) —
  // never sort alphabetically, that would reorder a board's official
  // criteria sequence.
  const dimensionScores: Record<string, number> = {};
  for (const [key, value] of Object.entries(dims)) {
    dimensionScores[key] = num(value);
  }
  const scoreMax = submission.score_max;
  const normalizedTotalPct = submission.normalized_total_pct;
  return {
    modality: "schreiben",
    bodyDe: str(submission.body_de),
    prueferText: str(submission.pruefer_text),
    betreuerText: str(submission.betreuer_text),
    overallScore: num(submission.score),
    scoreMax: typeof scoreMax === "number" && Number.isFinite(scoreMax) ? scoreMax : null,
    normalizedTotalPct:
      typeof normalizedTotalPct === "number" && Number.isFinite(normalizedTotalPct)
        ? normalizedTotalPct
        : null,
    // Writing rows carry no one-line headline; `GlobalScoreBlock` hides an
    // empty summary. The Betreuer's prose feedback is `betreuer_text`,
    // rendered inside the diff view. Hardcoded empty string is deliberate
    // parity with backend#418 — do not invent a summary here.
    summaryFr: "",
    dimensionScores,
  };
}
