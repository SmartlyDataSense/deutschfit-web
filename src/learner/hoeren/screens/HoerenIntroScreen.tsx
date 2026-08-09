"use client";

/**
 * `HoerenIntroScreen` — graded Hören intro: modelltest picker + live drill
 * bootstrap (Task 5.9), at `/examen/hoeren`.
 *
 * ⚠️ DISCLAIMER — this screen is WEB-LED, not a mobile port. Mobile's
 * `HoerenIntroScreen` is retired (issue #473 legacy — the fixture-mode
 * intro that bypassed the exam-context level gate) and MUST NOT be used as
 * a template. The structural template for this screen is the WEB
 * `LesenIntroScreen` (Task 4.8, `src/learner/lesen/screens/
 * LesenIntroScreen.tsx`) — composition, hook shape, and the P6-fused start
 * flow all mirror that screen; only the content-specific pieces below are
 * new.
 *
 * Composition (top → bottom):
 *   - "Zurück" link → `/{locale}/app/examen` (hardcoded German text, NOT
 *     the French `common:actions.back` chrome string Lesen's icon button
 *     uses — this screen's copy is entirely hardcoded German exam content,
 *     same posture as the error/empty strings below, so it stays
 *     consistent rather than mixing in one French-chrome affordance).
 *   - Eyebrow track label — `formatExamTrackLabel(board, level)`.
 *   - Heading — `computeHoerenLevelLabels(level).examLabel` (e.g.
 *     `"Hören · B1"`), NOT a hardcoded "Modul Hören" string — the level is
 *     baked into the heading itself.
 *   - "Modelltest wählen" picker: rows from
 *     `useAvailableHoerenModelltests`. `data-testid="hoeren-modelltest-
 *     <slug>"` per row.
 *   - No "So funktioniert's" info card, no shape-line meta (P10 — this
 *     screen is intentionally leaner than Lesen's).
 *   - "Test starten" CTA — same **P6 fused contract** as `LesenIntroScreen`
 *     (see that screen's doc comment for the full rationale): this screen
 *     runs `startSession` itself and routes straight into the live session
 *     route (`/hoeren/session`) with the `moduleFilter=HOEREN` param
 *     contract `HoerenSessionScreen` expects (Task 5.7) — see
 *     `startHoerenDrill` below and `handleStart`'s route-building.
 *
 * Exam-context hydration guard — same idiom as `LesenIntroScreen`, but
 * here it is NOT merely a rendering nicety: `useAvailableHoerenModelltests`
 * itself gates its fetch on `isLoaded` because the level filter (P10) is
 * level-dependent (see that hook's doc comment). This screen still
 * self-hydrates on mount (the hook's own hydration effect is idempotent —
 * calling `hydrateExamContext()` twice is cheap/deduped) and folds
 * `!isExamContextLoaded` into the same loading condition as the hook's own
 * `loading` flag, so nothing renders until both the exam context AND the
 * filtered list have landed.
 *
 * Start-button re-entrancy + unmount guard: `isStartingRef` blocks a
 * second `startSession` call while one is already in flight; `isMountedRef`
 * is the S3 async-then-navigate idiom — identical to `LesenIntroScreen`.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useLocale } from "next-intl";

import { Icon } from "@/learner/core/icons/Icon";
import { AppButton, AppText, Card, EmptyState, Skeleton } from "@/learner/ui/primitives";

import type { ModelltestRow } from "@/learner/core/api/examApi";
import { useLearnerSession } from "@/learner/core/auth/useLearnerSession";
import { hydrateExamContext, useExamContextStore } from "@/learner/core/exam/examContext";
import { formatExamTrackLabel } from "@/learner/core/exam/examTypes";
import { startSession } from "@/learner/core/exam/mockExamSession";

import { computeHoerenLevelLabels } from "../hoerenUtils";
import { useAvailableHoerenModelltests } from "../hooks/useAvailableHoerenModelltests";

/**
 * Runs `mock-exam-start`/resume for the picked modelltest (drill mode —
 * `module: "HOEREN"`) and normalises the handle into the two values the
 * session route needs. `attemptId` mirrors `handle.hoerenAttemptId`
 * verbatim — `null` on a resumed attempt (per `SessionHandle`'s doc
 * comment, the 409 resume path never carries a module attempt id; the
 * session route falls back to hydrating via `examSlug` alone in that
 * case — `HoerenSessionScreen` → `useHoerenSession({examSlug})` →
 * `hoeren-start`), populated on a fresh 201.
 */
async function startHoerenDrill(
  userId: string,
  examSlug: string
): Promise<{ attemptId: string | null; mockAttemptId: string }> {
  const handle = await startSession({ userId, examSlug, module: "HOEREN" });
  return { attemptId: handle.hoerenAttemptId, mockAttemptId: handle.mockAttemptId };
}

export function HoerenIntroScreen() {
  const router = useRouter();
  const locale = useLocale();

  const board = useExamContextStore((s) => s.board);
  const level = useExamContextStore((s) => s.level);
  const isExamContextLoaded = useExamContextStore((s) => s.isLoaded);

  // This route has no ancestor that hydrates the exam-context store — same
  // idiom as `LesenIntroScreen`. Idempotent/cheap to call again if the
  // hook (or some other screen) already did.
  useEffect(() => {
    void hydrateExamContext();
  }, []);

  const { data, loading, error, refresh } = useAvailableHoerenModelltests();

  const [selectedSlug, setSelectedSlug] = useState<string | null>(null);
  const [startError, setStartError] = useState<string | null>(null);
  const [isStarting, setIsStarting] = useState(false);
  const isStartingRef = useRef(false);
  const isMountedRef = useRef(true);

  useEffect(() => {
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
        const { attemptId, mockAttemptId } = await startHoerenDrill(userId, effectiveSlug);
        if (!isMountedRef.current) return;
        // `attemptId` is only appended when fresh (`handle.hoerenAttemptId`
        // is null on a resumed attempt) — the HOEREN drill param contract
        // `HoerenSessionScreen` expects (Task 5.7).
        const attemptQuery = attemptId ? `&attemptId=${attemptId}` : "";
        router.push(
          `/${locale}/app/hoeren/session?examSlug=${effectiveSlug}&mockAttemptId=${mockAttemptId}${attemptQuery}&moduleFilter=HOEREN`
        );
      } catch (err) {
        if (!isMountedRef.current) return;
        // Soft inline error — same posture as `LesenIntroScreen`'s
        // `startError` banner: render the raw message, stay on the picker
        // so the learner can retry without losing their selection.
        setStartError(err instanceof Error ? err.message : String(err));
      } finally {
        isStartingRef.current = false;
        if (isMountedRef.current) setIsStarting(false);
      }
    })();
  }, [effectiveSlug, locale, router]);

  const backLink = (
    <button
      type="button"
      onClick={handleBack}
      data-testid="hoeren-intro-back"
      className="flex items-center gap-2 self-start rounded-full transition hover:opacity-90"
    >
      <Icon name="back" size={18} label="Zurück" />
      <AppText tone="secondary" size="small" weight="medium">
        Zurück
      </AppText>
    </button>
  );

  const isLoading = loading || !isExamContextLoaded;

  if (isLoading) {
    return (
      <div
        className="mx-auto flex w-full max-w-2xl flex-col gap-4 px-4 py-8 lg:px-8"
        data-testid="hoeren-intro-loading"
      >
        {backLink}
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
        data-testid="hoeren-intro-error"
      >
        {backLink}
        <EmptyState
          title="Modelltests konnten nicht geladen werden"
          description="Prüfe deine Internetverbindung und versuche es erneut."
        />
        <AppButton
          testID="hoeren-intro-error-retry"
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
        data-testid="hoeren-intro-empty"
      >
        {backLink}
        <EmptyState
          title="Noch keine Hören-Modelltests"
          description="Für diesen Kurs haben wir noch keine Hören-Inhalte im Content-Paket. Wechsle in den Einstellungen zu einem Kurs mit verfügbaren Modelltests, oder sieh bald wieder vorbei."
        />
      </div>
    );
  }

  const { examLabel } = computeHoerenLevelLabels(level);

  return (
    <div
      className="mx-auto flex w-full max-w-2xl flex-col gap-4 px-4 py-8 lg:px-8"
      data-testid="hoeren-intro-screen"
    >
      {backLink}

      <AppText
        tone="secondary"
        size="small"
        weight="medium"
        className="uppercase tracking-wide"
        testID="hoeren-intro-eyebrow"
      >
        {formatExamTrackLabel(board, level)}
      </AppText>

      <AppText
        as="h1"
        tone="primary"
        family="serif"
        size="h1"
        weight="bold"
        testID="hoeren-intro-title"
      >
        {examLabel}
      </AppText>

      <AppText as="h2" family="serif" size="h1" weight="bold" testID="hoeren-intro-picker-title">
        Modelltest wählen
      </AppText>
      <AppText tone="tertiary" size="small" testID="hoeren-intro-picker-meta">
        {`${data.length} Modelltest${data.length > 1 ? "s" : ""} verfügbar`}
      </AppText>

      <div className="flex flex-col gap-3">
        {data.map((row) => {
          const isSelected = row.slug === effectiveSlug;
          return (
            <Card
              key={row.slug}
              testID={`hoeren-modelltest-${row.slug}`}
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

      {startError ? (
        <div role="alert" data-testid="hoeren-intro-start-error">
          <AppText tone="warning" size="small">
            {startError}
          </AppText>
        </div>
      ) : null}

      <AppButton
        testID="hoeren-intro-start"
        label="Test starten"
        onClick={handleStart}
        disabled={!effectiveSlug}
        loading={isStarting}
      />
    </div>
  );
}
