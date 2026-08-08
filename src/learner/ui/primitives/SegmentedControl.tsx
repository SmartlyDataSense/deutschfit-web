"use client";

import clsx from "clsx";

import { AppText } from "./AppText";

/**
 * `SegmentedControl` — ports
 * `deutschfit-mobile/src/ui/primitives/SegmentedControl.tsx`. iOS-style
 * 2–3 way switch (e.g. the FR/EN language toggle).
 */
export interface SegmentedOption<T extends string> {
  readonly label: string;
  readonly value: T;
}

export interface SegmentedControlProps<T extends string> {
  readonly options: readonly SegmentedOption<T>[];
  readonly value: T;
  readonly onChange: (value: T) => void;
  readonly "aria-label"?: string;
  readonly className?: string;
  readonly testID?: string;
}

export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  "aria-label": ariaLabel,
  className,
  testID,
}: SegmentedControlProps<T>) {
  return (
    <div
      role="group"
      aria-label={ariaLabel}
      data-testid={testID}
      className={clsx(
        "inline-flex rounded-[var(--radius-full)] border border-line-soft bg-bg-hero p-0.5",
        className
      )}
    >
      {options.map((opt) => {
        const active = opt.value === value;
        return (
          <button
            key={opt.value}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(opt.value)}
            className={clsx(
              "min-h-9 flex-1 rounded-[var(--radius-full)] px-4 py-1 transition",
              active ? "bg-cta" : "hover:opacity-75"
            )}
          >
            <AppText
              tone={active ? "inverse" : "secondary"}
              size="small"
              weight="semi"
              align="center"
            >
              {opt.label}
            </AppText>
          </button>
        );
      })}
    </div>
  );
}
