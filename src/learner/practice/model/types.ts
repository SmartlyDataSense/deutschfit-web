/**
 * Practice-surface domain types (§6.5/§6.6). Port of
 * `deutschfit-mobile/src/features/practice/model/types.ts`.
 *
 * `PracticeModality` spans every module reachable from the Übungen hub —
 * Lesen, Sprachbausteine, and (Task 5.5) Hören. Schreiben still routes
 * through its own not-yet-built surface and stays outside this union.
 *
 * `TextPracticeModality` is the narrower subset that the shared,
 * lock-based practice session screen actually serves (Lesen,
 * Sprachbausteine). Hören is deliberately excluded — Hören practice
 * persists nothing to `practice_progress` (P13) — so this type is the
 * compile-time proof that `usePracticeSession`, `PracticeSessionScreen`,
 * and their `practice_progress` call sites can never receive `"hoeren"`.
 */
export type PracticeModality = "lesen" | "sprachbausteine" | "hoeren";

export type TextPracticeModality = "lesen" | "sprachbausteine";

export const MODULE_BY_MODALITY: Readonly<
  Record<PracticeModality, "LESEN" | "SPRACHBAUSTEINE" | "HOEREN">
> = {
  lesen: "LESEN",
  sprachbausteine: "SPRACHBAUSTEINE",
  hoeren: "HOEREN",
} as const;
