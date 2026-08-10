/**
 * `drillClient.ts` — adaptive drill transport (System A, S9 · Task 9.6).
 *
 * Covers:
 *   - `fetchDrillRecommendation` posts the exact body to `drill-recommend`
 *     and passes a successful payload through unchanged.
 *   - `fetchDrillRecommendation` collapses an `invokeFn` rejection to
 *     `{ items: [], reason: "error" }`.
 *   - `submitDrillAttempt` posts the exact body to `drill-attempt` and
 *     passes a successful payload through unchanged.
 *   - `submitDrillAttempt` collapses an `invokeFn` rejection to
 *     `{ ok: false, is_correct: false }`.
 *
 * These reject-path assertions pin the real collapse behaviour, not
 * self-consistency: removing the try/catch around `invokeFn` would make
 * the "collapses" tests fail with an unhandled rejection instead of the
 * asserted fallback envelope.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const { invokeFnMock } = vi.hoisted(() => ({ invokeFnMock: vi.fn() }));
vi.mock("@/learner/core/api", () => ({ invokeFn: invokeFnMock }));

import { fetchDrillRecommendation, submitDrillAttempt } from "@/learner/drill/api/drillClient";

beforeEach(() => {
  invokeFnMock.mockReset();
});

describe("fetchDrillRecommendation", () => {
  it("posts the exact body to drill-recommend and returns the payload on success", async () => {
    invokeFnMock.mockResolvedValueOnce({ items: [], reason: "ok" });

    const result = await fetchDrillRecommendation({ surface: "redo", max_items: 5 });

    expect(invokeFnMock).toHaveBeenCalledTimes(1);
    expect(invokeFnMock).toHaveBeenCalledWith("drill-recommend", {
      body: { surface: "redo", max_items: 5 },
    });
    expect(result).toEqual({ items: [], reason: "ok" });
  });

  it("passes submission_id through for the post_grade surface", async () => {
    invokeFnMock.mockResolvedValueOnce({ items: [], reason: "ok" });

    await fetchDrillRecommendation({ surface: "post_grade", max_items: 3, submission_id: "sub-1" });

    expect(invokeFnMock).toHaveBeenCalledWith("drill-recommend", {
      body: { surface: "post_grade", max_items: 3, submission_id: "sub-1" },
    });
  });

  it("collapses an invokeFn rejection to {items:[], reason:'error'}", async () => {
    invokeFnMock.mockRejectedValueOnce(new Error("network failure"));

    const result = await fetchDrillRecommendation({ surface: "home_daily", max_items: 5 });

    expect(result).toEqual({ items: [], reason: "error" });
  });
});

describe("submitDrillAttempt", () => {
  it("posts the exact body to drill-attempt and returns the payload on success", async () => {
    invokeFnMock.mockResolvedValueOnce({ ok: true, is_correct: true, correct_answer: "den" });

    const result = await submitDrillAttempt({
      drill_item_id: "d1",
      surface: "redo",
      selected: "den",
    });

    expect(invokeFnMock).toHaveBeenCalledTimes(1);
    expect(invokeFnMock).toHaveBeenCalledWith("drill-attempt", {
      body: { drill_item_id: "d1", surface: "redo", selected: "den" },
    });
    expect(result).toEqual({ ok: true, is_correct: true, correct_answer: "den" });
  });

  it("collapses an invokeFn rejection to {ok:false, is_correct:false}", async () => {
    invokeFnMock.mockRejectedValueOnce(new Error("network failure"));

    const result = await submitDrillAttempt({
      drill_item_id: "d1",
      surface: "redo",
      selected: "den",
    });

    expect(result).toEqual({ ok: false, is_correct: false });
  });
});
