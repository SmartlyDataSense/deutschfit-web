/**
 * `SkillScore` / `SKILL_ORDER` / `toSkillScores` — hoisted out of the
 * byte-identical copies in `LesenSessionScreen.tsx` and
 * `HoerenSessionScreen.tsx` (S5 final review carry-over, Task 6.1).
 *
 * Both graded session screens fold a finalize response's
 * `per_competence_report` (already shaped into `CompetenceSkills` by
 * `normaliseReport`) into an ordered `SkillScore[]` for the results
 * hand-off store. The mapping is identical for every module — Lesen,
 * Hören, Schreiben, Sprechen alike — so it belongs in `core/exam`, not
 * duplicated per screen.
 *
 * `SkillModuleKey`/`SkillScore` were previously declared in
 * `src/learner/lesen/resultsStore.ts:28–35` (a narrower, web-local type —
 * NOT mobile's richer `SkillScore` from
 * `deutschfit-mobile/src/features/exam/hooks/useSimulationResults.ts`).
 * Both `lesen/resultsStore.ts` and `hoeren/resultsStore.ts` now
 * type-import from here; `lesen/resultsStore.ts` keeps a re-export since
 * `LesenSessionScreen.tsx` and `HoerenResultsScreen.tsx` still import
 * `SkillScore` from that path.
 */
import type { CompetenceBar, CompetenceSkills } from "@/learner/core/api/mockExam";

export type SkillModuleKey = "lesen" | "hoeren" | "schreiben" | "sprechen";

export interface SkillScore {
  readonly key: SkillModuleKey;
  readonly status: CompetenceBar["status"];
  readonly score: number | null;
  readonly max: number | null;
}

export const SKILL_ORDER: readonly SkillModuleKey[] = ["lesen", "hoeren", "schreiben", "sprechen"];

export function toSkillScores(report: CompetenceSkills): readonly SkillScore[] {
  return SKILL_ORDER.map((key) => ({
    key,
    status: report[key].status,
    score: report[key].score,
    max: report[key].max,
  }));
}
