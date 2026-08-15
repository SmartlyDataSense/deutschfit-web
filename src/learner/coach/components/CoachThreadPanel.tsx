"use client";

/**
 * `CoachThreadPanel` — one component, two variants (S9 · Task 9.4).
 * Ports `deutschfit-mobile/src/features/coach/components/CoachSideMenu.tsx`'s
 * content (title, "new conversation" button, session rows, empty state)
 * but restructures the presentation shell for web's wider viewport:
 *
 *   - `variant="persistent"` — a left rail, always mounted, hidden below
 *     the `lg` breakpoint via `className` (`hidden lg:flex`) so desktop
 *     viewports show the conversation list alongside the transcript
 *     without a drawer interaction.
 *   - `variant="drawer"` — mobile's modal-drawer equivalent: a scrim +
 *     sliding panel, only mounted while `drawerOpen` is true on the
 *     `CoachChatScreen` side, closes on scrim press or `Escape`.
 *
 * Both variants call `router.push` directly (unlike mobile's
 * `onSelectSession`/`onNewSession` callback props) — this component owns
 * navigation since there's no shared parent state to bubble a selection
 * through on web; `onClose` is only meaningful for the drawer variant
 * (closes it after navigating, and on scrim/Escape).
 */
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useTranslation } from "react-i18next";
import clsx from "clsx";

import { AppText } from "@/learner/ui/primitives";

import { generateThreadId } from "../hooks/useCoachChat";
import type { CoachSideMenuSession } from "../hooks/useCoachSessions";

export type CoachThreadPanelVariant = "persistent" | "drawer";

export interface CoachThreadPanelProps {
  readonly variant: CoachThreadPanelVariant;
  /** Locale-prefixed app root (`/${locale}/app`) — same convention as every other learner screen. */
  readonly base: string;
  readonly sessions: readonly CoachSideMenuSession[];
  /** Required for `variant="drawer"` (scrim + Escape close); ignored for `variant="persistent"`. */
  readonly onClose?: () => void;
  readonly testID?: string;
}

export function CoachThreadPanel({
  variant,
  base,
  sessions,
  onClose,
  testID = "coach-thread-panel",
}: CoachThreadPanelProps) {
  const { t } = useTranslation(["coach"]);
  const router = useRouter();
  const isDrawer = variant === "drawer";

  // Escape closes the drawer variant. Re-armed on every effect run
  // (Constraint 12) — plain declarative listener registration, not a
  // one-shot boot ref.
  useEffect(() => {
    if (!isDrawer || !onClose) return;
    function handleKeyDown(e: KeyboardEvent): void {
      if (e.key === "Escape") onClose?.();
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [isDrawer, onClose]);

  const handleNewSession = (): void => {
    router.push(`${base}/coach/chat/${generateThreadId()}`);
    onClose?.();
  };

  const handleSelectSession = (id: string): void => {
    router.push(`${base}/coach/chat/${id}`);
    onClose?.();
  };

  const panel = (
    <div
      data-testid={testID}
      className={clsx(
        "flex h-full w-72 shrink-0 flex-col gap-4 overflow-y-auto border-r border-line-soft bg-bg-hero p-4",
        isDrawer &&
          "w-[82%] max-w-[var(--coach-drawer-max-width)] rounded-r-[var(--radius-lg)] border-r-0 shadow-lg"
      )}
    >
      <AppText as="h2" family="serif" size="h2" weight="bold">
        {t("coach:sideMenu.title")}
      </AppText>

      <button
        type="button"
        onClick={handleNewSession}
        data-testid={`${testID}-new`}
        aria-label={t("coach:sideMenu.newConversationA11y")}
        className="rounded-[var(--radius-md)] border border-line-soft bg-bg-card px-3 py-2 text-left transition hover:bg-bg-content"
      >
        <AppText tone="primary" size="small" weight="semi">
          {t("coach:sideMenu.newConversation")}
        </AppText>
      </button>

      {sessions.length === 0 ? (
        <AppText tone="tertiary" size="body" align="center" className="mt-4">
          {t("coach:sideMenu.empty")}
        </AppText>
      ) : (
        <div className="flex flex-col gap-2">
          {sessions.map((session) => (
            <button
              key={session.id}
              type="button"
              onClick={() => handleSelectSession(session.id)}
              data-testid={`${testID}-row-${session.id}`}
              aria-label={`${session.dateLabel}. ${session.preview}`}
              className="flex flex-col gap-1 rounded-[var(--radius-md)] border border-line-soft bg-bg-card px-3 py-2 text-left transition hover:bg-bg-content"
            >
              <div className="flex items-center justify-between">
                <AppText tone="secondary" size="caption" weight="semi">
                  {session.dateLabel}
                </AppText>
                <AppText tone="tertiary" size="caption">
                  {session.count}
                </AppText>
              </div>
              <AppText tone="primary" size="small" className="line-clamp-2">
                {session.preview}
              </AppText>
            </button>
          ))}
        </div>
      )}
    </div>
  );

  if (!isDrawer) {
    return <div className="hidden lg:flex">{panel}</div>;
  }

  return (
    <div className="fixed inset-0 z-[var(--z-header)] flex lg:hidden">
      {panel}
      <button
        type="button"
        onClick={onClose}
        aria-label={t("coach:sideMenu.closeA11y")}
        data-testid={`${testID}-scrim`}
        className="flex-1 bg-bg-premium/50"
      />
    </div>
  );
}
