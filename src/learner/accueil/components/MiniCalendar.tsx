"use client";

import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import clsx from "clsx";

import { Icon } from "@/learner/core/icons/Icon";
import { AppText } from "@/learner/ui/primitives";

/**
 * `MiniCalendar` — web port of
 * `deutschfit-mobile/src/features/accueil/components/MiniCalendar.tsx`
 * (Wave C1, Spec §1.1 / #5).
 *
 * Renders inline inside `CountdownHeroCard`'s dark hero. The user opens it
 * by clicking the "no exam date set" placeholder (or the date pill — bug
 * #287), picks a future day, and the parent commits the choice via
 * `onSelect(isoDate)`.
 *
 * Visual contract (ported 1:1):
 *   - Sits on the dark `bg-bg-premium` surface (parent's responsibility —
 *     this component only sets text tone, not background).
 *   - Day cells = a 7-column, 6-row (42-cell) Monday-first grid. Past dates
 *     are `disabled` buttons; today is selectable (a learner could
 *     legitimately book a same-day exam).
 *   - No calendar-outline glyph exists in the DeutschFit sprite/Ionicons
 *     set — month navigation reuses the single sprite `chevron` glyph
 *     (rotated via CSS), never an invented icon.
 *
 * `buildMonthGrid` / `toLocalIsoDate` / `startOfLocalDay` are ported
 * verbatim (pure date math, no RN/DOM dependency).
 */
export interface MiniCalendarProps {
  /**
   * Optional ISO date (`YYYY-MM-DD`) to highlight as the current selection.
   * When present, the calendar opens on that month; otherwise it opens on
   * the visible month for `referenceDate` (default = today).
   */
  readonly selectedIsoDate?: string | null;
  /**
   * Anchor "today" used for the past-vs-future check + the default visible
   * month. Defaults to `new Date()`. Tests override this so the grid is
   * deterministic across timezones and CI clocks.
   */
  readonly referenceDate?: Date;
  /**
   * Fired when the user clicks a day cell. The argument is the ISO
   * (`YYYY-MM-DD`) representation of the chosen day in local time.
   */
  readonly onSelect: (isoDate: string) => void;
  readonly testID?: string;
}

/**
 * Format a `Date` as a local-tz `YYYY-MM-DD` string. Deliberately not
 * `toISOString()` — that converts to UTC and would shift the day across
 * timezones. The mini-calendar's contract is "the day the user clicked on
 * their device", which is local time.
 */
function toLocalIsoDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/**
 * Strip a `Date` to `YYYY-MM-DD 00:00:00.000` in local tz so date-only
 * comparisons (today vs. selected, past vs. future) ignore the time part.
 */
function startOfLocalDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

interface DayCell {
  readonly date: Date;
  readonly isCurrentMonth: boolean;
  readonly isPast: boolean;
  readonly isToday: boolean;
}

/**
 * Build the 6×7 grid cells for a given visible month. Always returns 42
 * cells — the trailing days fall over into the next month so the grid
 * height stays constant across months. Week starts on Monday (matches the
 * European convention used in the i18n `daysShort` order).
 */
function buildMonthGrid(visible: Date, today: Date): readonly DayCell[] {
  const todayMs = startOfLocalDay(today).getTime();
  const firstOfMonth = new Date(visible.getFullYear(), visible.getMonth(), 1);
  // JS `getDay()` is Sun=0..Sat=6; we want Monday as column 0.
  const jsWeekday = firstOfMonth.getDay();
  const mondayIndex = (jsWeekday + 6) % 7;
  const gridStart = new Date(visible.getFullYear(), visible.getMonth(), 1 - mondayIndex);

  const cells: DayCell[] = [];
  for (let i = 0; i < 42; i += 1) {
    const cursor = new Date(gridStart.getFullYear(), gridStart.getMonth(), gridStart.getDate() + i);
    const cursorMs = cursor.getTime();
    cells.push({
      date: cursor,
      isCurrentMonth: cursor.getMonth() === visible.getMonth(),
      isPast: cursorMs < todayMs,
      isToday: cursorMs === todayMs,
    });
  }
  return cells;
}

export function MiniCalendar({
  selectedIsoDate,
  referenceDate,
  onSelect,
  testID,
}: MiniCalendarProps) {
  const { t } = useTranslation(["dashboard"]);
  // Stabilize the "today" anchor across renders — recreating `new Date()`
  // every render would invalidate the memoized grid on each call. Tests
  // pass a fixed `referenceDate` so the comparison is deterministic.
  const today = useMemo<Date>(() => referenceDate ?? new Date(), [referenceDate]);

  // Anchor the visible month on the selection (if given) or on today.
  const initialVisible = useMemo<Date>(() => {
    if (selectedIsoDate) {
      const [y, m] = selectedIsoDate.split("-").map(Number);
      if (Number.isFinite(y) && Number.isFinite(m) && y !== undefined && m !== undefined) {
        return new Date(y, m - 1, 1);
      }
    }
    return new Date(today.getFullYear(), today.getMonth(), 1);
  }, [selectedIsoDate, today]);
  const [visible, setVisible] = useState<Date>(initialVisible);

  const grid = useMemo(() => buildMonthGrid(visible, today), [visible, today]);

  const monthsLong = t("dashboard:miniCalendar.monthsLong", {
    returnObjects: true,
  }) as readonly string[];
  const daysShort = t("dashboard:miniCalendar.daysShort", {
    returnObjects: true,
  }) as readonly string[];
  const monthLabel = `${monthsLong[visible.getMonth()] ?? ""} ${visible.getFullYear()}`;

  const onPrev = (event?: { stopPropagation: () => void }): void => {
    event?.stopPropagation();
    setVisible((cur) => new Date(cur.getFullYear(), cur.getMonth() - 1, 1));
  };
  const onNext = (event?: { stopPropagation: () => void }): void => {
    event?.stopPropagation();
    setVisible((cur) => new Date(cur.getFullYear(), cur.getMonth() + 1, 1));
  };

  return (
    <div
      className="mt-4 border-t border-on-premium/20 pt-2"
      data-testid={testID}
      aria-label={t("dashboard:miniCalendar.title")}
    >
      <div className="mb-2 flex items-center justify-between">
        <button
          type="button"
          aria-label={t("dashboard:miniCalendar.prevMonthA11y")}
          onClick={onPrev}
          data-testid={testID ? `${testID}-prev` : undefined}
          className="rounded-[var(--radius-full)] p-1 opacity-90 transition hover:opacity-100"
        >
          {/* No calendar/chevron-back glyph in the sprite — reuse the
              single right-pointing `chevron`, rotated up (like a
              spinner's "previous" arrow). */}
          <span className="-rotate-90 inline-block">
            <Icon name="chevron" size={18} color="var(--color-on-premium)" />
          </span>
        </button>
        <AppText
          tone="inverse"
          size="body"
          weight="semi"
          testID={testID ? `${testID}-month-label` : undefined}
        >
          {monthLabel}
        </AppText>
        <button
          type="button"
          aria-label={t("dashboard:miniCalendar.nextMonthA11y")}
          onClick={onNext}
          data-testid={testID ? `${testID}-next` : undefined}
          className="rounded-[var(--radius-full)] p-1 opacity-90 transition hover:opacity-100"
        >
          <span className="rotate-90 inline-block">
            <Icon name="chevron" size={18} color="var(--color-on-premium)" />
          </span>
        </button>
      </div>

      <div className="flex items-center" data-testid={testID ? `${testID}-day-headers` : undefined}>
        {daysShort.map((label, idx) => (
          <div key={`dh-${idx}-${label}`} className="flex-1 py-1 text-center">
            <AppText
              tone="inverse"
              size="caption"
              weight="medium"
              testID={testID ? `${testID}-day-header-${idx}` : undefined}
            >
              {label}
            </AppText>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap">
        {grid.map((cell) => {
          const iso = toLocalIsoDate(cell.date);
          const isSelected = selectedIsoDate === iso;
          const disabled = cell.isPast;
          const dim = !cell.isCurrentMonth;
          const a11yDate = `${cell.date.getDate()} ${monthsLong[cell.date.getMonth()] ?? ""} ${cell.date.getFullYear()}`;
          return (
            <button
              key={iso}
              type="button"
              aria-label={t("dashboard:miniCalendar.dayA11y", { date: a11yDate })}
              aria-pressed={isSelected}
              disabled={disabled}
              onClick={(event) => {
                event.stopPropagation();
                onSelect(iso);
              }}
              data-testid={testID ? `${testID}-day-${iso}` : undefined}
              className={clsx(
                "flex aspect-square basis-[calc(100%/7)] items-center justify-center rounded-[var(--radius-full)]",
                isSelected ? "bg-cta" : cell.isToday ? "border border-accent-gold" : undefined,
                disabled ? "cursor-not-allowed opacity-35" : "hover:opacity-70"
              )}
            >
              <AppText
                tone="inverse"
                size="small"
                weight={isSelected || cell.isToday ? "semi" : "regular"}
                numeric
                className={clsx(dim && !isSelected && "opacity-50", disabled && "opacity-70")}
              >
                {`${cell.date.getDate()}`}
              </AppText>
            </button>
          );
        })}
      </div>
    </div>
  );
}
