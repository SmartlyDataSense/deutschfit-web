"use client";

/**
 * `SettingsPickerRow<T>` — web port of
 * `mobile/src/features/settings/components/SettingsPickerRow.tsx`.
 * Trigger row (min-h-14, gold border when dirty) + option dialog.
 * testID contract (mobile parity): `-trigger`, `-modal`, `-backdrop`,
 * `-${optionValue}`. Overlay markup mirrors the established web
 * dropdown in `src/learner/onboarding/screens/ExamTypeScreen.tsx`.
 */
import { useState } from "react";
import clsx from "clsx";

import { AppText } from "@/learner/ui/primitives";

export interface PickerOption<T extends string> {
  readonly value: T;
  readonly label: string;
  readonly caveat?: string;
  readonly disabled?: boolean;
}

export interface SettingsPickerRowProps<T extends string> {
  readonly label: string;
  readonly value: T;
  readonly options: readonly PickerOption<T>[];
  readonly onChange: (value: T) => void;
  readonly testID: string;
  readonly accessibilityHint?: string;
  readonly disabled?: boolean;
  readonly dirty?: boolean;
}

export function SettingsPickerRow<T extends string>({
  label,
  value,
  options,
  onChange,
  testID,
  accessibilityHint,
  disabled = false,
  dirty = false,
}: SettingsPickerRowProps<T>) {
  const [open, setOpen] = useState(false);
  const selected = options.find((option) => option.value === value);

  return (
    <div data-testid={testID}>
      <button
        type="button"
        data-testid={`${testID}-trigger`}
        onClick={() => setOpen(true)}
        disabled={disabled}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={accessibilityHint ?? label}
        className={clsx(
          "flex min-h-14 w-full items-center justify-between gap-3 rounded-[var(--radius-md)] border bg-bg-card px-4 py-3 text-left transition",
          dirty ? "border-accent-gold" : "border-line-strong",
          disabled ? "cursor-not-allowed opacity-50" : "hover:opacity-90"
        )}
      >
        <AppText size="small" tone="secondary">
          {label}
        </AppText>
        <span className="flex items-center gap-2">
          <AppText size="body" weight="medium" tone="primary">
            {selected?.label ?? value}
          </AppText>
          <AppText size="small" tone="tertiary" aria-hidden="true">
            ▾
          </AppText>
        </span>
      </button>

      {open ? (
        <div
          data-testid={`${testID}-backdrop`}
          className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--color-premium-black)]/60 p-4"
          onClick={() => setOpen(false)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label={label}
            data-testid={`${testID}-modal`}
            className="max-h-[70vh] w-full max-w-sm overflow-y-auto rounded-[var(--radius-lg)] bg-bg-card p-4"
            onClick={(event) => event.stopPropagation()}
          >
            <AppText size="caption" weight="semi" tone="tertiary" className="uppercase">
              {label}
            </AppText>
            <div className="mt-3 flex flex-col gap-1" role="radiogroup" aria-label={label}>
              {options.map((option) => {
                const isSelected = option.value === value;
                return (
                  <button
                    key={option.value}
                    type="button"
                    role="radio"
                    aria-checked={isSelected}
                    data-testid={`${testID}-${option.value}`}
                    disabled={option.disabled}
                    onClick={() => {
                      if (option.disabled) return;
                      onChange(option.value);
                      setOpen(false);
                    }}
                    className={clsx(
                      "flex w-full items-center justify-between gap-3 rounded-xl px-3 py-3 text-left transition",
                      isSelected ? "bg-bg-hero" : "hover:bg-cream-deep",
                      option.disabled && "cursor-not-allowed opacity-40"
                    )}
                  >
                    <span className="min-w-0 flex-1">
                      <AppText size="body" weight={isSelected ? "semi" : "regular"} tone="primary">
                        {option.label}
                      </AppText>
                      {option.caveat ? (
                        <AppText size="caption" tone="secondary">
                          {option.caveat}
                        </AppText>
                      ) : null}
                    </span>
                    {isSelected ? (
                      <AppText size="body" tone="gold" aria-hidden="true">
                        ✓
                      </AppText>
                    ) : null}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
