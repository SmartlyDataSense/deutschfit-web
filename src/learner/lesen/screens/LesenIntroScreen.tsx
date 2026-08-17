"use client";

/**
 * `LesenIntroScreen` — graded Lesen intro: modelltest picker + live drill
 * bootstrap (Task 4.8). Web port of
 * `deutschfit-mobile/src/features/lesen/screens/LesenIntroScreen.tsx`.
 * German exam copy is kept byte-identical (hardcoded, same as mobile —
 * this is exam content, not app chrome, so it does NOT go through
 * react-i18next). Only the back-button a11y label pulls the French
 * `common:actions.back` chrome string — the same German-content /
 * French-chrome split every other module screen in this app uses.
 *
 * Composition (top → bottom):
 *   - Nav bar: sprite `back` button → `/{locale}/app/examen`, centered
 *     "Modul Lesen" title, right-hand spacer (same 3-part nav bar as
 *     `ChangeExamDateScreen`/`PerformanceHistoryScreen`).
 *   - Eyebrow track label (`formatExamTrackLabel(board, level)`).
 *   - "Modelltest wählen" picker: rows from `useAvailableLesenModelltests`
 *     (server: `modelltests-list?module=LESEN`, client sort by
 *     `sequence_num` nulls-last). `data-testid="lesen-modelltest-<slug>"`
 *     per row — consumed verbatim by the 4.11 e2e.
 *   - "So funktioniert's" info card + `formatLesenModuleShape(level)`
 *     shape meta.
 *   - "Test starten" CTA — **P6 fused contract** (web deliberately
 *     diverges from mobile here, per the Task 4.8 brief): mobile's intro
 *     just `navigation.navigate("LesenSession", {sessionSlug})` into a
 *     legacy fixture screen, and the *live* `mock-exam-start`/resume
 *     bootstrap instead lives in mobile's `SimulationPlayerScreen`. Web
 *     has no fixture path and no separate simulation-player screen yet,
 *     so this screen runs `startSession` itself and routes straight into
 *     the live session route with the `moduleFilter=LESEN` param contract
 *     `SimulationPlayerScreen` expects on mobile — see `startLesenDrill`
 *     below and `handleStart`'s route-building.
 *
 * Exam-context hydration guard (established idiom — see
 * `usePracticeSets`/`usePracticeSession` doc comments for the full
 * rationale this repeats): `/examen/lesen` is deep-linkable and its
 * ancestor layout chain never calls `hydrateExamContext()`. This screen
 * reads `board`/`level` from the store to render the eyebrow track label
 * and `formatLesenModuleShape(level)`, so a direct deep-link/refresh
 * would otherwise flash the un-hydrated defaults (`goethe`/`b1`) before
 * the learner's real track lands. The screen self-hydrates on mount and
 * folds `!isExamContextLoaded` into the same loading condition as the
 * modelltest-list hook's own `loading` flag — nothing that reads
 * `board`/`level` renders until `isLoaded` is `true`. Note the modelltest
 * fetch itself has NO board/level dependency (see the hook's doc
 * comment: `modelltests-list` filters by `module` only) — this gate is
 * purely about what gets *rendered*, not a second network call.
 *
 * Start-button re-entrancy + unmount guard: `isStartingRef` blocks a
 * second `startSession` call while one is already in flight (a
 * double-click can't leak two `mock_exam_attempts` rows — the `disabled`/
 * `loading` state on the button is the visible half of this, the ref is
 * the source-of-truth half, same split `ChangeExamDateScreen` uses for
 * its own "saving" guard). `isMountedRef` is the S3 async-then-navigate
 * idiom (`ChangeExamDateScreen`) — a start that resolves after the
 * learner has already navigated away must not call `router.push` or
 * touch state.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useLocale } from "next-intl";
import { useTranslation } from "react-i18next";

import { Icon } from "@/learner/core/icons/Icon";
import { AppButton, AppText, Card, EmptyState, Skeleton } from "@/learner/ui/primitives";

import type { ModelltestRow } from "@/learner/core/api/examApi";
import { useLearnerSession } from "@/learner/core/auth/useLearnerSession";
import { hydrateExamContext, useExamContextStore } from "@/learner/core/exam/examContext";
import { formatExamTrackLabel } from "@/learner/core/exam/examTypes";
import { startSession } from "@/learner/core/exam/mockExamSession";

import { formatLesenModuleShape } from "../data";
import { useAvailableLesenModelltests } from "../hooks/useAvailableModelltests";

/**
 * Runs `mock-exam-start`/resume for the picked modelltest and normalises
 * the handle into the two values the session route needs. `attemptId`
 * mirrors `handle.lesenAttemptId` verbatim — `null` on a resumed attempt
 * (the session route falls back to hydrating via `examSlug` alone in that
 * case, mirroring mobile's resume comment: "Resumed attempts don't
 * re-issue a module attempt id"), populated on a fresh 201.
 */
async function startLesenDrill(
  userId: string,
  examSlug: string
): Promise<{ attemptId: string | null; mockAttemptId: string }> {
  const handle = await startSession({ userId, examSlug });
  return { attemptId: handle.lesenAttemptId, mockAttemptId: handle.mockAttemptId };
}

export function LesenIntroScreen() {
  const router = useRouter();
  const locale = useLocale();
  const { t } = useTranslation(["common"]);

  const board = useExamContextStore((s) => s.board);
  const level = useExamContextStore((s) => s.level);
  const isExamContextLoaded = useExamContextStore((s) => s.isLoaded);

  // This route has no ancestor that hydrates the exam-context store (see
  // doc comment above) — trigger it here, same idiom as `usePracticeSets`.
  // `hydrateExamContext()` is idempotent/cheap to call again if some other
  // screen already did.
  useEffect(() => {
    void hydrateExamContext();
  }, []);

  const { data, loading, error, refresh } = useAvailableLesenModelltests();

  const [selectedSlug, setSelectedSlug] = useState<string | null>(null);
  const [startError, setStartError] = useState<string | null>(null);
  const [isStarting, setIsStarting] = useState(false);
  const isStartingRef = useRef(false);
  const isMountedRef = useRef(true);

  useEffect(() => {
    // Re-arm on every setup invocation (web#38 idiom, mirrors
    // `SimulationOrchestratorScreen`/`useWebPushSettings`): StrictMode's dev
    // double-invoke runs setup → cleanup → setup on mount, and a
    // cleanup-only effect would leave this ref permanently `false` after
    // that cycle, silently dropping any async work that resolves later.
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const effectiveSlug = selectedSlug ?? data?.[0]?.slug ?? null;

  const handleBack = (): void => {
    router.push(`/${locale}/app/examen`);
  };

  const handleSelect = (row: ModelltestRow): void => {
    setSelectedSlug(row.slug);
  };

  const handleStart = useCallback((): void => {
    // Re-entrancy: a second click while a start is already in flight is a
    // no-op — the ref is checked synchronously (not the `isStarting`
    // state, which only updates on the next render) so back-to-back
    // clicks in the same tick can't both pass the guard.
    if (!effectiveSlug || isStartingRef.current) return;
    const userId = useLearnerSession.getState().session?.user.id ?? null;
    if (!userId) return;
    isStartingRef.current = true;
    setIsStarting(true);
    setStartError(null);
    void (async () => {
      try {
        const { attemptId, mockAttemptId } = await startLesenDrill(userId, effectiveSlug);
        if (!isMountedRef.current) return;
        // Exact param order per the Task 4.8 brief: examSlug, mockAttemptId,
        // [attemptId], moduleFilter — SimulationPlayerScreen's LESEN drill
        // param contract on mobile.
        const attemptQuery = attemptId ? `&attemptId=${attemptId}` : "";
        router.push(
          `/${locale}/app/examen/lesen/session?examSlug=${effectiveSlug}&mockAttemptId=${mockAttemptId}${attemptQuery}&moduleFilter=LESEN`
        );
      } catch (err) {
        if (!isMountedRef.current) return;
        // Soft inline error — same posture as mobile's `submitError`
        // banner: render the raw message, stay on the picker so the
        // learner can retry without losing their selection.
        setStartError(err instanceof Error ? err.message : String(err));
      } finally {
        isStartingRef.current = false;
        if (isMountedRef.current) setIsStarting(false);
      }
    })();
  }, [effectiveSlug, locale, router]);

  const header = (
    <div className="flex items-center gap-3" data-testid="lesen-intro-navbar">
      <button
        type="button"
        onClick={handleBack}
        aria-label={t("common:actions.back")}
        data-testid="lesen-intro-back"
        className="flex h-9 w-9 items-center justify-center rounded-full bg-bg-card transition hover:opacity-90"
      >
        <Icon name="back" size={18} label={t("common:actions.back")} />
      </button>
      <AppText
        as="h1"
        tone="primary"
        family="serif"
        size="h3"
        weight="bold"
        className="flex-1 text-center"
        testID="lesen-intro-title"
      >
        Modul Lesen
      </AppText>
      {/* Right-hand spacer keeps the title visually centred, same size as
          the back button so the title's optical center matches (pattern
          shared with `ChangeExamDateScreen`/`PerformanceHistoryScreen`). */}
      <div className="h-9 w-9" aria-hidden="true" />
    </div>
  );

  const isLoading = loading || !isExamContextLoaded;

  if (isLoading) {
    return (
      <div
        className="mx-auto flex w-full max-w-2xl flex-col gap-4 px-4 py-8 lg:px-8"
        data-testid="lesen-intro-loading"
      >
        {header}
        <Skeleton.Card />
        <Skeleton.Card />
        <Skeleton.Card />
      </div>
    );
  }

  if (error && (!data || data.length === 0)) {
    return (
      <div
        className="mx-auto flex w-full max-w-2xl flex-col gap-4 px-4 py-8 lg:px-8"
        data-testid="lesen-intro-error"
      >
        {header}
        <EmptyState
          title="Modelltests konnten nicht geladen werden"
          description="Prüfe deine Internetverbindung und versuche es erneut."
        />
        <AppButton
          testID="lesen-intro-error-retry"
          label="Erneut versuchen"
          onClick={refresh}
          variant="outline"
          className="self-start"
        />
      </div>
    );
  }

  if (!data || data.length === 0) {
    return (
      <div
        className="mx-auto flex w-full max-w-2xl flex-col gap-4 px-4 py-8 lg:px-8"
        data-testid="lesen-intro-empty"
      >
        {header}
        <EmptyState
          title="Noch keine Lesen-Modelltests"
          description="Für diesen Kurs haben wir noch keine Lesen-Inhalte im Content-Paket. Wechsle in den Einstellungen zu einem Kurs mit verfügbaren Modelltests, oder sieh bald wieder vorbei."
        />
      </div>
    );
  }

  const shapeLabel = formatLesenModuleShape(level);

  return (
    <div
      className="mx-auto flex w-full max-w-2xl flex-col gap-4 px-4 py-8 lg:px-8"
      data-testid="lesen-intro-screen"
    >
      {header}

      <AppText
        tone="secondary"
        size="small"
        weight="medium"
        className="uppercase tracking-wide"
        testID="lesen-intro-eyebrow"
      >
        {formatExamTrackLabel(board, level)}
      </AppText>

      <AppText as="h2" family="serif" size="h1" weight="bold" testID="lesen-intro-picker-title">
        Modelltest wählen
      </AppText>
      <AppText tone="tertiary" size="small" testID="lesen-intro-picker-meta">
        {`${data.length} Modelltest${data.length > 1 ? "s" : ""} verfügbar`}
      </AppText>

      <div className="flex flex-col gap-3">
        {data.map((row) => {
          const isSelected = row.slug === effectiveSlug;
          return (
            <Card
              key={row.slug}
              testID={`lesen-modelltest-${row.slug}`}
              onClick={() => handleSelect(row)}
              className={isSelected ? "flex flex-col gap-1 ring-2 ring-cta" : "flex flex-col gap-1"}
            >
              <AppText size="body" weight="semi">
                {row.short_label ?? row.title}
              </AppText>
              <AppText tone="secondary" size="small">
                {row.title}
              </AppText>
            </Card>
          );
        })}
      </div>

      <div
        className="rounded-[var(--radius-lg)] border border-line-soft bg-bg-card p-6"
        data-testid="lesen-intro-info-card"
      >
        <AppText as="h3" size="h3" weight="semi">
          So funktioniert&apos;s
        </AppText>
        <AppText tone="secondary" size="body" className="mt-2">
          Lies jeden Text und beantworte die Aufgaben. Du kannst frei zwischen den Fragen wechseln.
          Wenn die Zeit abläuft, wird dein Versuch automatisch abgegeben.
        </AppText>
        <AppText tone="tertiary" size="small" className="mt-2">
          {shapeLabel}
        </AppText>
      </div>

      {startError ? (
        <div role="alert" data-testid="lesen-intro-start-error">
          <AppText tone="warning" size="small">
            {startError}
          </AppText>
        </div>
      ) : null}

      <AppButton
        testID="lesen-intro-start"
        label="Test starten"
        onClick={handleStart}
        disabled={!effectiveSlug}
        loading={isStarting}
      />
    </div>
  );
}
