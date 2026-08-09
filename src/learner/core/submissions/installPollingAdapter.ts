/**
 * Top-level submission polling adapter.
 *
 * Ports `deutschfit-mobile/src/core/submissions/installPollingAdapter.ts`
 * verbatim — the module is platform-free (no AsyncStorage / AppState /
 * supabase dependency), so nothing needed to change beyond the import
 * paths.
 *
 * The `usePollSubmission` React hook only runs while the FeedbackScreen
 * (or another consumer) is mounted. After a Schreiben submit, the
 * learner is on Accueil — the StatusStrip subscribes to the readiness
 * store but no poller is running, so a missed / stale push leaves the
 * slot stuck on `in-flight` forever ("On corrige ton expression…"
 * banner that never resolves).
 *
 * This adapter is the always-on companion: it subscribes to the
 * readiness store at app boot and drives a `createSubmissionPoller`
 * for whatever submission is currently `in-flight`. The poller's
 * `markCorrectionReady` / `markSubmissionFailed` calls flip the slot,
 * which the StatusStrip is already watching.
 *
 * Why a separate install (and not baked into the store):
 *   1. The pure store has no transport / network deps. Tests for the
 *      store don't need to mock the API client.
 *   2. Same opt-in seam as `installAcknowledgeAdapter` — a single place
 *      in `LearnerProviders` to wire (or unwire) the side-effect.
 *
 * Single-poller invariant: the readiness store is single-slot per
 * learner, so at most one poller is alive at any time. We track the
 * active key as `<submissionId>:<module>`; a transition to a different
 * (id, module) tears the old poller down before starting the new one.
 *
 * Idempotent on the same in-flight slot: re-emitting `in-flight` for
 * the same submission (e.g. the store's no-op re-emit on retry) does
 * not restart the poller.
 */
import { getReadiness, subscribeReadiness } from "@/learner/core/readiness";
import type { ReadinessSignal } from "@/learner/core/readiness/types";

import { createSubmissionPoller, type SubmissionPoller } from "./usePollSubmission";

function keyFor(signal: ReadinessSignal | null): string | null {
  if (!signal) return null;
  if (signal.state !== "in-flight") return null;
  return `${signal.submissionId}:${signal.module}`;
}

export function installPollingAdapter(): () => void {
  let currentPoller: SubmissionPoller | null = null;
  let currentKey: string | null = null;

  const sync = (signal: ReadinessSignal | null): void => {
    const nextKey = keyFor(signal);
    if (nextKey === currentKey) return;

    if (currentPoller) {
      currentPoller.stop();
      currentPoller = null;
    }
    currentKey = nextKey;

    if (signal && signal.state === "in-flight") {
      const poller = createSubmissionPoller({
        submissionId: signal.submissionId,
        module: signal.module,
        // The adapter is fire-and-forget — readiness transitions are
        // owned by the poller's `markCorrectionReady` /
        // `markSubmissionFailed` calls; the snapshot stream is for
        // screens that want progress data, which Accueil's StatusStrip
        // doesn't.
        onUpdate: () => undefined,
      });
      currentPoller = poller;
      poller.start();
    }
  };

  // Pick up a slot that's synchronously active at install time — e.g. a
  // second adapter install in the same session, after hydration already
  // resolved earlier. This does NOT cover the common boot-restore case:
  // `LearnerProviders` installs this adapter synchronously and only
  // then kicks off `hydrateOnBoot()` without awaiting it (Dexie read +
  // edge-fn fetch), so `getReadiness()` here is still `null` on a fresh
  // load even when a persisted in-flight row is about to be restored.
  // That case is covered below: `hydrateOnBoot()` notifies subscribers
  // once its restore settles (see `readiness/hydrate.ts`'s
  // `applyMerge`), and this `subscribeReadiness(sync)` is already
  // registered by the time that notify fires.
  sync(getReadiness());
  const unsubscribe = subscribeReadiness(sync);

  return () => {
    unsubscribe();
    if (currentPoller) {
      currentPoller.stop();
      currentPoller = null;
    }
    currentKey = null;
  };
}
