"use client";

/**
 * `CoachThreadHeader` — Coach chat top bar (S9 · Task 9.4). Ports
 * `deutschfit-mobile/src/features/coach/components/CoachThreadHeader.tsx`'s
 * three-slot layout (hamburger / serif title / presence dot) to web.
 *
 * The hamburger renders the literal "☰" glyph inside `AppText` — same
 * choice mobile makes (not an icon-set glyph, so this isn't "inventing"
 * an icon; it's a text character, exactly as mobile renders it).
 *
 * `onMenu` opens the drawer variant of `CoachThreadPanel` on narrow
 * viewports where the persistent panel is hidden.
 */
import { AppText } from "@/learner/ui/primitives";

export type CoachThreadHeaderStatus = "online" | "offline";

export interface CoachThreadHeaderProps {
  readonly onMenu: () => void;
  readonly status?: CoachThreadHeaderStatus;
  /** Pre-translated title (`coach:chat.header.title`). */
  readonly title: string;
  /** Pre-translated a11y label for the hamburger button (`coach:threadHeader.menuA11y`). */
  readonly menuAccessibilityLabel?: string;
  /** Pre-translated a11y label for the status dot (`coach:threadHeader.online`). */
  readonly onlineAccessibilityLabel?: string;
  /** Pre-translated a11y label for the status dot (`coach:threadHeader.offline`). */
  readonly offlineAccessibilityLabel?: string;
  readonly testID?: string;
}

const DEFAULT_MENU_LABEL = "Voir les conversations";
const DEFAULT_ONLINE_LABEL = "En ligne";
const DEFAULT_OFFLINE_LABEL = "Hors ligne";

export function CoachThreadHeader({
  onMenu,
  status = "online",
  title,
  menuAccessibilityLabel = DEFAULT_MENU_LABEL,
  onlineAccessibilityLabel = DEFAULT_ONLINE_LABEL,
  offlineAccessibilityLabel = DEFAULT_OFFLINE_LABEL,
  testID = "coach-thread-header",
}: CoachThreadHeaderProps) {
  const isOnline = status === "online";
  const statusLabel = isOnline ? onlineAccessibilityLabel : offlineAccessibilityLabel;

  return (
    <div
      className="flex items-center gap-2 border-b border-line-soft px-2 py-2"
      data-testid={testID}
    >
      <button
        type="button"
        onClick={onMenu}
        aria-label={menuAccessibilityLabel}
        data-testid={`${testID}-menu`}
        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[var(--radius-md)] transition hover:bg-bg-content"
      >
        <AppText as="span" tone="primary" size="h3">
          {"☰"}
        </AppText>
      </button>

      <div className="flex flex-1 items-center justify-center">
        <AppText
          as="h1"
          tone="primary"
          family="serif"
          size="h2"
          weight="bold"
          className="truncate"
          testID={`${testID}-title`}
        >
          {title}
        </AppText>
      </div>

      <div
        className="flex h-11 w-11 shrink-0 items-center justify-center"
        role="text"
        aria-label={statusLabel}
        data-testid={`${testID}-status`}
      >
        <span
          aria-hidden="true"
          className={`h-2.5 w-2.5 rounded-[var(--radius-full)] ${isOnline ? "bg-success-green" : "bg-line-strong"}`}
        />
      </div>
    </div>
  );
}
