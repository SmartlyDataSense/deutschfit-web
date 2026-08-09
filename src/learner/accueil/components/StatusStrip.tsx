"use client";

/**
 * `<StatusStrip />` — async-result-experience surface. Web port of
 * `deutschfit-mobile/src/features/accueil/components/StatusStrip.tsx`
 * (S3 · Task 3.8).
 *
 * A slim home-screen strip that mounts directly under the Hero card and
 * surfaces the live state of the learner's most recent submission
 * (Schreiben or Sprechen). It mirrors the four-state readiness store
 * machine from `@/learner/core/readiness`:
 *
 *   - `in-flight` — submission posted, grader running. Calm primary copy
 *     ("On corrige ton expression… ⏱ ~1 min"). Not interactive.
 *   - `in-flight + slow` — same submission, ≥90 s elapsed. Warmer warning
 *     palette + "tu peux fermer" copy so the learner doesn't feel pinned.
 *     Still not interactive.
 *   - `ready` — graded payload landed. Success palette + "Voir →" CTA. Tap
 *     fires `onReady(signal)`.
 *   - `failed` — grader gave up, reaper timed out, or push retries
 *     exhausted. Error palette + "Réessayer →" CTA. Tap fires `onRetry()`.
 *
 * Animation: mobile's `Animated.timing` (300 ms ease-out slide-in,
 * translateY 12 → 0 + opacity 0 → 1) becomes a CSS transition here — the
 * strip mounts with `translate-y-3 opacity-0` and an effect keyed on
 * `signal.submissionId` flips it to `translate-y-0 opacity-100` on the
 * next commit, so the browser animates the transition. State changes
 * inside the same slot never re-trigger the slide (only the copy /
 * palette swap via normal React render).
 *
 * Accessibility: `aria-live="polite"` so screen readers announce the new
 * copy when the state flips. `aria-label` is keyed off the canonical
 * state so assistive tech gets a calm, full-sentence summary instead of
 * just the visual copy. The non-interactive states render a
 * `role="group"` container (labeled, non-interactive — see
 * `CountdownHeroCard`'s db952e6 idiom); the interactive states wrap the
 * row in a `<button>` (itself a labeled interactive element, no extra
 * role needed).
 *
 * Analytics:
 *   - `strip_shown` fires once per submission slot, on the first paint
 *     where the strip surfaces the slot.
 *   - `strip_ready` fires once per submission slot, when the slot
 *     transitions into `ready`. Carries `latency_ms_since_strip_shown`.
 *
 * Both events are no-ops on a `null` slot (strip hidden).
 */
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import clsx from "clsx";

import { trackEvent } from "@/learner/core/analytics/posthog";
import { AppText, type AppTextTone } from "@/learner/ui/primitives";

import { useReadinessSignal } from "../hooks/useReadinessSignal";
import type { ReadinessSignal } from "@/learner/core/readiness";

/**
 * The four-state visual contract the strip renders. Internal — derived
 * from the live `ReadinessSignal` so the component never has to
 * re-implement the state machine.
 */
type StripVisualState = "in-flight" | "in-flight-slow" | "ready" | "failed" | "hidden";

export interface StatusStripProps {
  /**
   * Test seam — inject a deterministic readiness slot. When omitted, the
   * strip subscribes to the live `readinessStore` via
   * `useReadinessSignal`.
   */
  readonly _signal?: ReadinessSignal | null;
  /**
   * Test seam — deterministic clock for the latency math + slide-in
   * timer. Defaults to `Date.now`.
   */
  readonly _now?: () => number;
  /**
   * Click handler for the `failed` state. P6 wires this to a real
   * retry-submission flow; this slice ships the prop stub so the
   * failed-tap test can assert it.
   */
  readonly onRetry?: () => void;
  /**
   * Click handler for the `ready` state. Defaults to a no-op so the strip
   * can be unit-tested in isolation; the Accueil screen overrides this
   * with the deep-link router used by the Hero CTA.
   */
  readonly onReady?: (signal: ReadinessSignal) => void;
  /** RTL test handle. */
  readonly testID?: string;
}

function visualStateFor(signal: ReadinessSignal | null): StripVisualState {
  if (!signal) return "hidden";
  if (signal.state === "ready") return "ready";
  if (signal.state === "failed") return "failed";
  return signal.slow ? "in-flight-slow" : "in-flight";
}

interface PaletteSpec {
  readonly background: string;
  readonly tone: AppTextTone;
}

function paletteFor(state: StripVisualState): PaletteSpec {
  switch (state) {
    case "ready":
      return { background: "bg-success-subtle", tone: "success" };
    case "failed":
      return { background: "bg-error-subtle", tone: "warning" };
    case "in-flight-slow":
      return { background: "bg-warning-subtle", tone: "warning" };
    case "in-flight":
    case "hidden":
    default:
      return { background: "bg-bg-card", tone: "primary" };
  }
}

const COPY_KEY: Record<Exclude<StripVisualState, "hidden">, string> = {
  "in-flight": "status.inflight",
  "in-flight-slow": "status.inflightSlow",
  ready: "status.ready",
  failed: "status.failed",
};

const A11Y_KEY: Record<Exclude<StripVisualState, "hidden">, string> = {
  "in-flight": "status.a11y.inflight",
  "in-flight-slow": "status.a11y.inflightSlow",
  ready: "status.a11y.ready",
  failed: "status.a11y.failed",
};

export function StatusStrip({
  _signal,
  _now,
  onRetry,
  onReady,
  testID = "status-strip",
}: StatusStripProps) {
  const { t } = useTranslation(["dashboard"]);
  const { signal, shownAt } = useReadinessSignal({ _signal, _now });
  const visualState = visualStateFor(signal);

  // --- Slide-in transition -------------------------------------------------
  // The strip slides in once per submission slot. It mounts "off-screen"
  // (translate-y-3 opacity-0); the effect below flips it to its resting
  // position on the render after the slot first surfaces, so the browser
  // animates the CSS transition. State transitions inside the same slot
  // don't re-slide — only the copy / palette swap happens implicitly
  // through React render.
  const [slideIn, setSlideIn] = useState(false);
  const lastSubmissionId = useRef<string | null>(null);
  useEffect(() => {
    const submissionId = signal?.submissionId ?? null;
    if (submissionId && submissionId !== lastSubmissionId.current) {
      lastSubmissionId.current = submissionId;
      setSlideIn(true);
    } else if (!submissionId) {
      lastSubmissionId.current = null;
      setSlideIn(false);
    }
  }, [signal?.submissionId]);

  // --- Analytics: `strip_shown` per slot ---------------------------------
  const shownEmittedFor = useRef<string | null>(null);
  useEffect(() => {
    if (!signal) {
      shownEmittedFor.current = null;
      return;
    }
    if (shownEmittedFor.current === signal.submissionId) return;
    shownEmittedFor.current = signal.submissionId;
    trackEvent("strip_shown", {
      submission_id: signal.submissionId,
      module: signal.module,
    });
  }, [signal]);

  // --- Analytics: `strip_ready` on state-flip into ready -----------------
  const readyEmittedFor = useRef<string | null>(null);
  useEffect(() => {
    if (!signal) {
      readyEmittedFor.current = null;
      return;
    }
    if (signal.state !== "ready") return;
    if (readyEmittedFor.current === signal.submissionId) return;
    readyEmittedFor.current = signal.submissionId;
    const now = _now ?? Date.now;
    const latency = typeof shownAt === "number" ? Math.max(0, now() - shownAt) : 0;
    trackEvent("strip_ready", {
      submission_id: signal.submissionId,
      module: signal.module,
      latency_ms_since_strip_shown: latency,
    });
  }, [signal, shownAt, _now]);

  if (!signal || visualState === "hidden") return null;

  const palette = paletteFor(visualState);
  const copy = t(`dashboard:${COPY_KEY[visualState]}`);
  const a11yLabel = t(`dashboard:${A11Y_KEY[visualState]}`);
  const isInteractive = visualState === "ready" || visualState === "failed";

  const handlePress = (): void => {
    if (visualState === "ready" && onReady) {
      onReady(signal);
      return;
    }
    if (visualState === "failed" && onRetry) {
      onRetry();
    }
  };

  const outerClasses = clsx(
    "my-2 rounded-[var(--radius-md)] px-4 py-2 transition-[transform,opacity] duration-300 ease-out",
    palette.background,
    slideIn ? "translate-y-0 opacity-100" : "translate-y-3 opacity-0"
  );

  const copyEl = (
    <AppText
      tone={palette.tone}
      size="small"
      weight="medium"
      family="sans"
      testID={`${testID}-copy`}
    >
      {copy}
    </AppText>
  );

  if (isInteractive) {
    return (
      <div data-testid={testID} aria-live="polite" className={outerClasses}>
        <button
          type="button"
          data-testid={`${testID}-press`}
          onClick={handlePress}
          aria-label={a11yLabel}
          className="block w-full text-left transition hover:opacity-90"
        >
          {copyEl}
        </button>
      </div>
    );
  }

  return (
    <div
      data-testid={testID}
      role="group"
      aria-live="polite"
      aria-label={a11yLabel}
      className={outerClasses}
    >
      {copyEl}
    </div>
  );
}
