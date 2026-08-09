"use client";

import { useState, type KeyboardEvent, type MouseEvent } from "react";
import clsx from "clsx";

import { Icon } from "@/learner/core/icons/Icon";
import { AppText, ProgressBar } from "@/learner/ui/primitives";

import { MiniCalendar } from "./MiniCalendar";

/**
 * Accueil-feature `CountdownHeroCard` — web port of
 * `deutschfit-mobile/src/features/accueil/components/CountdownHeroCard.tsx`.
 * The dark exam-countdown hero (mock #3): header date pill, big day count
 * (or the "no date set" placeholder), the `PRÉPARATION X%` progress bar,
 * and the `OBJECTIF N` / readiness caption row.
 *
 * Composition:
 *   - Dark surface: `bg-bg-premium` + `text-on-premium`, `rounded-3xl`.
 *   - `AppText` funnels every visible string through the typed contrast API.
 *   - `ProgressBar tone="cta"` for the orange track.
 *   - No calendar-outline glyph — the DeutschFit sprite + the 5 inlined
 *     Ionicons don't include one, so the date pill renders as text only
 *     (parity note vs. mobile, which used `@expo/vector-icons`).
 *
 * Wave B1 — Dynamic state + no-exam-date fallback (MVP Final Spec §1.2).
 *   When the user has not set an exam date yet, both `daysRemaining` and
 *   `examDateLabel` arrive as `null`. The card renders the localized
 *   `noDateSetLabel` placeholder in the header pill and replaces the big
 *   day count with the same string. Progress bar + target score continue
 *   to render — they're driven by the user's prep, not the exam date.
 *
 * Wave B2 — Tap → User Performance History (Spec #3).
 *   `onPress` is optional; when provided AND an exam date is set, the
 *   whole card becomes clickable and routes to PerformanceHistory.
 *
 * Wave C1 — Inline mini-calendar for null exam date (Spec §1.1 / #5).
 *   When `onSelectExamDate` is provided AND the user has no exam date set,
 *   the card switches its click handler from "navigate to
 *   PerformanceHistory" to "expand an inline `<MiniCalendar />` inside the
 *   card body". Picking a future date fires `onSelectExamDate(iso)`; the
 *   picker auto-collapses on selection.
 *
 * Bug #287 — the date pill is its own clickable element. With a date
 *   already set, the card-wide click still routes to PerformanceHistory
 *   (B2 contract), but clicking the pill in the header opens the inline
 *   MiniCalendar so the learner can edit the date in place. The pill
 *   becomes interactive only when the parent wires `onSelectExamDate`.
 *
 * The card wraps its body in a `<div role="button">` (not a `<button>`)
 * because it contains nested `<button>`s (date pill, placeholder, mini
 * calendar day cells) — nesting `<button>` inside `<button>` is invalid
 * HTML. Nested interactive elements call `stopPropagation()` so a click
 * inside the pill / picker never also fires the card-wide `onPress`.
 */
export interface CountdownHeroCardProps {
  readonly daysRemaining: number | null;
  readonly examDateLabel: string | null;
  readonly preparationPct: number;
  readonly targetScore: number;
  /**
   * S2 #4b — controls the `PRÉPARATION X%` progress bar (founding-doc
   * §8.2). The percentage is meaningful only when N≥1 submissions have
   * been graded; on State A (cold) and State C (date set, zero
   * submissions) the home screen passes `false` and we hide the bar + the
   * "PRÉPARATION · X%" caption row entirely. Defaults to `true` so
   * existing callers keep the current visual contract.
   */
  readonly showPreparationBar?: boolean;
  /**
   * S2 #4b — readiness score (founding-doc §8.3 / §8.4). Surfaced as
   * "XX/100" alongside `OBJECTIF` on State B (`readiness-only`) and State
   * D (`full`). When omitted, the card renders the legacy `OBJECTIF X`
   * caption only.
   */
  readonly readiness?: { readonly score: number; readonly target: number };
  /**
   * Localized fallback string ("No exam date set" / "Aucune date
   * d'examen") surfaced when `examDateLabel` and/or `daysRemaining` are
   * `null`.
   */
  readonly noDateSetLabel: string;
  /**
   * Optional accessibility label for the days-remaining variant. Falls
   * back to a French default that matches the original D10 string.
   */
  readonly daysRemainingA11y?: string;
  /**
   * Click handler — Wave B2. When provided AND an exam date exists, the
   * whole card becomes clickable and fires `onPress`. When absent the
   * card stays static (showcase / detached stories).
   */
  readonly onPress?: () => void;
  /**
   * Wave C1 — date picker. When provided AND the user has no exam date
   * set, the card swaps the click target so it expands an inline
   * mini-calendar instead of firing `onPress`. Picking a day calls
   * `onSelectExamDate(iso)` and the picker auto-collapses. `iso` is a
   * local-tz `YYYY-MM-DD` string.
   */
  readonly onSelectExamDate?: (isoDate: string) => void;
  /**
   * Wave C1 — localized labels for the inline picker. Pulled from the
   * `dashboard:miniCalendar.*` i18n bundle.
   */
  readonly miniCalendarOpenA11y?: string;
  readonly miniCalendarCloseA11y?: string;
  readonly testID?: string;
}

export function CountdownHeroCard({
  daysRemaining,
  examDateLabel,
  preparationPct,
  targetScore,
  showPreparationBar = true,
  readiness,
  noDateSetLabel,
  daysRemainingA11y,
  onPress,
  onSelectExamDate,
  miniCalendarOpenA11y,
  miniCalendarCloseA11y,
  testID,
}: CountdownHeroCardProps) {
  const progressValue = Math.max(0, Math.min(100, preparationPct)) / 100;
  const hasExamDate = examDateLabel !== null && daysRemaining !== null;

  // Bug #287 — `canPickDate` follows `onSelectExamDate` only, not
  // `!hasExamDate`. The header date pill is its own clickable element so
  // the learner can edit the date even after onboarding. The card-wide
  // `onPress` (PerformanceHistory) still wins on the rest of the surface
  // because the pill click calls `togglePicker` directly and stops
  // propagation before it reaches the card-wide handler.
  const canPickDate = typeof onSelectExamDate === "function";
  const [isPickerOpen, setPickerOpen] = useState(false);

  const togglePicker = (event: MouseEvent): void => {
    event.stopPropagation();
    setPickerOpen((cur) => !cur);
  };

  // Resolve the click target for the no-date placeholder digit row. With
  // a picker wired in we keep the click inside the card (toggle the
  // calendar); without one we fall through to the screen-level `onPress`
  // (matches the legacy Wave B2 behavior on the with-date branch).
  const placeholderOnClick = (event: MouseEvent): void => {
    event.stopPropagation();
    if (canPickDate) {
      setPickerOpen((cur) => !cur);
      return;
    }
    onPress?.();
  };

  // §1.2 — when the user hasn't set an exam date, the date pill renders
  // the localized fallback (no calendar glyph) and the digit row swaps
  // the big number for the same string so the layout doesn't collapse.
  const headerPillLabel = hasExamDate ? examDateLabel : noDateSetLabel;
  const a11y = hasExamDate
    ? (daysRemainingA11y ??
      `Compte à rebours examen. ${daysRemaining} jours restants. Examen le ${examDateLabel}. Préparation ${preparationPct}%. Objectif ${targetScore}.`)
    : canPickDate
      ? isPickerOpen
        ? (miniCalendarCloseA11y ??
          `${noDateSetLabel}. Préparation ${preparationPct}%. Objectif ${targetScore}.`)
        : (miniCalendarOpenA11y ??
          `${noDateSetLabel}. Préparation ${preparationPct}%. Objectif ${targetScore}.`)
      : `${noDateSetLabel}. Préparation ${preparationPct}%. Objectif ${targetScore}.`;

  // Wave C1 wires the placeholder digit row's own click instead of the
  // whole card — opening/closing the inline picker shouldn't fire the
  // PerformanceHistory navigation. With a date set, we keep the historical
  // card-wide click contract (B2).
  const cardOnClick = hasExamDate ? onPress : undefined;
  const handleCardKeyDown = (event: KeyboardEvent<HTMLDivElement>): void => {
    if (!cardOnClick) return;
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      cardOnClick();
    }
  };

  const handleSelectDate = (iso: string): void => {
    setPickerOpen(false);
    onSelectExamDate?.(iso);
  };

  return (
    <div
      data-testid={testID}
      aria-label={a11y}
      role={cardOnClick ? "button" : undefined}
      tabIndex={cardOnClick ? 0 : undefined}
      onClick={cardOnClick}
      onKeyDown={cardOnClick ? handleCardKeyDown : undefined}
      className={clsx(
        "rounded-3xl bg-bg-premium p-6 text-on-premium",
        cardOnClick && "cursor-pointer text-left"
      )}
    >
      <div className="mb-4 flex items-center justify-between">
        <AppText tone="inverse" size="caption" weight="medium" className="tracking-wide uppercase">
          COMPTE À REBOURS · EXAMEN
        </AppText>
        {canPickDate ? (
          <button
            type="button"
            onClick={togglePicker}
            aria-expanded={isPickerOpen}
            aria-label={
              isPickerOpen
                ? (miniCalendarCloseA11y ?? headerPillLabel)
                : (miniCalendarOpenA11y ?? headerPillLabel)
            }
            data-testid={testID ? `${testID}-date-pill` : undefined}
            className="flex items-center gap-1 rounded-[var(--radius-full)] border border-on-premium/40 px-3 py-0.5 opacity-90 transition hover:opacity-100"
          >
            <AppText
              tone="inverse"
              size="caption"
              weight="medium"
              testID={testID ? `${testID}-date-label` : undefined}
            >
              {headerPillLabel}
            </AppText>
          </button>
        ) : (
          <div className="flex items-center gap-1 rounded-[var(--radius-full)] border border-on-premium/40 px-3 py-0.5">
            <AppText
              tone="inverse"
              size="caption"
              weight="medium"
              testID={testID ? `${testID}-date-label` : undefined}
            >
              {headerPillLabel}
            </AppText>
          </div>
        )}
      </div>

      {hasExamDate ? (
        <div className="flex items-end gap-2">
          <AppText
            tone="inverse"
            family="serif"
            size="display"
            weight="bold"
            numeric
            testID={testID ? `${testID}-days-remaining` : undefined}
          >
            {`${daysRemaining}`}
          </AppText>
          <AppText tone="inverse" size="bodyLg" className="mb-1">
            jours
          </AppText>
        </div>
      ) : canPickDate ? (
        <button
          type="button"
          aria-expanded={isPickerOpen}
          aria-label={
            isPickerOpen
              ? (miniCalendarCloseA11y ?? noDateSetLabel)
              : (miniCalendarOpenA11y ?? noDateSetLabel)
          }
          onClick={placeholderOnClick}
          data-testid={testID ? `${testID}-pick-date` : undefined}
          className="flex items-end gap-2 opacity-90 transition hover:opacity-100"
        >
          <AppText
            tone="inverse"
            family="serif"
            size="h2"
            weight="bold"
            testID={testID ? `${testID}-no-date-set` : undefined}
          >
            {noDateSetLabel}
          </AppText>
          <span className={clsx("mb-1 inline-block", isPickerOpen ? "-rotate-90" : "rotate-90")}>
            <Icon name="chevron" size={18} color="var(--color-on-premium)" />
          </span>
        </button>
      ) : (
        <div className="flex items-end gap-2">
          <AppText
            tone="inverse"
            family="serif"
            size="h2"
            weight="bold"
            testID={testID ? `${testID}-no-date-set` : undefined}
          >
            {noDateSetLabel}
          </AppText>
        </div>
      )}

      {canPickDate && isPickerOpen ? (
        <MiniCalendar
          onSelect={handleSelectDate}
          testID={testID ? `${testID}-mini-calendar` : undefined}
        />
      ) : null}

      {showPreparationBar ? (
        <ProgressBar
          value={progressValue}
          tone="cta"
          aria-label={`Préparation ${preparationPct}%`}
          className="mt-4"
          testID={testID ? `${testID}-preparation-bar` : undefined}
        />
      ) : null}

      {showPreparationBar || readiness ? (
        <div className="mt-2 flex items-center justify-between">
          {showPreparationBar ? (
            <AppText
              tone="inverse"
              size="caption"
              weight="medium"
              testID={testID ? `${testID}-preparation-label` : undefined}
            >
              {`PRÉPARATION · ${preparationPct}%`}
            </AppText>
          ) : (
            // Keep the row left-anchored so OBJECTIF stays in the same
            // right-hand position whether or not the bar is shown.
            <div />
          )}
          <div className="flex items-center gap-2">
            {readiness ? (
              <AppText
                tone="inverse"
                size="caption"
                weight="medium"
                className="tracking-wide"
                testID={testID ? `${testID}-readiness-score` : undefined}
              >
                {`${readiness.score}/100`}
              </AppText>
            ) : null}
            <AppText
              tone="gold"
              size="caption"
              weight="medium"
              testID={testID ? `${testID}-target-score` : undefined}
            >
              {`OBJECTIF ${readiness?.target ?? targetScore}`}
            </AppText>
          </div>
        </div>
      ) : null}
    </div>
  );
}
