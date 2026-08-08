import type { ElementType, HTMLAttributes, ReactNode } from "react";
import clsx from "clsx";

/**
 * `AppText` — the canonical learner text primitive. Ports
 * `deutschfit-mobile/src/ui/primitives/AppText.tsx` to the web: same
 * `tone` / `size` / `weight` / `family` / `numeric` contract, but resolves
 * to Tailwind classes (backed by the token CSS vars in `globals.css`)
 * instead of RN `StyleSheet` objects.
 *
 * `surface` is kept for API parity with mobile (it documents the
 * tone/surface AA-contrast pairing) but has no runtime effect here — the
 * web port doesn't yet carry mobile's `contrast.test.ts` harness.
 */
export type AppTextTone =
  | "primary"
  | "secondary"
  | "tertiary"
  | "inverse"
  | "cta"
  | "coach"
  | "gold"
  | "warning"
  | "success";

export type AppTextSurface = "cream" | "creamDeep" | "card" | "premium" | "gold" | "cta" | "coach";

export type AppTextSize = "caption" | "small" | "body" | "bodyLg" | "h3" | "h2" | "h1" | "display";

export type AppTextWeight = "regular" | "medium" | "semi" | "bold";

export type AppTextFamily = "sans" | "serif" | "mono";

export interface AppTextProps extends Omit<HTMLAttributes<HTMLElement>, "color"> {
  readonly children: ReactNode;
  readonly tone?: AppTextTone;
  readonly surface?: AppTextSurface;
  readonly size?: AppTextSize;
  readonly weight?: AppTextWeight;
  readonly family?: AppTextFamily;
  readonly numeric?: boolean;
  readonly align?: "left" | "center" | "right";
  readonly as?: ElementType;
  readonly testID?: string;
}

const TONE_CLASS: Record<AppTextTone, string> = {
  primary: "text-text-primary",
  secondary: "text-text-secondary",
  tertiary: "text-text-tertiary",
  inverse: "text-on-premium",
  cta: "text-cta",
  coach: "text-coach",
  gold: "text-accent-gold",
  warning: "text-warning-red",
  success: "text-success-green",
};

const SIZE_CLASS: Record<AppTextSize, string> = {
  caption: "text-caption",
  small: "text-small",
  body: "text-body",
  bodyLg: "text-body-lg",
  h3: "text-h3",
  h2: "text-h2",
  h1: "text-h1",
  display: "text-display",
};

const WEIGHT_CLASS: Record<AppTextWeight, string> = {
  regular: "font-normal",
  medium: "font-medium",
  semi: "font-semibold",
  bold: "font-bold",
};

const ALIGN_CLASS: Record<"left" | "center" | "right", string> = {
  left: "text-left",
  center: "text-center",
  right: "text-right",
};

const DEFAULT_TAG: Record<AppTextSize, ElementType> = {
  display: "h1",
  h1: "h1",
  h2: "h2",
  h3: "h3",
  bodyLg: "p",
  body: "p",
  small: "p",
  caption: "p",
};

function familyClass(family: AppTextFamily, numeric: boolean): string {
  if (numeric || family === "mono") return "font-mono tabular-nums";
  if (family === "serif") return "font-serif-learner";
  return "font-sans";
}

export function AppText({
  children,
  tone = "primary",
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- kept for API parity with mobile's tone/surface contrast pairing; no runtime effect on web yet.
  surface: _surface,
  size = "body",
  weight = "regular",
  family = "sans",
  numeric = false,
  align,
  as,
  className,
  testID,
  ...rest
}: AppTextProps) {
  const Tag = as ?? DEFAULT_TAG[size];
  return (
    <Tag
      data-testid={testID}
      className={clsx(
        TONE_CLASS[tone],
        SIZE_CLASS[size],
        WEIGHT_CLASS[weight],
        familyClass(family, numeric),
        align ? ALIGN_CLASS[align] : undefined,
        className
      )}
      {...rest}
    >
      {children}
    </Tag>
  );
}
