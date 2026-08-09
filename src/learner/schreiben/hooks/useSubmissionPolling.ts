/**
 * Submission polling hook.
 *
 * Port of `deutschfit-mobile/src/features/writing/hooks/useSubmissionPolling.ts`
 * (structure verbatim, 1:1). Only the transport import changes: mobile calls
 * `getSubmission` from its local `@features/writing/api`; this hook imports
 * `getWritingSubmission` + `PollingStatus` + `WritingSubmission` from the
 * facade (`@/learner/core/api/examApi`), per Constraint 15 — feature code
 * imports wire fns ONLY from the facade.
 *
 * Contract (spec §7.3):
 *   - While the submission is in a non-terminal state, poll every **2s**.
 *   - Stop on any of:
 *       · server-side terminal (`graded` / `failed`)
 *       · 240s wall-clock budget exhausted → emit local `timeout` status
 *         (covers ~95% of foreground sessions; the long tail falls
 *         through to the `grading_ready` push notification)
 *       · explicit `stop()` / component unmount
 *   - Errors from `getWritingSubmission` do not tear down the loop — they
 *     surface in `snapshot.error` but the next tick still fires. A single
 *     transient 5xx shouldn't cancel a poll that will almost certainly
 *     succeed 2s later.
 *
 * The pure `createSubmissionPoller` is the testable unit; the React hook is a
 * thin `useEffect` wrapper that wires it into component state.
 */
import { useEffect, useState } from "react";

import {
  getWritingSubmission,
  type PollingStatus,
  type WritingSubmission,
} from "@/learner/core/api/examApi";

const INTERVAL_MS = 2_000;
const MAX_DURATION_MS = 240_000;

const TERMINAL_SERVER_STATUSES = new Set<string>(["graded", "failed"]);

export type PollingSnapshot = {
  status: PollingStatus | "idle";
  data: WritingSubmission | null;
  error: string | null;
};

export type SubmissionPoller = {
  start: () => void;
  stop: () => void;
};

export function createSubmissionPoller(
  id: string,
  onUpdate: (snapshot: PollingSnapshot) => void
): SubmissionPoller {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let stopped = false;
  let startedAt = 0;
  let lastData: WritingSubmission | null = null;

  const emit = (snapshot: PollingSnapshot): void => {
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
      const row = await getWritingSubmission(id);
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
        status: lastData?.status ?? "pending",
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

export type UseSubmissionPollingResult = {
  data: WritingSubmission | null;
  status: PollingStatus | "idle";
  error: string | null;
};

export function useSubmissionPolling(id: string | null): UseSubmissionPollingResult {
  const [snapshot, setSnapshot] = useState<PollingSnapshot>({
    status: "idle",
    data: null,
    error: null,
  });

  useEffect(() => {
    if (!id) {
      setSnapshot({ status: "idle", data: null, error: null });
      return;
    }
    const poller = createSubmissionPoller(id, (next) => setSnapshot(next));
    poller.start();
    return () => poller.stop();
  }, [id]);

  return snapshot;
}
