"use client";

/**
 * `IdentityCard` — web port of
 * `mobile/src/features/profil/components/IdentityCard.tsx`.
 * Avatar = 64px sage circle (`bg-coach`, mobile theme.coach) with the
 * name initial; serif bold name; secondary subtitle
 * `location · lang1 · lang2`; premium pill with the exam label (level
 * only — F-3 debranding). Pill is an inline span (S10 precedent: no new
 * exported primitives for one-off pills).
 *
 * Deliberately does NOT pass a wrapper `role="group"`/`aria-label`
 * (fix-round web#58 sweep). An earlier version composed
 * `${fullName}. ${locationA11y}. ${examPill}.` and put it on the outer
 * `role="group"` div — `role="group"` is not children-presentational on
 * web (unlike mobile's `accessible` View), so a screen reader announced
 * that composed name and then re-read the name/subtitle/pill a second
 * time as it continued into the group. Those are already independently
 * readable `AppText`/`<span>` children in the same order, so no wrapper
 * accessible name is needed — same treatment as `PriorityTaskCard`
 * (commit `1ea9e6a`).
 */
import { AppText } from "@/learner/ui/primitives";
import type { ProfilStats } from "../data/fixtures";

export interface IdentityCardProps {
  readonly stats: ProfilStats;
  readonly examPill: string;
  readonly testID?: string;
}

export function IdentityCard({
  stats,
  examPill,
  testID = "profil-identity-card",
}: IdentityCardProps) {
  const subtitle = `${stats.location}${
    stats.languages.length ? ` · ${stats.languages.join(" · ")}` : ""
  }`;
  const initial = stats.fullName.trim().charAt(0).toUpperCase() || "·";

  return (
    <div
      data-testid={testID}
      className="flex items-center gap-4 rounded-[var(--radius-lg)] bg-bg-card p-4"
    >
      <div
        data-testid={`${testID}-avatar`}
        aria-hidden="true"
        className="flex h-16 w-16 shrink-0 items-center justify-center rounded-[var(--radius-md)] bg-coach"
      >
        <AppText size="h3" weight="bold" family="serif" tone="coachInk">
          {initial}
        </AppText>
      </div>
      <div className="min-w-0 flex-1">
        <AppText as="h2" size="h3" weight="bold" family="serif" tone="primary" className="truncate">
          {stats.fullName}
        </AppText>
        <AppText size="small" tone="secondary" className="truncate">
          {subtitle}
        </AppText>
      </div>
      <span
        data-testid={`${testID}-exam-pill`}
        className="shrink-0 rounded-full bg-bg-premium px-3 py-1"
      >
        <AppText size="caption" weight="semi" tone="inverse">
          {examPill}
        </AppText>
      </span>
    </div>
  );
}
