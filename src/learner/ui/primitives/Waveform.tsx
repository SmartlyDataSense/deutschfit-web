import clsx from "clsx";

/**
 * `Waveform` — ports `deutschfit-mobile/src/ui/primitives/Waveform.tsx`.
 * Renders a static bar pattern driven by `levels` (0–1 amplitudes),
 * resampled to exactly `bars` bars (nearest-index sampling — pads when
 * `levels` is shorter than `bars`, subsamples/truncates when longer;
 * identical algorithm to mobile).
 *
 * Default bar count is 45 (web spec) rather than mobile's 32 default —
 * an intentional, wider recorder window; the resampling algorithm itself
 * is unchanged.
 */
export type WaveformTone = "cta" | "coach" | "premium";

export interface WaveformProps {
  readonly levels?: readonly number[];
  readonly tone?: WaveformTone;
  readonly height?: number;
  readonly bars?: number;
  readonly className?: string;
  readonly testID?: string;
}

const DEFAULT_BARS = 45;

const TONE_VAR: Record<WaveformTone, string> = {
  cta: "var(--color-cta)",
  coach: "var(--color-coach)",
  premium: "var(--color-on-premium)",
};

function clamp01(n: number): number {
  if (Number.isNaN(n)) return 0;
  if (n < 0) return 0;
  if (n > 1) return 1;
  return n;
}

/** Smooth sin-like pattern between 0.25 and 0.9 so the idle state reads
 * as "ready to record" rather than silent — same formula as mobile,
 * generated for the requested bar count instead of a fixed 32. */
function idlePattern(bars: number): number[] {
  return Array.from({ length: bars }, (_, i) => {
    const t = i / bars;
    return 0.4 + 0.35 * Math.abs(Math.sin(t * Math.PI * 2));
  });
}

/** Resample `source` to exactly `bars` values via nearest-index lookup —
 * identical algorithm to mobile's Waveform. */
export function resampleLevels(source: readonly number[], bars: number): number[] {
  const data: number[] = [];
  for (let i = 0; i < bars; i += 1) {
    const idx = Math.floor((i / bars) * source.length);
    const v = source[idx] ?? 0.5;
    data.push(clamp01(v));
  }
  return data;
}

export function Waveform({
  levels,
  tone = "cta",
  height = 48,
  bars = DEFAULT_BARS,
  className,
  testID,
}: WaveformProps) {
  const source = levels && levels.length > 0 ? levels : idlePattern(bars);
  const data = resampleLevels(source, bars);

  return (
    <div
      data-testid={testID}
      role="img"
      aria-label="Audio waveform"
      className={clsx("flex items-center justify-between gap-0.5 px-1", className)}
      style={{ height }}
    >
      {data.map((level, i) => (
        <span
          key={i}
          className="learner-waveform-bar w-[3px] rounded-[var(--radius-full)]"
          style={{ backgroundColor: TONE_VAR[tone], height: Math.max(2, level * height) }}
        />
      ))}
    </div>
  );
}
