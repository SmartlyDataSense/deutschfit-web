/**
 * `BrandMark` — ports `deutschfit-mobile/src/ui/primitives/BrandMark.tsx`.
 *
 * Plain `<img>` for the DeutschFit monogram PNG (not the icon-sprite glyph
 * set — this is the actual brand asset, byte-copied from mobile into
 * `public/brand/`). `next/image` adds no value for a small, fixed-size,
 * decorative PNG and complicates unit testing (it rewrites `src` to a
 * loader URL), so this stays a plain `<img>`.
 */
export type BrandTone = "onCream" | "onDark";

export interface BrandMarkProps {
  readonly tone?: BrandTone;
  readonly size?: number;
  readonly alt?: string;
  readonly testID?: string;
}

// Dark mark reads on light (cream) surfaces; cream mark reads on dark
// (premium) surfaces — tone names the surface the mark sits on, not the
// mark's own color.
const SOURCES: Record<BrandTone, string> = {
  onCream: "/brand/monogram-dark.png",
  onDark: "/brand/monogram-cream.png",
};

export function BrandMark({
  tone = "onCream",
  size = 64,
  alt = "DeutschFit",
  testID,
}: BrandMarkProps) {
  // eslint-disable-next-line @next/next/no-img-element -- static brand PNG, fixed size, no optimization needed
  return <img src={SOURCES[tone]} width={size} height={size} alt={alt} data-testid={testID} />;
}
