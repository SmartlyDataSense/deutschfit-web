/**
 * `attemptOutbox.ts` — local retry queue for failed `drill-attempt`
 * POSTs (System A, S9 · Task 9.6).
 *
 * Uses the real `getLearnerDb()` handle: under jsdom (this repo's
 * vitest environment has no `indexedDB` global) it auto-falls back to
 * the documented page-lifetime in-memory store (`core/db/index.ts`),
 * same pattern as `learner-db.test.ts` / `learner-writing-draft.test.ts`.
 * `__resetLearnerDbForTests()` resets that handle between tests.
 *
 * Covers:
 *   - `enqueueAttempt` writes a row with a UUID `id`, `attempts: 0`,
 *     `queued_at` ≈ now.
 *   - `flushOutbox` with an injected `submit` that succeeds deletes the
 *     row and calls `submit` with exactly `{drill_item_id, surface,
 *     selected}` — never `is_correct` (the server recomputes it).
 *   - a failing submit increments `attempts` and keeps the row.
 *   - the `MAX_ATTEMPTS`-th failed pass drops the row.
 *   - two queued rows flush oldest-`queued_at` first (D5, FIFO) — this
 *     is asserted against out-of-order insertion, so it fails if the
 *     `.sort()` in `flushOutbox` is ever removed.
 *   - with no injected `submit`, `flushOutbox` falls back to the real
 *     `submitDrillAttempt` from `drillClient.ts`.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { submitDrillAttemptMock } = vi.hoisted(() => ({ submitDrillAttemptMock: vi.fn() }));
vi.mock("@/learner/drill/api/drillClient", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/learner/drill/api/drillClient")>();
  return { ...actual, submitDrillAttempt: submitDrillAttemptMock };
});

import { __resetLearnerDbForTests, getLearnerDb } from "@/learner/core/db";
import type { DrillAttemptOutboxRow } from "@/learner/core/db/types";
import { MAX_ATTEMPTS, enqueueAttempt, flushOutbox } from "@/learner/drill/api/attemptOutbox";

beforeEach(() => {
  __resetLearnerDbForTests();
  submitDrillAttemptMock.mockReset();
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-08-10T10:00:00.000Z"));
});

afterEach(() => {
  vi.useRealTimers();
});

async function outboxRows(): Promise<DrillAttemptOutboxRow[]> {
  const db = await getLearnerDb();
  return (await db.drillAttemptOutbox.toArray()) as unknown as DrillAttemptOutboxRow[];
}

describe("MAX_ATTEMPTS", () => {
  it("is 5", () => {
    expect(MAX_ATTEMPTS).toBe(5);
  });
});

describe("enqueueAttempt", () => {
  it("writes a row with a UUID id, attempts=0, queued_at≈now", async () => {
    await enqueueAttempt({ drillItemId: "d1", surface: "redo", selected: "den", isCorrect: 1 });

    const rows = await outboxRows();
    expect(rows).toHaveLength(1);
    const row = rows[0]!;
    expect(row.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
    expect(row.drill_item_id).toBe("d1");
    expect(row.surface).toBe("redo");
    expect(row.selected).toBe("den");
    expect(row.is_correct).toBe(1);
    expect(row.attempts).toBe(0);
    expect(row.queued_at).toBe(Date.now());
  });
});

describe("flushOutbox", () => {
  it("with a succeeding injected submit, deletes the row and never forwards is_correct", async () => {
    await enqueueAttempt({ drillItemId: "d1", surface: "redo", selected: "den", isCorrect: 1 });
    const submit = vi.fn().mockResolvedValue({ ok: true, is_correct: true });

    await flushOutbox({ submit });

    expect(submit).toHaveBeenCalledTimes(1);
    expect(submit).toHaveBeenCalledWith({ drill_item_id: "d1", surface: "redo", selected: "den" });
    expect(submit.mock.calls[0]![0]).not.toHaveProperty("is_correct");
    expect(await outboxRows()).toHaveLength(0);
  });

  it("a failing submit increments attempts and keeps the row", async () => {
    await enqueueAttempt({ drillItemId: "d1", surface: "redo", selected: "den", isCorrect: 0 });
    const submit = vi.fn().mockResolvedValue({ ok: false, is_correct: false });

    await flushOutbox({ submit });

    const rows = await outboxRows();
    expect(rows).toHaveLength(1);
    expect(rows[0]?.attempts).toBe(1);
  });

  it("drops the row on the MAX_ATTEMPTS-th failed pass", async () => {
    await enqueueAttempt({ drillItemId: "d1", surface: "redo", selected: "den", isCorrect: 0 });
    const submit = vi.fn().mockResolvedValue({ ok: false, is_correct: false });

    for (let i = 0; i < MAX_ATTEMPTS - 1; i += 1) {
      await flushOutbox({ submit });
      expect(await outboxRows()).toHaveLength(1); // still present before the cap
    }
    await flushOutbox({ submit }); // MAX_ATTEMPTS-th pass

    expect(await outboxRows()).toHaveLength(0);
    expect(submit).toHaveBeenCalledTimes(MAX_ATTEMPTS);
  });

  it("flushes oldest queued_at first, regardless of insertion order (D5 FIFO)", async () => {
    const db = await getLearnerDb();
    // Insert the newer row first — a naive insertion-order drain would
    // process "item-b" before "item-a", failing the assertion below.
    await db.drillAttemptOutbox.put({
      id: "row-b",
      drill_item_id: "item-b",
      surface: "redo",
      selected: "x",
      is_correct: 0,
      queued_at: 200,
      attempts: 0,
    });
    await db.drillAttemptOutbox.put({
      id: "row-a",
      drill_item_id: "item-a",
      surface: "redo",
      selected: "y",
      is_correct: 0,
      queued_at: 100,
      attempts: 0,
    });

    const order: string[] = [];
    const submit = vi.fn().mockImplementation(async (input: { drill_item_id: string }) => {
      order.push(input.drill_item_id);
      return { ok: true, is_correct: true };
    });

    await flushOutbox({ submit });

    expect(order).toEqual(["item-a", "item-b"]);
  });

  it("with no injected submit, falls back to the real submitDrillAttempt", async () => {
    await enqueueAttempt({ drillItemId: "d1", surface: "redo", selected: "den", isCorrect: 1 });
    submitDrillAttemptMock.mockResolvedValue({ ok: true, is_correct: true });

    await flushOutbox();

    expect(submitDrillAttemptMock).toHaveBeenCalledWith({
      drill_item_id: "d1",
      surface: "redo",
      selected: "den",
    });
    expect(await outboxRows()).toHaveLength(0);
  });
});
