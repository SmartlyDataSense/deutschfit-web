import { beforeEach, describe, expect, it, vi } from "vitest";

const invokeFn = vi.fn();
vi.mock("@/learner/core/api/client", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  invokeFn: (...a: unknown[]) => invokeFn(...a),
}));

import { ApiError } from "@/learner/core/api/client";
import { getDiagnosticQuestions } from "@/learner/onboarding/services/getDiagnosticQuestions";
import { submitDiagnostic } from "@/learner/onboarding/services/submitDiagnostic";

const ATTEMPT = "11111111-1111-4111-8111-111111111111";

function packFixture() {
  const item = (id: string) => ({
    questionId: id, stemDe: `Stem ${id}`, tags: ["lesen"],
    categoryPillLabel: "B1 · Lesen",
    options: [{ key: "a", label_de: "A" }, { key: "b", label_de: "B" }],
  });
  return {
    attemptId: ATTEMPT, level: "b1", issuedAt: "2026-08-09T10:00:00Z",
    expiresAt: "2026-08-09T11:00:00Z", bankExhausted: false,
    sections: [
      { kind: "lesen", durationSec: 300, readingText: null, items: [1, 2, 3, 4].map((i) => item(`l${i}`)) },
      { kind: "sprachbausteine", durationSec: 300, readingText: null, items: [1, 2, 3, 4, 5, 6].map((i) => item(`s${i}`)) },
      { kind: "wortschatz", durationSec: 180, readingText: null, items: [1, 2, 3, 4, 5].map((i) => item(`w${i}`)) },
    ],
  };
}

beforeEach(() => { invokeFn.mockReset(); });

describe("getDiagnosticQuestions", () => {
  it("POSTs {attemptId, level} to diagnostic-questions-get and returns the typed pack", async () => {
    invokeFn.mockResolvedValue(packFixture());
    const res = await getDiagnosticQuestions({ attemptId: ATTEMPT, level: "b1" });
    expect(invokeFn).toHaveBeenCalledWith("diagnostic-questions-get", {
      method: "POST", body: { attemptId: ATTEMPT, level: "b1" },
    });
    expect(res.sections.map((s) => s.durationSec)).toEqual([300, 300, 180]);
    expect(res.sections.map((s) => s.items.length)).toEqual([4, 6, 5]);
  });

  it("throws the malformed-response code on a 200 with a bogus body", async () => {
    invokeFn.mockResolvedValue({ nope: true });
    await expect(getDiagnosticQuestions({ attemptId: ATTEMPT, level: "b1" }))
      .rejects.toThrow("diagnostic_questions_malformed_response");
  });
});

describe("submitDiagnostic", () => {
  const result = {
    attemptId: ATTEMPT, estimatedLevel: "b1.1",
    scorePerSection: { lesen: 3, sprachbausteine: 4, wortschatz: 4 },
    totalScore: 11, weaknessTags: ["präposition"],
    perQuestionResults: [{
      questionId: "l1", wasCorrect: false, correctOption: "b",
      selectedOption: "a", explanationDe: "Weil…", explanationEn: null,
    }],
  };

  it("POSTs answers + clientMeta and normalises the response", async () => {
    invokeFn.mockResolvedValue(result);
    const res = await submitDiagnostic({
      attemptId: ATTEMPT, answers: { l1: "a" },
      clientMeta: { elapsedSecPerSection: { lesen: 42, sprachbausteine: 0, wortschatz: 0 } },
    });
    expect(invokeFn).toHaveBeenCalledWith("diagnostic-submit", {
      method: "POST",
      body: {
        attemptId: ATTEMPT, answers: { l1: "a" },
        clientMeta: { elapsedSecPerSection: { lesen: 42, sprachbausteine: 0, wortschatz: 0 } },
      },
    });
    expect(res.estimatedLevel).toBe("b1.1");
    expect(res.perQuestionResults[0]).toEqual({
      questionId: "l1", wasCorrect: false, correctOption: "b",
      selectedOption: "a", explanationDe: "Weil…", explanationEn: null,
    });
  });

  it("omits clientMeta from the body when not provided", async () => {
    invokeFn.mockResolvedValue(result);
    await submitDiagnostic({ attemptId: ATTEMPT, answers: {} });
    expect(invokeFn.mock.calls[0]![1]).toEqual({
      method: "POST", body: { attemptId: ATTEMPT, answers: {} },
    });
  });

  it("fills defensive defaults for missing per-question fields and throws on malformed bodies", async () => {
    invokeFn.mockResolvedValue({ ...result, scorePerSection: { lesen: 3 }, perQuestionResults: [{ questionId: "x" }] });
    const res = await submitDiagnostic({ attemptId: ATTEMPT, answers: {} });
    expect(res.scorePerSection).toEqual({ lesen: 3, sprachbausteine: 0, wortschatz: 0 });
    expect(res.perQuestionResults[0]).toEqual({
      questionId: "x", wasCorrect: false, correctOption: "", selectedOption: null,
      explanationDe: null, explanationEn: null,
    });

    invokeFn.mockResolvedValue({ error: "whatever" });
    await expect(submitDiagnostic({ attemptId: ATTEMPT, answers: {} }))
      .rejects.toThrow(); // server-shaped error string in a 200 body
  });

  // M-2.7 regression pin — the generic malformed-body test above only
  // exercises the top-level `payload.error` string branch (line 101 of
  // submitDiagnostic.ts). It never exercises the structural-validation
  // branch (line 102-111: missing/wrong-typed required fields), so a
  // regression there (e.g. dropping a required-field check) could ship
  // silently.
  it("throws the structural malformed-response code when a required field is missing", async () => {
    invokeFn.mockResolvedValue({
      ...result,
      // weaknessTags dropped entirely -> fails the `Array.isArray` check.
      weaknessTags: undefined,
    });
    await expect(submitDiagnostic({ attemptId: ATTEMPT, answers: {} }))
      .rejects.toThrow("diagnostic_submit_malformed_response");
  });

  // M-2.7 regression pin — `submitDiagnostic` has no try/catch around the
  // `invokeFn` call, so a thrown `ApiError` (transport/HTTP failure) must
  // propagate unchanged, not be swallowed or re-wrapped. Nothing pinned
  // this passthrough before.
  it("propagates an ApiError from the transport unchanged", async () => {
    const apiErrorInstance = new ApiError(500, "internal_error", "boom");
    invokeFn.mockRejectedValue(apiErrorInstance);
    await expect(submitDiagnostic({ attemptId: ATTEMPT, answers: {} }))
      .rejects.toBe(apiErrorInstance);
  });
});
