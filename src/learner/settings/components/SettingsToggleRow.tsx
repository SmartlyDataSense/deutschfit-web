"use client";

/**
 * `SettingsToggleRow` — S12. First REAL toggle in the web settings
 * surface. Row markup follows `SettingsPickerRow.tsx` (min-h-14,
 * px-4 py-3, AppText tones, token classes only). The switch is a native
 * <button role="switch" aria-checked> — keyboard-accessible by
 * construction (Enter/Space activate a button natively).
 *
 * Deliberately NOT modelled on SettingsScreen's inert analytics
 * placeholder (<input disabled readOnly> with no handler): that control
 * is a "coming soon" affordance; this one drives a live capability.
 */
import clsx from "clsx";

import { AppText } from "@/learner/ui/primitives";

export interface SettingsToggleRowProps {
  readonly label: string;
  readonly hint?: string;
  readonly checked: boolean;
  readonly onChange: (next: boolean) => void;
  readonly disabled?: boolean;
  readonly testID: string;
}

export function SettingsToggleRow({
  label,
  hint,
  checked,
  onChange,
  disabled = false,
  testID,
}: SettingsToggleRowProps) {
  return (
    <div
      className="flex min-h-14 w-full items-center justify-between gap-3 px-4 py-3"
      data-testid={testID}
    >
      <div className="min-w-0 flex-1">
        <AppText size="body" weight="medium" tone={disabled ? "tertiary" : "primary"}>
          {label}
        </AppText>
        {hint ? (
          <AppText size="caption" tone="tertiary">
            {hint}
          </AppText>
        ) : null}
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        data-testid={`${testID}-toggle`}
        className={clsx(
          "relative h-7 w-12 shrink-0 rounded-full transition-colors",
          checked ? "bg-accent-gold" : "bg-line-strong",
          disabled ? "cursor-not-allowed opacity-50" : "hover:opacity-90"
        )}
      >
        <span
          aria-hidden="true"
          className={clsx(
            "absolute top-1 h-5 w-5 rounded-full bg-bg-card transition-all",
            checked ? "left-6" : "left-1"
          )}
        />
      </button>
    </div>
  );
}
