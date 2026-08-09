import { describe, expect, it } from "vitest";

import {
  toDiagnosticViewModel,
  toResultViewModel,
} from "@/learner/onboarding/services/diagnosticAdapter";
import { formatClock } from "@/learner/onboarding/services/formatClock";
import type { DiagnosticQuestionsResponse } from "@/learner/onboarding/services/getDiagnosticQuestions";
import type { SubmitDiagnosticResult } from "@/learner/onboarding/services/submitDiagnostic";

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

describe("toDiagnosticViewModel", () => {
  it("flattens 4+6+5 into 15 sequenced questions with section-aware indices", () => {
    const vm = toDiagnosticViewModel(dto);
    expect(vm.totalQuestions).toBe(15);
    expect(vm.questions[0]).toMatchObject({
      globalIndex: 1,
      sectionIndex: 1,
      sectionKind: "lesen",
      sectionTotal: 4,
    });
    expect(vm.questions[4]).toMatchObject({
      globalIndex: 5,
      sectionIndex: 1,
      sectionKind: "sprachbausteine",
      sectionTotal: 6,
    });
    expect(vm.questions[14]).toMatchObject({
      globalIndex: 15,
      sectionIndex: 5,
      sectionKind: "wortschatz",
      sectionTotal: 5,
    });
    // durations ride along on sections for the timer:
    expect(vm.sections.map((s) => s.durationSec)).toEqual([300, 300, 180]);
  });
});

describe("toResultViewModel", () => {
  const result: SubmitDiagnosticResult = {
    attemptId: "at-1",
    estimatedLevel: "b1.2",
    scorePerSection: { lesen: 2, sprachbausteine: 3, wortschatz: 5 },
    totalScore: 10,
    weaknessTags: ["präposition", "leseverstehen"],
    perQuestionResults: dto.sections
      .flatMap((s) => s.items)
      .map((q, i) => ({
        questionId: q.questionId,
        wasCorrect: i % 3 !== 0,
        correctOption: "b",
        selectedOption: "a",
        explanationDe: null,
        explanationEn: null,
      })),
  };

  it("derives tier suffix, total 15, top-3 weaknesses and 15 review rows", () => {
    const vm = toResultViewModel(result);
    expect(vm.tierSuffix).toBe("fast-b2"); // .2 → fast-b2
    expect(vm.totalOutOf).toBe(15);
    expect(vm.review).toHaveLength(15);
    expect(vm.review[0]).toMatchObject({ globalIndex: 1, wasCorrect: false });
    expect(vm.weaknesses.length).toBeLessThanOrEqual(3);
    for (const w of vm.weaknesses) expect(result.weaknessTags).toContain(w.tag);
  });

  it("maps .1 → solide and .0/bare → debutant", () => {
    expect(toResultViewModel({ ...result, estimatedLevel: "b1.1" }).tierSuffix).toBe("solide");
    expect(toResultViewModel({ ...result, estimatedLevel: "b1.0" }).tierSuffix).toBe("debutant");
    expect(toResultViewModel({ ...result, estimatedLevel: "b1" }).tierSuffix).toBe("debutant");
  });
});

describe("formatClock", () => {
  it("renders MM:SS and clamps negatives", () => {
    expect(formatClock(300)).toBe("05:00");
    expect(formatClock(180)).toBe("03:00");
    expect(formatClock(61)).toBe("01:01");
    expect(formatClock(0)).toBe("00:00");
    expect(formatClock(-5)).toBe("00:00");
  });
});
