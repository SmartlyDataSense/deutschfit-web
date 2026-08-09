"use client";

/**
 * `PromptListScreen` — Schreiben entry point (S6 Task 6.6). Web port of
 * `deutschfit-mobile/src/features/writing/screens/PromptListScreen.tsx`
 * (617 lines — read fully before touching this file). Fetches
 * `listPrompts(board, level)` (S6 Task 6.2's web-parametrized signature —
 * the edge function itself still ignores the filters today, so this
 * still returns every board's prompts, same as mobile's unfiltered
 * fetch) and renders them grouped by Teil, with a free-text search box
 * and board/level filter chips narrowing the list client-side.
 *
 * Constraint 16 (binding): NO photo/OCR affordance. Mobile pairs each row
 * with "Au clavier" (typed Composer) + "En photo" (handwritten capture,
 * gated by `supportsPhotoCapture`). Web ships the keyboard path only —
 * the photo path is out of scope until the v1.1 OCR deferral lands
 * (`project_schreiben_ocr_v11`). Do not add a camera CTA, a
 * `supportsPhotoCapture` import, or any "En photo" string here.
 *
 * Exam-context hydration gate (S4 idiom, established by
 * `HoerenIntroScreen`/`LesenIntroScreen`/`PracticeHubScreen`): this route
 * is deep-linkable and its ancestor layout chain never calls
 * `hydrateExamContext()`, so the screen self-hydrates on mount. The
 * initial `listPrompts` fetch is gated on `isLoaded` — never fires on the
 * un-hydrated default (board, level), which would warm the wrong cache
 * key and could 404/empty-flash on a fresh reload.
 *
 * One-shot query params (all cleared via a single `router.replace` of the
 * bare `/schreiben` path once consumed, each guarded by its own ref so a
 * re-render never re-applies it):
 *   - `?created=1`   — the (future) custom-prompt screen invalidates the
 *     prompt-list cache before navigating back here; this triggers one
 *     extra `load()` so the new community prompt shows up immediately
 *     instead of waiting out the SWR window.
 *   - `?board=<tok>` — the practice hub's Schreiben row (see
 *     `PracticeHubScreen`) links here pre-filtered to the learner's
 *     `<board>-<level>` token. Seeds `boardFilter` exactly once; a chip
 *     tap after that always wins (the seed never re-applies).
 *   - `?submitted=1` — the (future) composer screen redirects back here
 *     after a successful submit. Mobile's `SchreibenEditorScreen` shows
 *     this as a toast with `testID="schreiben-submitted-toast"`
 *     (`writing:composer.submittedToast` copy); web has no toast system
 *     (established S3 replacement: an inline auto-dismissing banner, see
 *     `AccueilScreen`'s `examDateStatus`), so the same testID/copy is
 *     reused here as an inline `role="status"` banner instead.
 *
 * Error → inline banner + retry (web has no dedicated `ErrorState`
 * component — reuses `EmptyState` + `AppButton`, same pairing
 * `HoerenIntroScreen` uses). Empty (zero prompts in the DB) → distinct
 * `EmptyState` with a refresh CTA. Search/chip filters excluding
 * everything → inline "no results" copy below the controls, controls
 * stay mounted (mobile's `ListEmptyComponent` parity).
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useLocale } from "next-intl";
import { useTranslation } from "react-i18next";

import {
  AppButton,
  AppText,
  Card,
  Chip,
  EmptyState,
  Input,
  Skeleton,
} from "@/learner/ui/primitives";

import { listPrompts, type WritingPrompt } from "@/learner/core/api/examApi";
import { hydrateExamContext, useExamContextStore } from "@/learner/core/exam/examContext";

import { formatBoardLabel } from "../examBoardLabel";

const ALL_BOARDS = "all";

/** Inline submitted-banner lifetime — mirrors `AccueilScreen`'s toast replacement. */
const SUBMITTED_BANNER_TIMEOUT_MS = 4000;

type PromptSection = {
  readonly teil: number;
  readonly data: readonly WritingPrompt[];
};

/** Group prompts into Teil sections, ordered by Teil ascending. Verbatim port. */
function toSections(prompts: readonly WritingPrompt[]): PromptSection[] {
  const byTeil = new Map<number, WritingPrompt[]>();
  for (const p of prompts) {
    const bucket = byTeil.get(p.teil);
    if (bucket) bucket.push(p);
    else byTeil.set(p.teil, [p]);
  }
  return [...byTeil.entries()].sort(([a], [b]) => a - b).map(([teil, data]) => ({ teil, data }));
}

export function PromptListScreen() {
  const router = useRouter();
  const locale = useLocale();
  const searchParams = useSearchParams();
  const { t } = useTranslation(["writing"]);

  const board = useExamContextStore((s) => s.board);
  const level = useExamContextStore((s) => s.level);
  const isExamContextLoaded = useExamContextStore((s) => s.isLoaded);

  // This route has no ancestor that hydrates the exam-context store — same
  // idiom as `HoerenIntroScreen`/`PracticeHubScreen`. Idempotent/cheap to
  // call again if some other screen already did.
  useEffect(() => {
    void hydrateExamContext();
  }, []);

  const [prompts, setPrompts] = useState<WritingPrompt[]>([]);
  const [loading, setLoading] = useState(false);
  const [hasError, setHasError] = useState(false);
  const [search, setSearch] = useState("");
  const [boardFilter, setBoardFilter] = useState<string>(ALL_BOARDS);
  const [submittedVisible, setSubmittedVisible] = useState(false);

  const load = useCallback(async (): Promise<void> => {
    setLoading(true);
    setHasError(false);
    try {
      const rows = await listPrompts(board, level);
      setPrompts(rows);
    } catch {
      setHasError(true);
    } finally {
      setLoading(false);
    }
  }, [board, level]);

  // Hydration gate: no fetch fires until `isLoaded` flips true. Removing
  // this guard is exactly the regression the "guard-removal" unit test
  // covers — it would fetch against the un-hydrated default (board,
  // level) on every fresh mount/deep-link/hard-refresh.
  useEffect(() => {
    if (!isExamContextLoaded) return;
    void load();
  }, [isExamContextLoaded, load]);

  // One-shot query params — see module doc comment. Gated on
  // `isExamContextLoaded` too: consuming (and clearing) `?board=` before
  // hydration lands would seed `boardFilter` from a param the primary
  // load effect above hasn't had a chance to act on yet, and `?created=1`
  // firing `load()` pre-hydration would hit the same un-hydrated-default
  // trap the primary gate exists to prevent.
  const createdConsumedRef = useRef(false);
  const boardSeedConsumedRef = useRef(false);
  const submittedConsumedRef = useRef(false);
  const submittedTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (submittedTimeoutRef.current) clearTimeout(submittedTimeoutRef.current);
    };
  }, []);

  useEffect(() => {
    if (!isExamContextLoaded) return;

    const createdParam = searchParams.get("created");
    const boardParam = searchParams.get("board");
    const submittedParam = searchParams.get("submitted");

    let shouldClear = false;

    if (createdParam && !createdConsumedRef.current) {
      createdConsumedRef.current = true;
      shouldClear = true;
      void load();
    }

    if (boardParam && !boardSeedConsumedRef.current) {
      boardSeedConsumedRef.current = true;
      shouldClear = true;
      setBoardFilter(boardParam);
    }

    if (submittedParam && !submittedConsumedRef.current) {
      submittedConsumedRef.current = true;
      shouldClear = true;
      setSubmittedVisible(true);
      if (submittedTimeoutRef.current) clearTimeout(submittedTimeoutRef.current);
      submittedTimeoutRef.current = setTimeout(
        () => setSubmittedVisible(false),
        SUBMITTED_BANNER_TIMEOUT_MS
      );
    }

    if (shouldClear) {
      router.replace(`/${locale}/app/schreiben`);
    }
  }, [isExamContextLoaded, searchParams, load, locale, router]);

  const handleAddPress = useCallback((): void => {
    router.push(`/${locale}/app/schreiben/new`);
  }, [router, locale]);

  const handleTypedPress = useCallback(
    (item: WritingPrompt): void => {
      router.push(`/${locale}/app/schreiben/compose/${item.id}`);
    },
    [router, locale]
  );

  // Distinct boards present in the (unfiltered) data, sorted — drives the
  // filter chips. Derived from `prompts`, not the search/chip-filtered
  // subset, same as mobile.
  const boards = useMemo(() => {
    return [...new Set(prompts.map((p) => p.exam_board))].sort();
  }, [prompts]);

  // Apply the board chip + free-text search, then group by Teil.
  const sections = useMemo(() => {
    const query = search.trim().toLowerCase();
    const filtered = prompts.filter((p) => {
      const boardOk = boardFilter === ALL_BOARDS || p.exam_board === boardFilter;
      const searchOk = query.length === 0 || p.title_de.toLowerCase().includes(query);
      return boardOk && searchOk;
    });
    return toSections(filtered);
  }, [prompts, boardFilter, search]);

  const isLoading = loading || !isExamContextLoaded;

  if (isLoading) {
    return (
      <div
        className="mx-auto flex w-full max-w-2xl flex-col gap-4 px-4 py-8 lg:px-8"
        data-testid="schreiben-prompt-list-loading"
      >
        <Skeleton.Card />
        <Skeleton.Card />
        <Skeleton.Card />
      </div>
    );
  }

  if (hasError && prompts.length === 0) {
    return (
      <div
        className="mx-auto flex w-full max-w-2xl flex-col gap-4 px-4 py-8 lg:px-8"
        data-testid="schreiben-prompt-list-error"
      >
        <EmptyState
          title={t("writing:promptList.errorTitle")}
          description={t("writing:promptList.errorBody")}
        />
        <AppButton
          testID="schreiben-prompt-list-error-retry"
          label={t("writing:promptList.errorRetry")}
          onClick={() => void load()}
          variant="outline"
          className="self-start"
        />
      </div>
    );
  }

  // No prompts at all in the DB — distinct from "search/chip excluded them".
  if (prompts.length === 0) {
    return (
      <div
        className="mx-auto flex w-full max-w-2xl flex-col gap-4 px-4 py-8 lg:px-8"
        data-testid="schreiben-prompt-list-empty"
      >
        <EmptyState
          testID="schreiben-prompt-list-empty-state"
          title={t("writing:promptList.emptyTitle")}
          description={t("writing:promptList.emptyBody")}
          actionLabel={t("writing:promptList.emptyCta")}
          onAction={() => void load()}
        />
      </div>
    );
  }

  return (
    <div
      className="mx-auto flex w-full max-w-2xl flex-col gap-4 px-4 py-8 lg:px-8"
      data-testid="schreiben-prompt-list-screen"
    >
      <div className="flex flex-col gap-1">
        <AppText
          as="h1"
          family="serif"
          size="h1"
          weight="bold"
          testID="schreiben-prompt-list-title"
        >
          {t("writing:promptList.title")}
        </AppText>
        <AppText tone="secondary" size="body" testID="schreiben-prompt-list-subtitle">
          {t("writing:promptList.subtitle")}
        </AppText>
        <button
          type="button"
          onClick={handleAddPress}
          data-testid="schreiben-add-prompt"
          className="mt-2 min-h-11 self-start rounded-[var(--radius-sm)] border border-line-strong bg-bg-card px-4 py-2 transition hover:opacity-90"
        >
          <AppText tone="primary" size="body" weight="semi">
            {t("writing:promptList.addPrompt")}
          </AppText>
        </button>
      </div>

      {submittedVisible ? (
        <div
          role="status"
          aria-live="polite"
          data-testid="schreiben-submitted-toast"
          className="rounded-[var(--radius-md)] bg-success-subtle px-4 py-2 text-center"
        >
          <AppText tone="success" size="small" weight="medium">
            {t("writing:composer.submittedToast")}
          </AppText>
        </div>
      ) : null}

      <div className="flex flex-col gap-2">
        <Input
          testID="schreiben-prompt-list-search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t("writing:promptList.searchPlaceholder")}
          aria-label={t("writing:promptList.searchPlaceholder")}
        />
        <div className="flex flex-wrap gap-2">
          <Chip
            testID="schreiben-prompt-list-chip-all"
            label={t("writing:promptList.filterAll")}
            selected={boardFilter === ALL_BOARDS}
            onClick={() => setBoardFilter(ALL_BOARDS)}
          />
          {boards.map((b) => (
            <Chip
              key={b}
              testID={`schreiben-prompt-list-chip-${b}`}
              label={formatBoardLabel(b)}
              selected={boardFilter === b}
              onClick={() => setBoardFilter(b)}
            />
          ))}
        </div>
      </div>

      {sections.length === 0 ? (
        <div
          className="flex flex-col items-center gap-1 py-8 text-center"
          data-testid="schreiben-prompt-list-no-results"
        >
          <AppText tone="primary" size="body" weight="semi" align="center">
            {t("writing:promptList.noResultsTitle")}
          </AppText>
          <AppText tone="secondary" size="small" align="center">
            {t("writing:promptList.noResultsBody")}
          </AppText>
        </div>
      ) : (
        <div className="flex flex-col gap-5">
          {sections.map((section) => (
            <div key={section.teil} className="flex flex-col gap-3">
              <AppText
                tone="primary"
                size="small"
                weight="bold"
                testID={`schreiben-prompt-list-section-${section.teil}`}
              >
                {t("writing:promptList.teilSection", { teil: section.teil })}
              </AppText>
              <div className="flex flex-col gap-3">
                {section.data.map((item) => (
                  <Card
                    key={item.id}
                    testID={`schreiben-prompt-${item.id}`}
                    className="flex flex-col gap-2"
                  >
                    <div className="flex items-center gap-2">
                      <AppText tone="secondary" size="small" weight="semi">
                        {formatBoardLabel(item.exam_board)}
                      </AppText>
                      {item.source === "community" ? (
                        <Chip
                          testID={`schreiben-prompt-${item.id}-community-badge`}
                          label={t("writing:promptList.communityBadge")}
                        />
                      ) : null}
                    </div>
                    <AppText family="serif" size="bodyLg" weight="semi">
                      {item.title_de}
                    </AppText>
                    <AppText tone="secondary" size="small">
                      {t("writing:promptList.wordRange", {
                        min: item.min_words,
                        max: item.max_words,
                      })}
                    </AppText>
                    <AppButton
                      testID={`schreiben-prompt-${item.id}-keyboard`}
                      label={t("writing:promptList.actions.keyboard")}
                      onClick={() => handleTypedPress(item)}
                      variant="outline"
                      className="self-start"
                    />
                  </Card>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
