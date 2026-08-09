"use client";

/**
 * `useHoerenResultsStore` — in-memory results hand-off for Hören (S5 ·
 * Task 5.6).
 *
 * Same module-level zustand hand-off shape as `useLesenResultsStore`
 * (`src/learner/lesen/resultsStore.ts`, S4 · Task 4.9 P7) — Next.js query
 * strings can't carry an object, so the session screen writes this store
 * immediately before `router.push('/{locale}/app/hoeren/results')` and the
 * results page reads it. A hard refresh / direct deep-link onto `/results`
 * finds an empty store and redirects back (the results screen's job, not
 * this module's) — there is no query-string score, by design, same
 * documented deviation from mobile as Lesen's.
 *
 * `mode` is a web-only addition (P9) with no `LesenResultsPayload`
 * equivalent: Hören's results route is shared between the graded
 * mock-exam flow and the Apprendre practice flow (Lesen has no practice
 * results route yet), so the results screen needs to know which one it's
 * rendering — e.g. to gate the "next module" CTA that only makes sense
 * inside a graded mock-exam run.
 *
 * `skills` is a type-only import of `SkillScore` from
 * `@/learner/core/exam/skillScores` (Task 6.1 — re-homed from
 * `@/learner/lesen/resultsStore`) — deliberately reused rather than
 * redeclared, since it is already a web-local (S4) type, not mobile's
 * richer `SkillScore` (see that module's doc comment).
 */
import { create } from "zustand";

import type { SessionScore } from "@/learner/core/exam/engine/scoring";
import type { SkillScore } from "@/learner/core/exam/skillScores";

/** Which flow produced this hand-off — graded mock exam or Apprendre practice. */
export type HoerenResultsMode = "practice" | "graded";

export interface HoerenResultsPayload {
  readonly submissionId: string;
  readonly score: SessionScore;
  readonly skills?: readonly SkillScore[];
  readonly attemptId?: string;
  readonly mode: HoerenResultsMode;
}

interface HoerenResultsState {
  readonly payload: HoerenResultsPayload | null;
  readonly set: (payload: HoerenResultsPayload) => void;
  readonly clear: () => void;
}

export const useHoerenResultsStore = create<HoerenResultsState>((set) => ({
  payload: null,
  set: (payload) => set({ payload }),
  clear: () => set({ payload: null }),
}));
