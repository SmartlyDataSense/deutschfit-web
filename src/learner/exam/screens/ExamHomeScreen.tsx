"use client";

/**
 * `ExamHomeScreen` — the Examen tab landing screen (S8 · Task 8.3). Web
 * port of `deutschfit-mobile/src/features/exam/screens/ExamHomeScreen.tsx`
 * (251L) for the track badge / title / resume-card slice — the mobile file
 * is the spec for those three pieces (composition order, `readPendingMockExam`
 * fetch-effect shape, resume-card copy/testID). The three module +
 * simulation cards below are a **web-led block** (P13) — mobile's screen
 * has no card affordances today (S2 sh-5 trimmed it to a single
 * non-interactive "Bientôt disponible" hero, see mobile's own doc comment);
 * this screen instead surfaces the orphaned-but-shipped `examen:cards.*`
 * copy as three real, routable cards.
 *
 * Composition (top → bottom):
 *   1. Exam-track badge — `formatExamTrackLabel(board, level)` from the
 *      exam-context store, rendered as a non-interactive `Chip`.
 *   2. Title/subtitle — `examen:home.title` / `examen:home.subtitle`.
 *   3. Resume card (only when `readPendingMockExam(userId)` resolves a
 *      row) — `examen:resume.*` copy, `testID="examHome.resume"`. Tap
 *      fires `exam_home_card_tapped {card:"resume"}` then routes to
 *      `/examen/simulation?examSlug=<row.modelltestSlug>` (the 409-resume
 *      path `mock-exam-start` already understands — see S8 progress
 *      ledger's 8.10 smoke note). `readPendingMockExam` shipped S4
 *      (`mockExamSession.ts:150`) with no caller — this is its first.
 *   4. Three cards from `examen:cards.{lesen,hoeren,simulation}`
 *      ({title, description}, byte-identical fr/en) — real buttons
 *      (`Card`'s `onClick` variant renders a native `<button>`, so every
 *      card is keyboard-reachable with no extra wiring):
 *        - lesen      → `/examen/lesen`      {card:"module", module:"LESEN"}
 *        - hoeren     → `/examen/hoeren`     {card:"module", module:"HOEREN"}
 *        - simulation → `/examen/modelltests` {card:"full_simulation"}
 *
 * Web delta (P13): mobile's "bientôt disponible" hero (`examen:home.hero.*`)
 * is NOT rendered here — that hero is mobile's own WIP placeholder for
 * this exact surface (S2 sh-5's "Examen = Bientôt vitrine" trim); this
 * screen replaces the placeholder with the real thing instead of porting
 * a second placeholder alongside it.
 *
 * Exam-context hydration guard — established S4-S7 idiom (see
 * `LesenIntroScreen`/`HoerenIntroScreen`/`PracticeHubScreen` doc comments
 * for the full rationale this repeats): `/examen` is deep-linkable and its
 * ancestor layout chain never calls `hydrateExamContext()`. This screen
 * self-hydrates on mount and gates both the track-badge render AND the
 * pending-mock-exam fetch on `isLoaded` so a direct deep-link/hard-refresh
 * never flashes the un-hydrated default track, and never warms the
 * pending-scan against a stale/default board+level combo.
 *
 * Pending-mock-exam fetch effect — value-keyed one-shot ref +
 * `isMountedRef` guard + reset-on-failure (S7 Constraint 9, carried into
 * S8; mirrors `FeedbackScreen.tsx`'s `fetchedPromptIdRef` exactly, not a
 * plain boolean): `fetchedForUserIdRef` stores the `userId` the scan last
 * ran for, so the guard both blocks a second concurrent call (React
 * StrictMode's dev double-invoke fires this effect's setup twice,
 * synchronously, before either call's promise settles) AND still re-runs
 * the scan on a genuine `userId` change while mounted (the effect's own
 * declared dependency) — a plain boolean would stick forever after the
 * first success. The resume scan is best-effort — a rejection resets the
 * ref to `null` so a later *legitimate* re-run (dependency change, or the
 * same `userId` again) is not permanently blocked by one earlier failure.
 * `userId` is read reactively off `useLearnerSession` (mirrors mobile's
 * `useAuth((s) => s.session?.user?.id ?? null)` selector for this exact
 * effect — web's own selector is `s.session?.user.id`, no `?.` before
 * `.id` since `user` is non-optional once `session` exists).
 */
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useLocale } from "next-intl";
import { useTranslation } from "react-i18next";

import type { IconName } from "@/learner/core/icons/iconSprite";
import { Icon } from "@/learner/core/icons/Icon";
import { AppText, Card, Chip, Skeleton } from "@/learner/ui/primitives";

import { trackEvent, type ExamModuleTag } from "@/learner/core/analytics/posthog";
import { useLearnerSession } from "@/learner/core/auth/useLearnerSession";
import { hydrateExamContext, useExamContextStore } from "@/learner/core/exam/examContext";
import { formatExamTrackLabel } from "@/learner/core/exam/examTypes";
import { readPendingMockExam, type MockExamCacheRecord } from "@/learner/core/exam/mockExamSession";

type HomeCardKey = "lesen" | "hoeren" | "simulation";

const CARD_ICON: Record<HomeCardKey, IconName> = {
  lesen: "lesen",
  hoeren: "hoeren",
  simulation: "exam",
};

const CARD_ROUTE: Record<HomeCardKey, string> = {
  lesen: "/examen/lesen",
  hoeren: "/examen/hoeren",
  simulation: "/examen/modelltests",
};

const CARD_ORDER: readonly HomeCardKey[] = ["lesen", "hoeren", "simulation"];

export function ExamHomeScreen() {
  const router = useRouter();
  const locale = useLocale();
  const { t } = useTranslation(["examen", "common"]);

  const board = useExamContextStore((s) => s.board);
  const level = useExamContextStore((s) => s.level);
  const isExamContextLoaded = useExamContextStore((s) => s.isLoaded);
  const userId = useLearnerSession((s) => s.session?.user.id ?? null);

  const [pending, setPending] = useState<MockExamCacheRecord | null>(null);
  const fetchedForUserIdRef = useRef<string | null>(null);
  const isMountedRef = useRef(true);

  // This route has no ancestor that hydrates the exam-context store (see
  // doc comment above) — trigger it here, same idiom as
  // `LesenIntroScreen`/`PracticeHubScreen`. Idempotent/cheap to call again
  // if some other screen already did.
  useEffect(() => {
    void hydrateExamContext();
  }, []);

  useEffect(() => {
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  // Pending-mock-exam scan — module doc comment above has the full
  // rationale for the ref shape. Gated on `isExamContextLoaded` for the
  // same reason the render below is: no fetch before the real track has
  // landed.
  useEffect(() => {
    if (!isExamContextLoaded) return;
    if (!userId) return;
    if (fetchedForUserIdRef.current === userId) return;
    fetchedForUserIdRef.current = userId;
    void (async () => {
      try {
        const row = await readPendingMockExam(userId);
        if (isMountedRef.current) setPending(row);
      } catch {
        // Best-effort — the hub still renders below even when the local
        // pending-scan fails (offline, Dexie unavailable). Reset the guard
        // so a later legitimate re-run isn't permanently blocked by this
        // one failure (S7 Constraint 9).
        fetchedForUserIdRef.current = null;
        if (isMountedRef.current) setPending(null);
      }
    })();
  }, [isExamContextLoaded, userId]);

  const handleResume = (): void => {
    if (!pending) return;
    trackEvent("exam_home_card_tapped", { card: "resume" });
    router.push(`/${locale}/app/examen/simulation?examSlug=${pending.modelltestSlug}`);
  };

  const handleCard = (card: HomeCardKey): void => {
    if (card === "simulation") {
      trackEvent("exam_home_card_tapped", { card: "full_simulation" });
    } else {
      const moduleTag: ExamModuleTag = card === "lesen" ? "LESEN" : "HOEREN";
      trackEvent("exam_home_card_tapped", { card: "module", module: moduleTag });
    }
    router.push(`/${locale}/app${CARD_ROUTE[card]}`);
  };

  if (!isExamContextLoaded) {
    return (
      <div
        className="mx-auto flex w-full max-w-2xl flex-col gap-4 px-4 py-8 lg:px-8"
        data-testid="examHome.loading"
      >
        <Skeleton.Block width="30%" height={20} aria-label={t("examen:home.title")} />
        <Skeleton.Block width="60%" height={28} aria-label={t("examen:home.title")} />
        <Skeleton.Card aria-label={t("examen:home.title")} />
        <Skeleton.Card aria-label={t("examen:home.title")} />
        <Skeleton.Card aria-label={t("examen:home.title")} />
      </div>
    );
  }

  return (
    <div
      className="mx-auto flex w-full max-w-2xl flex-col gap-4 px-4 py-8 lg:px-8"
      data-testid="examHome"
    >
      <Chip
        label={formatExamTrackLabel(board, level)}
        testID="examHome.trackBadge"
        className="self-start"
      />

      <AppText as="h1" family="serif" size="h1" weight="bold" testID="examHome.title">
        {t("examen:home.title")}
      </AppText>
      <AppText tone="secondary" size="body" testID="examHome.subtitle">
        {t("examen:home.subtitle")}
      </AppText>

      {pending ? (
        <button
          type="button"
          onClick={handleResume}
          aria-label={t("examen:resume.a11y")}
          data-testid="examHome.resume"
          className="block w-full rounded-[var(--radius-lg)] border border-line-strong bg-bg-card p-4 text-left shadow-sm transition hover:opacity-90"
        >
          <AppText as="h2" family="serif" size="h3" weight="bold">
            {t("examen:resume.title")}
          </AppText>
          <AppText tone="secondary" size="body" className="mt-1">
            {t("examen:resume.body")}
          </AppText>
          <AppText tone="primary" size="body" weight="medium" className="mt-1">
            {t("examen:resume.cta")}
          </AppText>
        </button>
      ) : null}

      <div className="flex flex-col gap-3">
        {CARD_ORDER.map((card) => (
          <Card
            key={card}
            testID={`examHome.card.${card}`}
            onClick={() => handleCard(card)}
            className="flex items-center gap-3"
          >
            <div className="flex h-11 w-11 items-center justify-center rounded-[var(--radius-md)] bg-bg-subtle">
              <Icon name={CARD_ICON[card]} size={24} />
            </div>
            <div className="flex flex-1 flex-col">
              <AppText family="serif" size="bodyLg" weight="semi">
                {t(`examen:cards.${card}.title`)}
              </AppText>
              <AppText tone="secondary" size="small">
                {t(`examen:cards.${card}.description`)}
              </AppText>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
