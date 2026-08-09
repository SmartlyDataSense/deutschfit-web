/**
 * Exam engine (verbatim port of deutschfit-mobile/src/core/exam) — pure-TS
 * load -> answer -> score loop plus the exam-player reducer transitions.
 *
 * Wire shapes exactly as lesen-start / lesen-practice-get return them:
 * `manifest` ({ modelltest, modules }) and `module` are SIBLING payload keys.
 */
import { describe, expect, it } from "vitest";

import { buildSession, createEmptyExamSession } from "@/learner/core/exam/engine/loadModel";
import { buildOptionPool } from "@/learner/core/exam/engine/optionPool";
import { toPracticeLevel } from "@/learner/core/exam/engine/practiceLevel";
import { gradeItem, scoreSession } from "@/learner/core/exam/engine/scoring";
import {
  createInitialExamPlayerState,
  examPlayerReducer,
  flattenSession,
} from "@/learner/core/exam/engine/useExamPlayer";

const manifest = {
  modelltest: { slug: "telc-b1-modelltest-1", title: "Modelltest 1", short_label: "MT 1" },
  modules: [{ code: "LESEN", duration_minutes: 65, item_count: 2, instructions_de: "" }],
} as never;
const wireModule = {
  module_code: "LESEN",
  source_slug: "telc-b1-modelltest-1",
  parts: [
    {
      teil_number: 1,
      teil_label: "Teil 1",
      part_kind: "GLOBALVERSTEHEN",
      duration_minutes: 10,
      instructions_de: "Lies die Texte.",
      reading_texts: [{ slug: "t1", label: "Text 1", transcript_md: "..." }],
      questions: [
        {
          id: "q-uuid-1",
          item_number: 1,
          stem_de: "Frage 1",
          answer_format: "MC_SINGLE_3",
          options: [
            { key: "a", text: "A" },
            { key: "b", text: "B" },
            { key: "c", text: "C" },
          ],
          correct_answer: "b",
          reading_text_slug: "t1",
        },
        {
          id: "q-uuid-2",
          item_number: 2,
          stem_de: "Frage 2",
          answer_format: "MATCH_TO_ITEM",
          options: [
            { key: "a", text: "A" },
            { key: "x", text: "Keine passende Anzeige" },
          ],
          correct_answer: "x",
          reading_text_slug: "t1",
        },
      ],
    },
  ],
} as never;

describe("exam engine (verbatim port of deutschfit-mobile/src/core/exam)", () => {
  it("buildSession adapts the wire payload, prefers server UUIDs, scores correctly", () => {
    const session = buildSession({ manifest, module: wireModule });
    expect(session.moduleCode).toBe("LESEN");
    expect(session.examSlug).toBe("telc-b1-modelltest-1");
    expect(session.id).toBe("telc-b1-modelltest-1-lesen");
    expect(session.totalDurationMinutes).toBe(65);
    const [i1, i2] = session.parts[0]!.items;
    expect(i1!.id).toBe("q-uuid-1");
    // mobile's gradeItem returns an ItemResult, not a bare boolean.
    expect(gradeItem(i1!, "b").isCorrect).toBe(true);
    expect(gradeItem(i2!, "a").isCorrect).toBe(false);
    const score = scoreSession(session, { "q-uuid-1": "b", "q-uuid-2": "a" });
    expect(score.correct).toBe(1);
    expect(score.total).toBe(2);
    expect(score.answered).toBe(2);
    expect(score.accuracy).toBeCloseTo(0.5);
  });

  it("player reducer walks items and pick records answers (3-arg reducer, no-arg initial state)", () => {
    const session = buildSession({ manifest, module: wireModule });
    let state = createInitialExamPlayerState();
    expect(flattenSession(session)).toHaveLength(2);
    state = examPlayerReducer(state, { type: "pick", itemId: "q-uuid-1", key: "b" }, session);
    state = examPlayerReducer(state, { type: "goNext" }, session);
    expect(state.currentIndex).toBe(1);
    expect(state.answers["q-uuid-1"]).toBe("b");
  });

  it("option pool consume-mode marks sibling picks, honours exempt keys", () => {
    const session = buildSession({ manifest, module: wireModule });
    const items = session.parts[0]!.items;
    const pool = buildOptionPool("q-uuid-2", items, { "q-uuid-1": "a" }, "consume", ["x"]);
    expect(pool.find((o) => o.key === "a")!.consumedByOther).toBe(true);
    expect(pool.find((o) => o.key === "x")!.exempt).toBe(true);
  });

  it("createEmptyExamSession + toPracticeLevel behave like mobile", () => {
    expect(createEmptyExamSession("LESEN").parts).toHaveLength(0);
    expect(toPracticeLevel("b1")).toBe("B1");
    expect(toPracticeLevel("c1")).toBeNull();
  });
});
