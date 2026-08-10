/**
 * `useDrillSession` — S9 · Task 9.6.
 *
 * `drillClient` and `attemptOutbox` are fully mocked (they have their
 * own dedicated suites — `learner-drill-client.test.ts` /
 * `learner-drill-outbox.test.ts`); this suite pins the hook's own
 * composition/state-machine logic:
 *   - mount order: flushOutbox() → redo fetch → (conditionally) daily
 *     fetch to top up to SESSION_SIZE.
 *   - redo alone filling the session skips the daily fetch entirely.
 *   - a zero-item session still exposes the daily `reason` (D6 — lets
 *     the screen render the correct empty-state copy before any
 *     summary exists).
 *   - `answer()` posts the exact body (never `is_correct`), is a
 *     synchronous no-op on a second call for the same item, enqueues
 *     to the outbox on failure, and fires a background flush on
 *     success.
 *   - completing all items writes exactly one `drillSessions` row
 *     (using the real Dexie in-memory-fallback db, same pattern as
 *     `learner-drill-outbox.test.ts`), with `ledWithRedo` reflecting
 *     whether any answered item came from the redo surface — and a
 *     second trailing `next()` call does not write a second row
 *     (`completedRef` guard).
 *   - unmounting mid-session writes nothing.
 */
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { fetchDrillRecommendationMock, submitDrillAttemptMock, enqueueAttemptMock, flushOutboxMock } =
  vi.hoisted(() => ({
    fetchDrillRecommendationMock: vi.fn(),
    submitDrillAttemptMock: vi.fn(),
    enqueueAttemptMock: vi.fn(),
    flushOutboxMock: vi.fn(),
  }));

vi.mock("@/learner/drill/api/drillClient", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/learner/drill/api/drillClient")>();
  return {
    ...actual,
    fetchDrillRecommendation: fetchDrillRecommendationMock,
    submitDrillAttempt: submitDrillAttemptMock,
  };
});
vi.mock("@/learner/drill/api/attemptOutbox", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/learner/drill/api/attemptOutbox")>();
  return { ...actual, enqueueAttempt: enqueueAttemptMock, flushOutbox: flushOutboxMock };
});

import { __resetLearnerDbForTests, getLearnerDb } from "@/learner/core/db";
import type { DrillSessionRow } from "@/learner/core/db/types";
import type { DrillItem, DrillReason } from "@/learner/drill/api/drillClient";
import { useDrillSession } from "@/learner/drill/hooks/useDrillSession";

function makeItem(id: string, overrides: Partial<DrillItem> = {}): DrillItem {
  return {
    id,
    concept_code: "kasus_akkusativ",
    before_de: "Ich sehe ___ Mann.",
    after_de: "Ich sehe den Mann.",
    answer_de: "den",
    distractors_de: ["dem", "der"],
    explanation_fr: "Accusatif masculin.",
    ...overrides,
  };
}

function items(n: number, prefix: string): DrillItem[] {
  return Array.from({ length: n }, (_, i) => makeItem(`${prefix}-${i}`));
}

/** Redo alone returns exactly SESSION_SIZE items — the daily leg is never called. */
function mockFullRedoSession(list: DrillItem[]): void {
  fetchDrillRecommendationMock.mockResolvedValueOnce({ items: list, reason: "ok" });
}

beforeEach(() => {
  __resetLearnerDbForTests();
  fetchDrillRecommendationMock.mockReset();
  submitDrillAttemptMock.mockReset();
  enqueueAttemptMock.mockReset();
  flushOutboxMock.mockReset();
  flushOutboxMock.mockResolvedValue(undefined);
  enqueueAttemptMock.mockResolvedValue(undefined);
});

afterEach(() => {
  cleanup();
});

describe("mount", () => {
  it("flushes the outbox, fetches redo first, then tops up with home_daily (in that order)", async () => {
    const order: string[] = [];
    flushOutboxMock.mockImplementationOnce(async () => {
      order.push("flush");
    });
    fetchDrillRecommendationMock.mockImplementationOnce(async (input: { surface: string }) => {
      order.push(input.surface);
      return { items: items(2, "redo"), reason: "ok" };
    });
    fetchDrillRecommendationMock.mockImplementationOnce(async (input: { surface: string }) => {
      order.push(input.surface);
      return { items: items(3, "daily"), reason: "ok" };
    });

    const { result } = renderHook(() => useDrillSession());

    await waitFor(() => expect(result.current.status).toBe("in_progress"));

    expect(order).toEqual(["flush", "redo", "home_daily"]);
    expect(fetchDrillRecommendationMock).toHaveBeenNthCalledWith(1, { surface: "redo", max_items: 5 });
    expect(fetchDrillRecommendationMock).toHaveBeenNthCalledWith(2, {
      surface: "home_daily",
      max_items: 3,
    });
    expect(result.current.items).toHaveLength(5);
    expect(result.current.items[0]?.surface).toBe("redo");
    expect(result.current.items[4]?.surface).toBe("home_daily");
  });

  it("skips the home_daily fetch entirely when redo alone fills the session", async () => {
    mockFullRedoSession(items(5, "redo"));

    const { result } = renderHook(() => useDrillSession());

    await waitFor(() => expect(result.current.status).toBe("in_progress"));

    expect(fetchDrillRecommendationMock).toHaveBeenCalledTimes(1);
    expect(result.current.items).toHaveLength(5);
    expect(result.current.reason).toBe("ok");
  });

  it("a zero-item session still exposes the daily reason (D6)", async () => {
    fetchDrillRecommendationMock.mockResolvedValueOnce({ items: [], reason: "ok" });
    fetchDrillRecommendationMock.mockResolvedValueOnce({
      items: [],
      reason: "no_gaps_yet" satisfies DrillReason,
    });

    const { result } = renderHook(() => useDrillSession());

    await waitFor(() => expect(result.current.status).toBe("in_progress"));

    expect(result.current.items).toHaveLength(0);
    expect(result.current.reason).toBe("no_gaps_yet");
  });
});

describe("answer", () => {
  it("posts the exact body (never is_correct) and flushes the outbox again on success", async () => {
    mockFullRedoSession(items(5, "redo"));
    submitDrillAttemptMock.mockResolvedValue({ ok: true, is_correct: true, correct_answer: "den" });

    const { result } = renderHook(() => useDrillSession());
    await waitFor(() => expect(result.current.status).toBe("in_progress"));
    flushOutboxMock.mockClear(); // drop the mount-time call

    await act(async () => {
      await result.current.answer("den");
    });

    expect(submitDrillAttemptMock).toHaveBeenCalledWith({
      drill_item_id: "redo-0",
      surface: "redo",
      selected: "den",
    });
    expect(submitDrillAttemptMock.mock.calls[0]![0]).not.toHaveProperty("is_correct");
    expect(result.current.selected).toBe("den");
    expect(enqueueAttemptMock).not.toHaveBeenCalled();
    expect(flushOutboxMock).toHaveBeenCalledTimes(1);
  });

  it("a second answer call on the same item is a synchronous no-op", async () => {
    mockFullRedoSession(items(5, "redo"));
    submitDrillAttemptMock.mockResolvedValue({ ok: true, is_correct: true });

    const { result } = renderHook(() => useDrillSession());
    await waitFor(() => expect(result.current.status).toBe("in_progress"));

    await act(async () => {
      await result.current.answer("den");
      await result.current.answer("dem"); // must not overwrite `selected` or re-post
    });

    expect(submitDrillAttemptMock).toHaveBeenCalledTimes(1);
    expect(result.current.selected).toBe("den");
  });

  it("a wrong answer records the missed concept and enqueues to the outbox on a failed post", async () => {
    mockFullRedoSession(items(5, "redo"));
    submitDrillAttemptMock.mockResolvedValue({ ok: false, is_correct: false });

    const { result } = renderHook(() => useDrillSession());
    await waitFor(() => expect(result.current.status).toBe("in_progress"));
    flushOutboxMock.mockClear();

    await act(async () => {
      await result.current.answer("dem"); // wrong: answer_de is "den"
    });

    expect(enqueueAttemptMock).toHaveBeenCalledWith({
      drillItemId: "redo-0",
      surface: "redo",
      selected: "dem",
      isCorrect: 0,
    });
    expect(flushOutboxMock).not.toHaveBeenCalled(); // only enqueue on failure, never flush
  });
});

describe("session completion", () => {
  async function db_drillSessionRows(): Promise<DrillSessionRow[]> {
    const db = await getLearnerDb();
    return (await db.drillSessions.toArray()) as unknown as DrillSessionRow[];
  }

  it("writes exactly one drillSessions row with ledWithRedo=true when a redo item was answered", async () => {
    // 2 redo + 3 home_daily — exercises the mixed-surface composition path.
    fetchDrillRecommendationMock.mockResolvedValueOnce({ items: items(2, "redo"), reason: "ok" });
    fetchDrillRecommendationMock.mockResolvedValueOnce({ items: items(3, "daily"), reason: "ok" });
    // First item wrong, the rest correct.
    submitDrillAttemptMock
      .mockResolvedValueOnce({ ok: true, is_correct: false })
      .mockResolvedValue({ ok: true, is_correct: true });

    const { result } = renderHook(() => useDrillSession());
    await waitFor(() => expect(result.current.status).toBe("in_progress"));

    for (let i = 0; i < 5; i += 1) {
      const wrongChoice = i === 0;
      const item = result.current.items[i]!;
      const choice = wrongChoice ? item.distractors_de[0]! : item.answer_de;
      await act(async () => {
        await result.current.answer(choice);
      });
      act(() => result.current.next());
    }

    await waitFor(() => expect(result.current.status).toBe("results"));
    expect(result.current.summary).toEqual({
      total: 5,
      correct: 4,
      ledWithRedo: true,
      reason: "ok",
      missed: [
        { conceptCode: "kasus_akkusativ", conceptName: "Kasus Akkusativ", explanationFr: "Accusatif masculin." },
      ],
    });

    const rows = await db_drillSessionRows();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ total: 5, correct: 4, led_with_redo: 1 });
    expect(rows[0]?.completed_at).toBeCloseTo(Date.now(), -3); // within ~seconds

    // A trailing next() call past the final item must not write a second row.
    act(() => result.current.next());
    expect(await db_drillSessionRows()).toHaveLength(1);
  });

  it("ledWithRedo=false when the session is topped up entirely by home_daily", async () => {
    fetchDrillRecommendationMock.mockResolvedValueOnce({ items: [], reason: "ok" });
    fetchDrillRecommendationMock.mockResolvedValueOnce({ items: items(5, "daily"), reason: "ok" });
    submitDrillAttemptMock.mockResolvedValue({ ok: true, is_correct: true });

    const { result } = renderHook(() => useDrillSession());
    await waitFor(() => expect(result.current.status).toBe("in_progress"));

    for (let i = 0; i < 5; i += 1) {
      const item = result.current.items[i]!;
      await act(async () => {
        await result.current.answer(item.answer_de);
      });
      act(() => result.current.next());
    }

    await waitFor(() => expect(result.current.status).toBe("results"));
    expect(result.current.summary?.ledWithRedo).toBe(false);

    const rows = await db_drillSessionRows();
    expect(rows[0]?.led_with_redo).toBe(0);
  });

  it("unmounting mid-session writes nothing to drillSessions", async () => {
    mockFullRedoSession(items(5, "redo"));
    submitDrillAttemptMock.mockResolvedValue({ ok: true, is_correct: true });

    const { result, unmount } = renderHook(() => useDrillSession());
    await waitFor(() => expect(result.current.status).toBe("in_progress"));

    await act(async () => {
      await result.current.answer("den");
    });
    unmount();

    expect(await db_drillSessionRows()).toHaveLength(0);
  });
});
