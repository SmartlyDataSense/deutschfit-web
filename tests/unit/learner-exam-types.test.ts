import { describe, expect, it } from "vitest";

import {
  DEFAULT_EXAM_BOARD,
  DEFAULT_EXAM_LEVEL,
  EXAM_BOARDS,
  EXAM_LEVELS,
  LEVELS_BY_BOARD,
  classifyExamChange,
  formatExamTrackLabel,
  isExamBoard,
  isExamLevel,
  normaliseExamSelection,
} from "@/learner/core/exam/examTypes";

describe("examTypes (mobile parity port)", () => {
  it("ships the exact board and level sets in mobile's order", () => {
    expect(EXAM_BOARDS).toEqual([
      "goethe",
      "telc",
      "oesd",
      "testdaf",
      "ecl",
      "pflege",
      "beruf_tourismus",
    ]);
    expect(EXAM_LEVELS).toEqual(["a1", "a2", "b1", "b2", "c1", "c2"]);
    expect(DEFAULT_EXAM_BOARD).toBe("goethe");
    expect(DEFAULT_EXAM_LEVEL).toBe("b1");
  });

  it("clamps unsupported combos to the board's first shipped level", () => {
    // testdaf ships only b2/c1 — c2 falls back to b2 (the first shipped).
    expect(normaliseExamSelection("testdaf", "c2")).toEqual({ board: "testdaf", level: "b2" });
    // valid combos pass through untouched.
    expect(normaliseExamSelection("goethe", "c2")).toEqual({ board: "goethe", level: "c2" });
    expect(LEVELS_BY_BOARD.pflege).toEqual(["b2"]);
  });

  it("guards + label + change classification behave like mobile", () => {
    expect(isExamBoard("telc")).toBe(true);
    expect(isExamBoard("TELC")).toBe(false);
    expect(isExamLevel("b1")).toBe(true);
    expect(formatExamTrackLabel("goethe", "b1")).toBe("B1"); // level-only, board debranded (F-3)
    expect(
      classifyExamChange({
        from: { board: "goethe", level: "b1" },
        to: { board: "telc", level: "b2" },
      })
    ).toBe("board"); // board dominates when both differ
    expect(
      classifyExamChange({
        from: { board: "goethe", level: "b1" },
        to: { board: "goethe", level: "b2" },
      })
    ).toBe("level");
    expect(
      classifyExamChange({
        from: { board: "goethe", level: "b1" },
        to: { board: "goethe", level: "b1" },
      })
    ).toBe("none");
  });
});
