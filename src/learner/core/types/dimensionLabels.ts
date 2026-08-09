/**
 * Maps every grader dimension key to its display labels.
 *
 * Keys come from `dimension_scores[].key` in `UnifiedFeedbackJson`. All
 * rubric profiles in `task_profiles.py` use a subset of these keys — the
 * map covers every key that any profile can emit so screen code never needs
 * to hard-code a label string.
 *
 * Label lookup: `DIMENSION_LABEL_MAP[key] ?? DIMENSION_LABEL_FALLBACK`
 *
 * Ported verbatim (values byte-for-byte) from
 * `deutschfit-mobile/src/core/types/dimensionLabels.ts:12-59`.
 */

export type DimensionLabel = {
  readonly labelGerman: string;
  readonly labelFrench: string;
};

export const DIMENSION_LABEL_MAP: Record<string, DimensionLabel> = {
  // Shared across all unified profiles
  aufgabe: {
    labelGerman: "Erfüllung der Aufgabe",
    labelFrench: "Réalisation de la tâche",
  },
  // ECL 5-criterion (writing + speaking)
  register: {
    labelGerman: "Register",
    labelFrench: "Registre",
  },
  // Speaking profiles — audio-graded only (blocked from transcript by validator)
  aussprache: {
    labelGerman: "Aussprache",
    labelFrench: "Prononciation",
  },
  // Goethe-B1 Schreiben (spec §8)
  erfuellung: {
    labelGerman: "Erfüllung",
    labelFrench: "Réalisation de la tâche",
  },
  kohaerenz: { labelGerman: "Kohärenz", labelFrench: "Cohérence" },
  wortschatz: { labelGerman: "Wortschatz", labelFrench: "Vocabulaire" },
  strukturen: { labelGerman: "Strukturen", labelFrench: "Grammaire" },
  // telc-B2 Schreiben (spec §8)
  inhalt: {
    labelGerman: "Inhaltliche Angemessenheit",
    labelFrench: "Contenu",
  },
  kommunikative_gestaltung: {
    labelGerman: "Kommunikative Gestaltung",
    labelFrench: "Communication",
  },
  formale_richtigkeit: {
    labelGerman: "Formale Richtigkeit",
    labelFrench: "Correction de la langue",
  },
};

export const DIMENSION_LABEL_FALLBACK: DimensionLabel = {
  labelGerman: "Kompetenz",
  labelFrench: "Compétence",
};
