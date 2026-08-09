"use client";

/**
 * `useLesenResultsStore` — in-memory results hand-off (S4 · Task 4.9, P7).
 *
 * Mobile passes `SessionScore` + skills through React Navigation params.
 * Next.js query strings can't carry an object, so the web session screen
 * writes this module-level zustand store immediately before
 * `router.push('/{locale}/app/examen/lesen/results')`, and the results
 * page reads it. A hard refresh / direct deep-link onto `/results` finds
 * an empty store and redirects back to `/{locale}/app/examen/lesen`
 * (`LesenResultsScreen`'s job, not this module's) — there is no
 * query-string score, by design (documented deviation from mobile).
 *
 * `skills` carries the finalize branches' `per_competence_report`, folded
 * via `normaliseReport` into the 4-bar `CompetenceSkills` shape and then
 * flattened into `SkillScore[]` rows via `toSkillScores`
 * (`@/learner/core/exam/skillScores` — a narrower, S4-local type — NOT
 * mobile's richer `SkillScore` from
 * `deutschfit-mobile/src/features/exam/hooks/useSimulationResults.ts`,
 * which carries copy metadata this results screen doesn't render yet).
 * Absent on the local-fallback / non-finalize branches.
 *
 * `SkillModuleKey`/`SkillScore` re-homed to `core/exam/skillScores.ts`
 * (Task 6.1, S5 final review carry-over) — re-exported here (not a bare
 * re-declaration) because `LesenSessionScreen.tsx` and
 * `HoerenResultsScreen.tsx` still import `SkillScore` from this path;
 * `hoeren/resultsStore.ts` and `HoerenSessionScreen.tsx` now point at
 * `core/exam/skillScores.ts` directly.
 */
import { create } from "zustand";

import type { SessionScore } from "@/learner/core/exam/engine/scoring";
import type { SkillModuleKey, SkillScore } from "@/learner/core/exam/skillScores";

export type { SkillModuleKey, SkillScore };

export interface LesenResultsPayload {
  readonly submissionId: string;
  readonly score: SessionScore;
  readonly skills?: readonly SkillScore[];
  readonly attemptId?: string;
}

interface LesenResultsState {
  readonly payload: LesenResultsPayload | null;
  readonly set: (payload: LesenResultsPayload) => void;
  readonly clear: () => void;
}

export const useLesenResultsStore = create<LesenResultsState>((set) => ({
  payload: null,
  set: (payload) => set({ payload }),
  clear: () => set({ payload: null }),
}));
