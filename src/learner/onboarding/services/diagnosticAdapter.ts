/**
 * Adapters between the diagnostic wire DTOs and the screen view-models
 * (spec 2026-05-04 §3.8).
 *
 * - `toDiagnosticViewModel` flattens the section-grouped questions DTO
 *   into a sequenced list with precomputed indices for the eyebrow
 *   (`LESEN · 3/4 · 01:42`) and the screen never has to know the wire
 *   shape.
 * - `toResultViewModel` ranks weaknesses and prepares Block-3 + review
 *   collapsible data for `OnboardingDiagnosticResultScreen`.
 *
 * These are the only places allowed to know both shapes.
 */
import type {
  DiagnosticItem,
  DiagnosticQuestionsResponse,
  DiagnosticReadingText,
  DiagnosticSection,
  DiagnosticSectionKind,
} from "./getDiagnosticQuestions";
import type {
  PerQuestionResult,
  ScorePerSection,
  SubmitDiagnosticResult,
} from "./submitDiagnostic";

export interface SequencedQuestion extends DiagnosticItem {
  /** 1-indexed across the whole 15-item attempt. */
  readonly globalIndex: number;
  /** 1-indexed within its own section. */
  readonly sectionIndex: number;
  readonly sectionKind: DiagnosticSectionKind;
  readonly sectionTotal: number;
  readonly readingText: DiagnosticReadingText | null;
}

export interface DiagnosticViewModel {
  readonly attemptId: string;
  readonly level: "b1" | "b2";
  readonly bankExhausted: boolean;
  readonly sections: readonly DiagnosticSection[];
  readonly questions: readonly SequencedQuestion[];
  readonly totalQuestions: number;
}

export function toDiagnosticViewModel(dto: DiagnosticQuestionsResponse): DiagnosticViewModel {
  const questions: SequencedQuestion[] = [];
  let globalIndex = 0;
  for (const section of dto.sections) {
    let sectionIndex = 0;
    for (const item of section.items) {
      globalIndex += 1;
      sectionIndex += 1;
      questions.push({
        ...item,
        globalIndex,
        sectionIndex,
        sectionKind: section.kind,
        sectionTotal: section.items.length,
        readingText: section.readingText,
      });
    }
  }
  return {
    attemptId: dto.attemptId,
    level: dto.level,
    bankExhausted: dto.bankExhausted,
    sections: dto.sections,
    questions,
    totalQuestions: questions.length,
  };
}

// ---------------------------------------------------------------------------
// Result view-model
// ---------------------------------------------------------------------------

export interface WeaknessRow {
  readonly tag: string;
  readonly section: DiagnosticSectionKind | null;
  readonly errorCount: number;
  readonly outOf: number;
}

export interface ResultReviewRow {
  readonly questionId: string;
  readonly globalIndex: number;
  readonly wasCorrect: boolean;
  readonly correctOption: string;
  readonly selectedOption: string | null;
  readonly explanationDe: string | null;
  readonly explanationEn: string | null;
}

export interface DiagnosticResultViewModel {
  readonly attemptId: string;
  readonly estimatedLevel: SubmitDiagnosticResult["estimatedLevel"];
  readonly tierSuffix: TierSuffix;
  readonly scorePerSection: ScorePerSection;
  readonly totalScore: number;
  readonly totalOutOf: number;
  readonly weaknesses: readonly WeaknessRow[];
  readonly review: readonly ResultReviewRow[];
}

export type TierSuffix =
  | "fast-b2" // .2 sub-tier
  | "solide" // .1 sub-tier
  | "debutant"; // .0 sub-tier

const SECTION_TOTAL: Record<DiagnosticSectionKind, number> = {
  lesen: 4,
  sprachbausteine: 6,
  wortschatz: 5,
};
const TOTAL_OUT_OF = 15;

export function toResultViewModel(dto: SubmitDiagnosticResult): DiagnosticResultViewModel {
  return {
    attemptId: dto.attemptId,
    estimatedLevel: dto.estimatedLevel,
    tierSuffix: tierSuffixFor(dto.estimatedLevel),
    scorePerSection: dto.scorePerSection,
    totalScore: dto.totalScore,
    totalOutOf: TOTAL_OUT_OF,
    weaknesses: rankWeaknesses(dto.weaknessTags, dto.perQuestionResults),
    review: dto.perQuestionResults.map((r, i) => ({
      questionId: r.questionId,
      globalIndex: i + 1,
      wasCorrect: r.wasCorrect,
      correctOption: r.correctOption,
      selectedOption: r.selectedOption,
      explanationDe: r.explanationDe,
      explanationEn: r.explanationEn,
    })),
  };
}

function tierSuffixFor(level: SubmitDiagnosticResult["estimatedLevel"]): TierSuffix {
  if (level.endsWith(".2")) return "fast-b2";
  if (level.endsWith(".1")) return "solide";
  return "debutant";
}

const SECTION_KINDS: readonly DiagnosticSectionKind[] = ["lesen", "sprachbausteine", "wortschatz"];

function rankWeaknesses(
  weaknessTags: readonly string[],
  perQuestion: readonly PerQuestionResult[]
): readonly WeaknessRow[] {
  // Two pass: first map each tag to its primary section + error count,
  // then sort by errorCount desc and take top 3.
  const errorsByTag = new Map<string, { section: DiagnosticSectionKind | null; count: number }>();
  for (const r of perQuestion) {
    if (r.wasCorrect) continue;
    // The wire shape is flat — we don't have section_kind on the row.
    // Tag-derived section is the best signal: the seed encodes the
    // section as the first tag value (e.g. ["lesen","anzeigen"]) and
    // weaknessTags are the most-missed tag names. Match by intersection.
    const section = inferSectionFromTagName(r.questionId, r);
    for (const tag of weaknessTags) {
      const entry = errorsByTag.get(tag) ?? { section, count: 0 };
      entry.count += 1;
      if (!entry.section) entry.section = section;
      errorsByTag.set(tag, entry);
    }
  }

  const rows: WeaknessRow[] = [];
  for (const [tag, info] of errorsByTag) {
    const sectionKey = info.section ?? null;
    rows.push({
      tag,
      section: sectionKey,
      errorCount: info.count,
      outOf: sectionKey ? SECTION_TOTAL[sectionKey] : 0,
    });
  }
  rows.sort((a, b) => b.errorCount - a.errorCount);
  return rows.slice(0, 3);
}

// In the v2 wire, `perQuestionResults` does not carry section. The
// server orders results in the same order it issued them: lesen first
// (4), then sprachbausteine (6), then wortschatz (5). Use the row's
// position within `perQuestion` to derive the section.
function inferSectionFromTagName(
  _questionId: string,
  row: PerQuestionResult
): DiagnosticSectionKind | null {
  // Static lookup by questionId prefix used in seed: `diag-b1-lesen-…`.
  const id = row.questionId.toLowerCase();
  for (const kind of SECTION_KINDS) {
    if (id.includes(`-${kind}-`)) return kind;
  }
  return null;
}
