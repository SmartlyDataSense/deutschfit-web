/**
 * `isFeedbackV2` — S7 · Task 7.1.
 *
 * Port of `deutschfit-mobile/src/core/feedback/types.ts`'s runtime guard.
 * Only the gate is exercised here (nested shapes are Ajv-validated
 * server-side, per the mobile doc comment) — accepts a full 16-key
 * `schema_version: 2` fixture, rejects `schema_version: 1`, rejects a
 * fixture missing a required top-level key (`asr_evidence`), rejects
 * null/non-object values.
 */
import { describe, expect, it } from "vitest";
import { isFeedbackV2, type FeedbackV2 } from "@/learner/core/feedback/feedbackV2";

function fullFixture(): FeedbackV2 {
  return {
    schema_version: 2,
    grader_version: "v2.1.0",
    graded_at: "2026-08-09T00:00:00.000Z",
    submission_id: "sub-1",
    cert_code: "GOETHE",
    level_code: "B1",
    monologue_type: "presentation_with_outline",
    overall_score: 78,
    band: "solide",
    band_downgrade_reason: null,
    feedback_blocked_reason: null,
    dimension_scores: {
      aufgabe: {
        score: 80,
        cap_applied: null,
        cap_reason: null,
        justification_de: "Die Aufgabe wurde erfüllt.",
        justification_fr: "Tu as bien répondu à la tâche.",
        evidence_spans: [],
      },
      kohaerenz: {
        score: 75,
        cap_applied: null,
        cap_reason: null,
        justification_de: "Kohärent.",
        justification_fr: "Cohérent.",
        evidence_spans: [],
      },
      wortschatz: {
        score: 76,
        cap_applied: null,
        cap_reason: null,
        justification_de: "Guter Wortschatz.",
        justification_fr: "Bon vocabulaire.",
        evidence_spans: [],
      },
      grammatik: {
        score: 74,
        cap_applied: null,
        cap_reason: null,
        justification_de: "Wenige Fehler.",
        justification_fr: "Peu d'erreurs.",
        evidence_spans: [],
      },
      aussprache: {
        score: 82,
        cap_applied: null,
        cap_reason: null,
        justification_de: "Klare Aussprache.",
        justification_fr: "Prononciation claire.",
        evidence_spans: [],
      },
    },
    asr_evidence: {
      transcript: "Ich möchte über mein Lieblingsbuch sprechen.",
      duration_seconds: 62,
      intelligibility_score: 0.94,
      intelligibility_basis: "logprob_normalized",
      low_confidence_spans: [],
      provider: "whisper-1",
    },
    summary: {
      headline_fr: "Belle présentation, structurée.",
      strengths_fr: ["Bonne structure"],
      growth_areas_fr: ["Varier le vocabulaire"],
      headline_de: "Gute strukturierte Präsentation.",
      strengths_de: ["Gute Struktur"],
      growth_areas_de: ["Wortschatz variieren"],
    },
    next_steps: [
      {
        id: "step-1",
        label_fr: "Travaille les connecteurs logiques.",
        label_de: "Übe logische Konnektoren.",
        linked_dimension: "kohaerenz",
        drill_hint: null,
      },
    ],
    metadata: {
      prompt_brief_keys_used: ["title_de"],
      weights_applied: {
        aufgabe: 0.3,
        kohaerenz: 0.2,
        wortschatz: 0.2,
        grammatik: 0.2,
        aussprache: 0.1,
      },
      rubric_descriptor_set: "B1",
      grader_latency_ms: 4200,
      model: "gpt-4.1",
    },
  };
}

describe("isFeedbackV2", () => {
  it("accepts a full 16-key fixture with schema_version: 2", () => {
    expect(isFeedbackV2(fullFixture())).toBe(true);
  });

  it("rejects schema_version: 1", () => {
    const fixture = { ...fullFixture(), schema_version: 1 };
    expect(isFeedbackV2(fixture)).toBe(false);
  });

  it("rejects a fixture missing asr_evidence", () => {
    const fixture = fullFixture() as unknown as Record<string, unknown>;
    delete fixture.asr_evidence;
    expect(isFeedbackV2(fixture)).toBe(false);
  });

  it("rejects null", () => {
    expect(isFeedbackV2(null)).toBe(false);
  });

  it("rejects non-object values", () => {
    expect(isFeedbackV2("not-an-object")).toBe(false);
    expect(isFeedbackV2(42)).toBe(false);
    expect(isFeedbackV2(undefined)).toBe(false);
  });
});
