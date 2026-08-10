/**
 * `useDrillChainStore` — non-persisted zustand handoff store between the
 * Coach chat screen and the drill-chain runner (S9 · Task 9.5, created
 * here per the task-9.4 brief's build-order note so both tasks compile
 * independently — this task only *reads* `pendingSummary` /
 * `consumePendingSummary`; the drill-chain screen (9.5/9.6) is the writer
 * of both `launch` and `pendingSummary`).
 *
 * Mirrors, in store form, what mobile threads through React Navigation
 * params (`CoachStackParamList` in
 * `deutschfit-mobile/src/features/coach/navigation.tsx`):
 *
 *   - `CoachChat -> CoachDrillChain`: mobile passes `{threadId,
 *     observationId, connectors, drills}` as route params. The web
 *     drill-chain route carries no such params in its URL (Task 9.4's
 *     CTA press only pushes `${base}/coach/drill-chain`), so the launch
 *     payload is written here immediately before the `router.push` and
 *     read by the drill-chain screen on mount — same handoff shape as
 *     `useTopicHandoff` (`src/learner/sprechen/topicHandoffStore.ts`).
 *   - `CoachDrillChain -> CoachChat`: mobile passes back a one-shot
 *     `pendingDrillSummary` route param that the chat screen consumes
 *     once and clears via `navigation.setParams`. The web chat screen
 *     has no navigation params to clear, so the drill-chain screen
 *     writes `pendingSummary` here before navigating back, and the chat
 *     screen's `ChatContent` calls `consumePendingSummary()` once (read
 *     + clear in a single atomic step) to materialise the in-thread
 *     summary bubble — same "read once, clear immediately" contract as
 *     mobile's param-clearing, without a navigation-params round trip.
 *
 * Not persisted (no localStorage/Dexie backing) — same rationale as
 * `useTopicHandoff`: a refresh or deep-link straight onto
 * `/coach/drill-chain` or `/coach/chat/:id` finds empty state here by
 * design, never a resurrected stale handoff from a previous session.
 */
import { create } from "zustand";

import type { DrillTemplate } from "./planApi";

/**
 * Payload written by the Coach chat screen's drill-CTA press handler,
 * read by the drill-chain screen on mount to build its chain without a
 * second network round-trip. Mirrors mobile's `CoachDrillChain` route
 * params exactly (`deutschfit-mobile/src/features/coach/navigation.tsx`).
 */
export type DrillChainLaunch = {
  readonly threadId: string;
  readonly observationId: string;
  readonly connectors: readonly string[];
  /**
   * Server-generated drill templates from `coach-weekly-plan.drills`.
   * Empty when the backend cache row predates drills or the plan is a
   * no-data fallback — the drill screen falls back to its own local
   * template set in that case (mirrors mobile's F12 comment).
   */
  readonly drills: readonly DrillTemplate[];
};

/**
 * One-shot payload handed back from the drill chain into the chat so the
 * chat screen can append a "drill completed" summary bubble. The `id` is
 * unique per chain run so the chat screen can dedupe replays (e.g.
 * double-mounts in dev / StrictMode) and the bubble carries a stable
 * identity. Mirrors mobile's `PendingDrillSummary` type exactly.
 */
export type PendingDrillSummary = {
  readonly id: string;
  readonly correct: number;
  readonly total: number;
};

interface DrillChainStore {
  readonly launch: DrillChainLaunch | null;
  readonly pendingSummary: PendingDrillSummary | null;
  /** Written by the chat screen's drill-CTA press handler. */
  readonly setLaunch: (launch: DrillChainLaunch) => void;
  /** Written by the drill-chain screen once its chain is consumed. */
  readonly clearLaunch: () => void;
  /** Written by the drill-chain screen before navigating back to chat. */
  readonly setPendingSummary: (summary: PendingDrillSummary) => void;
  /**
   * Read + clear in one atomic step. Returns the pending summary (or
   * `null` if there was none) so the caller can append the bubble
   * without a separate `clearPendingSummary()` call racing a re-render.
   */
  readonly consumePendingSummary: () => PendingDrillSummary | null;
}

export const useDrillChainStore = create<DrillChainStore>((set, get) => ({
  launch: null,
  pendingSummary: null,
  setLaunch: (launch) => set({ launch }),
  clearLaunch: () => set({ launch: null }),
  setPendingSummary: (summary) => set({ pendingSummary: summary }),
  consumePendingSummary: () => {
    const current = get().pendingSummary;
    if (current !== null) {
      set({ pendingSummary: null });
    }
    return current;
  },
}));

/** Test-only escape hatch to reset the module-level zustand store between tests. */
export function __resetDrillChainStoreForTests(): void {
  useDrillChainStore.setState({ launch: null, pendingSummary: null });
}
