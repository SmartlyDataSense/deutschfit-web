/**
 * `createDraftScheduler` / `clearDraft` / `useDraft` — Schreiben draft
 * autosave (task 6.3). Port of `deutschfit-mobile`'s
 * `src/features/writing/hooks/useDraft.ts` semantics onto the web
 * learner app's Dexie `writingDrafts` table (schema v1, pre-declared by
 * S0 — no version bump here).
 *
 * Uses the REAL `getLearnerDb()` handle — under jsdom (no `indexedDB`
 * global in this test env) it auto-falls back to the documented
 * page-lifetime in-memory store (`core/db/index.ts`), so no
 * fake-indexeddb dependency is needed. `__resetLearnerDbForTests()`
 * (the documented test-only escape hatch) resets that handle between
 * tests so writes from one test never leak into the next.
 */
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useLearnerSession } from "@/learner/core/auth/useLearnerSession";
import { __resetLearnerDbForTests, getLearnerDb } from "@/learner/core/db";
import type { WritingDraftRow } from "@/learner/core/db/types";
import { clearDraft, createDraftScheduler, useDraft } from "@/learner/schreiben/hooks/useDraft";

type FakeSession = { user: { id: string } };

function setSession(userId: string | null): void {
  const session = (userId ? { user: { id: userId } } : null) as FakeSession | null;
  useLearnerSession.setState({
    session: session as never,
    status: userId ? "authenticated" : "unauthenticated",
  });
}

async function getDraftRow(userId: string, promptId: string): Promise<WritingDraftRow | undefined> {
  const db = await getLearnerDb();
  return (await db.writingDrafts.get([userId, promptId])) as WritingDraftRow | undefined;
}

describe("createDraftScheduler", () => {
  beforeEach(() => {
    __resetLearnerDbForTests();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("schedule: nothing persisted before 3s, persisted right after advancing to 3000ms", async () => {
    const scheduler = createDraftScheduler("user-a", "prompt-1");
    scheduler.schedule("hallo");

    await vi.advanceTimersByTimeAsync(2999);
    expect(await getDraftRow("user-a", "prompt-1")).toBeUndefined();

    await vi.advanceTimersByTimeAsync(1);
    expect(await getDraftRow("user-a", "prompt-1")).toMatchObject({ body_de: "hallo" });
  });

  it("rapid re-schedule keeps a single pending write — last body wins", async () => {
    const scheduler = createDraftScheduler("user-a", "prompt-1");
    scheduler.schedule("h");
    await vi.advanceTimersByTimeAsync(1000);
    scheduler.schedule("ha");
    await vi.advanceTimersByTimeAsync(1000);
    scheduler.schedule("hallo");

    // Only 1000ms have elapsed since the last schedule() — not committed yet.
    await vi.advanceTimersByTimeAsync(2000);
    expect(await getDraftRow("user-a", "prompt-1")).toBeUndefined();

    await vi.advanceTimersByTimeAsync(1000);
    expect(await getDraftRow("user-a", "prompt-1")).toMatchObject({ body_de: "hallo" });
  });

  it("flush() inside the debounce window persists immediately", async () => {
    const scheduler = createDraftScheduler("user-a", "prompt-1");
    scheduler.schedule("sofort");
    await scheduler.flush();

    expect(await getDraftRow("user-a", "prompt-1")).toMatchObject({ body_de: "sofort" });
  });

  it("cancel() drops the pending body — nothing is ever persisted", async () => {
    const scheduler = createDraftScheduler("user-a", "prompt-1");
    scheduler.schedule("verworfen");
    scheduler.cancel();

    await vi.advanceTimersByTimeAsync(5000);
    expect(await getDraftRow("user-a", "prompt-1")).toBeUndefined();
  });

  it("clearDraft deletes the row", async () => {
    const scheduler = createDraftScheduler("user-a", "prompt-1");
    scheduler.schedule("temp");
    await scheduler.flush();
    expect(await getDraftRow("user-a", "prompt-1")).toBeDefined();

    await clearDraft("user-a", "prompt-1");
    expect(await getDraftRow("user-a", "prompt-1")).toBeUndefined();
  });
});

describe("useDraft", () => {
  beforeEach(() => {
    __resetLearnerDbForTests();
    vi.useFakeTimers();
    setSession(null);
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it("hydrates local state from an existing row for (userId, promptId)", async () => {
    setSession("user-a");
    const db = await getLearnerDb();
    await db.writingDrafts.put({
      user_id: "user-a",
      prompt_id: "prompt-1",
      body_de: "existing draft",
      updated_at: 111,
    });

    const { result } = renderHook(() => useDraft("prompt-1"));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(result.current.hydrated).toBe(true);
    expect(result.current.body).toBe("existing draft");
    expect(result.current.updatedAt).toBe(111);
  });

  it("no session → stays unhydrated with empty body, never touches the db", async () => {
    setSession(null);
    const { result } = renderHook(() => useDraft("prompt-1"));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(result.current.hydrated).toBe(false);
    expect(result.current.body).toBe("");
  });

  it("setBody updates state immediately and schedules a debounced commit", async () => {
    setSession("user-a");
    const { result } = renderHook(() => useDraft("prompt-1"));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    act(() => {
      result.current.setBody("erster Satz");
    });
    expect(result.current.body).toBe("erster Satz");
    expect(await getDraftRow("user-a", "prompt-1")).toBeUndefined();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(3000);
    });
    expect(await getDraftRow("user-a", "prompt-1")).toMatchObject({ body_de: "erster Satz" });
  });

  it(
    "cleanup FLUSHES the pending body on unmount (guard-removal check: " +
      "swapping the cleanup's flush() for cancel() must fail this test — " +
      "the assertion below only holds because unmount persists the " +
      "in-flight text instead of dropping it)",
    async () => {
      setSession("user-a");
      const { result, unmount } = renderHook(() => useDraft("prompt-1"));
      await act(async () => {
        await vi.advanceTimersByTimeAsync(0);
      });

      act(() => {
        result.current.setBody("in flight");
      });

      // Still well inside the 3s debounce window — nothing committed yet.
      expect(await getDraftRow("user-a", "prompt-1")).toBeUndefined();

      unmount();
      // cleanup's `void scheduler?.flush()` is fire-and-forget — let its
      // microtasks (the async commit()) settle.
      await act(async () => {
        await vi.advanceTimersByTimeAsync(0);
      });

      // If the cleanup called cancel() instead of flush(), this row would
      // be undefined — that is exactly the regression this hook exists to
      // prevent (mobile useDraft.ts:165-173).
      const row = await getDraftRow("user-a", "prompt-1");
      expect(row).toMatchObject({ body_de: "in flight" });
    }
  );

  it("clear() cancels the pending write and deletes the row; the debounce timer never resurrects it", async () => {
    setSession("user-a");
    const { result } = renderHook(() => useDraft("prompt-1"));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    act(() => {
      result.current.setBody("to be cleared");
    });

    await act(async () => {
      await result.current.clear();
    });

    expect(result.current.body).toBe("");
    expect(result.current.updatedAt).toBeNull();
    expect(await getDraftRow("user-a", "prompt-1")).toBeUndefined();

    // Advancing past the original 3s debounce window must not resurrect
    // the row — clear() cancels the pending timer before deleting.
    await vi.advanceTimersByTimeAsync(5000);
    expect(await getDraftRow("user-a", "prompt-1")).toBeUndefined();
  });
});
