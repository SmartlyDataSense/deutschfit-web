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
 *
 * Never set a text colour through `className` (web#57) — `clsx()` below
 * puts `TONE_CLASS[tone]` before `className` in the emitted `class`
 * attribute, but attribute order has no effect on the CSS cascade. Which
 * rule wins is decided by Tailwind's rule order in the generated
 * stylesheet, which this component does not control and which silently
 * changes across builds. A `className` colour utility can therefore lose
 * to the default `tone="primary"` with no error, no warning, and no
 * visual diff in a quick glance (`IdentityCard.tsx` shipped exactly this
 * way for one release). If the tone you need does not exist yet, add it
 * to `AppTextTone`/`TONE_CLASS` (see `coachInk`, added for the same
 * reason) — that keeps colour resolution inside the one mechanism
 * (`tone`) that is guaranteed to apply.
 */
export type AppTextTone =
  | "primary"
  | "secondary"
  | "tertiary"
  | "inverse"
  | "cta"
  | "ctaLabel"
  | "coach"
  | "coachInk"
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
  // S13 Task 10 (axe sweep): the vivid `text-cta`/`text-coach` brand hues
  // fail WCAG AA as body text on every light surface they actually render
  // on (mirrors mobile's own contrast.test.ts, which documents cta/coach
  // as "decorative only" — never body-text-safe). `-text` are the same
  // hue, darkened to clear AA; see globals.css for the derivation.
  cta: "text-cta-text",
  // #50 (a11y): the compliant learner-scoped label for body text ON TOP
  // of `bg-cta` (AppButton solid / Chip selected) — see
  // `--color-cta-label` in globals.css for the measured derivation.
  // Distinct from `inverse` (still correct everywhere else it's used,
  // e.g. on `bg-bg-premium`) — narrowly scoped to the two cta-background
  // call sites that were actually failing AA.
  ctaLabel: "text-cta-label",
  coach: "text-coach-text",
  // web#57: the on-`bg-coach` ink pairing (white, `--color-coach-ink`) —
  // distinct from `coach` above, which is the darkened AA body-text
  // shade of the same hue for use ON a light surface, not the ink that
  // sits ON a coach-coloured surface. Used by `IdentityCard`'s avatar
  // initial, which previously tried to reach this colour via
  // `className="text-coach-ink"` and silently lost to the default tone.
  coachInk: "text-coach-ink",
  gold: "text-accent-gold",
  // S13 Task 10 (axe sweep): `warning` backs 30+ form-validation-error /
  // destructive-label call sites app-wide, none at the "large text" AA
  // bar — the vivid `text-warning-red` fails AA there; `-text` is the
  // same hue darkened to clear it. See globals.css for the derivation.
  warning: "text-warning-red-text",
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
