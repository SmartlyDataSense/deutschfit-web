import {
  Icon,
  documentTextOutline as DocumentTextOutline,
  sparklesOutline as SparklesOutline,
} from "@/learner/core/icons";

import type { NavTabIcon } from "./navModel";

export interface NavIconProps {
  readonly icon: NavTabIcon;
  readonly size: number;
  /** CSS color value, e.g. `"var(--color-nav-active)"` — never a hex literal. */
  readonly color: string;
}

/**
 * Renders a `NavTabIcon` — either the custom sprite (`Icon`) or one of the
 * two ported ionicons glyphs. Decorative by design (no `label`/`aria-*`):
 * the wrapping nav link already carries the accessible name (see
 * `TabBar`/`Sidebar`), so labeling the icon too would double-announce it
 * to screen readers.
 *
 * The ionicons glyphs are plain functions that return a `ReactElement`
 * (`ionicons.tsx`), not components — JSX requires a capitalized reference
 * to treat them as such rather than as a literal DOM tag, hence the
 * `as SparklesOutline` import aliases.
 */
export function NavIcon({ icon, size, color }: NavIconProps) {
  if (icon.kind === "sprite") {
    return <Icon name={icon.name} size={size} color={color} />;
  }
  return icon.name === "sparklesOutline" ? (
    <SparklesOutline size={size} color={color} />
  ) : (
    <DocumentTextOutline size={size} color={color} />
  );
}
