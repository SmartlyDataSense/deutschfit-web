"use client";

/**
 * `ChangeExamDateScreen` — standalone Change-Exam-Date screen (S3 · Task
 * 3.11). Web port of
 * `deutschfit-mobile/src/features/accueil/screens/ChangeExamDateScreen.tsx`
 * (Bug #287 entry point, ProfilScreen → "Changer la date d'examen").
 *
 * Composition (top → bottom, mirrors mobile):
 *   - Nav bar (`change-exam-date-navbar`): sprite `back` glyph button →
 *     `router.back()`, centered title, right-hand spacer that keeps the
 *     title visually centred (same pattern as `PerformanceHistoryScreen`).
 *   - Intro caption.
 *   - Dark `bg-bg-premium` card (`change-exam-date-card`) framing the
 *     `MiniCalendar` (3.7) picker — mirrors mobile's cream `PremiumCard`
 *     wrapper conceptually (dark surface here since there's no
 *     `PremiumCard` primitive on web yet; same `rounded-3xl bg-bg-premium
 *     p-6 text-on-premium` treatment `CountdownHeroCard` already uses for
 *     its own dark surface).
 *   - Inline status caption (`change-exam-date-status`), rendered only
 *     once a save has settled.
 *
 * Deviations from mobile (S3 planning decision — already made, not
 * re-litigated here):
 *   - No toast, no haptics. On success the screen shows the same
 *     `dashboard:miniCalendar.toastSuccess` copy as an inline caption,
 *     then calls `router.back()` after a fixed 600ms delay — the web
 *     stand-in for mobile's "toast, then pop" sequence, long enough for
 *     the caption to register before the screen unmounts.
 *   - On failure the screen shows `dashboard:miniCalendar.toastError`
 *     inline and stays put (no `router.back()`), matching mobile's
 *     toast-only failure branch (mobile doesn't pop on error either).
 *   - Mobile's `LiquidGlassTopBar` / tab-bar inset plumbing doesn't apply
 *     — the shared `(learner)/app/layout.tsx` nav chrome already reserves
 *     that space for every `(protected)` route.
 */
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslation } from "react-i18next";

import { Icon } from "@/learner/core/icons/Icon";
import { AppText } from "@/learner/ui/primitives";

import { updateExamDate } from "../api";
import { MiniCalendar } from "../components/MiniCalendar";

/** Web stand-in for mobile's toast-then-pop — see file docstring. */
const BACK_DELAY_MS = 600;

type SaveState = "idle" | "saving" | "success" | "error";

export function ChangeExamDateScreen() {
  const router = useRouter();
  const { t } = useTranslation(["profil", "dashboard"]);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const backTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Clear a pending "navigate back" timer if the screen unmounts before it
  // fires (e.g. the learner clicks the back button manually mid-delay).
  useEffect(() => {
    return () => {
      if (backTimeoutRef.current) clearTimeout(backTimeoutRef.current);
    };
  }, []);

  const handleBack = (): void => {
    router.back();
  };

  const handleSelect = (isoDate: string): void => {
    setSaveState("saving");
    void (async () => {
      try {
        await updateExamDate(isoDate);
        setSaveState("success");
        backTimeoutRef.current = setTimeout(() => {
          router.back();
        }, BACK_DELAY_MS);
      } catch {
        setSaveState("error");
      }
    })();
  };

  const statusMessage =
    saveState === "success"
      ? t("dashboard:miniCalendar.toastSuccess")
      : saveState === "error"
        ? t("dashboard:miniCalendar.toastError")
        : null;

  return (
    <div
      className="mx-auto flex w-full max-w-2xl flex-col gap-4 px-4 py-8 lg:px-8"
      data-testid="change-exam-date-screen"
    >
      <div className="flex items-center gap-3" data-testid="change-exam-date-navbar">
        <button
          type="button"
          onClick={handleBack}
          aria-label={t("profil:header.backA11y")}
          data-testid="change-exam-date-back"
          className="flex h-9 w-9 items-center justify-center rounded-full bg-bg-card transition hover:opacity-90"
        >
          <Icon name="back" size={18} label={t("profil:header.backA11y")} />
        </button>
        <AppText
          as="h1"
          tone="primary"
          family="serif"
          size="h3"
          weight="bold"
          className="flex-1 text-center"
          testID="change-exam-date-title"
        >
          {t("profil:changeExamDate.title")}
        </AppText>
        {/* Right-hand spacer keeps the title visually centred, same size
            as the back button so the title's optical center matches. */}
        <div className="h-9 w-9" aria-hidden="true" />
      </div>

      <AppText tone="secondary" size="body" testID="change-exam-date-intro">
        {t("profil:changeExamDate.intro")}
      </AppText>

      <div
        data-testid="change-exam-date-card"
        className="rounded-3xl bg-bg-premium p-6 text-on-premium"
      >
        <MiniCalendar onSelect={handleSelect} testID="change-exam-date-mini-calendar" />
      </div>

      {statusMessage ? (
        <div role="status" data-testid="change-exam-date-status">
          <AppText
            tone={saveState === "error" ? "warning" : "success"}
            size="small"
            weight="medium"
          >
            {statusMessage}
          </AppText>
        </div>
      ) : null}
    </div>
  );
}
