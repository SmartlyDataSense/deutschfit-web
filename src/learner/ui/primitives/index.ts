/**
 * Barrel export for the learner primitives batch (S0.8). Import path:
 * `@/learner/ui/primitives`. Ports of
 * `deutschfit-mobile/src/ui/primitives/*` — see each file's docstring for
 * what matches mobile 1:1 vs. what's an intentional web deviation.
 */
export { AppText } from "./AppText";
export type {
  AppTextProps,
  AppTextTone,
  AppTextSurface,
  AppTextSize,
  AppTextWeight,
  AppTextFamily,
} from "./AppText";

export { AppButton } from "./AppButton";
export type { AppButtonProps, AppButtonVariant } from "./AppButton";

export { Chip } from "./Chip";
export type { ChipProps } from "./Chip";

export { Card } from "./Card";
export type { CardProps } from "./Card";

export { ProgressBar } from "./ProgressBar";
export type { ProgressBarProps, ProgressBarTone } from "./ProgressBar";

export { TimerPill, formatMs } from "./TimerPill";
export type { TimerPillProps, TimerState } from "./TimerPill";

export { ScoreBadge } from "./ScoreBadge";
export type { ScoreBadgeProps, ScoreBadgeTone } from "./ScoreBadge";

export { Donut, describeArc, arcPath, polarToCartesian, clamp01 } from "./Donut";
export type { DonutProps, DonutTone, DonutSegment, DonutSegmentTone, Point } from "./Donut";

export { SegmentedControl } from "./SegmentedControl";
export type { SegmentedControlProps, SegmentedOption } from "./SegmentedControl";

export { Input } from "./Input";
export type { InputProps } from "./Input";

export { Textarea } from "./Textarea";
export type { TextareaProps } from "./Textarea";

export { Skeleton } from "./Skeleton";
export type { SkeletonBlockProps, SkeletonTextProps, SkeletonCardProps } from "./Skeleton";

export { Waveform, resampleLevels } from "./Waveform";
export type { WaveformProps, WaveformTone } from "./Waveform";

export { GlassSurface } from "./GlassSurface";
export type { GlassSurfaceProps } from "./GlassSurface";
