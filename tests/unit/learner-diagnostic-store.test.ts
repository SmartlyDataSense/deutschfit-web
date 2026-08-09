import { beforeEach, describe, expect, it } from "vitest";

import {
  selectCurrentQuestion,
  useDiagnosticAttemptStore,
} from "@/learner/onboarding/state/useDiagnosticAttemptStore";
import type { DiagnosticQuestionsResponse } from "@/learner/onboarding/services/getDiagnosticQuestions";

// Reuse the same `dto` fixture shape as the adapter test (copy it in — tests
// must stay independent files; a shared fixture helper is NOT worth a module).
const item = (id: string) => ({
  questionId: id,
  stemDe: `Stem ${id}`,
  tags: [],
  categoryPillLabel: "B1 · Lesen",
  options: [
    { key: "a", label_de: "A" },
    { key: "b", label_de: "B" },
  ],
});

const dto: DiagnosticQuestionsResponse = {
  attemptId: "at-1",
  level: "b1",
  issuedAt: "x",
  expiresAt: "y",
  bankExhausted: false,
  sections: [
    {
      kind: "lesen",
      durationSec: 300,
      readingText: null,
      items: ["diag-b1-lesen-1", "diag-b1-lesen-2", "diag-b1-lesen-3", "diag-b1-lesen-4"].map(item),
    },
    {
      kind: "sprachbausteine",
      durationSec: 300,
      readingText: null,
      items: [
        "diag-b1-sprachbausteine-1",
        "diag-b1-sprachbausteine-2",
        "diag-b1-sprachbausteine-3",
        "diag-b1-sprachbausteine-4",
        "diag-b1-sprachbausteine-5",
        "diag-b1-sprachbausteine-6",
      ].map(item),
    },
    {
      kind: "wortschatz",
      durationSec: 180,
      readingText: null,
      items: [
        "diag-b1-wortschatz-1",
        "diag-b1-wortschatz-2",
        "diag-b1-wortschatz-3",
        "diag-b1-wortschatz-4",
        "diag-b1-wortschatz-5",
      ].map(item),
    },
  ],
};

describe("useDiagnosticAttemptStore", () => {
  beforeEach(() => {
    useDiagnosticAttemptStore.getState().reset();
  });

  it("hydrate seeds vm + in_progress; recordAnswer/advance/setElapsed accumulate; reset clears", () => {
    const s = () => useDiagnosticAttemptStore.getState();
    s().hydrate(dto);
    expect(s().status).toBe("in_progress");
    expect(s().attemptId).toBe("at-1");
    expect(selectCurrentQuestion(s().viewModel, s().currentIndex)?.globalIndex).toBe(1);

    s().recordAnswer("diag-b1-lesen-1", "b");
    s().advance();
    expect(s().answers).toEqual({ "diag-b1-lesen-1": "b" });
    expect(s().currentIndex).toBe(1);

    s().setElapsed("lesen", 42);
    expect(s().elapsedSecPerSection).toEqual({ lesen: 42, sprachbausteine: 0, wortschatz: 0 });

    s().setStatus("error", "boom");
    expect(s().errorCode).toBe("boom");

    s().reset();
    expect(s().viewModel).toBe(null);
    expect(s().status).toBe("idle");
  });

  it("setResult flips status to submitted", () => {
    const s = () => useDiagnosticAttemptStore.getState();
    s().hydrate(dto);
    s().setResult({
      attemptId: "at-1",
      estimatedLevel: "b1.0",
      scorePerSection: { lesen: 0, sprachbausteine: 0, wortschatz: 0 },
      totalScore: 0,
      weaknessTags: [],
      perQuestionResults: [],
    });
    expect(s().status).toBe("submitted");
    expect(s().result?.estimatedLevel).toBe("b1.0");
  });
});
