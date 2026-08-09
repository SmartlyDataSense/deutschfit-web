import { describe, expect, it } from "vitest";

import type { CompetenceSkills } from "@/learner/core/api/mockExam";
import { SKILL_ORDER, toSkillScores, type SkillModuleKey } from "@/learner/core/exam/skillScores";

// Task 6.1 — regression coverage for the hoist of `SKILL_ORDER`/`toSkillScores`
// out of `LesenSessionScreen.tsx:55–64` / `HoerenSessionScreen.tsx:81–90`
// into `core/exam/skillScores.ts`. Both screens must render identically
// after the hoist, so this asserts order + shape directly rather than
// re-testing screen rendering (already covered by
// `learner-lesen-session.test.tsx` / `learner-hoeren-session.test.tsx`).

const fixtureReport: CompetenceSkills = {
  lesen: { status: "scored", score: 18, max: 25 },
  hoeren: { status: "scored", score: 20, max: 25 },
  schreiben: { status: "pending", score: null, max: null },
  sprechen: { status: "deferred", score: null, max: null },
};

describe("core/exam/skillScores", () => {
  it("SKILL_ORDER is the fixed lesen, hoeren, schreiben, sprechen display order both session screens render", () => {
    const expected: readonly SkillModuleKey[] = ["lesen", "hoeren", "schreiben", "sprechen"];
    expect(SKILL_ORDER).toEqual(expected);
  });

  it("toSkillScores folds a CompetenceSkills report into SKILL_ORDER-ordered SkillScore rows", () => {
    expect(toSkillScores(fixtureReport)).toEqual([
      { key: "lesen", status: "scored", score: 18, max: 25 },
      { key: "hoeren", status: "scored", score: 20, max: 25 },
      { key: "schreiben", status: "pending", score: null, max: null },
      { key: "sprechen", status: "deferred", score: null, max: null },
    ]);
  });

  it("toSkillScores degrades a missing module to null score/max without dropping its row", () => {
    const missingSprechen: CompetenceSkills = {
      ...fixtureReport,
      sprechen: { status: "missing", score: null, max: null },
    };
    const rows = toSkillScores(missingSprechen);
    expect(rows).toHaveLength(4);
    expect(rows[3]).toEqual({ key: "sprechen", status: "missing", score: null, max: null });
  });
});
