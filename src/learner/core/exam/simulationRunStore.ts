"use client";

/**
 * `useSimulationRun` — non-persisted chain accumulator for the full
 * mock-exam simulation (S8 · Task 8.2, P10).
 *
 * Mobile threads the running LESEN/HÖREN outcomes through React Navigation
 * params across the chain; the web orchestrator instead holds them in this
 * module-level zustand store (S4-P7 `useLesenResultsStore` / S5-P9
 * `useHoerenResultsStore` hand-off precedent — see `@/learner/lesen/
 * resultsStore` and `@/learner/hoeren/resultsStore`). Each leg writes its
 * `SubmitModuleResponse`-derived outcome via `recordOutcome` before the
 * chain-continuation redirect (Task 8.5); the orchestrator writes `result`
 * after `finalizeSession` resolves (Task 8.6/8.7); the results screen
 * (Task 8.8) reads both.
 *
 * **Deliberately NOT persisted.** A hard refresh mid-chain loses the
 * accumulated `outcomes`/`durationMinutesTotal` — the results donut then
 * degrades to whatever `getMockAttempt`'s re-read `perCompetenceReport`
 * alone can supply (P9, documented deviation from mobile's persisted
 * navigation-param carry). This is designed behavior, not a bug: the
 * server-side attempt is the source of truth; this store is a same-tab
 * UX optimization, not a durability guarantee.
 *
 * `beginRun` is re-entry-safe: React StrictMode double-invokes effects,
 * and the orchestrator itself may re-run its boot effect on remount
 * (Task 8.6). Calling `beginRun` again with the SAME `mockAttemptId` is a
 * no-op — it must not wipe an already-recorded `lesen` outcome out from
 * under a re-render. Calling it with a DIFFERENT (or previously null)
 * `mockAttemptId` resets `outcomes`/`durationMinutesTotal`/`result` — a
 * new attempt starts a new chain.
 */
import { create } from "zustand";

import type { SkillScore } from "./skillScores";

export type ModuleOutcome = {
  readonly raw: number;
  readonly total: number;
  readonly unanswered: number;
};

export type SimulationRunResult = {
  /**
   * `per_competence_report` jsonb passthrough — matches
   * `FinalizeMockExamResult.perCompetenceReport: unknown`
   * (`@/learner/core/api/mockExam.ts:135`). There is no `PerCompetenceReport`
   * type on web; the results view-model shape-checks this via
   * `normaliseReport` (`@/learner/core/api/examApi`), exactly like the
   * per-leg results stores.
   */
  readonly report: unknown;
  /**
   * `toSkillScores(normaliseReport(report))` —
   * `@/learner/core/exam/skillScores`.
   */
  readonly skills: readonly SkillScore[];
  readonly finalizedAt: string;
};

interface SimulationRunState {
  readonly examSlug: string | null;
  readonly mockAttemptId: string | null;
  readonly outcomes: {
    readonly lesen?: ModuleOutcome;
    readonly hoeren?: ModuleOutcome;
  };
  readonly durationMinutesTotal: number;
  readonly result: SimulationRunResult | null;
  readonly beginRun: (examSlug: string, mockAttemptId: string) => void;
  readonly recordOutcome: (
    module: "lesen" | "hoeren",
    outcome: ModuleOutcome,
    durationMinutes: number
  ) => void;
  readonly setResult: (result: SimulationRunResult) => void;
  readonly clear: () => void;
}

const INITIAL_OUTCOMES: SimulationRunState["outcomes"] = {};

export const useSimulationRun = create<SimulationRunState>((set, get) => ({
  examSlug: null,
  mockAttemptId: null,
  outcomes: INITIAL_OUTCOMES,
  durationMinutesTotal: 0,
  result: null,
  beginRun: (examSlug, mockAttemptId) => {
    if (get().mockAttemptId === mockAttemptId) {
      // Re-entry (StrictMode double-invoke / orchestrator remount) on the
      // SAME attempt — preserve whatever outcomes/result have already
      // accumulated. Only the identity fields are (re)written; they're
      // already equal here, so this is a true no-op on outcomes/result.
      return;
    }
    set({
      examSlug,
      mockAttemptId,
      outcomes: INITIAL_OUTCOMES,
      durationMinutesTotal: 0,
      result: null,
    });
  },
  recordOutcome: (module, outcome, durationMinutes) => {
    set((state) => ({
      outcomes: { ...state.outcomes, [module]: outcome },
      durationMinutesTotal: state.durationMinutesTotal + durationMinutes,
    }));
  },
  setResult: (result) => set({ result }),
  clear: () =>
    set({
      examSlug: null,
      mockAttemptId: null,
      outcomes: INITIAL_OUTCOMES,
      durationMinutesTotal: 0,
      result: null,
    }),
}));
