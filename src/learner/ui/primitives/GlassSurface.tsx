import type { ReactNode } from "react";
import clsx from "clsx";

/**
 * `GlassSurface` — the web spec calls for a real frosted-glass surface
 * (`backdrop-filter: blur` + fallback) rather than mobile's Phase-1 stub
 * (which just re-renders `PremiumCard` — no `expo-blur` dependency yet on
 * RN). The web has no such dependency constraint, so this renders an
 * actual blurred, translucent premium-black surface via the
 * `.learner-glass-surface` utility in `globals.css`, which degrades to an
 * opaque premium-black surface under `@supports not (backdrop-filter)`.
 */
export interface GlassSurfaceProps {
  readonly children: ReactNode;
  readonly padded?: boolean;
  readonly className?: string;
  readonly testID?: string;
}

export function GlassSurface({ children, padded = true, className, testID }: GlassSurfaceProps) {
  return (
    <div
      data-testid={testID}
      className={clsx(
        "learner-glass-surface rounded-[var(--radius-lg)] text-on-premium",
        padded && "p-4",
        className
      )}
    >
      {children}
    </div>
  );
}
