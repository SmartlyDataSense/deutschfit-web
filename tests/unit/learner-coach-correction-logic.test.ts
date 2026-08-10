/**
 * Correction walkthrough pure-logic layer — S9 · Task 9.8.
 *
 * Covers the three modules ported verbatim from
 * `deutschfit-mobile/src/features/coach/correction/`:
 *   - `schreibenDiff.ts`  — whitespace-token LCS word diff.
 *   - `sprechenSpans.ts`  — evidence-span → transcript-segment resolver.
 *   - `correctionApi.ts`  — `fetchCorrection` adapter over `getSubmission`.
 *
 * Mocks only the transport boundary (`@/learner/core/api/submissions`),
 * per this repo's test idiom (see `learner-sprechen-api.test.ts`) — the
 * three correction modules themselves run for real.
 */
import { beforeEach, describe, expect, test, vi } from "vitest";
import type { EvidenceSpan } from "@/learner/core/feedback/feedbackV2";
import feedbackV2Fixture from "@/learner/coach/correction/__fixtures__/feedbackV2.sample.json";

const { getSubmissionMock } = vi.hoisted(() => ({
  getSubmissionMock: vi.fn(),
}));

vi.mock("@/learner/core/api/submissions", () => ({
  getSubmission: getSubmissionMock,
}));

import { buildDiff } from "@/learner/coach/correction/schreibenDiff";
import { resolveSpans } from "@/learner/coach/correction/sprechenSpans";
import { fetchCorrection } from "@/learner/coach/correction/correctionApi";

beforeEach(() => {
  // Block body deliberately — see learner-coach-api.test.ts / learner-sprechen-api.test.ts
  // for why an expression-bodied `() => getSubmissionMock.mockReset()` is a footgun here.
  getSubmissionMock.mockReset();
});

// ---------------------------------------------------------------------------
// schreibenDiff.buildDiff
// ---------------------------------------------------------------------------

describe("buildDiff", () => {
  test("word substitution: removed/added around a shared prefix and suffix", () => {
    expect(buildDiff("Ich habe gegangen", "Ich bin gegangen")).toEqual([
      { type: "equal", text: "Ich" },
      { type: "removed", text: "habe" },
      { type: "added", text: "bin" },
      { type: "equal", text: "gegangen" },
    ]);
  });

  test("identical strings produce a single equal segment", () => {
    expect(buildDiff("Hallo", "Hallo")).toEqual([{ type: "equal", text: "Hallo" }]);
  });

  test("empty original -> every token of the rewrite is added", () => {
    expect(buildDiff("", "Ich bin gegangen")).toEqual([
      { type: "added", text: "Ich" },
      { type: "added", text: "bin" },
      { type: "added", text: "gegangen" },
    ]);
  });

  test("tie-break prefers removed-before-added when LCS lengths tie", () => {
    // a=[x,y], b=[y,x]: LCS length 1 either way. At (i=0,j=0) down===right
    // (both 1) — `if (down >= right)` must choose `removed` first.
    expect(buildDiff("x y", "y x")).toEqual([
      { type: "removed", text: "x" },
      { type: "equal", text: "y" },
      { type: "added", text: "x" },
    ]);
  });
});

// ---------------------------------------------------------------------------
// sprechenSpans.resolveSpans
// ---------------------------------------------------------------------------

const span = (start: number, end: number, label = "l"): EvidenceSpan => ({
  transcript_offset_start: start,
  transcript_offset_end: end,
  quote_de: "",
  label,
});

describe("resolveSpans", () => {
  test("single mid-string span splits into plain/highlight/plain", () => {
    const result = resolveSpans("abcdef", [span(1, 3)]);
    expect(result).toEqual([
      { type: "plain", text: "a", spans: [] },
      { type: "highlight", text: "bc", spans: [span(1, 3)] },
      { type: "plain", text: "def", spans: [] },
    ]);
  });

  test("empty span list on a non-empty transcript -> one plain segment", () => {
    expect(resolveSpans("abcdef", [])).toEqual([{ type: "plain", text: "abcdef", spans: [] }]);
  });

  test("out-of-range and empty spans are dropped, leaving a single plain segment", () => {
    const spans: EvidenceSpan[] = [
      span(-1, 3), // negative start
      span(2, 99), // end past transcript length
      span(4, 4), // empty (start === end)
      span(5, 3), // inverted
    ];
    expect(resolveSpans("abcdef", spans)).toEqual([{ type: "plain", text: "abcdef", spans: [] }]);
  });

  test("a span object straddling a cut point merges into ONE highlight via reference identity", () => {
    // spanA covers the whole transcript; spanB's edges (3,4) inject extra
    // cut points inside spanA's range. Because `resolveSpans` filters
    // `covering` from the same `valid` array on every cut, spanA is the
    // *same object* in each of the three raw segments it covers — the
    // merge step must coalesce all three into one highlight, not leave
    // two (or three) separate ones.
    const spanA = span(0, 6, "whole");
    const spanB = span(3, 4, "inner");
    const result = resolveSpans("abcdef", [spanA, spanB]);

    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({
      type: "highlight",
      text: "abcdef",
      spans: [spanA, spanB],
    });
    // Reference-identity check, not just structural equality: the merged
    // segment's spans must be the exact same objects passed in.
    expect(result[0]!.spans[0]).toBe(spanA);
    expect(result[0]!.spans[1]).toBe(spanB);
  });

  test("two disjoint spans stay as two separate highlights", () => {
    const result = resolveSpans("abcdef", [span(0, 1), span(5, 6)]);
    expect(result).toEqual([
      { type: "highlight", text: "a", spans: [span(0, 1)] },
      { type: "plain", text: "bcde", spans: [] },
      { type: "highlight", text: "f", spans: [span(5, 6)] },
    ]);
  });
});

// ---------------------------------------------------------------------------
// correctionApi.fetchCorrection
// ---------------------------------------------------------------------------

describe("fetchCorrection — sprechen", () => {
  test("valid feedback_json -> {modality:'sprechen', feedback}", async () => {
    getSubmissionMock.mockResolvedValue({
      id: "sub-1",
      status: "graded",
      feedback_json: feedbackV2Fixture,
    });
    const result = await fetchCorrection("sub-1", "sprechen");
    expect(result).toEqual({ modality: "sprechen", feedback: feedbackV2Fixture });
  });

  test("invalid feedback_json throws correction_unavailable", async () => {
    getSubmissionMock.mockResolvedValue({
      id: "sub-1",
      status: "graded",
      feedback_json: { not: "valid" },
    });
    await expect(fetchCorrection("sub-1", "sprechen")).rejects.toThrow("correction_unavailable");
  });

  test("kind mapping: sprechen -> getSubmission(id, 'speaking')", async () => {
    getSubmissionMock.mockResolvedValue({
      id: "sub-1",
      status: "graded",
      feedback_json: feedbackV2Fixture,
    });
    await fetchCorrection("sub-1", "sprechen");
    expect(getSubmissionMock).toHaveBeenCalledWith("sub-1", "speaking");
  });
});

describe("fetchCorrection — schreiben", () => {
  const gradedRow = {
    id: "sub-2",
    status: "graded",
    schema_version: 2,
    body_de: "Ich habe gegangen.",
    pruefer_text: "Ich bin gegangen.",
    betreuer_text: "Achte auf das Perfekt mit 'sein'.",
    score: 72,
    dimension_scores: { erfuellung: 80, kohaerenz: 70, wortschatz: 65, strukturen: 60 },
  };

  test("schema_version 2 flat row maps to SchreibenCorrection, summaryFr is hardcoded ''", async () => {
    getSubmissionMock.mockResolvedValue(gradedRow);
    const result = await fetchCorrection("sub-2", "schreiben");
    expect(result).toEqual({
      modality: "schreiben",
      bodyDe: "Ich habe gegangen.",
      prueferText: "Ich bin gegangen.",
      betreuerText: "Achte auf das Perfekt mit 'sein'.",
      overallScore: 72,
      scoreMax: null,
      normalizedTotalPct: null,
      summaryFr: "",
      // No `dimension_scores_json` on this row -> every entry falls back to
      // the flat map's value with `max: null` (denominator unknown, never
      // invented).
      dimensionScores: {
        erfuellung: { score: 80, max: null },
        kohaerenz: { score: 70, max: null },
        wortschatz: { score: 65, max: null },
        strukturen: { score: 60, max: null },
      },
    });
  });

  test("kind mapping: schreiben -> getSubmission(id, 'writing')", async () => {
    getSubmissionMock.mockResolvedValue(gradedRow);
    await fetchCorrection("sub-2", "schreiben");
    expect(getSubmissionMock).toHaveBeenCalledWith("sub-2", "writing");
  });

  test("schema_version !== 2 throws correction_unavailable", async () => {
    getSubmissionMock.mockResolvedValue({ ...gradedRow, schema_version: 1 });
    await expect(fetchCorrection("sub-2", "schreiben")).rejects.toThrow("correction_unavailable");
  });

  // Regression coverage for issue #41: a real telc row
  // (76b2894d-8fc2-4789-80f5-439838493973, exam_product = telc_deutsch_b1)
  // has `dimension_scores = {"inhalt":13,"formale_richtigkeit":12,
  // "kommunikative_gestaltung":13}` — none of the Goethe four hardcoded
  // keys the old mapping pinned. Before the fix, every lookup here
  // returned `undefined` -> `num()` coerced it to 0, and the walkthrough
  // rendered four "0/100" cards for an 84% pass. This test would have
  // caught it: a hardcoded Goethe-4 mapping produces
  // `{erfuellung:0,kohaerenz:0,wortschatz:0,strukturen:0}`, not the telc
  // keys asserted below.
  test("telc-shaped dimension_scores (3 keys, no Goethe overlap) maps board-blind, in payload order", async () => {
    getSubmissionMock.mockResolvedValue({
      id: "sub-telc-1",
      status: "graded",
      schema_version: 2,
      body_de: "Sehr geehrte Damen und Herren, ...",
      pruefer_text: "Sehr geehrte Damen und Herren, ...",
      betreuer_text: "Ton texte respecte les 4 points demandés.",
      score: 38,
      score_max: 45,
      normalized_total_pct: 84.0,
      dimension_scores: { inhalt: 13, formale_richtigkeit: 12, kommunikative_gestaltung: 13 },
    });

    const result = await fetchCorrection("sub-telc-1", "schreiben");

    expect(result.modality).toBe("schreiben");
    if (result.modality !== "schreiben") throw new Error("unreachable");
    // No `dimension_scores_json` on this row -> every entry's `max` is
    // `null` (denominator unknown; the flat map alone never carries one).
    expect(result.dimensionScores).toEqual({
      inhalt: { score: 13, max: null },
      formale_richtigkeit: { score: 12, max: null },
      kommunikative_gestaltung: { score: 13, max: null },
    });
    // Payload key order is preserved (mutation guard: a `sort()` or a
    // `Object.entries` reimplementation that reorders keys must fail this).
    expect(Object.keys(result.dimensionScores)).toEqual([
      "inhalt",
      "formale_richtigkeit",
      "kommunikative_gestaltung",
    ]);
    expect(result.overallScore).toBe(38);
    expect(result.scoreMax).toBe(45);
    expect(result.normalizedTotalPct).toBe(84.0);
  });

  test("score_max / normalized_total_pct absent on legacy rows -> both null (not 0)", async () => {
    getSubmissionMock.mockResolvedValue(gradedRow);
    const result = await fetchCorrection("sub-2", "schreiben");
    if (result.modality !== "schreiben") throw new Error("unreachable");
    expect(result.scoreMax).toBeNull();
    expect(result.normalizedTotalPct).toBeNull();
  });

  // ---------------------------------------------------------------------
  // Issue #41 fix round 2 — dimension_scores_json enrichment. The real
  // telc row's `dimension_scores_json` (submissions-get's WRITING_COLUMNS)
  // carries the nested {score, pct, max} shape:
  //   {"inhalt":{"max":15,"pct":87,"score":13},
  //    "formale_richtigkeit":{"max":15,"pct":80,"score":12},
  //    "kommunikative_gestaltung":{"max":15,"pct":87,"score":13}}
  // ---------------------------------------------------------------------

  test("dimension_scores_json's nested {score,max} enriches every dimension with its real denominator (mutation guard: hardcoding 100 as max must fail this)", async () => {
    getSubmissionMock.mockResolvedValue({
      id: "sub-telc-json-1",
      status: "graded",
      schema_version: 2,
      body_de: "Sehr geehrte Damen und Herren, ...",
      pruefer_text: "Sehr geehrte Damen und Herren, ...",
      betreuer_text: "Ton texte respecte les 4 points demandés.",
      score: 38,
      score_max: 45,
      normalized_total_pct: 84.0,
      dimension_scores: { inhalt: 13, formale_richtigkeit: 12, kommunikative_gestaltung: 13 },
      dimension_scores_json: {
        inhalt: { score: 13, pct: 87, max: 15 },
        formale_richtigkeit: { score: 12, pct: 80, max: 15 },
        kommunikative_gestaltung: { score: 13, pct: 87, max: 15 },
      },
    });

    const result = await fetchCorrection("sub-telc-json-1", "schreiben");

    if (result.modality !== "schreiben") throw new Error("unreachable");
    expect(result.dimensionScores).toEqual({
      inhalt: { score: 13, max: 15 },
      formale_richtigkeit: { score: 12, max: 15 },
      kommunikative_gestaltung: { score: 13, max: 15 },
    });
  });

  test("dimension_scores_json absent (row carries only the flat map) -> max stays null, not a fabricated 100", async () => {
    getSubmissionMock.mockResolvedValue({
      ...gradedRow,
      dimension_scores_json: null,
    });

    const result = await fetchCorrection("sub-2", "schreiben");

    if (result.modality !== "schreiben") throw new Error("unreachable");
    for (const dim of Object.values(result.dimensionScores)) {
      expect(dim.max).toBeNull();
    }
  });

  test("dimension_scores_json in the legacy flat-number shape (no max) -> falls back to the flat map's score, max stays null", async () => {
    getSubmissionMock.mockResolvedValue({
      ...gradedRow,
      // Pre-PR-3 legacy shape: a plain number per key, no {score,max} object.
      dimension_scores_json: { erfuellung: 80, kohaerenz: 70, wortschatz: 65, strukturen: 60 },
    });

    const result = await fetchCorrection("sub-2", "schreiben");

    if (result.modality !== "schreiben") throw new Error("unreachable");
    expect(result.dimensionScores.erfuellung).toEqual({ score: 80, max: null });
  });

  test("dimension_scores_json's score is preferred over the flat map's value when they disagree", async () => {
    getSubmissionMock.mockResolvedValue({
      ...gradedRow,
      // Deliberately mismatched to prove which source wins — in practice
      // the grading pipeline writes both from the same request and they
      // are expected to always agree; no known case produces a real
      // disagreement.
      dimension_scores: { erfuellung: 999 },
      dimension_scores_json: { erfuellung: { score: 80, pct: 80, max: 100 } },
    });

    const result = await fetchCorrection("sub-2", "schreiben");

    if (result.modality !== "schreiben") throw new Error("unreachable");
    expect(result.dimensionScores.erfuellung).toEqual({ score: 80, max: 100 });
  });
});
