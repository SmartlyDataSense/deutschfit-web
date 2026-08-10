/**
 * `useDrillSession` — in-memory state for one 5-question adaptive drill
 * session (System A — S9 · Task 9.6).
 *
 * Web port of
 * `deutschfit-mobile/src/features/drill/hooks/useDrillSession.ts`. The
 * state-machine and composition logic (redo leads, home_daily tops up;
 * synchronous double-answer guard; write-summary-once guard) is ported
 * verbatim; only persistence swaps Drizzle for the learner Dexie table:
 * mobile's `db.insert(drillSessions).values(...)` becomes a single
 * `(await getLearnerDb()).drillSessions.put(...)` write, row-shaped per
 * `DrillSessionRow` (`core/db/types.ts`, cast per the `hydrate.ts`
 * documented pattern).
 *
 * State machine: loading → in_progress → results. Every answer hits
 * `drill-attempt` immediately; a failed POST is enqueued to the local
 * outbox (`attemptOutbox.ts`). A successful POST triggers a
 * fire-and-forget `flushOutbox()` so any previously-queued rows drain
 * opportunistically. On completion ONE summary row is written to
 * `drillSessions` (guarded by `completedRef` so a re-render, or a
 * stray extra `next()` call after `results`, cannot double-write).
 * Unmounting mid-session writes nothing.
 *
 * The mount effect's `cancelled` flag is declared *inside* the effect
 * body (fresh per setup — StrictMode double-invoke re-runs the whole
 * effect against a fresh closure, so there is no stale-ref leak).
 *
 * Deviation from mobile: this hook additionally returns `reason` — the
 * `DrillReason` from the most recent `home_daily` fetch (or `"ok"`
 * before any daily top-up ran, i.e. a redo-only session). Mobile never
 * surfaces this outside the final summary because its screen
 * auto-dismisses a zero-item session; the web screen instead renders
 * `DrillEmptyState` for that case (task-9.6-brief.md D6), which needs a
 * reason to render *before* a summary exists.
 */
import { useCallback, useEffect, useRef, useState } from "react";

import { newIdempotencyKey } from "@/learner/core/api";
import { getLearnerDb } from "@/learner/core/db";
import type { DrillSessionRow, MissedConcept } from "@/learner/core/db/types";

import { enqueueAttempt, flushOutbox } from "../api/attemptOutbox";
import {
  fetchDrillRecommendation,
  submitDrillAttempt,
  type DrillItem,
  type DrillReason,
  type DrillSurface,
} from "../api/drillClient";

export const SESSION_SIZE = 5;

export type DrillSessionStatus = "loading" | "in_progress" | "results";

export interface SessionItem extends DrillItem {
  readonly surface: DrillSurface;
  readonly options: readonly string[];
}

export interface SessionSummary {
  readonly total: number;
  readonly correct: number;
  readonly ledWithRedo: boolean;
  readonly reason: DrillReason;
  readonly missed: readonly MissedConcept[];
}

export interface UseDrillSessionResult {
  readonly status: DrillSessionStatus;
  readonly items: readonly SessionItem[];
  readonly index: number;
  readonly selected: string | undefined;
  readonly summary: SessionSummary | null;
  /** `home_daily` reason from the most recent fetch — see module docstring. */
  readonly reason: DrillReason;
  readonly answer: (selected: string) => Promise<void>;
  readonly next: () => void;
}

/** snake_case concept_code → human label ("kasus_akkusativ" → "Kasus Akkusativ"). */
export function conceptLabel(conceptCode: string): string {
  return conceptCode
    .split("_")
    .filter((p) => p.length > 0)
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
    .join(" ");
}

/** Fisher–Yates — pure, returns a new array. */
export function shuffle<T>(input: readonly T[]): T[] {
  const out = [...input];
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    const a = out[i]!;
    const b = out[j]!;
    out[i] = b;
    out[j] = a;
  }
  return out;
}

export function toSessionItem(item: DrillItem, surface: DrillSurface): SessionItem {
  return {
    ...item,
    surface,
    options: shuffle([item.answer_de, ...item.distractors_de]),
  };
}

export function useDrillSession(): UseDrillSessionResult {
  const [status, setStatus] = useState<DrillSessionStatus>("loading");
  const [items, setItems] = useState<readonly SessionItem[]>([]);
  const [index, setIndex] = useState(0);
  const [selected, setSelected] = useState<string | undefined>(undefined);
  const [summary, setSummary] = useState<SessionSummary | null>(null);
  const [reason, setReason] = useState<DrillReason>("ok");

  const correctRef = useRef(0);
  const missedRef = useRef<MissedConcept[]>([]);
  const dailyReasonRef = useRef<DrillReason>("ok");
  const completedRef = useRef(false);
  // Synchronous lock: `selected` state lags a render, so two `answer`
  // calls in the same tick would both pass the state guard. The ref
  // commits immediately, making a double-answer a true no-op.
  const answeredRef = useRef<number>(-1);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      await flushOutbox();
      const redo = await fetchDrillRecommendation({ surface: "redo", max_items: SESSION_SIZE });
      const redoItems = redo.items.map((i) => toSessionItem(i, "redo"));
      let dailyItems: SessionItem[] = [];
      if (redoItems.length < SESSION_SIZE) {
        const daily = await fetchDrillRecommendation({
          surface: "home_daily",
          max_items: SESSION_SIZE - redoItems.length,
        });
        dailyReasonRef.current = daily.reason;
        if (!cancelled) setReason(daily.reason);
        dailyItems = daily.items.map((i) => toSessionItem(i, "home_daily"));
      }
      if (cancelled) return;
      setItems([...redoItems, ...dailyItems]);
      setStatus("in_progress");
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const writeSummary = useCallback(async () => {
    if (completedRef.current) return;
    completedRef.current = true;
    const ledWithRedo = items.some((i) => i.surface === "redo");
    const next: SessionSummary = {
      total: items.length,
      correct: correctRef.current,
      ledWithRedo,
      reason: dailyReasonRef.current,
      missed: missedRef.current,
    };
    setSummary(next);
    try {
      const db = await getLearnerDb();
      await db.drillSessions.put({
        id: newIdempotencyKey(),
        completed_at: Date.now(),
        total: next.total,
        correct: next.correct,
        led_with_redo: ledWithRedo ? 1 : 0,
        missed: next.missed as MissedConcept[],
      } satisfies DrillSessionRow);
    } catch (err) {
      console.warn("[drill] failed to persist session summary", err);
    }
    setStatus("results");
  }, [items]);

  const answer = useCallback(
    async (choice: string) => {
      const item = items[index];
      if (!item || selected !== undefined || answeredRef.current === index) {
        return;
      }
      answeredRef.current = index;
      setSelected(choice);
      const isCorrect = choice === item.answer_de;
      if (isCorrect) {
        correctRef.current += 1;
      } else {
        missedRef.current = [
          ...missedRef.current,
          {
            conceptCode: item.concept_code,
            conceptName: conceptLabel(item.concept_code),
            explanationFr: item.explanation_fr,
          },
        ];
      }
      const result = await submitDrillAttempt({
        drill_item_id: item.id,
        surface: item.surface,
        selected: choice,
      });
      if (!result.ok) {
        await enqueueAttempt({
          drillItemId: item.id,
          surface: item.surface,
          selected: choice,
          isCorrect: isCorrect ? 1 : 0,
        });
      } else {
        void flushOutbox();
      }
    },
    [items, index, selected]
  );

  const next = useCallback(() => {
    if (index + 1 >= items.length) {
      void writeSummary();
      return;
    }
    setIndex((i) => i + 1);
    setSelected(undefined);
  }, [index, items.length, writeSummary]);

  return { status, items, index, selected, summary, reason, answer, next };
}
