/**
 * App-wide line-icon component (spec §8). Renders a 24×24 icon from
 * `ICON_SPRITE` and tints it via the `color` prop, which the path data
 * picks up through `stroke="currentColor"` / `fill="currentColor"` (the
 * browser resolves `currentColor` from this element's CSS `color`).
 *
 * Mirrors mobile's `Icon.tsx` API surface: `name`, `size` (default 24),
 * `color` (default `currentColor`). Mobile's `accessibilityLabel` prop
 * maps to `label` here — when provided, the icon gets `role="img"` +
 * `aria-label`; otherwise it is decorative (`aria-hidden`).
 */
import { ICON_SPRITE, type IconName } from "./iconSprite";

export interface IconProps {
  readonly name: IconName;
  readonly size?: number;
  readonly color?: string;
  readonly label?: string;
}

export function Icon({ name, size = 24, color = "currentColor", label }: IconProps) {
  const decorative = label === undefined;
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      style={{ color }}
      role={decorative ? undefined : "img"}
      aria-label={decorative ? undefined : label}
      aria-hidden={decorative ? true : undefined}
    >
      {ICON_SPRITE[name]}
    </svg>
  );
}
