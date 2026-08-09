/**
 * Sprechen submission polling hook (S7 · Task 7.4).
 *
 * Port of `deutschfit-mobile/src/features/sprechen/hooks/useSprechenSubmissionPolling.ts`
 * — structure verbatim. Only the transport import changes: mobile calls
 * `getSubmission` from its local `@features/sprechen/api`; this hook
 * imports `getSprechenSubmission` + `SprechenPollingStatus` +
 * `SprechenSubmission` from the facade (`@/learner/core/api/examApi`), per
 * Constraint 15 — feature code imports wire fns ONLY from the facade.
 *
 * P2 pinned cadence — mobile wins over S6's 2s writing idiom:
 *   - Poll every **5s** while the submission is in a non-terminal state
 *     (`awaiting_upload` / `queued` / `in_progress`).
 *   - Stop on any of:
 *       · server-side terminal (`graded` / `failed` / `error` / `rejected`
 *         — four members, not S6's two)
 *       · 240s wall-clock budget exhausted → emit local `timeout` status
 *         (grader latency baseline 42–134s — 240s holds)
 *       · explicit `stop()` / component unmount
 *   - Errors from `getSprechenSubmission` do not tear down the loop. They
 *     surface as `{status: lastData?.status ?? "queued", data: lastData,
 *     error}` but the next tick still fires.
 *
 * The pure `createSprechenPoller` is the testable unit; the React hook is
 * a thin `useEffect` wrapper that wires it into component state.
 */
import { useEffect, useState } from "react";

import {
  getSprechenSubmission,
  type SprechenPollingStatus,
  type SprechenSubmission,
} from "@/learner/core/api/examApi";

const INTERVAL_MS = 5_000;
const MAX_DURATION_MS = 240_000;

const TERMINAL_SERVER_STATUSES: ReadonlySet<string> = new Set([
  "graded",
  "failed",
  "error",
  "rejected",
]);

export type SprechenPollingSnapshot = {
  status: SprechenPollingStatus | "idle";
  data: SprechenSubmission | null;
  error: string | null;
};

export type SprechenPoller = {
  start: () => void;
  stop: () => void;
};

export function createSprechenPoller(
  id: string,
  onUpdate: (snapshot: SprechenPollingSnapshot) => void
): SprechenPoller {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let stopped = false;
  let startedAt = 0;
  let lastData: SprechenSubmission | null = null;

  const emit = (snapshot: SprechenPollingSnapshot): void => {
    if (stopped) return;
    onUpdate(snapshot);
  };

  const stop = (): void => {
    stopped = true;
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }
  };

  const scheduleNext = (): void => {
    if (stopped) return;
    if (Date.now() - startedAt >= MAX_DURATION_MS) {
      emit({ status: "timeout", data: lastData, error: null });
      stop();
      return;
    }
    timer = setTimeout(() => {
      timer = null;
      void tick();
    }, INTERVAL_MS);
  };

  const tick = async (): Promise<void> => {
    if (stopped) return;
    try {
      const row = await getSprechenSubmission(id);
      if (stopped) return;
      lastData = row;
      emit({ status: row.status, data: row, error: null });
      if (TERMINAL_SERVER_STATUSES.has(row.status)) {
        stop();
        return;
      }
    } catch (err) {
      if (stopped) return;
      const message = err instanceof Error ? err.message : "poll_failed";
      emit({
        status: lastData?.status ?? "queued",
        data: lastData,
        error: message,
      });
    }
    scheduleNext();
  };

  const start = (): void => {
    if (stopped) return;
    startedAt = Date.now();
    void tick();
  };

  return { start, stop };
}

export type UseSprechenSubmissionPollingResult = {
  data: SprechenSubmission | null;
  status: SprechenPollingStatus | "idle";
  error: string | null;
};

export function useSprechenSubmissionPolling(
  id: string | null
): UseSprechenSubmissionPollingResult {
  const [snapshot, setSnapshot] = useState<SprechenPollingSnapshot>({
    status: "idle",
    data: null,
    error: null,
  });

  useEffect(() => {
    if (!id) {
      setSnapshot({ status: "idle", data: null, error: null });
      return;
    }
    const poller = createSprechenPoller(id, (next) => setSnapshot(next));
    poller.start();
    return () => poller.stop();
  }, [id]);

  return snapshot;
}
