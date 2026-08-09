/**
 * Unified submission polling hook (M-POLL · Wave 1 · P5).
 *
 * Ports `deutschfit-mobile/src/core/submissions/usePollSubmission.ts`
 * verbatim (constants, cadence/threshold state machine, snapshot shape,
 * React hook) — only the imports differ: `getSubmissionRow` from
 * `@/learner/core/api/submissions` and the readiness producers from
 * `@/learner/core/readiness` (this repo's Task 3.1 port).
 *
 * Centralises the two legacy pollings (`useSubmissionPolling` for
 * Schreiben, `useSprechenSubmissionPolling` for Sprechen) into a single
 * source of truth that:
 *
 *   - Polls `submissions-get/<id>` at the module-appropriate cadence:
 *       · Sprechen → 5 s × 240 s active phase, then 30 s slow phase.
 *       · Schreiben → 2 s × 240 s active phase, then 30 s slow phase.
 *   - At 90 s elapsed without a terminal status → calls
 *     `markCorrectionLong(submissionId)` so the readiness store flips
 *     `slow=true`. State stays `in-flight`. UI (StatusStrip) softens
 *     copy via the `slow` flag — this hook never touches user-facing
 *     strings.
 *   - At 240 s elapsed without a terminal status → re-cadences the
 *     timer interval to 30 s. **State stays `in-flight slow`.** We do
 *     NOT flip to `failed` purely because of a polling timeout — only
 *     a backend-emitted `failed` row (grader gave up, reaper reaped)
 *     warrants a state transition.
 *   - On `status === 'graded'` → `markCorrectionReady(submissionId)`;
 *     polling stops cleanly.
 *   - On `status === 'failed'` → `markSubmissionFailed(submissionId,
 *     reason)`; polling stops. The reason is `'reaper-timeout'` when
 *     the row carries that hint (M-BACKEND P7.3 reaper marks the
 *     `failure_reason` column), otherwise `'grader'`.
 *   - Push-first race: M-NOTIF's handler already calls
 *     `markCorrectionReady` on a graded push. The next poll tick
 *     re-asserts the same state (no-op in the store thanks to
 *     idempotent re-emit) and the hook stops because the row also
 *     reports `graded`.
 *   - Poll-first race: this hook lands `markCorrectionReady`; if a
 *     push arrives later for the same `submissionId`, the store's
 *     idempotent re-emit no-ops it.
 *   - Stale push (different `submissionId` than the active slot):
 *     filtered upstream by `isStaleSubmission` from `./predicates.ts`;
 *     this hook does not need a parallel guard because it is keyed by
 *     the live `submissionId`.
 *
 * The pure `createSubmissionPoller` factory is the testable unit; the
 * React hook is a thin `useEffect` wrapper that wires it into mount /
 * unmount. Errors from `getSubmission` do not tear down the loop —
 * they surface in `snapshot.error` but the next tick still fires.
 */
import { useEffect, useState } from "react";

import {
  getSubmission as getSubmissionRow,
  type RemoteSubmission,
  type SubmissionKind,
} from "@/learner/core/api/submissions";
import {
  markCorrectionLong,
  markCorrectionReady,
  markSubmissionFailed,
  type ReadinessFailedReason,
  type ReadinessModule,
} from "@/learner/core/readiness";

/** Phase 1 active-cadence intervals — module-aware. */
const ACTIVE_INTERVAL_MS: Record<ReadinessModule, number> = {
  sprechen: 5_000,
  schreiben: 2_000,
};

/** Phase 2 slow-cadence interval — Marie's promise cap × 1 (240 s). */
const SLOW_INTERVAL_MS = 30_000;

/** Threshold at which the readiness store flips `slow=true`. */
const SLOW_THRESHOLD_MS = 90_000;

/**
 * Threshold at which the polling cadence re-paces from active to slow.
 * Founding-doc cap — Marie never waits > 240 s without a signal; past
 * this, we keep polling but at a lower rate to spare the Supabase
 * quota.
 */
const RECADENCE_THRESHOLD_MS = 240_000;

/** Snapshot emitted to the React layer on every tick or terminal. */
export interface PollSubmissionSnapshot {
  readonly status: "idle" | "in-flight" | "in-flight-slow" | "graded" | "failed" | "error";
  readonly slow: boolean;
  readonly data: RemoteSubmission | null;
  readonly error: string | null;
  readonly elapsedMs: number;
}

export interface SubmissionPoller {
  readonly start: () => void;
  readonly stop: () => void;
}

/**
 * Reaper hint — when the backend reaper reaps a `pending` row past the
 * 600 s budget, it stamps `failure_reason='reaper-timeout'` on the row
 * (B-REAPER · P7.3, migration 0078). We read it via a defensive cast —
 * when the column is absent, we fall back to `'grader'`.
 */
function readFailedReason(row: RemoteSubmission): ReadinessFailedReason {
  const candidate = (row as { failure_reason?: unknown }).failure_reason;
  if (candidate === "reaper-timeout") return "reaper-timeout";
  return "grader";
}

/**
 * Map a `ReadinessModule` to the `SubmissionKind` query hint
 * `submissions-get` accepts. Skips the writing-first probe on the
 * server.
 */
function moduleToKind(module: ReadinessModule): SubmissionKind {
  return module === "sprechen" ? "speaking" : "writing";
}

interface CreatePollerArgs {
  readonly submissionId: string;
  readonly module: ReadinessModule;
  readonly onUpdate: (snapshot: PollSubmissionSnapshot) => void;
  /** Test seam — defaults to the real `getSubmission`. */
  readonly fetchRow?: (id: string, kind: SubmissionKind) => Promise<RemoteSubmission>;
  /** Test seam — defaults to wall clock. */
  readonly now?: () => number;
}

/**
 * Pure poller factory — the testable unit. Drives the cadence /
 * threshold state machine; emits a snapshot on every transition.
 */
export function createSubmissionPoller(args: CreatePollerArgs): SubmissionPoller {
  const { submissionId, module, onUpdate, fetchRow = getSubmissionRow, now = Date.now } = args;

  const activeIntervalMs = ACTIVE_INTERVAL_MS[module];
  const kind = moduleToKind(module);

  let timer: ReturnType<typeof setTimeout> | null = null;
  let stopped = false;
  let started = false;
  let startedAt = 0;
  let slowFlipped = false;
  let recadenced = false;
  let lastData: RemoteSubmission | null = null;

  const elapsed = (): number => now() - startedAt;

  const currentInterval = (): number => (recadenced ? SLOW_INTERVAL_MS : activeIntervalMs);

  const emit = (snapshot: PollSubmissionSnapshot): void => {
    if (stopped) return;
    onUpdate(snapshot);
  };

  const stop = (): void => {
    if (stopped) return;
    stopped = true;
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }
  };

  const checkThresholds = (): void => {
    const e = elapsed();
    if (!slowFlipped && e >= SLOW_THRESHOLD_MS) {
      slowFlipped = true;
      // Tell the readiness store to soften the StatusStrip copy.
      // Idempotent in the store; safe even if a push beat us to it.
      markCorrectionLong(submissionId);
    }
    if (!recadenced && e >= RECADENCE_THRESHOLD_MS) {
      recadenced = true;
      // No state transition — explicit per the plan: "Do NOT flip to
      // failed". The slot stays `in-flight slow`.
    }
  };

  const scheduleNext = (): void => {
    if (stopped) return;
    timer = setTimeout(() => {
      timer = null;
      void tick();
    }, currentInterval());
  };

  const tick = async (): Promise<void> => {
    if (stopped) return;

    // Re-check thresholds before the network call so a long fetch
    // round-trip doesn't delay the slow-flag flip past 90 s.
    checkThresholds();

    let row: RemoteSubmission | null = null;
    let errorMessage: string | null = null;
    try {
      row = await fetchRow(submissionId, kind);
    } catch (err) {
      errorMessage = err instanceof Error ? err.message : "poll_failed";
    }

    if (stopped) return;

    if (row !== null) {
      lastData = row;

      if (row.status === "graded") {
        // Push may have already landed `ready` — store re-emit is
        // idempotent. Always stop polling once the server confirms.
        markCorrectionReady(submissionId);
        emit({
          status: "graded",
          slow: slowFlipped,
          data: row,
          error: null,
          elapsedMs: elapsed(),
        });
        stop();
        return;
      }

      if (row.status === "failed") {
        const reason = readFailedReason(row);
        markSubmissionFailed(submissionId, reason);
        emit({
          status: "failed",
          slow: slowFlipped,
          data: row,
          error: null,
          elapsedMs: elapsed(),
        });
        stop();
        return;
      }

      // Non-terminal — keep going.
      emit({
        status: slowFlipped ? "in-flight-slow" : "in-flight",
        slow: slowFlipped,
        data: row,
        error: null,
        elapsedMs: elapsed(),
      });
    } else {
      // Transient fetch error — surface it but keep polling.
      emit({
        status: "error",
        slow: slowFlipped,
        data: lastData,
        error: errorMessage,
        elapsedMs: elapsed(),
      });
    }

    // Re-evaluate thresholds *after* the tick too, so the very first
    // post-90s emission already carries `slow=true` on the next cycle.
    checkThresholds();
    scheduleNext();
  };

  const start = (): void => {
    if (started || stopped) return;
    started = true;
    startedAt = now();
    void tick();
  };

  return { start, stop };
}

export interface UsePollSubmissionResult {
  readonly snapshot: PollSubmissionSnapshot;
}

/**
 * Thin React adapter — wires the pure poller into a `useEffect` keyed
 * by `(submissionId, module)`. Pass `null` for `submissionId` to keep
 * the hook idle (e.g. on screens that mount before a submit lands).
 */
export function usePollSubmission(
  submissionId: string | null,
  module: ReadinessModule
): UsePollSubmissionResult {
  const [snapshot, setSnapshot] = useState<PollSubmissionSnapshot>({
    status: "idle",
    slow: false,
    data: null,
    error: null,
    elapsedMs: 0,
  });

  useEffect(() => {
    if (!submissionId) {
      setSnapshot({
        status: "idle",
        slow: false,
        data: null,
        error: null,
        elapsedMs: 0,
      });
      return;
    }
    const poller = createSubmissionPoller({
      submissionId,
      module,
      onUpdate: (next) => setSnapshot(next),
    });
    poller.start();
    return () => poller.stop();
  }, [submissionId, module]);

  return { snapshot };
}
