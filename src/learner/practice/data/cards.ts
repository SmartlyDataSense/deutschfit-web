/**
 * Skill cards for the Apprendre tab. Port of
 * `deutschfit-mobile/src/features/apprendre/data/cards.ts` — same
 * `SkillCard` type, same card ordering.
 *
 * Web S4 deviation from mobile's current flags (Task 4.5): mobile has
 * `sprechen`/`schreiben`/`hoeren`/`lesen`/`sprachbausteine` all active
 * (only `srs` disabled) because those surfaces already ship on mobile.
 * The web learner app only had the Lesen + Sprachbausteine practice hub
 * as of S4 — Sprechen/Schreiben/Hören had no web surface yet — so those
 * three plus `srs` rendered as disabled "Bientôt" tiles.
 * Re-activating a card is the same one-line flip mobile documents: set
 * `active: true` once that skill's web slice ships. Task 5.5 does that
 * for `hoeren` — its practice hub row now routes through the same
 * `/{locale}/app/apprendre/practice` destination as `lesen`/
 * `sprachbausteine` (`ApprendreScreen.handlePress` doesn't branch on
 * card id).
 */
export type SkillCard = {
  id: "schreiben" | "lesen" | "sprachbausteine" | "hoeren" | "sprechen" | "srs";
  active: boolean;
};

export const skillCards: SkillCard[] = [
  { id: "sprechen", active: false },
  { id: "schreiben", active: false },
  { id: "hoeren", active: true },
  { id: "lesen", active: true },
  { id: "sprachbausteine", active: true },
  { id: "srs", active: false },
];
