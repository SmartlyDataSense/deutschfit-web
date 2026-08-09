/**
 * `useReadinessSignal` — Accueil hook that subscribes to the
 * cross-feature `readinessStore` and feeds the home `<StatusStrip />`.
 *
 * Ports `deutschfit-mobile/src/features/accueil/hooks/useReadinessSignal.ts`
 * verbatim (S3 · Task 3.6) — zero RN imports, only the client import path
 * changes (`@core/readiness` → `@/learner/core/readiness`).
 *
 * Responsibilities:
 *   - Subscribe to `subscribeReadiness(...)` so any push receiver, poll
 *     worker, or feedback-screen ack triggers a re-render of the home
 *     surface (single-source-of-truth — the same store that drives the
 *     Hero pulse).
 *   - Track a stable `shownAt` epoch so the strip can compute the
 *     latency reported in the `strip_ready` analytics event without
 *     reaching back to the store. The timer resets when the slot's
 *     `submissionId` flips so a fresh submit gets a fresh stopwatch.
 *
 * The hook does not own analytics emission — the consumer
 * (`<StatusStrip />`) decides whether the visible-state transition
 * deserves an emit (de-duped vs. mount, vs. slot change). The hook just
 * surfaces the timestamp so the consumer can stamp the latency.
 *
 * Test seam: `_signal` lets logic tests inject a deterministic slot
 * without mounting the real store / subscribing.
 */
import { useEffect, useRef, useState } from "react";

import { getReadiness, subscribeReadiness, type ReadinessSignal } from "@/learner/core/readiness";

export interface UseReadinessSignalResult {
  /** Current readiness slot — `null` when no submission is in scope. */
  readonly signal: ReadinessSignal | null;
  /**
   * `Date.now()` epoch at which the StatusStrip first surfaced the
   * current submission. Resets when `signal.submissionId` changes;
   * stays stable across re-renders for the same slot. `null` when
   * `signal === null` (the strip is hidden).
   */
  readonly shownAt: number | null;
}

export interface UseReadinessSignalArgs {
  /**
   * Test seam — inject a deterministic slot so unit tests don't have
   * to drive the real store. When provided, the hook short-circuits
   * the subscription and reflects this value verbatim.
   */
  readonly _signal?: ReadinessSignal | null;
  /**
   * Test seam — inject a deterministic clock. Defaults to `Date.now`.
   * Pass a stub returning a monotonically increasing integer to
   * exercise the latency computation deterministically.
   */
  readonly _now?: () => number;
}

export function useReadinessSignal(args: UseReadinessSignalArgs = {}): UseReadinessSignalResult {
  const now = args._now ?? Date.now;

  const [signal, setSignal] = useState<ReadinessSignal | null>(() =>
    args._signal !== undefined ? args._signal : getReadiness()
  );

  // Subscribe to live store transitions. The test seam short-circuits
  // by skipping the subscription entirely; the slot stays whatever the
  // caller injected.
  useEffect(() => {
    if (args._signal !== undefined) return undefined;
    setSignal(getReadiness());
    const unsubscribe = subscribeReadiness((next) => {
      setSignal(next);
    });
    return unsubscribe;
  }, [args._signal]);

  // Reflect injected slots into local state when the test prop changes
  // between renders. Cheap: `setSignal` is a no-op when reference-equal.
  useEffect(() => {
    if (args._signal !== undefined) {
      setSignal(args._signal);
    }
  }, [args._signal]);

  // Track the shown-at epoch keyed by submissionId. Using a ref lets us
  // keep a stable timestamp across re-renders for the same slot without
  // triggering an extra render when we stamp it.
  const shownAtRef = useRef<{ submissionId: string; at: number } | null>(null);
  let shownAt: number | null = null;
  if (signal) {
    if (!shownAtRef.current || shownAtRef.current.submissionId !== signal.submissionId) {
      shownAtRef.current = { submissionId: signal.submissionId, at: now() };
    }
    shownAt = shownAtRef.current.at;
  } else {
    shownAtRef.current = null;
  }

  return { signal, shownAt };
}
