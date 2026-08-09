/**
 * Generic exam-session types.
 *
 * Verbatim port of `deutschfit-mobile/src/core/exam/types.ts`. The shapes
 * here are intentionally narrower than the raw Modelltest manifest + module
 * JSON — each feature (Lesen, Hören, …) adapts its input into these
 * primitives so the player UI and grading logic stay format-agnostic.
 */

/** Module identity for any servable session (graded exam or practice). */
export type ModuleCode = "LESEN" | "HOEREN" | "SPRACHBAUSTEINE";

/**
 * All single-pick answer formats currently in the corpus.
 * Each one maps to "the user picks exactly one option key" — only the
 * label / option count differs.
 */
export type AnswerFormat =
  | "TRUE_FALSE"
  | "YES_NO"
  | "MC_SINGLE_3"
  | "MC_SINGLE_4"
  | "MATCH_TO_ITEM"
  | "CLOZE_RADIO"
  | "CLOZE_DRAG";

export interface ExamOption {
  /** Stable key used as the answer identifier (e.g. 'a', 'R'). */
  readonly key: string;
  /** Human-visible option text (German). */
  readonly text: string;
}

export interface ExamItem {
  /** Stable id within a session (e.g. 'lesen-t1-q3'). */
  readonly id: string;
  /** 1-based item number from the source booklet. */
  readonly number: number;
  /** Question stem in German. May be `null` if the source is still scaffolding. */
  readonly stem: string | null;
  readonly answerFormat: AnswerFormat;
  readonly options: readonly ExamOption[];
  readonly correctKey: string;
  /** Slug of the reading text or audio track this item belongs to. */
  readonly stimulusSlug: string | null;
}

export interface ExamPart {
  readonly id: string;
  /** Booklet teil number (1..N). */
  readonly teilNumber: number;
  readonly label: string;
  readonly partKind: string;
  readonly durationMinutes: number;
  readonly instructions: string;
  readonly items: readonly ExamItem[];
}

export interface ExamSession {
  readonly id: string;
  readonly examSlug: string;
  readonly moduleCode: ModuleCode;
  readonly title: string;
  readonly totalDurationMinutes: number;
  readonly parts: readonly ExamPart[];
}
