"use client";

/**
 * Accueil — home screen (S3 · Task 3.9). Web port of
 * `deutschfit-mobile/src/features/accueil/screens/AccueilScreen.tsx`.
 *
 * Composition (top → bottom): header (`BrandMark` + user name + current
 * level pill) → date eyebrow → serif greeting → teaser → `HeroCard`
 * (countdown) or the inline `ExamDatePickerInline` fallback when the
 * learner has no future exam date → inline exam-date save/error caption
 * → `StatusStrip` → "AUJOURD'HUI" section row → drill `PriorityTaskCard`
 * (skeleton / active / empty three-state).
 *
 * Deviations from mobile (S3 scope, all called out in the task-3.9 brief):
 *   - The bell / notifications affordance is omitted this slice — mobile's
 *     `handleOpenNotifications` had no real destination yet either.
 *   - Every deep-link the mobile screen routes on `getParent()` hops
 *     (Hero post-session CTA, Hero countdown tap, `StatusStrip` ready-tap)
 *     falls back to a single `/{locale}/app/history` push — **half-resolved
 *     as of S6 Task 6.9, fully resolved for readiness taps as of S7 Task
 *     7.9**: the Hero CTA/countdown fallbacks are unchanged, but
 *     `StatusStrip`'s ready-tap now deep-links directly to
 *     `/{locale}/app/schreiben/feedback/<submissionId>` or
 *     `/{locale}/app/sprechen/feedback/<submissionId>` depending on the
 *     signal's module (`handleOpenReady` below) — this is what makes
 *     `acknowledgeReadiness` reachable from the home Hero pulse for both
 *     modules. Any other/unknown module still falls back to
 *     `/{locale}/app/history`.
 *   - `StatusStrip`'s `onRetry` is a noop stub (mobile: "wired in P6").
 *   - The drill `PriorityTaskCard`'s active-branch CTA landed in S9
 *     (Task 9.6): it now pushes `/{locale}/app/drill/session` instead
 *     of the S3-era `noop` stub. The empty-branch CTA still has
 *     nothing to navigate to, so it stays wired to `noop` (and the
 *     card itself keeps that button `disabled`).
 *   - Mobile persists the exam-date save result as a toast
 *     (`useToast().show(...)`); the web learner app has no toast system
 *     yet, so this screen renders an inline `accueil-exam-date-status`
 *     caption instead (same `dashboard:miniCalendar.toast*` copy),
 *     auto-clearing after 3 s via a timeout ref.
 *   - Mobile's level pill uses the RN `Pill` primitive; web has no
 *     equivalent primitive so this reuses `Chip` (display-only, no
 *     `onClick`).
 *   - Desktop (≥1024px) keeps the same single-column layout — just
 *     `max-w-2xl` centered with `lg:px-8` breathing room (spec §3: the
 *     two-pane treatments are exam/coach surfaces, not home).
 *
 * The `ExamDatePickerInline` local component below is ported 1:1 from the
 * mobile file's bottom section (same file, same rationale — Bug 3 /
 * founding-doc §8 state A).
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useLocale } from "next-intl";
import { useTranslation } from "react-i18next";
import clsx from "clsx";

import { useLearnerSession } from "@/learner/core/auth/useLearnerSession";
import { hydrateExamContext, useExamContextStore } from "@/learner/core/exam/examContext";
import { Icon } from "@/learner/core/icons/Icon";
import type { ReadinessSignal } from "@/learner/core/readiness";
import { AppButton, AppText, BrandMark, Chip, EmptyState, Skeleton } from "@/learner/ui/primitives";

import { updateExamDate } from "../api";
import { HeroCard } from "../components/HeroCard";
import { MiniCalendar } from "../components/MiniCalendar";
import { PriorityTaskCard } from "../components/PriorityTaskCard";
import { StatusStrip } from "../components/StatusStrip";
import { formatDateEyebrow } from "../formatDateEyebrow";
import { greetingName } from "../greetingName";
import { useAccueilHome } from "../hooks/useAccueilHome";
import { useDailyDrill } from "../hooks/useDailyDrill";
import { useHeroState } from "../hooks/useHeroState";

/** Inline exam-date save/error caption lifetime — S3 toast replacement. */
const EXAM_DATE_STATUS_TIMEOUT_MS = 3000;

const noop = (): void => {};

export function AccueilScreen() {
  const { t } = useTranslation(["dashboard"]);
  const router = useRouter();
  const locale = useLocale();

  const session = useLearnerSession((s) => s.session);

  const accueilHome = useAccueilHome();
  const { data, isError, refetch } = accueilHome;
  const { recommendation: dailyDrill } = useDailyDrill();
  // S2 #4 — state-aware Hero. Cross-feature inputs (queued prescription,
  // hours-since-last-session, submissionsCount) aren't threaded through
  // the `accueil-home` payload yet, so the hook falls back to the
  // countdown branch driven by `daysUntilExam` + the readiness store.
  const heroState = useHeroState({ _accueilHome: accueilHome });

  // F-4 — the level pill follows the user's *current* CEFR level (the
  // exam-context store), not the server `targetLevel` stub. Hidden until
  // the store's first hydration pass completes so we never flash the
  // `DEFAULT_EXAM_LEVEL` before the real value lands.
  const currentLevel = useExamContextStore((s) => s.level);
  const isExamContextLoaded = useExamContextStore((s) => s.isLoaded);

  useEffect(() => {
    void hydrateExamContext();
  }, []);

  // Wave C1 — inline save/error caption (S3 toast replacement). Cleared
  // on unmount and re-armed on every new selection.
  const [examDateStatus, setExamDateStatus] = useState<{
    readonly tone: "success" | "error";
    readonly message: string;
  } | null>(null);
  const statusTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (statusTimeoutRef.current) clearTimeout(statusTimeoutRef.current);
    },
    []
  );

  const metadata = (session?.user.user_metadata ?? {}) as Record<string, unknown>;
  const metaDisplayName =
    typeof metadata.display_name === "string"
      ? metadata.display_name
      : typeof metadata.full_name === "string"
        ? metadata.full_name
        : typeof metadata.name === "string"
          ? metadata.name
          : null;
  const userName = greetingName(
    metaDisplayName,
    session?.user.email,
    t("dashboard:greeting.fallback")
  );

  const dateEyebrow = formatDateEyebrow(new Date(), locale);

  // S3 fallback — every deep-link target the mobile screen routes on
  // (Hero post-session CTA, Hero countdown tap, StatusStrip ready-tap)
  // collapses to the Performance History route until the real Schreiben /
  // Sprechen feedback deep links land (S6/S7 — parity note in the brief).
  const handleOpenHistory = useCallback((): void => {
    router.push(`/${locale}/app/history`);
  }, [router, locale]);

  // P17 — StatusStrip's ready-tap deep-links straight to the graded
  // submission for every module that has a feedback screen (Schreiben —
  // S6 Task 6.9; Sprechen — S7 Task 7.9). Any other/unknown module still
  // falls back to the S3 history route.
  const handleOpenReady = useCallback(
    (signal: ReadinessSignal): void => {
      if (signal.module === "schreiben") {
        router.push(`/${locale}/app/schreiben/feedback/${signal.submissionId}`);
        return;
      }
      if (signal.module === "sprechen") {
        router.push(`/${locale}/app/sprechen/feedback/${signal.submissionId}`);
        return;
      }
      router.push(`/${locale}/app/history`);
    },
    [router, locale]
  );

  // S9 Task 9.6 — the drill card's active-branch CTA now launches the
  // adaptive drill session (System A). The empty-branch CTA still has
  // no destination and stays wired to `noop` below.
  const handleOpenDrillSession = useCallback((): void => {
    router.push(`/${locale}/app/drill/session`);
  }, [router, locale]);

  const handleSelectExamDate = useCallback(
    (isoDate: string): void => {
      void (async () => {
        try {
          await updateExamDate(isoDate);
          setExamDateStatus({ tone: "success", message: t("dashboard:miniCalendar.toastSuccess") });
          await refetch();
        } catch {
          setExamDateStatus({ tone: "error", message: t("dashboard:miniCalendar.toastError") });
        } finally {
          if (statusTimeoutRef.current) clearTimeout(statusTimeoutRef.current);
          statusTimeoutRef.current = setTimeout(
            () => setExamDateStatus(null),
            EXAM_DATE_STATUS_TIMEOUT_MS
          );
        }
      })();
    },
    [refetch, t]
  );

  // --- Loading / error frames -------------------------------------------
  // `data` stays non-null-typed for the rest of the function once we fall
  // through this guard: `isLoading && !data` renders the silent skeleton
  // (founding-doc §17 — no spinner, no "Chargement…" copy); a failed fetch
  // with nothing cached renders the hard error card instead.
  if (!data) {
    if (isError) {
      return (
        <div
          className="flex min-h-[var(--state-panel-min-height)] flex-col items-center justify-center gap-4 px-6 text-center"
          data-testid="accueil-error"
        >
          <EmptyState
            title={t("dashboard:error.title")}
            description={t("dashboard:error.description")}
          />
          <AppButton
            label={t("dashboard:error.retry")}
            onClick={() => void refetch()}
            testID="accueil-error-retry"
          />
        </div>
      );
    }
    return (
      <div
        className="mx-auto flex w-full max-w-2xl flex-col gap-3 px-4 py-8 lg:px-8"
        data-testid="accueil-loading"
      >
        <Skeleton.Block
          width="60%"
          height={20}
          aria-label={t("dashboard:dailyDrill.loadingA11y")}
        />
        <Skeleton.Block
          width="40%"
          height={14}
          aria-label={t("dashboard:dailyDrill.loadingA11y")}
        />
        <Skeleton.Block
          width="100%"
          height={140}
          className="rounded-[var(--radius-lg)]"
          aria-label={t("dashboard:dailyDrill.loadingA11y")}
        />
        <Skeleton.Card aria-label={t("dashboard:dailyDrill.loadingA11y")} />
      </div>
    );
  }

  const { countdown } = data;

  const currentLevelLabel = isExamContextLoaded ? currentLevel.toUpperCase() : "";
  const greetingLine = `Bonjour, ${userName}.`;
  const hasFutureExam = countdown.daysRemaining !== null && countdown.daysRemaining > 0;
  const teaser = hasFutureExam
    ? currentLevelLabel
      ? t("dashboard:hero.teaserWithDate", {
          count: countdown.daysRemaining as number,
          level: currentLevelLabel,
        })
      : t("dashboard:hero.teaserWithDateNoLevel", { count: countdown.daysRemaining as number })
    : t("dashboard:hero.teaserNoDate");

  // Engine B — the priority card is driven by the drill-gap recommender,
  // not the (unused) server `priorityTask` stub. Three render states:
  //   - `dailyDrill === null`       → recommendation still loading.
  //   - `reason === "ok"` & count>0 → active card.
  //   - anything else               → calm empty branch.
  const drillReady = dailyDrill !== null;
  const drillActive = dailyDrill?.reason === "ok" && dailyDrill.itemCount > 0;
  const drillCount = dailyDrill?.itemCount ?? 0;

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-4 px-4 py-8 lg:px-8">
      <div className="flex items-center gap-3" data-testid="accueil-header">
        <BrandMark size={40} tone="onCream" />
        <div className="flex flex-shrink flex-col items-start gap-1">
          <AppText tone="primary" family="serif" size="h3" weight="bold" testID="accueil-user-name">
            {userName}
          </AppText>
          {currentLevelLabel ? (
            <Chip label={currentLevelLabel} testID="accueil-current-level-pill" />
          ) : null}
        </div>
      </div>

      <AppText
        tone="secondary"
        size="caption"
        weight="medium"
        className="tracking-wide"
        testID="accueil-date-eyebrow"
      >
        {dateEyebrow}
      </AppText>

      <AppText tone="primary" family="serif" size="h2" weight="bold" testID="accueil-greeting">
        {greetingLine}
      </AppText>

      <AppText tone="secondary" size="body" testID="accueil-teaser">
        {teaser}
      </AppText>

      {hasFutureExam ? (
        <HeroCard
          payload={heroState.payload}
          countdownProps={{
            daysRemaining: countdown.daysRemaining,
            examDateLabel: countdown.examDateLabel,
            preparationPct: countdown.preparationPct,
            targetScore: countdown.targetScore,
            noDateSetLabel: t("dashboard:exam.noDateSet"),
            daysRemainingA11y: t("dashboard:exam.countdownTapA11y"),
            onPress: handleOpenHistory,
            onSelectExamDate: handleSelectExamDate,
            miniCalendarOpenA11y: t("dashboard:miniCalendar.openA11y"),
            miniCalendarCloseA11y: t("dashboard:miniCalendar.closeA11y"),
          }}
          onCtaPress={handleOpenHistory}
          testID="accueil-countdown"
        />
      ) : (
        <ExamDatePickerInline
          label={t("dashboard:examDatePicker.label")}
          openA11y={t("dashboard:examDatePicker.openA11y")}
          closeA11y={t("dashboard:examDatePicker.closeA11y")}
          onSelect={handleSelectExamDate}
          testID="accueil-exam-date-picker"
        />
      )}

      {examDateStatus ? (
        <div
          role="status"
          aria-live="polite"
          data-testid="accueil-exam-date-status"
          className={clsx(
            "rounded-[var(--radius-md)] px-4 py-2 text-center",
            examDateStatus.tone === "success" ? "bg-success-subtle" : "bg-error-subtle"
          )}
        >
          <AppText
            tone={examDateStatus.tone === "success" ? "success" : "warning"}
            size="small"
            weight="medium"
          >
            {examDateStatus.message}
          </AppText>
        </div>
      ) : null}

      <StatusStrip onReady={handleOpenReady} onRetry={noop} testID="accueil-status-strip" />

      <AppText
        tone="secondary"
        size="caption"
        weight="medium"
        className="tracking-wide"
        testID="accueil-today-row"
      >
        {t("dashboard:today")}
      </AppText>

      {!drillReady ? (
        <Skeleton.Card
          aria-label={t("dashboard:dailyDrill.loadingA11y")}
          testID="accueil-priority-task-skeleton"
        />
      ) : drillActive ? (
        <PriorityTaskCard
          priorityLabel={t("dashboard:dailyDrill.priorityLabel")}
          skill={t("dashboard:dailyDrill.skill")}
          title={t("dashboard:dailyDrill.title")}
          subtitle={t("dashboard:dailyDrill.subtitle", { count: drillCount })}
          body={t("dashboard:dailyDrill.body")}
          ctaLabel={t("dashboard:dailyDrill.ctaLabel")}
          durationLabel={t("dashboard:dailyDrill.duration")}
          onCtaPress={handleOpenDrillSession}
          testID="accueil-priority-task"
        />
      ) : (
        <PriorityTaskCard
          priorityLabel={t("dashboard:dailyDrill.priorityLabel")}
          skill={t("dashboard:dailyDrill.skill")}
          title={t("dashboard:dailyDrill.title")}
          subtitle=""
          body=""
          ctaLabel={t("dashboard:dailyDrill.ctaLabel")}
          durationLabel={t("dashboard:dailyDrill.duration")}
          onCtaPress={noop}
          empty={{
            title: t("dashboard:dailyDrill.empty.title"),
            body: t("dashboard:dailyDrill.empty.body"),
            ctaLabel: t("dashboard:dailyDrill.empty.ctaLabel"),
          }}
          testID="accueil-priority-task"
        />
      )}
    </div>
  );
}

/**
 * Bug 3 — slim inline exam-date picker, ported from
 * `deutschfit-mobile/src/features/accueil/screens/AccueilScreen.tsx`'s
 * `ExamDatePickerInline`. Replaces the dark countdown hero on the
 * no-date / past-date branch. `role="group"` (not `role="button"`) on the
 * outer card since it wraps a nested interactive toggle + calendar —
 * same idiom as `CountdownHeroCard`'s non-clickable branch.
 */
interface ExamDatePickerInlineProps {
  readonly label: string;
  readonly openA11y: string;
  readonly closeA11y: string;
  readonly onSelect: (isoDate: string) => void;
  readonly testID?: string;
}

function ExamDatePickerInline({
  label,
  openA11y,
  closeA11y,
  onSelect,
  testID,
}: ExamDatePickerInlineProps) {
  const [isOpen, setOpen] = useState(false);

  const handleSelect = (iso: string): void => {
    setOpen(false);
    onSelect(iso);
  };

  return (
    <div
      className="rounded-3xl bg-bg-premium p-6 text-on-premium"
      data-testid={testID}
      role="group"
      aria-label={isOpen ? closeA11y : openA11y}
    >
      <button
        type="button"
        aria-expanded={isOpen}
        aria-label={isOpen ? closeA11y : openA11y}
        onClick={() => setOpen((cur) => !cur)}
        data-testid={testID ? `${testID}-toggle` : undefined}
        className="flex w-full items-center justify-between gap-2 text-left transition hover:opacity-90"
      >
        <AppText tone="inverse" family="serif" size="h3" weight="bold">
          {label}
        </AppText>
        <span className={clsx("inline-block", isOpen ? "-rotate-90" : "rotate-90")}>
          <Icon name="chevron" size={18} color="var(--color-on-premium)" />
        </span>
      </button>
      {isOpen ? (
        <MiniCalendar
          onSelect={handleSelect}
          testID={testID ? `${testID}-mini-calendar` : undefined}
        />
      ) : null}
    </div>
  );
}
