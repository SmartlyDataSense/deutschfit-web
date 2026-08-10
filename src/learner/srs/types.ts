/**
 * SRS feature domain types.
 *
 * These shape the runtime values the hooks + screens pass around. They
 * are decoupled from `@/learner/core/db/types` so the feature module can
 * evolve the UI representation (e.g. prompt payload structure, option
 * ordering) without forcing a schema migration.
 *
 * `SRSCard.prompt` is carried as a tagged union so the revision screen
 * can render cloze sentences and vocab prompts through the same block
 * without drilling into `any`.
 *
 * Port of mobile `src/features/srs/types.ts` — `Difficulty` (imported
 * there from `@ui/blocks`) becomes a local union here since the web app
 * has no such import.
 */
import type { SRSCardType, SRSRating } from "@/learner/core/db/types";

export type DifficultyRating = "again" | "hard" | "good" | "easy";

export type SRSClozePrompt = {
  readonly kind: "cloze";
  readonly subjectLabel: string;
  /**
   * Sentence split on the blank. The block renders
   * `[before] ____ [after]` with the blank emphasized.
   */
  readonly before: string;
  readonly after: string;
  readonly translation?: string;
  readonly explanation: string;
};

export type SRSVocabPrompt = {
  readonly kind: "vocab";
  readonly subjectLabel: string;
  readonly headword: string;
  readonly translation?: string;
  readonly explanation: string;
};

export type SRSPromptPayload = SRSClozePrompt | SRSVocabPrompt;

export interface SRSAnswerOption {
  readonly id: string;
  readonly label: string;
  readonly isCorrect: boolean;
}

export interface SRSAnswerPayload {
  readonly options: readonly SRSAnswerOption[];
}

export interface SRSCard {
  readonly id: string;
  readonly cardType: SRSCardType;
  readonly prompt: SRSPromptPayload;
  readonly answer: SRSAnswerPayload;
  readonly sourceRef: string;
  readonly deck: string | null;
  readonly nextDue: Date;
  readonly createdAt: Date;
}

export interface SRSReview {
  readonly id: string;
  readonly cardId: string;
  readonly reviewedAt: Date;
  readonly rating: SRSRating;
  readonly easeAfter: number;
  readonly intervalDaysAfter: number;
  readonly nextDue: Date;
}

/** Mapping from the 4-button difficulty tile to an SM-2 rating. */
export const DIFFICULTY_TO_RATING: Record<DifficultyRating, SRSRating> = {
  again: "again",
  hard: "hard",
  good: "good",
  easy: "easy",
};
