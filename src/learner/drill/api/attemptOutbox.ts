/**
 * Local retry queue for failed `drill-attempt` POSTs (S9 · Task 9.6).
 *
 * Web port of `deutschfit-mobile/src/features/drill/api/attemptOutbox.ts`
 * onto the learner Dexie table `drillAttemptOutbox` (pre-declared in
 * schema v1 — no migration needed here) instead of Drizzle.
 *
 * Every drill answer must reach the server — it updates
 * `user_concept_mastery` and feeds the adaptive cycle. When the POST
 * fails, the attempt is persisted to `drill_attempt_outbox` and retried
 * on session start and after any successful attempt (mobile's third
 * retry trigger, "app foreground", is a stale doc comment there with no
 * actual wiring — no web equivalent is invented here). A row that
 * exceeds `MAX_ATTEMPTS` is dropped and logged locally (rare; never
 * surfaced to the learner).
 *
 * Note: `drill-attempt` is NOT idempotent — it fans out a mastery
 * update on every insert. A retry after a lost-response *success*
 * therefore double-counts that mastery update. This is mobile parity,
 * not a web-specific bug — not fixed here.
 */
import { newIdempotencyKey } from "@/learner/core/api";
import { getLearnerDb } from "@/learner/core/db";
import type { DrillAttemptOutboxRow } from "@/learner/core/db/types";
import { submitDrillAttempt, type DrillSurface } from "./drillClient";

export const MAX_ATTEMPTS = 5;

export interface PendingAttempt {
  readonly drillItemId: string;
  readonly surface: DrillSurface;
  readonly selected: string;
  readonly isCorrect: number;
}

export async function enqueueAttempt(attempt: PendingAttempt): Promise<void> {
  const db = await getLearnerDb();
  await db.drillAttemptOutbox.put({
    id: newIdempotencyKey(),
    drill_item_id: attempt.drillItemId,
    surface: attempt.surface,
    selected: attempt.selected,
    is_correct: attempt.isCorrect,
    queued_at: Date.now(),
    attempts: 0,
  } satisfies DrillAttemptOutboxRow);
}

export async function flushOutbox(
  deps: { submit?: typeof submitDrillAttempt } = {}
): Promise<void> {
  const submit = deps.submit ?? submitDrillAttempt;
  const db = await getLearnerDb();
  const rows = ((await db.drillAttemptOutbox.toArray()) as unknown as DrillAttemptOutboxRow[]).sort(
    (a, b) => a.queued_at - b.queued_at
  ); // D5: FIFO
  for (const row of rows) {
    const result = await submit({
      drill_item_id: row.drill_item_id,
      surface: row.surface as DrillSurface,
      selected: row.selected,
    });
    if (result.ok) {
      await db.drillAttemptOutbox.delete(row.id);
      continue;
    }
    const nextAttempts = row.attempts + 1;
    if (nextAttempts >= MAX_ATTEMPTS) {
      await db.drillAttemptOutbox.delete(row.id);
      console.warn("[drill] outbox row dropped past retry cap", row.id);
      continue;
    }
    await db.drillAttemptOutbox.put({ ...row, attempts: nextAttempts });
  }
}
