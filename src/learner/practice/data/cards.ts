/**
 * Skill cards for the Apprendre tab. Port of
 * `deutschfit-mobile/src/features/apprendre/data/cards.ts` — same
 * `SkillCard` type, same card ordering.
 *
 * Web S4 deviation from mobile's current flags (Task 4.5): mobile has
 * `sprechen`/`schreiben`/`hoeren`/`lesen`/`sprachbausteine` all active
 * (only `srs` disabled) because those surfaces already ship on mobile.
 * The web learner app only has the Lesen + Sprachbausteine practice hub
 * this slice — Sprechen/Schreiben/Hören have no web surface yet — so
 * those three plus `srs` render as disabled "Bientôt" tiles here.
 * Re-activating a card is the same one-line flip mobile documents: set
 * `active: true` once that skill's web slice ships.
 */
export type SkillCard = {
  id: "schreiben" | "lesen" | "sprachbausteine" | "hoeren" | "sprechen" | "srs";
  active: boolean;
};

export const skillCards: SkillCard[] = [
  { id: "sprechen", active: false },
  { id: "schreiben", active: false },
  { id: "hoeren", active: false },
  { id: "lesen", active: true },
  { id: "sprachbausteine", active: true },
  { id: "srs", active: false },
];
