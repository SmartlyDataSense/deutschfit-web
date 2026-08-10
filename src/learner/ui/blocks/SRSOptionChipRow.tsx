"use client";

import clsx from "clsx";

import { AppText, type AppTextTone } from "@/learner/ui/primitives";

/**
 * `SRSOptionChipRow` block — ports `deutschfit-mobile/src/ui/blocks/SRSOptionChipRow.tsx`.
 *
 * Options laid out in a wrapping row of radio chips. Each chip reflects
 * selection + correctness:
 *   - revealed + correct → coach bg with a trailing "✓"
 *   - selected + wrong    → amber bg (not red — "not quite", not "error")
 *   - default             → bg-card with a soft border
 *   - unselected after reveal → soft border, tertiary text
 *
 * The parent owns the selected id / revealed state.
 */
export interface SRSOption {
  readonly id: string;
  readonly label: string;
  readonly isCorrect: boolean;
}

export interface SRSOptionChipRowProps {
  readonly options: readonly SRSOption[];
  readonly selectedId?: string;
  readonly revealed?: boolean;
  readonly onSelect: (optionId: string) => void;
  readonly testID?: string;
}

interface ChipSpec {
  readonly className: string;
  readonly tone: AppTextTone;
  readonly suffix?: string;
}

function resolveSpec(option: SRSOption, selected: boolean, revealed: boolean): ChipSpec {
  if (revealed && option.isCorrect) {
    return {
      className: "border-coach bg-coach",
      tone: "inverse",
      suffix: "✓",
    };
  }
  if (selected && !option.isCorrect) {
    return {
      className: "border-priority-amber bg-priority-amber",
      tone: "primary",
    };
  }
  if (revealed) {
    return {
      className: "border-line-soft bg-bg-card",
      tone: "tertiary",
    };
  }
  return {
    className: "border-line-soft bg-bg-card",
    tone: "primary",
  };
}

export function SRSOptionChipRow({
  options,
  selectedId,
  revealed = false,
  onSelect,
  testID,
}: SRSOptionChipRowProps) {
  return (
    <div role="radiogroup" data-testid={testID} className="flex flex-wrap gap-2">
      {options.map((option) => {
        const isSelected = option.id === selectedId;
        const spec = resolveSpec(option, isSelected, revealed);
        return (
          <button
            key={option.id}
            type="button"
            role="radio"
            aria-checked={isSelected}
            onClick={() => onSelect(option.id)}
            className={clsx(
              "rounded-[var(--radius-full)] border px-4 py-2 transition hover:opacity-90",
              spec.className
            )}
          >
            <AppText tone={spec.tone} size="body" weight="semi">
              {spec.suffix ? `${option.label} ${spec.suffix}` : option.label}
            </AppText>
          </button>
        );
      })}
    </div>
  );
}
