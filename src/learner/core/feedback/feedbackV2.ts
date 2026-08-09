/**
 * v2 unified-grader feedback contract — shared across modalities.
 *
 * Verbatim port of `deutschfit-mobile/src/core/feedback/types.ts` (202L)
 * + `deutschfit-mobile/src/core/feedback/band.ts` (19L), merged into a
 * single web file (S7 · Task 7.1). Mirrors the JSON Schema at
 * `deutschfit-meta/docs/product/grader-v2-feedback-schema.json`
 * (companion design doc: `grader-v2-feedback-schema.md`). Every shape
 * here must stay in lock-step with that file — when the schema changes,
 * this file changes in the same PR.
 *
 * Persona model (locked, see brand-voice.md §11):
 *   - Betreuer  → in-app companion, faceless, renders `*_fr` content.
 *   - Prüfer    → human exam examiner the AI simulates, perspective on
 *                  `*_de` content. Both German terms never translate.
 *   - Marie     → the LEARNER persona. NEVER attached to grader output.
 *
 * Lives in `src/learner/core/feedback/` (not a feature folder) so both
 * `src/learner/sprechen/` and any future modality can consume it without
 * crossing the feature-isolation boundary.
 */

export type CertCode = "GOETHE" | "TELC" | "OESD" | "TESTDAF" | "ECL";

export type LevelCode = "A1" | "A2" | "B1" | "B2" | "C1" | "C2";

export type MonologueType =
  | "monologue_personal"
  | "picture_description_simple"
  | "picture_description_collage_thematic"
  | "structured_response_4bullets"
  | "presentation_with_outline"
  | "vortrag_argumentation"
  | "partner_summary_followup"
  | "topic_discussion";

export type Band = "solide" | "proche_du_seuil" | "a_retravailler";

export type DimensionKey = "aufgabe" | "kohaerenz" | "wortschatz" | "grammatik" | "aussprache";

export type FeedbackBlockedReason =
  | "transcript_too_short"
  | "duration_too_short"
  | "partner_utterance_missing"
  | "transcript_unreliable"
  | "invalid_cert_code"
  | "invalid_level_code"
  | "invalid_monologue_type"
  | "prompt_brief_incomplete"
  | "grader_internal_error";

export type IntelligibilityBasis = "logprob_normalized" | "provider_confidence" | "unavailable";

export type RubricDescriptorSet = "A1" | "A2" | "B1" | "B2" | "C1" | "C2";

export interface EvidenceSpan {
  readonly transcript_offset_start: number;
  readonly transcript_offset_end: number;
  /** Verbatim substring of `asr_evidence.transcript`. */
  readonly quote_de: string;
  /** Short identifier (e.g. `missed_bullet_3`, `no_thesis`). */
  readonly label: string;
}

export interface LowConfidenceSpan {
  readonly transcript_offset_start: number;
  readonly transcript_offset_end: number;
  readonly quote: string;
}

export interface AsrEvidence {
  readonly transcript: string;
  readonly duration_seconds: number;
  readonly intelligibility_score: number;
  readonly intelligibility_basis: IntelligibilityBasis;
  readonly low_confidence_spans: readonly LowConfidenceSpan[];
  /** Informational only; never displayed to the user. */
  readonly provider: string;
}

export interface DimensionScore {
  readonly score: number;
  readonly cap_applied: number | null;
  readonly cap_reason: string | null;
  /** Prüfer-perspective German text (3rd-person / passive). */
  readonly justification_de: string;
  /** Betreuer voice in French (tutoiement; brand-voice §12 compliant). */
  readonly justification_fr: string;
  readonly evidence_spans: readonly EvidenceSpan[];
}

export interface DimensionScores {
  readonly aufgabe: DimensionScore;
  readonly kohaerenz: DimensionScore;
  readonly wortschatz: DimensionScore;
  readonly grammatik: DimensionScore;
  readonly aussprache: DimensionScore;
}

export interface Summary {
  readonly headline_fr: string;
  readonly strengths_fr: readonly string[];
  readonly growth_areas_fr: readonly string[];
  readonly headline_de: string;
  readonly strengths_de: readonly string[];
  readonly growth_areas_de: readonly string[];
}

export interface NextStep {
  readonly id: string;
  readonly label_fr: string;
  readonly label_de: string;
  readonly linked_dimension: DimensionKey;
  /** Reserved for v1.1 drill chaining; always null in v1.0. */
  readonly drill_hint: string | null;
  /** Optional rationale (not always provided by the grader). */
  readonly rationale?: string;
}

export interface WeightsApplied {
  readonly aufgabe: 0.3;
  readonly kohaerenz: 0.2;
  readonly wortschatz: 0.2;
  readonly grammatik: 0.2;
  readonly aussprache: 0.1;
}

export interface Metadata {
  readonly prompt_brief_keys_used: readonly string[];
  readonly weights_applied: WeightsApplied;
  readonly rubric_descriptor_set: RubricDescriptorSet;
  readonly grader_latency_ms: number;
  readonly model: string;
}

/**
 * Top-level envelope written to `public.sprechen_submissions.feedback_json`
 * by the v2 unified grader.
 */
export interface FeedbackV2 {
  readonly schema_version: 2;
  readonly grader_version: string;
  readonly graded_at: string;
  readonly submission_id: string;
  readonly cert_code: CertCode;
  readonly level_code: LevelCode;
  readonly monologue_type: MonologueType;
  readonly overall_score: number;
  readonly band: Band;
  readonly band_downgrade_reason: string | null;
  readonly feedback_blocked_reason: FeedbackBlockedReason | null;
  readonly dimension_scores: DimensionScores;
  readonly asr_evidence: AsrEvidence;
  readonly summary: Summary;
  readonly next_steps: readonly NextStep[];
  readonly metadata: Metadata;
}

const REQUIRED_TOP_LEVEL_KEYS: readonly (keyof FeedbackV2)[] = [
  "schema_version",
  "grader_version",
  "graded_at",
  "submission_id",
  "cert_code",
  "level_code",
  "monologue_type",
  "overall_score",
  "band",
  "band_downgrade_reason",
  "feedback_blocked_reason",
  "dimension_scores",
  "asr_evidence",
  "summary",
  "next_steps",
  "metadata",
];

/**
 * Pragmatic runtime guard for `FeedbackV2`. Verifies `schema_version === 2`
 * and the presence of every required top-level key — does NOT re-validate
 * nested shapes (Ajv on the backend already does that). Use to gate v2 UI
 * rendering vs. the legacy banner.
 */
export function isFeedbackV2(value: unknown): value is FeedbackV2 {
  if (typeof value !== "object" || value === null) return false;
  const record = value as Record<string, unknown>;
  if (record.schema_version !== 2) return false;
  for (const key of REQUIRED_TOP_LEVEL_KEYS) {
    if (!(key in record)) return false;
  }
  return true;
}

// ---------------------------------------------------------------------------
// band.ts — score → band mapping. Thresholds are inclusive at the upper
// band: 75 is `solide`, 55 is `proche_du_seuil`.
// ---------------------------------------------------------------------------

export const BAND_THRESHOLDS = {
  solide: 75,
  procheDuSeuil: 55,
} as const;

export function scoreToBand(score: number): Band {
  if (score >= BAND_THRESHOLDS.solide) return "solide";
  if (score >= BAND_THRESHOLDS.procheDuSeuil) return "proche_du_seuil";
  return "a_retravailler";
}
