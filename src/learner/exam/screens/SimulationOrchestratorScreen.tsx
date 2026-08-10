"use client";

/**
 * `SimulationOrchestratorScreen` — the full-mock-exam keystone (S8 · Task
 * 8.6). Boots (or resumes) the server-side `mock_exam_attempts` chain and
 * dispatches into the right leg route on every mount — the leg screens
 * (LESEN/HÖREN, Task 8.5) `router.replace` straight back to
 * `/examen/simulation?examSlug=<slug>` after each advance, so this screen
 * re-runs its boot on every hop rather than owning any persistent
 * in-session UI itself. Semantic reference: mobile's
 * `SimulationPlayerScreen.tsx:208–297` (the live-mode resume-or-start
 * effect + child-navigation dispatch effect this screen replaces) — the
 * fixture/offline chrome around it is NOT ported (anti-req 4; web has no
 * fixture path).
 *
 * P11 fix over mobile: mobile's resume branch (`SimulationPlayerScreen.tsx:222–231`)
 * hard-codes `nextModule = "LESEN"` on every resume, regardless of the
 * attempt's real status — a learner resuming after Hören would get bounced
 * back into Lesen. This screen instead re-reads the attempt row via
 * `getMockAttempt` on every resume and dispatches off `row.status`, the
 * server-authoritative value — never off `useSimulationRun`'s client-side
 * outcome cache (the 8.5 review's carry-forward: `recordOutcome` fires
 * before `advanceSession` in the legs, so a rejected advance can leave a
 * phantom client-side outcome for a leg the server never actually
 * completed).
 *
 * Phases (`dispatch` never itself renders — it always either
 * `router.replace`s into a leg route or flips `phase` to a state this
 * screen DOES render):
 *   - `"booting"`        — default. Silent `Skeleton` only (founding-doc
 *     §17 — no spinner/percentage copy); also what's showing while a
 *     dispatched `router.replace` is in flight.
 *   - `"schreiben_gate"` — `nextModuleForStatus` resolved to `"SCHREIBEN"`.
 *     Task 8.7 builds the real gate UI; this task ships the placeholder
 *     region + testID only.
 *   - `"finalizing"`     — any dispatch that means "the chain is done
 *     playing legs, go finalize": `nextModuleForStatus` resolved to
 *     `"SPRECHEN"` (P3 — the chain has no Sprechen leg; this is the
 *     refresh/reboot-after-schreiben-gate-advance recovery state) OR a
 *     `sprechen_done`/`finalized` status (`nextModuleForStatus` maps both,
 *     along with `abandoned`, to `null` — see the dispatch table below for
 *     how those three are told apart).
 *   - `"error"`          — `abandoned` status, an `getMockAttempt`-failure
 *     without a usable fallback, or an unexpected boot rejection.
 *     `EmptyState` + explicit retry (re-runs boot; the one-shot ref resets
 *     on failure so this actually works — see `runBoot`'s catch) + a
 *     separate back-to-`/examen` link.
 *
 * Dispatch table (P17, exhaustive over `MockExamModule | null` × the
 * handful of `status` values that can reach the `null` branch):
 *
 *   module        │ →
 *   ───────────────┼──────────────────────────────────────────────────────
 *   "LESEN"        │ `router.replace(examen/lesen/session?examSlug=&
 *                  │   mockAttemptId=&[attemptId=lesenAttemptId])`
 *   "HOEREN"       │ `router.replace(hoeren/session?examSlug=&
 *                  │   mockAttemptId=&[attemptId=hoerenAttemptId])`
 *                  │   — top-level `hoeren/session` path, NOT under
 *                  │   `examen/` (deliberate asymmetry, see the shipped
 *                  │   `hoeren/session/page.tsx`). Neither leg route ever
 *                  │   carries `moduleFilter` — that param is the drill-
 *                  │   only contract the intro screens use; a `null` child
 *                  │   id omits `attemptId` entirely (the session route
 *                  │   then re-hydrates from `examSlug` alone).
 *   "SCHREIBEN"    │ `setPhase("schreiben_gate")`
 *   "SPRECHEN"     │ `setPhase("finalizing")` — P3, unconditional.
 *   null, status:
 *     "sprechen_done" │ `setPhase("finalizing")` — the real terminal-null
 *                     │   status (FINALIZABLE), unreachable in practice
 *                     │   today (nothing currently drives an attempt past
 *                     │   `schreiben_done` before Sprechen ships), kept
 *                     │   for shape-truth against a future Sprechen leg.
 *     "finalized"     │ `setPhase("finalizing")` — dead branch: the 409
 *                     │   resume guard excludes `finalized` (a finalized
 *                     │   attempt never 409s), so `getMockAttempt` cannot
 *                     │   observe this status on the just-resumed handle
 *                     │   except via an exceedingly rare finalize-lands-
 *                     │   mid-read race. Assert-not-expected only; the
 *                     │   ordinary "retake" path never reaches here at
 *                     │   all — a finalized attempt doesn't 409, so
 *                     │   `startSession` just returns a fresh 201 and the
 *                     │   normal `resumed:false` branch runs.
 *     "abandoned"     │ `setPhase("error")`
 *     anything else   │ `setPhase("error")` — genuinely unexpected status
 *                     │   reaching the null branch (defensive only; every
 *                     │   real `MockExamStatus` that maps to `null` is one
 *                     │   of the three above).
 *
 * Boot algorithm (`runBoot`, gated on exam-context hydration — established
 * S4-S8 idiom, see `ExamHomeScreen`/`ModelltestsListScreen` doc comments —
 * and on a signed-in `userId`; this route sits behind `(protected)` so
 * that gate is expected to clear near-instantly):
 *
 *   1. No `examSlug` prop → `readPendingMockExam(userId)`. A row → adopt
 *      `row.modelltestSlug`. No row → `router.replace('/{locale}/app/examen')`.
 *   2. `startSession({ userId, examSlug })` (`@/learner/core/exam/
 *      mockExamSession` — NOT `examApi.startMockExam` directly; that
 *      service already folds the 409 "mock_in_progress" catch into a
 *      `resumed: true` handle, so this screen never touches
 *      `MockExamInProgressError` itself).
 *        - `resumed: false` (fresh 201) → `trackEvent("simulation_started",
 *          {board})` (P16 — fires ONCE, only here, never on resume) →
 *          `useSimulationRun.beginRun(examSlug, handle.mockAttemptId)` →
 *          `dispatch(handle.nextModule ?? "LESEN", handle.status, {…
 *          lesenAttemptId: handle.lesenAttemptId, hoerenAttemptId:
 *          handle.hoerenAttemptId})`.
 *        - `resumed: true` (409) → `getMockAttempt(handle.mockAttemptId)`:
 *            - resolves → `beginRun(examSlug, handle.mockAttemptId)`
 *              (no-op if it's the same attempt as before — StrictMode /
 *              re-boot safe) → `dispatch(nextModuleForStatus(row.status),
 *              row.status, {…lesenAttemptId: row.lesenAttemptId,
 *              hoerenAttemptId: row.hoerenAttemptId})` — P11, the whole
 *              point of this re-read.
 *            - rejects → LOUD `console.warn` + fall back to
 *              `dispatch(nextModuleForStatus(handle.status), handle.status,
 *              {…lesenAttemptId: null, hoerenAttemptId: null})` — the
 *              legacy (mobile-parity) path: correct module, no child id,
 *              the leg route re-hydrates from `examSlug` alone.
 *   3. Any other rejection from step 2 (a genuine `startSession` failure,
 *      not the 409 the service already handles) → `setPhase("error")` +
 *      reset the one-shot boot ref so the retry CTA can re-run this whole
 *      function.
 *
 * One-shot boot ref (`bootedRef`): guards both the mount effect (React
 * StrictMode's dev double-invoke) and the retry CTA against a second
 * concurrent `runBoot` call — same shape as `ExamHomeScreen`'s
 * `fetchedForUserIdRef` / `LesenSessionScreen`'s `startedRef`, but reset
 * inside `runBoot`'s catch (not just left `true` forever) so a failed boot
 * is actually re-enterable. `isMountedRef` guards every `setState`/
 * `router.replace` after an await, same idiom as `LesenIntroScreen`.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useLocale } from "next-intl";
import { useTranslation } from "react-i18next";

import { AppButton, EmptyState, Skeleton } from "@/learner/ui/primitives";

import {
  getMockAttempt,
  nextModuleForStatus,
  type MockAttemptRow,
  type MockExamModule,
  type MockExamStatus,
} from "@/learner/core/api/examApi";
import { trackEvent, type ExamBoardTag } from "@/learner/core/analytics/posthog";
import { useLearnerSession } from "@/learner/core/auth/useLearnerSession";
import { hydrateExamContext, useExamContextStore } from "@/learner/core/exam/examContext";
import type { ExamBoard } from "@/learner/core/exam/examTypes";
import { readPendingMockExam, startSession } from "@/learner/core/exam/mockExamSession";
import { useSimulationRun } from "@/learner/core/exam/simulationRunStore";

export interface SimulationOrchestratorScreenProps {
  readonly examSlug?: string;
}

type Phase = "booting" | "schreiben_gate" | "finalizing" | "error";

interface DispatchIds {
  readonly examSlug: string;
  readonly mockAttemptId: string;
  readonly lesenAttemptId: string | null;
  readonly hoerenAttemptId: string | null;
}

/** `ExamBoardTag` is a strict subset of `ExamBoard` (no `pflege` /
 * `beruf_tourismus` — those tracks have no mock-exam simulation). Full
 * simulations are only ever started against a modelltest already filtered
 * by `ModelltestsListScreen`'s `CERT_CODES_BY_BOARD`, so the excluded
 * boards should never actually reach this call in practice; `undefined`
 * (the property is optional on the event) is the safe fallback. */
function toExamBoardTag(board: ExamBoard): ExamBoardTag | undefined {
  return board === "pflege" || board === "beruf_tourismus" ? undefined : board;
}

function buildLegUrl(base: string, ids: DispatchIds, childId: string | null): string {
  const attemptQuery = childId ? `&attemptId=${childId}` : "";
  return `${base}?examSlug=${ids.examSlug}&mockAttemptId=${ids.mockAttemptId}${attemptQuery}`;
}

export function SimulationOrchestratorScreen({ examSlug }: SimulationOrchestratorScreenProps) {
  const router = useRouter();
  const locale = useLocale();
  const { t } = useTranslation(["common"]);

  const isExamContextLoaded = useExamContextStore((s) => s.isLoaded);
  const userId = useLearnerSession((s) => s.session?.user.id ?? null);

  const [phase, setPhase] = useState<Phase>("booting");

  const bootedRef = useRef(false);
  const isMountedRef = useRef(true);

  useEffect(() => {
    void hydrateExamContext();
  }, []);

  useEffect(() => {
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const dispatch = useCallback(
    (module: MockExamModule | null, status: MockExamStatus, ids: DispatchIds) => {
      if (!isMountedRef.current) return;

      if (module === "LESEN") {
        router.replace(buildLegUrl(`/${locale}/app/examen/lesen/session`, ids, ids.lesenAttemptId));
        return;
      }
      if (module === "HOEREN") {
        router.replace(buildLegUrl(`/${locale}/app/hoeren/session`, ids, ids.hoerenAttemptId));
        return;
      }
      if (module === "SCHREIBEN") {
        setPhase("schreiben_gate");
        return;
      }
      if (module === "SPRECHEN") {
        // P3 — the chain has no Sprechen leg. Any SPRECHEN dispatch (fresh
        // or resumed) means the mock is done playing legs; go finalize.
        setPhase("finalizing");
        return;
      }
      // module === null. `nextModuleForStatus` maps three distinct
      // statuses here (`sprechen_done`, `finalized`, `abandoned`) — the
      // status itself is what tells them apart.
      if (status === "abandoned") {
        setPhase("error");
        return;
      }
      if (status === "sprechen_done" || status === "finalized") {
        setPhase("finalizing");
        return;
      }
      // Genuinely unexpected — defensive only, see doc comment above.
      setPhase("error");
    },
    [locale, router]
  );

  const runBoot = useCallback(async () => {
    try {
      let slug = examSlug;
      if (!slug) {
        const pending = userId ? await readPendingMockExam(userId) : null;
        if (!isMountedRef.current) return;
        if (!pending) {
          router.replace(`/${locale}/app/examen`);
          return;
        }
        slug = pending.modelltestSlug;
      }
      if (!userId) return;

      const handle = await startSession({ userId, examSlug: slug });
      if (!isMountedRef.current) return;

      if (!handle.resumed) {
        const board = toExamBoardTag(useExamContextStore.getState().board);
        trackEvent("simulation_started", board ? { board } : {});
        useSimulationRun.getState().beginRun(slug, handle.mockAttemptId);
        dispatch(handle.nextModule ?? "LESEN", handle.status, {
          examSlug: slug,
          mockAttemptId: handle.mockAttemptId,
          lesenAttemptId: handle.lesenAttemptId,
          hoerenAttemptId: handle.hoerenAttemptId,
        });
        return;
      }

      // Resumed (409) — re-read the attempt row so dispatch derives from
      // the server-authoritative status (P11), not the 409 body's own
      // `handle.status` (which the service only echoes for the fallback
      // below) and never from `useSimulationRun`'s client-side outcomes.
      let row: MockAttemptRow | null = null;
      try {
        row = await getMockAttempt(handle.mockAttemptId);
      } catch (err) {
        if (!isMountedRef.current) return;
        console.warn(
          "[SimulationOrchestratorScreen] getMockAttempt failed on resume — falling back to the 409 handle's own status with no child attempt id.",
          err
        );
        dispatch(nextModuleForStatus(handle.status), handle.status, {
          examSlug: slug,
          mockAttemptId: handle.mockAttemptId,
          lesenAttemptId: null,
          hoerenAttemptId: null,
        });
        return;
      }
      if (!isMountedRef.current) return;

      if (!row) {
        // No row for this id — treat like the getMockAttempt-failure
        // fallback (same shape, same rationale: dispatch off whatever the
        // 409 body itself told us).
        console.warn(
          "[SimulationOrchestratorScreen] getMockAttempt returned no row on resume — falling back to the 409 handle's own status."
        );
        dispatch(nextModuleForStatus(handle.status), handle.status, {
          examSlug: slug,
          mockAttemptId: handle.mockAttemptId,
          lesenAttemptId: null,
          hoerenAttemptId: null,
        });
        return;
      }

      useSimulationRun.getState().beginRun(slug, handle.mockAttemptId);
      dispatch(nextModuleForStatus(row.status), row.status, {
        examSlug: slug,
        mockAttemptId: row.id,
        lesenAttemptId: row.lesenAttemptId,
        hoerenAttemptId: row.hoerenAttemptId,
      });
    } catch (err) {
      if (!isMountedRef.current) return;
      console.warn("[SimulationOrchestratorScreen] boot failed:", err);
      setPhase("error");
      // Reset the one-shot guard so the retry CTA (and any legitimate
      // future re-mount) can actually re-run this function — without this
      // line the retry button silently no-ops forever after one failure.
      bootedRef.current = false;
    }
  }, [dispatch, examSlug, locale, router, userId]);

  useEffect(() => {
    if (!isExamContextLoaded) return;
    if (!userId) return;
    if (bootedRef.current) return;
    bootedRef.current = true;
    void runBoot();
    // `runBoot` is intentionally excluded: `next/navigation`'s `useRouter()`
    // (real and every test mock in this suite) is not guaranteed referentially
    // stable across renders, so `dispatch`/`runBoot` are recreated on every
    // render. Including `runBoot` here would re-arm this effect on every
    // state change downstream of `router` — including the very `setPhase`
    // call inside `runBoot`'s own catch block, which would otherwise
    // immediately re-enter `runBoot` a second time (the reset `bootedRef`
    // is READ synchronously by this effect body, so a re-fire right after
    // the reset races the retry CTA). Gating on the two primitive booleans
    // is correct: this effect's only job is the ONE-SHOT initial boot: the
    // retry CTA (`handleRetry`) is the sole re-entry point after a failure.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isExamContextLoaded, userId]);

  const handleRetry = useCallback((): void => {
    if (bootedRef.current) return;
    bootedRef.current = true;
    setPhase("booting");
    void runBoot();
  }, [runBoot]);

  const handleBackToExamen = useCallback((): void => {
    router.push(`/${locale}/app/examen`);
  }, [router, locale]);

  return (
    <div
      className="mx-auto flex w-full max-w-2xl flex-col gap-4 px-4 py-8 lg:px-8"
      data-testid="simulation-orchestrator"
    >
      {phase === "booting" ? (
        <div className="flex flex-col gap-4" data-testid="simulation-orchestrator-booting">
          <Skeleton.Block width="60%" height={24} />
          <Skeleton.Card />
          <Skeleton.Card />
        </div>
      ) : null}

      {phase === "schreiben_gate" ? (
        // Task 8.7 builds the real Schreiben gate UI. This region is a
        // deliberate placeholder — the phase transition (the part this
        // task owns) is what's under test; the rendered content is not.
        <div data-testid="simulation-orchestrator-schreiben-gate">
          <Skeleton.Card />
        </div>
      ) : null}

      {phase === "finalizing" ? (
        <div className="flex flex-col gap-4" data-testid="simulation-orchestrator-finalizing">
          <Skeleton.Block width="60%" height={24} />
          <Skeleton.Card />
        </div>
      ) : null}

      {phase === "error" ? (
        <div
          className="flex flex-col items-center gap-3"
          data-testid="simulation-orchestrator-error"
        >
          <EmptyState
            title={t("common:error.genericTitle")}
            description={t("common:error.genericBody")}
          />
          <AppButton
            testID="simulation-orchestrator-error-retry"
            label={t("common:actions.retry")}
            onClick={handleRetry}
            variant="outline"
          />
          <AppButton
            testID="simulation-orchestrator-error-back"
            label={t("common:actions.back")}
            onClick={handleBackToExamen}
            variant="ghost"
          />
        </div>
      ) : null}
    </div>
  );
}
