/**
 * Deterministic verdict copy generator for the simulation results screen
 * (S8 · Task 8.2).
 *
 * Verbatim port of `deutschfit-mobile/src/features/exam/verdict.ts` (54L) —
 * export surface, thresholds, and the `COPY` table copy are byte-identical,
 * INCLUDING its brand-voice violations (mixed register between the "vous"
 * pass copy and the "tu" borderline copy, and "Presque !" — both flagged
 * for the ship-task brand-voice issue, not fixed here; Constraint 10
 * exception, P15). Do not rename or add exports: mobile has no
 * `verdictFor` and no exported `VERDICT_COPY` — only `VerdictBand`,
 * `VerdictCopy`, `bandForAccuracy`, `buildVerdict`. `COPY` stays
 * module-local and unexported here exactly as on mobile.
 *
 * The real coach copy is scheduled to come from the backend edge function
 * landing with D3 (`requestPostSessionAnalysis`). Until that ships we use
 * three score-threshold bands to pick a stable French verdict — good enough
 * for UX validation and for QA to click through builds.
 *
 * Pure function. No React, no I/O — safe to test under Node.
 */

export type VerdictBand = "fail" | "borderline" | "pass";

export interface VerdictCopy {
  readonly band: VerdictBand;
  readonly title: string;
  readonly body: string;
}

/** Score bands. Below 50% → fail. 50–69 → borderline. 70+ → pass. */
export function bandForAccuracy(accuracy: number): VerdictBand {
  if (Number.isNaN(accuracy)) return "fail";
  if (accuracy >= 0.7) return "pass";
  if (accuracy >= 0.5) return "borderline";
  return "fail";
}

const COPY: Record<VerdictBand, VerdictCopy> = {
  pass: {
    band: "pass",
    title: "Vous êtes prêt·e.",
    body: "Vous passeriez l'examen aujourd'hui. Consolidez votre niveau avec une session ciblée sur vos 2 points les plus faibles.",
  },
  borderline: {
    band: "borderline",
    title: "Presque !",
    body: "Tu passerais avec 2 bonnes réponses de plus. Reprends les questions ratées avec le Betreuer pour fermer l'écart.",
  },
  fail: {
    band: "fail",
    title: "Pas encore, mais tenez bon.",
    body: "Il manque encore quelques points clés. Attaquez une révision courte sur votre compétence la plus faible pour grimper rapidement.",
  },
};

export function buildVerdict(accuracy: number): VerdictCopy {
  return COPY[bandForAccuracy(accuracy)];
}
