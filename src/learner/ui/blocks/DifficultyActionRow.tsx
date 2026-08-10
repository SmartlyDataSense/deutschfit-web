"use client";

import clsx from "clsx";

import { AppText } from "@/learner/ui/primitives";

/**
 * `DifficultyActionRow` block — ports `deutschfit-mobile/src/ui/blocks/DifficultyActionRow.tsx`.
 *
 * Four-button row the user taps after revealing a flashcard to grade their
 * own recall (again / hard / good / easy). The rating feeds the SRS
 * scheduler. Each tile shows a softer palette per mobile's TILE_SPEC:
 *   - `again` — warning red @ 80% opacity
 *   - `hard`  — brand gold
 *   - `good`  — success green @ 80% opacity
 *   - `easy`  — coach teal
 *
 * Optional `icons` and `durations` map to the glyph rendered above the
 * label and the time estimate rendered below it. When omitted the tile
 * falls back to the label-only layout.
 */
export type Difficulty = "again" | "hard" | "good" | "easy";

export interface DifficultyActionRowProps {
  readonly labels: Record<Difficulty, string>;
  readonly icons?: Record<Difficulty, string>;
  readonly durations?: Record<Difficulty, string>;
  readonly onSelect: (value: Difficulty) => void;
  readonly disabled?: boolean;
  readonly testID?: string;
}

const ORDER = ["again", "hard", "good", "easy"] as const;

const TILE_BG: Record<Difficulty, string> = {
  again: "bg-warning-red/80",
  hard: "bg-accent-gold",
  good: "bg-success-green/80",
  easy: "bg-coach",
};

export function DifficultyActionRow({
  labels,
  icons,
  durations,
  onSelect,
  disabled = false,
  testID,
}: DifficultyActionRowProps) {
  return (
    <div data-testid={testID} className="flex gap-2">
      {ORDER.map((value) => {
        const icon = icons?.[value];
        const duration = durations?.[value];
        const ariaLabel = duration ? `${labels[value]}, ${duration}` : labels[value];
        return (
          <button
            key={value}
            type="button"
            disabled={disabled}
            aria-label={ariaLabel}
            onClick={() => onSelect(value)}
            className={clsx(
              "flex min-h-[52px] flex-1 flex-col items-center justify-center gap-0.5 rounded-[var(--radius-md)] px-2 py-1 transition disabled:cursor-not-allowed disabled:opacity-50",
              TILE_BG[value]
            )}
          >
            {icon ? (
              <AppText tone="inverse" size="bodyLg" weight="bold" align="center">
                {icon}
              </AppText>
            ) : null}
            <AppText tone="inverse" size="small" weight="semi" align="center">
              {labels[value]}
            </AppText>
            {duration ? (
              <AppText tone="inverse" size="caption" align="center">
                {duration}
              </AppText>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}
