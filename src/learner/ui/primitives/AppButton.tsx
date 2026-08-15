"use client";

import type { ButtonHTMLAttributes } from "react";
import clsx from "clsx";

import { AppText, type AppTextTone } from "./AppText";

/**
 * `AppButton` — ports `deutschfit-mobile/src/ui/primitives/AppButton.tsx`.
 *
 * Variant names match mobile exactly: `solid` (default) / `outline` /
 * `ghost` / `premium`. Loading swaps the label for a spinner and flips
 * `aria-busy`; disabled blocks the click handler (both natively, via the
 * `disabled` attribute, and defensively in `handleClick`).
 *
 * Hit target: mobile mandates a 52pt minimum (a touch-target choice).
 * The web port uses the WCAG 2.5.5 44px minimum instead (`min-h-11`) —
 * appropriate for a mouse/trackpad surface; intentionally not
 * pixel-identical to mobile.
 */
export type AppButtonVariant = "solid" | "outline" | "ghost" | "premium";

/**
 * The focus-visible ring convention every clickable primitive should use
 * — exported so non-`AppButton` controls (raw `<button>`s that can't take
 * `AppButton`'s own `min-h-11 px-6` layout without changing their row)
 * can reuse it without duplicating the token string. There is no
 * danger-tone ring anywhere in the token system, so destructive controls
 * intentionally take this same CTA-coloured ring — see the S13 Task 5
 * commit body for the precedent.
 */
export const FOCUS_RING_CLASSES =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cta focus-visible:ring-offset-2";

export interface AppButtonProps extends Omit<
  ButtonHTMLAttributes<HTMLButtonElement>,
  "className" | "disabled" | "onClick"
> {
  readonly label: string;
  readonly onClick: () => void;
  readonly variant?: AppButtonVariant;
  readonly loading?: boolean;
  readonly disabled?: boolean;
  readonly className?: string;
  readonly testID?: string;
}

interface VariantSpec {
  readonly bgIdle: string;
  readonly bgDisabled: string;
  readonly toneIdle: AppTextTone;
  readonly toneDisabled: AppTextTone;
}

// Mirrors mobile's VARIANTS table 1:1 (bg / bgDisabled / toneIdle /
// toneDisabled per variant) — including reusing the "inverse" tone for
// solid's onCta label, same as mobile's comment notes.
const VARIANTS: Record<AppButtonVariant, VariantSpec> = {
  solid: {
    bgIdle: "bg-cta hover:opacity-90 active:opacity-80",
    bgDisabled: "bg-line-soft",
    toneIdle: "inverse",
    toneDisabled: "tertiary",
  },
  outline: {
    bgIdle: "bg-transparent border border-line-strong hover:bg-cream-deep",
    bgDisabled: "bg-transparent border border-line-soft",
    toneIdle: "primary",
    toneDisabled: "tertiary",
  },
  ghost: {
    bgIdle: "bg-transparent hover:bg-cream-deep",
    bgDisabled: "bg-transparent",
    toneIdle: "primary",
    toneDisabled: "tertiary",
  },
  premium: {
    bgIdle: "bg-bg-premium hover:opacity-90 active:opacity-80",
    bgDisabled: "bg-line-soft",
    toneIdle: "inverse",
    toneDisabled: "tertiary",
  },
};

export function AppButton({
  label,
  onClick,
  variant = "solid",
  loading = false,
  disabled = false,
  className,
  testID,
  type,
  ...rest
}: AppButtonProps) {
  const isDisabled = disabled || loading;
  const spec = VARIANTS[variant];
  const tone = isDisabled ? spec.toneDisabled : spec.toneIdle;

  function handleClick() {
    if (isDisabled) return;
    onClick();
  }

  return (
    <button
      type={type ?? "button"}
      data-testid={testID}
      disabled={isDisabled}
      aria-busy={loading}
      onClick={handleClick}
      className={clsx(
        "inline-flex min-h-11 items-center justify-center gap-2 rounded-[var(--radius-md)] px-6",
        "transition disabled:cursor-not-allowed",
        FOCUS_RING_CLASSES,
        isDisabled ? spec.bgDisabled : spec.bgIdle,
        className
      )}
      {...rest}
    >
      {loading ? (
        <span
          aria-hidden="true"
          className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent"
        />
      ) : (
        <AppText tone={tone} size="body" weight="semi">
          {label}
        </AppText>
      )}
    </button>
  );
}
