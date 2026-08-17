"use client";

/**
 * `ModelltestsListScreen` (S8 · Task 8.4) — the picker between the Examen
 * hub and the full-simulation player. Web port of
 * `deutschfit-mobile/src/features/exam/screens/ModelltestsListScreen.tsx`
 * (402L) — that file is the spec for the client-side cert/level filter
 * (mobile :110–124), the post-hydration fetch gate (mobile :144–150), and
 * the row copy (title + `short_label`).
 *
 * Web delta (P12, pinned by the S8 slice plan): every row starts a FULL
 * simulation — `router.push('/examen/simulation?examSlug=<slug>')`.
 * Mobile's `moduleFilter` route param and the `UNSUPPORTED_DRILL_MODULES`
 * toast machinery (mobile :57–70, :160–168) are NOT ported — web's per-
 * module drills (Lesen/Hören) keep their own shipped intro screens
 * (`LesenIntroScreen`/`HoerenIntroScreen`), so this screen never needs to
 * distinguish a module drill from a full mock.
 *
 * web#32 fix (round 1 — LESEN-only, superseded): the list was first
 * fetched via a single `listModelltests({ module: "LESEN" })` call. Review
 * caught that this only guarantees a valid *entry* point — a row with
 * LESEN but missing HOEREN (the chain's second forced step) still got
 * offered and still launched, only to strand one screen later on
 * `HoerenSessionScreen`'s defensive empty state. See
 * `FULL_SIMULATION_REQUIRED_MODULES` below for the fix round 2 fetch,
 * which checks presence across the whole chain, not one module.
 *
 * The full-simulation chain (`SimulationOrchestratorScreen`) always starts
 * at LESEN — the backend's `mock-exam-start`/`mock-exam-advance` state
 * machine is a fixed LESEN→HOEREN→SCHREIBEN chain
 * (`_shared/mock_exam.ts`'s `NEXT_MODULE` table, mirrored client-side by
 * `nextModuleForStatus` in `@/learner/core/api/examApi`), blind to which
 * modules a given Modelltest actually has content for. A Modelltest
 * missing any module in that chain would still start a "full" mock and
 * eventually strand the learner on an empty session with an orphaned
 * attempt. `listModelltests` only accepts one `?module=` filter per call
 * (no backend change in scope here), so `fetchFullSimulationModelltests`
 * below issues one filtered request per required module — reusing the
 * backend's existing inner-join gate (`modelltests-list/index.ts`,
 * already shipped for #59's mono-module drills) — and intersects the
 * results on `slug`: a row is offered only if it appears in *every*
 * response. No backend change needed, no new field invented on
 * `ModelltestRow`.
 *
 * Web delta: no pull-to-refresh — RN's `RefreshControl` has no web analog.
 * The error state's retry button is the only refresh affordance (also
 * reachable from the empty state's CTA, mobile parity).
 *
 * Client-side cert + level filter (mobile :110–124, verbatim): the
 * `modelltests-list` edge function returns every published row; this
 * screen narrows to `cert_code ∈ CERT_CODES_BY_BOARD[board] && level_code
 * === level.toUpperCase()` so a Goethe B1 user never sees TELC / ECL
 * cards. `CERT_CODES_BY_BOARD` is shipped in `@/learner/core/exam/
 * examTypes` (S7's `TopicPickerScreen` is the existing import site) — not
 * redeclared here.
 *
 * Exam-context hydration guard — established S4-S8 idiom (see
 * `ExamHomeScreen`/`LesenIntroScreen`/`TopicPickerScreen` doc comments for
 * the full rationale this repeats): `/examen/modelltests` is deep-linkable
 * and its ancestor layout chain never calls `hydrateExamContext()`. This
 * screen self-hydrates on mount and gates BOTH the render (a neutral gate
 * frame, testID `modelltestsList.gate`) AND the fetch effect on `isLoaded`
 * so a direct deep-link/hard-refresh never fetches against the un-hydrated
 * default (`goethe`/`b1`) track. The fetch effect's own gate
 * (`if (!isExamContextLoaded) return`) is what makes it StrictMode-safe —
 * the effect body is a no-op on both invocations of React 18 dev's
 * synchronous mount→cleanup→mount double-invoke while `isLoaded` is still
 * false, so the fetch only ever fires on the later, non-double-invoked
 * `isLoaded: true` transition. See `learner-modelltests-list.test.tsx`'s
 * `guard-removal-verified` test, which reproduces this under
 * `<StrictMode>`.
 *
 * Retry (error state) / refresh (empty state) both bump `reloadKey`, which
 * re-runs the same gated effect — no separate ref-based one-shot guard is
 * needed here (unlike `ExamHomeScreen`'s value-keyed `fetchedForUserIdRef`)
 * because there is no per-call identity to dedupe against; the effect's
 * `cancelled` closure flag is the only guard required to keep a stale
 * in-flight response from clobbering a newer one.
 *
 * N7 (do NOT "fix"): `examen:modelltests.emptyTitle` is German ("Keine
 * Prüfungen verfügbar") in the fr locale file — a mobile-parity quirk
 * shipped byte-identical on web already (`fr/examen.json:51`). Ported
 * as-is.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useLocale } from "next-intl";
import { useTranslation } from "react-i18next";

import { Icon } from "@/learner/core/icons/Icon";
import { AppButton, AppText, Card, Chip, EmptyState, Skeleton } from "@/learner/ui/primitives";

import {
  listModelltests,
  type MockExamModule,
  type ModelltestRow,
} from "@/learner/core/api/examApi";
import { hydrateExamContext, useExamContextStore } from "@/learner/core/exam/examContext";
import { CERT_CODES_BY_BOARD } from "@/learner/core/exam/examTypes";

/**
 * web#32 fix round 2 — every module the full-simulation chain actually
 * walks on a fresh start: LESEN → HOEREN → SCHREIBEN (`NEXT_MODULE` in
 * backend `_shared/mock_exam.ts`, mirrored by `nextModuleForStatus`).
 * SPRECHEN is deliberately excluded: `nextModuleForStatus("schreiben_done")`
 * resolves to `"SPRECHEN"` only as a finalize signal, never an actual leg
 * the chain routes to (see `SimulationOrchestratorScreen`'s "B1 recovery
 * path" handling) — so a row's SPRECHEN content is irrelevant to whether
 * it can complete the chain.
 *
 * Named and exported (not inlined into the fetch call) specifically so a
 * future change to the chain's module order is a one-line edit here
 * instead of a second special-cased filter silently drifting out of sync.
 */
export const FULL_SIMULATION_REQUIRED_MODULES: readonly MockExamModule[] = [
  "LESEN",
  "HOEREN",
  "SCHREIBEN",
] as const;

/**
 * Issues one `listModelltests({ module })` call per entry in
 * `FULL_SIMULATION_REQUIRED_MODULES` and intersects the results on
 * `slug` — a row is returned only if it appears in every response, i.e.
 * only if it carries every module the chain will walk. See the class doc
 * comment above for why this can't be a single backend call.
 */
async function fetchFullSimulationModelltests(): Promise<readonly ModelltestRow[]> {
  const [first, ...rest] = await Promise.all(
    FULL_SIMULATION_REQUIRED_MODULES.map((module) => listModelltests({ module }))
  );
  if (!first) return [];
  const restSlugSets = rest.map((rows) => new Set(rows.map((row) => row.slug)));
  return first.filter((row) => restSlugSets.every((slugs) => slugs.has(row.slug)));
}

export function ModelltestsListScreen() {
  const router = useRouter();
  const locale = useLocale();
  const { t } = useTranslation(["examen", "common"]);

  const board = useExamContextStore((s) => s.board);
  const level = useExamContextStore((s) => s.level);
  const isExamContextLoaded = useExamContextStore((s) => s.isLoaded);

  // This route has no ancestor that hydrates the exam-context store (see
  // doc comment above) — trigger it here, same idiom as
  // `ExamHomeScreen`/`TopicPickerScreen`. Idempotent/cheap to call again if
  // some other screen already did.
  useEffect(() => {
    void hydrateExamContext();
  }, []);

  const [modelltests, setModelltests] = useState<readonly ModelltestRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [hasError, setHasError] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    // Wait for the exam context to hydrate so we don't fetch — and filter —
    // against the default (goethe/b1) and then rerender under the user's
    // real track a tick later.
    if (!isExamContextLoaded) return;
    let cancelled = false;
    setLoading(true);
    setHasError(false);
    void (async () => {
      try {
        // web#32 — filters to Modelltests that carry every module the
        // full-simulation chain will walk (see doc comment above).
        const rows = await fetchFullSimulationModelltests();
        if (cancelled) return;
        setModelltests(rows);
      } catch {
        if (cancelled) return;
        setHasError(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isExamContextLoaded, reloadKey]);

  const handleRetry = useCallback((): void => {
    setReloadKey((k) => k + 1);
  }, []);

  const handleBack = useCallback((): void => {
    router.push(`/${locale}/app/examen`);
  }, [router, locale]);

  const handleRowPress = useCallback(
    (row: ModelltestRow): void => {
      // Web delta (P12): every row starts a full simulation — no
      // `moduleFilter` param, no unsupported-drill toast branch (mobile
      // :152–178 dropped entirely). Web's per-module drills keep their own
      // shipped intro screens.
      router.push(`/${locale}/app/examen/simulation?examSlug=${row.slug}`);
    },
    [router, locale]
  );

  const allowedCertCodes = useMemo(() => new Set(CERT_CODES_BY_BOARD[board]), [board]);
  const levelCode = level.toUpperCase();
  const visibleModelltests = useMemo(
    () =>
      modelltests.filter(
        (row) => allowedCertCodes.has(row.cert_code) && row.level_code === levelCode
      ),
    [modelltests, allowedCertCodes, levelCode]
  );

  if (!isExamContextLoaded) {
    return (
      <div
        className="mx-auto flex w-full max-w-2xl flex-col gap-4 px-4 py-8 lg:px-8"
        data-testid="modelltestsList.gate"
      >
        <Skeleton.Block width="30%" height={20} />
        <Skeleton.Block width="60%" height={28} />
        <Skeleton.Card />
        <Skeleton.Card />
        <Skeleton.Card />
      </div>
    );
  }

  const body = (() => {
    if (loading) {
      return (
        <div className="flex flex-col gap-3" data-testid="modelltestsList.loading">
          <Skeleton.Card />
          <Skeleton.Card />
          <Skeleton.Card />
        </div>
      );
    }
    if (hasError) {
      return (
        <div
          className="flex flex-col items-center gap-3 py-8 text-center"
          data-testid="modelltestsList.error"
        >
          <AppText family="serif" size="h3" weight="semi" align="center">
            {t("examen:modelltests.errorTitle")}
          </AppText>
          <AppText tone="secondary" size="body" align="center">
            {t("examen:modelltests.errorBody")}
          </AppText>
          <AppButton
            testID="modelltestsList.error.retry"
            label={t("examen:modelltests.errorRetry")}
            onClick={handleRetry}
            variant="outline"
          />
        </div>
      );
    }
    if (visibleModelltests.length === 0) {
      return (
        <EmptyState
          testID="modelltestsList.empty"
          title={t("examen:modelltests.emptyTitle")}
          description={t("examen:modelltests.emptyBody")}
          actionLabel={t("examen:modelltests.emptyCta")}
          onAction={handleBack}
        />
      );
    }
    return (
      <div className="flex flex-col gap-3" data-testid="modelltestsList.list">
        {visibleModelltests.map((row) => (
          <Card
            key={row.id}
            testID={`modelltestsList.row.${row.slug}`}
            onClick={() => handleRowPress(row)}
            className="flex flex-col gap-1"
          >
            <div className="flex items-center justify-between gap-2">
              <AppText family="serif" size="h3" weight="semi" className="flex-1">
                {row.title}
              </AppText>
              <Chip label={`${row.cert_code} · ${row.level_code}`} />
            </div>
            {row.short_label ? (
              <AppText tone="secondary" size="body">
                {row.short_label}
              </AppText>
            ) : null}
          </Card>
        ))}
      </div>
    );
  })();

  return (
    <div
      className="mx-auto flex w-full max-w-2xl flex-col gap-4 px-4 py-8 lg:px-8"
      data-testid="modelltestsList"
    >
      <div className="flex items-center gap-3" data-testid="modelltestsList.navbar">
        <button
          type="button"
          onClick={handleBack}
          aria-label={t("common:actions.back")}
          data-testid="modelltestsList.back"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-bg-card transition hover:opacity-90"
        >
          <Icon name="back" size={18} label={t("common:actions.back")} />
        </button>
        <div className="flex flex-1 flex-col gap-1">
          <AppText as="h1" family="serif" size="h1" weight="bold" testID="modelltestsList.title">
            {t("examen:modelltests.title")}
          </AppText>
          <AppText tone="secondary" size="body" testID="modelltestsList.subtitle">
            {t("examen:modelltests.subtitle")}
          </AppText>
        </div>
      </div>

      {body}
    </div>
  );
}
