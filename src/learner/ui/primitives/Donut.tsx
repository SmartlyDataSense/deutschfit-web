import type { ReactNode } from "react";
import clsx from "clsx";

/**
 * `Donut` — ports `deutschfit-mobile/src/ui/primitives/Donut.tsx`'s API
 * (same `value` / `segments` 2-arc shape: a track arc + a value arc, or
 * one arc per segment) but renders real SVG arcs instead of mobile's
 * Phase-1 `borderColor` rotation hack — the web has no `react-native-svg`
 * dependency constraint, so there's no reason to fake it here.
 *
 * `describeArc` / `arcPath` are exported as pure functions so the arc
 * math (0% / 50% / 100%) can be unit-tested without rendering.
 */
export type DonutTone = "cta" | "coach" | "success" | "gold";

export type DonutSegmentTone = "teal" | "amber" | "neutral";

export interface DonutSegment {
  readonly value: number;
  readonly tone: DonutSegmentTone;
}

export interface DonutProps {
  readonly value?: number;
  readonly segments?: readonly DonutSegment[];
  readonly size?: number;
  readonly stroke?: number;
  readonly tone?: DonutTone;
  readonly children?: ReactNode;
  readonly className?: string;
  readonly testID?: string;
}

const TONE_VAR: Record<DonutTone, string> = {
  cta: "var(--color-cta)",
  coach: "var(--color-coach)",
  success: "var(--color-success-green)",
  gold: "var(--color-accent-gold)",
};

const SEGMENT_TONE_VAR: Record<DonutSegmentTone, string> = {
  teal: "var(--color-coach)",
  amber: "var(--color-priority-amber)",
  neutral: "var(--color-line-soft)",
};

const TRACK_VAR = "var(--color-line-soft)";

export function clamp01(n: number): number {
  if (Number.isNaN(n)) return 0;
  if (n < 0) return 0;
  if (n > 1) return 1;
  return n;
}

/** Round to 3 decimal places, stripping floating-point noise. */
function round(n: number): number {
  return Math.round(n * 1000) / 1000;
}

export interface Point {
  readonly x: number;
  readonly y: number;
}

/** Point on a circle of radius `r` centred at `(cx, cy)`, `angleDeg`
 * clockwise from 12 o'clock (so 0deg is the top, matching mobile's
 * ring which starts its arc at the top). */
export function polarToCartesian(cx: number, cy: number, r: number, angleDeg: number): Point {
  const rad = ((angleDeg - 90) * Math.PI) / 180;
  return { x: round(cx + r * Math.cos(rad)), y: round(cy + r * Math.sin(rad)) };
}

/** SVG path `d` for the arc from `startAngle` to `endAngle` (degrees,
 * clockwise from 12 o'clock) on a circle of radius `r` centred at
 * `(cx, cy)`. A full 360deg arc is degenerate in SVG (start === end), so
 * the end is clamped just short of a full turn. */
export function describeArc(
  cx: number,
  cy: number,
  r: number,
  startAngle: number,
  endAngle: number
): string {
  const clampedEnd = Math.min(endAngle, startAngle + 359.999);
  const start = polarToCartesian(cx, cy, r, clampedEnd);
  const end = polarToCartesian(cx, cy, r, startAngle);
  const largeArcFlag = clampedEnd - startAngle <= 180 ? 0 : 1;
  return `M ${start.x} ${start.y} A ${r} ${r} 0 ${largeArcFlag} 0 ${end.x} ${end.y}`;
}

/** Path for a ring arc spanning `[0, fraction * 360deg]`. Returns "" for
 * `fraction <= 0` (nothing to draw). */
export function arcPath(size: number, stroke: number, fraction: number): string {
  const clamped = clamp01(fraction);
  if (clamped <= 0) return "";
  const r = (size - stroke) / 2;
  const c = size / 2;
  return describeArc(c, c, r, 0, clamped * 360);
}

export function Donut({
  value,
  segments,
  size = 160,
  stroke = 16,
  tone = "cta",
  children,
  className,
  testID,
}: DonutProps) {
  const r = (size - stroke) / 2;
  const c = size / 2;

  let fraction: number;
  let arcs: ReactNode;

  if (segments && segments.length > 0) {
    // Cumulative fraction per segment, drawn biggest-cumulative-first so
    // earlier segments occlude the tail of later ones (same paint order
    // as mobile's stacked-arc technique).
    const cumulative = segments.map((seg, index) =>
      clamp01(segments.slice(0, index + 1).reduce((sum, s) => sum + clamp01(s.value), 0))
    );
    fraction = clamp01(cumulative[cumulative.length - 1] ?? 0);
    const order = segments
      .map((seg, index) => ({ index, tone: seg.tone, cumulative: cumulative[index] ?? 0 }))
      .sort((a, b) => b.cumulative - a.cumulative);
    arcs = order.map(({ index, tone: segTone, cumulative: cum }) => (
      <path
        key={`seg-${index}-${segTone}`}
        d={arcPath(size, stroke, cum)}
        stroke={SEGMENT_TONE_VAR[segTone]}
        strokeWidth={stroke}
        fill="none"
      />
    ));
  } else {
    fraction = clamp01(value ?? 0);
    arcs = (
      <path
        d={arcPath(size, stroke, fraction)}
        stroke={TONE_VAR[tone]}
        strokeWidth={stroke}
        fill="none"
      />
    );
  }

  return (
    <div
      data-testid={testID}
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={1}
      aria-valuenow={fraction}
      className={clsx("relative inline-flex items-center justify-center", className)}
      style={{ width: size, height: size }}
    >
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <circle cx={c} cy={c} r={r} stroke={TRACK_VAR} strokeWidth={stroke} fill="none" />
        {arcs}
      </svg>
      {children ? (
        <div className="absolute inset-0 flex items-center justify-center">{children}</div>
      ) : null}
    </div>
  );
}
