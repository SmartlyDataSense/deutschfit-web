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
 * flattened into `SkillScore[]` rows here (a narrower, S4-local type —
 * NOT mobile's richer `SkillScore` from
 * `deutschfit-mobile/src/features/exam/hooks/useSimulationResults.ts`,
 * which carries copy metadata this results screen doesn't render yet).
 * Absent on the local-fallback / non-finalize branches.
 */
import { create } from "zustand";

import type { CompetenceBar } from "@/learner/core/api/mockExam";
import type { SessionScore } from "@/learner/core/exam/engine/scoring";

export type SkillModuleKey = "lesen" | "hoeren" | "schreiben" | "sprechen";

export interface SkillScore {
  readonly key: SkillModuleKey;
  readonly status: CompetenceBar["status"];
  readonly score: number | null;
  readonly max: number | null;
}

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
