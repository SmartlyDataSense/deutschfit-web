import { beforeEach, describe, expect, it } from "vitest";

import { __resetLearnerDbForTests, getLearnerDb } from "@/learner/core/db";
import { LEARNER_TABLE_SCHEMAS } from "@/learner/core/db/schema";
import {
  listPracticeProgress,
  loadPracticeProgress,
  savePracticeProgress,
} from "@/learner/core/storage/practiceProgress";
import { deriveChip } from "@/learner/practice/model/progressChip";
import {
  isSessionComplete,
  lockPick,
  locksToAnswerMap,
  partProgress,
  resetPart,
} from "@/learner/practice/model/lockState";
import type { ExamItem, ExamPart, ExamSession } from "@/learner/core/exam/engine/types";

const item = (id: string, correctKey: string): ExamItem =>
  ({
    id,
    number: 1,
    stem: "s",
    answerFormat: "MC_SINGLE_3",
    options: [
      { key: "a", text: "A" },
      { key: "b", text: "B" },
    ],
    correctKey,
    stimulusSlug: null,
  }) as ExamItem;
const part: ExamPart = {
  id: "p1",
  teilNumber: 1,
  label: "Teil 1",
  partKind: "X",
  durationMinutes: 10,
  instructions: "",
  items: [item("i1", "a"), item("i2", "b")],
} as ExamPart;

describe("practiceProgress storage + chip/lock models", () => {
  beforeEach(() => __resetLearnerDbForTests());

  it("save → load → list round-trips a record; Dexie row is snake_case", async () => {
    await savePracticeProgress({
      userId: "u1",
      board: "telc",
      level: "B1",
      moduleCode: "LESEN",
      quizSlug: "s1",
      answers: { i1: { key: "a", correct: true } },
      correctCount: 1,
      totalCount: 10,
      completedAt: null,
      updatedAt: 111,
    });
    const loaded = await loadPracticeProgress({
      userId: "u1",
      board: "telc",
      level: "B1",
      moduleCode: "LESEN",
      quizSlug: "s1",
    });
    expect(loaded?.correctCount).toBe(1);
    const listed = await listPracticeProgress("u1", "telc", "B1");
    expect(listed).toHaveLength(1);
    const db = await getLearnerDb();
    const row = await db.practiceProgress.get(["u1", "telc", "B1", "LESEN", "s1"]);
    expect(row).toMatchObject({ correct_count: 1, total_count: 10, quiz_slug: "s1" });
  });

  it("practiceProgress Dexie schema indexes user_id (listPracticeProgress's whereEquals needs a real index, not just the compound PK)", () => {
    const tokens = LEARNER_TABLE_SCHEMAS.practiceProgress.split(",").map((t) => t.trim());
    expect(tokens).toContain("user_id");
  });

  it("deriveChip: null→todo, locked 0→todo even with a row, partial→inProgress, completed→done", () => {
    expect(deriveChip(null)).toEqual({ state: "todo" });
    expect(deriveChip({ lockedCount: 0, totalCount: 10, completedAt: null })).toEqual({
      state: "todo",
    });
    expect(deriveChip({ lockedCount: 3, totalCount: 10, completedAt: null })).toEqual({
      state: "inProgress",
      locked: 3,
      total: 10,
    });
    expect(deriveChip({ lockedCount: 10, totalCount: 10, completedAt: 5 })).toEqual({
      state: "done",
    });
  });

  it("lockPick grades once and is immutable to re-picks; resetPart clears whole part (locks-first signatures)", () => {
    let locks = lockPick({}, part.items[0]!, "b"); // wrong first pick
    expect(locks["i1"]).toEqual({ key: "b", correct: false });
    locks = lockPick(locks, part.items[0]!, "a"); // no-op — first pick is locked
    expect(locks["i1"]!.key).toBe("b");
    locks = lockPick(locks, part.items[1]!, "b");
    expect(partProgress(locks, part)).toEqual({ locked: 2, correct: 1, total: 2 });
    expect(locksToAnswerMap(locks)).toEqual({ i1: "b", i2: "b" });
    expect(resetPart(locks, part)).toEqual({});
  });

  // S4-4.4 regression pin — direct isSessionComplete cases. Empty-session
  // (`parts: []`) is vacuously true per the ported mobile behaviour
  // (deutschfit-mobile/src/features/practice/model/lockState.ts:54-59 is
  // byte-identical to this file's implementation: `.every()` over an
  // empty array returns `true`).
  it("isSessionComplete: all-answered -> true, one unanswered -> false, empty session -> true (mobile parity)", () => {
    const session: ExamSession = {
      id: "sess1",
      examSlug: "ex1",
      moduleCode: "LESEN",
      title: "t",
      totalDurationMinutes: 10,
      parts: [part],
    };
    const allLocked = { i1: { key: "a", correct: true }, i2: { key: "b", correct: true } };
    expect(isSessionComplete(allLocked, session)).toBe(true);

    const oneMissing = { i1: { key: "a", correct: true } };
    expect(isSessionComplete(oneMissing, session)).toBe(false);

    const emptySession: ExamSession = { ...session, parts: [] };
    expect(isSessionComplete({}, emptySession)).toBe(true);
  });
});
