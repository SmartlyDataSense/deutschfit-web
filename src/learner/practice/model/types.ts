/**
 * Practice-surface domain types (§6.5/§6.6). Port of
 * `deutschfit-mobile/src/features/practice/model/types.ts`.
 *
 * `PracticeModality` covers only the two modalities served by the shared
 * practice session screen this slice builds (Lesen, Sprachbausteine);
 * Hören/Schreiben practice routes through their own existing surfaces.
 */
export type PracticeModality = "lesen" | "sprachbausteine";

export const MODULE_BY_MODALITY: Readonly<Record<PracticeModality, "LESEN" | "SPRACHBAUSTEINE">> = {
  lesen: "LESEN",
  sprachbausteine: "SPRACHBAUSTEINE",
} as const;
