import type { HTMLAttributes } from "react";
import clsx from "clsx";

type Tone = "neutral" | "cta" | "coach" | "warning" | "success" | "gold";

const toneClass: Record<Tone, string> = {
  neutral: "bg-cream-deep text-cream-ink",
  cta: "bg-cta text-cta-ink",
  coach: "bg-coach text-coach-ink",
  warning: "bg-warning-red text-white",
  success: "bg-success-green text-white",
  gold: "bg-accent-gold text-accent-gold-ink",
};

type BadgeProps = HTMLAttributes<HTMLSpanElement> & { tone?: Tone };

/** Compact label primitive — used for plan tier, status pills, etc. */
export function Badge({ tone = "neutral", className, ...rest }: BadgeProps) {
  return (
    <span
      className={clsx(
        "inline-flex items-center justify-center rounded-full px-2.5 py-0.5",
        "text-xs font-semibold uppercase tracking-wide",
        toneClass[tone],
        className
      )}
      {...rest}
    />
  );
}
