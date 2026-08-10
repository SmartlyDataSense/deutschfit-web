"use client";

/**
 * `SchreibenDiffView` — word-level diff between the learner's draft and
 * the examiner rewrite, with an optional Betreuer prose card (S9 · Task
 * 9.9). Web port of
 * `deutschfit-mobile/src/features/coach/correction/components/SchreibenDiffView.tsx`.
 *
 * Removed words render red + strikethrough; added words render green;
 * equal words render the default text color. Segments are joined with
 * explicit space separators (mirrors mobile's inter-segment `<Text> </Text>`).
 * The Betreuer card renders only when `betreuerText` is non-empty.
 */
import { useTranslation } from "react-i18next";

import { AppText } from "@/learner/ui/primitives";

import { buildDiff, type DiffSegment } from "../schreibenDiff";

export interface SchreibenDiffViewProps {
  readonly bodyDe: string;
  readonly prueferText: string;
  readonly betreuerText: string;
}

// Web delta: no "error" AppText tone (see `GlobalScoreBlock`'s header) —
// these raw utility classes are applied directly on plain `<span>`s
// rather than through `AppText`'s `tone` prop, matching the established
// precedent in `ClozePartView`/`ItemListPartView` (`text-error-text`
// used directly, bypassing `AppText`).
function segmentClassName(seg: DiffSegment): string {
  switch (seg.type) {
    case "removed":
      return "text-error-text line-through";
    case "added":
      return "text-success-text";
    default:
      return "text-text-primary";
  }
}

export function SchreibenDiffView({ bodyDe, prueferText, betreuerText }: SchreibenDiffViewProps) {
  const { t } = useTranslation(["coach"]);
  const segments = buildDiff(bodyDe, prueferText);

  return (
    <div className="flex flex-col gap-3" data-testid="correction-diff">
      <div className="flex gap-4">
        <span className="text-caption font-semibold text-error-text">
          {t("coach:correction.walkthrough.diffLegend.removed")}
        </span>
        <span className="text-caption font-semibold text-success-text">
          {t("coach:correction.walkthrough.diffLegend.added")}
        </span>
      </div>

      <p className="text-body leading-6 text-text-primary">
        {segments.map((seg, idx) => (
          <span key={idx}>
            <span className={segmentClassName(seg)} data-testid={`correction-diff-segment-${idx}`}>
              {seg.text}
            </span>
            {idx < segments.length - 1 ? " " : null}
          </span>
        ))}
      </p>

      {betreuerText.length > 0 ? (
        <div
          className="rounded-[var(--radius-md)] border border-line-soft bg-coach-subtle p-4"
          data-testid="correction-diff-betreuer"
        >
          <AppText tone="coach" size="caption" weight="semi">
            {t("coach:correction.walkthrough.betreuerLabel")}
          </AppText>
          <AppText tone="primary" size="body">
            {betreuerText}
          </AppText>
        </div>
      ) : null}
    </div>
  );
}
