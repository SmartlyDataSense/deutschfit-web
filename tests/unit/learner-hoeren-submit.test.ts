/**
 * `submitHoerenSession` + `useHoerenResultsStore` — S5 Task 5.6.
 *
 * Port of `deutschfit-mobile/src/features/hoeren/api/submit.ts`'s test
 * surface. Mocks only the `@/learner/core/api/examApi` boundary
 * (`submitHoeren`) per Constraint 15 — `scoreSession` runs for real so the
 * assertions exercise the actual grading path, not a stub echo.
 *
 * Also carries the Task 5.6 P11 timer-relocation smoke: importing
 * `useExamTimer` from its new `@/learner/core/exam/useExamTimer` home
 * type-checks (`npm run typecheck` covers this file) and a light runtime
 * assertion proves the moved module still computes real countdown state —
 * the untouched `learner-lesen-session.test.tsx` suite is the actual
 * relocation regression guard.
 */
import { cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// `vi.hoisted` — `vi.mock` factories are hoisted above the rest of the
// module, so the mock fn must be built via `vi.hoisted`, not a plain
// top-level `const` (same TDZ rationale as `learner-lesen-session.test.tsx`).
const { submitHoerenMock } = vi.hoisted(() => ({
  submitHoerenMock: vi.fn(),
}));

vi.mock("@/learner/core/api/examApi", () => ({
  submitHoeren: (...args: unknown[]) => submitHoerenMock(...args),
}));

import type { AnswerMap, SessionScore } from "@/learner/core/exam/engine/scoring";
import type { ExamSession } from "@/learner/core/exam/engine/types";
import { useExamTimer } from "@/learner/core/exam/useExamTimer";
import { submitHoerenSession, type HoerenSubmissionRequest } from "@/learner/hoeren/api/submit";
import { useHoerenResultsStore } from "@/learner/hoeren/resultsStore";

const session: ExamSession = {
  id: "b1-hoeren-01-hoeren",
  examSlug: "b1-hoeren-01",
  moduleCode: "HOEREN",
  title: "Modelltest 1",
  totalDurationMinutes: 30,
  parts: [
    {
      id: "part-1",
      teilNumber: 1,
      label: "Teil 1",
      partKind: "GLOBALVERSTEHEN",
      durationMinutes: 30,
      instructions: "Hör zu und beantworte die Fragen.",
      items: [
        {
          id: "q-1",
          number: 1,
          stem: "Frage 1",
          answerFormat: "MC_SINGLE_3",
          options: [
            { key: "a", text: "A" },
            { key: "b", text: "B" },
            { key: "c", text: "C" },
          ],
          correctKey: "b",
          stimulusSlug: "track-1",
        },
        {
          id: "q-2",
          number: 2,
          stem: "Frage 2",
          answerFormat: "MC_SINGLE_3",
          options: [
            { key: "a", text: "A" },
            { key: "b", text: "B" },
            { key: "c", text: "C" },
          ],
          correctKey: "a",
          stimulusSlug: "track-1",
        },
      ],
    },
  ],
};

// One correct (`q-1`), one wrong (`q-2`) — locks in a non-trivial
// `SessionScore` so the assertions can't pass on an all-zero or
// all-correct degenerate case.
const answers: AnswerMap = { "q-1": "b", "q-2": "c" };

function baseRequest(attemptId: string): HoerenSubmissionRequest {
  return {
    attemptId,
    session,
    answers,
    elapsedSeconds: 120,
    submittedAt: "2026-08-09T12:00:00.000Z",
  };
}

describe("submitHoerenSession (port of deutschfit-mobile/src/features/hoeren/api/submit.ts)", () => {
  beforeEach(() => {
    submitHoerenMock.mockReset();
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("server success: server attempt id, serverGraded true, locally-computed score", async () => {
    submitHoerenMock.mockResolvedValue({ attempt_id: "srv-attempt-1", raw_score: 1 });

    const result = await submitHoerenSession(baseRequest("live-attempt-1"));

    expect(submitHoerenMock).toHaveBeenCalledWith({ attemptId: "live-attempt-1", answers });
    expect(result.submissionId).toBe("srv-attempt-1");
    expect(result.serverGraded).toBe(true);
    expect(result.score.correct).toBe(1);
    expect(result.score.total).toBe(2);
    expect(result.score.parts).toHaveLength(1);
  });

  it("server rejection: local- prefixed id keyed by session id + Date.now(), serverGraded false", async () => {
    vi.spyOn(Date, "now").mockReturnValue(999999);
    submitHoerenMock.mockRejectedValue(new Error("hoeren_submit_failed"));

    const result = await submitHoerenSession(baseRequest("live-attempt-2"));

    expect(result.submissionId).toBe(`local-${session.id}-999999`);
    expect(result.serverGraded).toBe(false);
    // Local fallback still computes the real grade, same as the
    // server-success branch — not a stub echo.
    expect(result.score.correct).toBe(1);
    expect(result.score.total).toBe(2);
  });

  it("malformed server body never throws to the caller — same local fallback", async () => {
    vi.spyOn(Date, "now").mockReturnValue(555555);
    submitHoerenMock.mockRejectedValue(new Error("hoeren_submit_malformed_response"));

    await expect(submitHoerenSession(baseRequest("live-attempt-3"))).resolves.toEqual({
      submissionId: `local-${session.id}-555555`,
      score: expect.objectContaining({ correct: 1, total: 2, answered: 2 }),
      serverGraded: false,
    });
  });

  it("hoerenResultsStore: set/clear round-trips a mode-tagged payload", () => {
    expect(useHoerenResultsStore.getState().payload).toBeNull();

    const score: SessionScore = {
      correct: 1,
      total: 2,
      answered: 2,
      unanswered: 0,
      accuracy: 0.5,
      parts: [],
    };

    useHoerenResultsStore.getState().set({
      submissionId: "srv-attempt-1",
      score,
      mode: "graded",
      attemptId: "live-attempt-1",
    });

    expect(useHoerenResultsStore.getState().payload).toEqual({
      submissionId: "srv-attempt-1",
      score,
      mode: "graded",
      attemptId: "live-attempt-1",
    });

    useHoerenResultsStore.getState().clear();

    expect(useHoerenResultsStore.getState().payload).toBeNull();
  });

  it("useExamTimer, imported from its relocated core/exam home, still computes real countdown state", () => {
    vi.spyOn(Date, "now").mockReturnValue(1_000_000);

    const { result } = renderHook(() => useExamTimer({ startMs: 1_000_000, durationMs: 60_000 }));

    expect(result.current.remainingSeconds).toBe(60);
    expect(result.current.isExpired).toBe(false);
    expect(result.current.elapsedFraction).toBe(0);
  });
});
