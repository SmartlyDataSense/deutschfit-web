"use client";

/**
 * `CustomPromptScreen` — community writing-prompt authoring form (S6 Task
 * 6.7). Web port of `deutschfit-mobile/src/features/writing/screens/
 * CustomPromptScreen.tsx` (484 lines — read fully before touching this
 * file). A minimal v0 form: a theme name (the prompt title), an exam
 * board, a CEFR level, a Teil, and a word range. Board + level compose the
 * unified `<board>-<level>` token the backend stores; there is no board
 * whitelist (the unified grader dispatches by profile key and falls back
 * gracefully).
 *
 * The form is *recommendation-driven*, not gated: picking a level pre-fills
 * the Teil and the min/max word defaults that suit that level, but every
 * field stays editable. `situation_de` and `bullet_points` are not
 * collected — the v0 contract is title + word range only.
 *
 * On success the prompt is persisted to `community_writing_prompts` and
 * becomes visible to every learner through `prompts-list`, tagged
 * `source: "community"`. The screen then navigates back to
 * `PromptListScreen` with `?created=1` so the list reloads past its cache.
 *
 * Exam-context hydration gate (S4 idiom, established by
 * `HoerenIntroScreen`/`PromptListScreen`): this route is deep-linkable and
 * its ancestor layout chain never calls `hydrateExamContext()`, so the
 * screen self-hydrates on mount. Unlike `PromptListScreen` (which only
 * gates a data *fetch* on `isLoaded`), this screen's initial form state
 * (board/level/Teil/word defaults) is *seeded from* the exam context, so
 * the whole form is gated behind `isLoaded` — seeding the defaults from
 * the un-hydrated (board, level) default would silently pre-fill the
 * wrong recommendation on a fresh reload/deep-link.
 *
 * Web deltas from mobile (already-made decisions, not re-litigated here):
 *   - No `useHaptic()` — no web equivalent, mobile's haptic calls are
 *     dropped entirely (same as every other web screen ported from
 *     mobile).
 *   - No `useNavigation()` — `router.back()` replaces
 *     `navigation.goBack()`; `router.replace(...)` replaces
 *     `navigation.navigate("PromptList", { created: true })`, landing on
 *     `/schreiben?created=1` (the one-shot param `PromptListScreen`
 *     already consumes to force a reload past its cache).
 *   - `createPrompt` takes a second `invalidate: {examBoard, examLevel}`
 *     argument on web (`core/api/writing.ts`'s cache-key-exact
 *     invalidation, S6 Task 6.2 delta) — always the caller's *active* exam
 *     context (`useExamContextStore`), which may differ from the
 *     board/level chips the learner picked for this specific prompt (F6).
 *   - Submit re-entrancy: mobile's `submitting` state disables the button,
 *     but a `disabled` attribute update lags one render behind a
 *     synchronous double-click in a test harness (see
 *     `LesenSessionScreen.handleSubmit`'s `isSubmittingRef` precedent).
 *     Ported here as the same ref-guard idiom, checked synchronously at
 *     the top of `handleSubmit`, ahead of the `disabled` DOM update.
 *
 * Constraint 15 (binding): feature code imports wire functions ONLY from
 * `@/learner/core/api/examApi` — never `./writing` directly.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useLocale } from "next-intl";
import { useTranslation } from "react-i18next";

import { AppButton, AppText, Chip, Input, Skeleton } from "@/learner/ui/primitives";

import { createPrompt } from "@/learner/core/api/examApi";
import { hydrateExamContext, useExamContextStore } from "@/learner/core/exam/examContext";
import {
  DEFAULT_EXAM_BOARD,
  DEFAULT_EXAM_LEVEL,
  EXAM_BOARDS,
  LEVELS_BY_BOARD,
  normaliseExamSelection,
  type ExamBoard,
  type ExamLevel,
} from "@/learner/core/exam/examTypes";

import { formatBoardLabel } from "../examBoardLabel";

type Teil = 1 | 2 | 3;

/**
 * Boards offerable in the form. The backend `exam_board` format regex
 * (`^[a-z]+(-[a-z0-9]+)+$`) rejects an underscore, so boards whose token
 * contains one (`beruf_tourismus`) cannot compose a valid `<board>-<level>`
 * token and are filtered out. `pflege` legitimately survives the filter
 * and appears as a chip — mobile parity, not a bug.
 */
const BOARD_OPTIONS: readonly ExamBoard[] = EXAM_BOARDS.filter((b) => !b.includes("_"));

const TEIL_OPTIONS: readonly Teil[] = [1, 2, 3];

/** Per-level Teil + word-range defaults — a starting point, fully editable. */
const LEVEL_DEFAULTS: Readonly<
  Record<ExamLevel, { teil: Teil; minWords: number; maxWords: number }>
> = {
  a1: { teil: 1, minWords: 20, maxWords: 30 },
  a2: { teil: 1, minWords: 30, maxWords: 40 },
  b1: { teil: 2, minWords: 80, maxWords: 100 },
  b2: { teil: 2, minWords: 120, maxWords: 150 },
  c1: { teil: 3, minWords: 180, maxWords: 220 },
  c2: { teil: 3, minWords: 230, maxWords: 280 },
};

const TITLE_MAX = 200;

/** Server error codes with dedicated copy; anything else falls back to `generic`. */
const KNOWN_ERROR_CODES = ["invalid_payload", "invalid_json", "db_write_failed"];

export function CustomPromptScreen() {
  const router = useRouter();
  const locale = useLocale();
  const { t } = useTranslation(["writing"]);

  const storeBoard = useExamContextStore((s) => s.board);
  const storeLevel = useExamContextStore((s) => s.level);
  const isExamContextLoaded = useExamContextStore((s) => s.isLoaded);

  // This route has no ancestor that hydrates the exam-context store — same
  // idiom as `PromptListScreen`/`HoerenIntroScreen`. Idempotent/cheap to
  // call again if some other screen already did.
  useEffect(() => {
    void hydrateExamContext();
  }, []);

  const [board, setBoard] = useState<ExamBoard>(DEFAULT_EXAM_BOARD);
  const [level, setLevel] = useState<ExamLevel>(DEFAULT_EXAM_LEVEL);
  const [teil, setTeil] = useState<Teil>(LEVEL_DEFAULTS[DEFAULT_EXAM_LEVEL].teil);
  const [title, setTitle] = useState("");
  const [minWords, setMinWords] = useState(String(LEVEL_DEFAULTS[DEFAULT_EXAM_LEVEL].minWords));
  const [maxWords, setMaxWords] = useState(String(LEVEL_DEFAULTS[DEFAULT_EXAM_LEVEL].maxWords));
  const [submitting, setSubmitting] = useState(false);
  const [errorKey, setErrorKey] = useState<string | null>(null);

  const isSubmittingRef = useRef(false);
  const isMountedRef = useRef(true);
  useEffect(() => {
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  // Seed the form's initial board/level/Teil/word-range defaults from the
  // active exam context exactly once, as soon as hydration lands. Gating
  // the whole form (not just a fetch, unlike `PromptListScreen`) behind
  // `isExamContextLoaded` avoids briefly seeding from the un-hydrated
  // (goethe, b1) default on a fresh reload/deep-link.
  const seededRef = useRef(false);
  useEffect(() => {
    if (!isExamContextLoaded || seededRef.current) return;
    seededRef.current = true;
    setBoard(storeBoard);
    setLevel(storeLevel);
    const d = LEVEL_DEFAULTS[storeLevel];
    setTeil(d.teil);
    setMinWords(String(d.minWords));
    setMaxWords(String(d.maxWords));
  }, [isExamContextLoaded, storeBoard, storeLevel]);

  // Levels the chosen board ships — drives the level chips.
  const levels = LEVELS_BY_BOARD[board];

  // Picking a board may strand the level (e.g. testdaf has no B1); clamp it
  // and re-seed the level-driven defaults so the form stays coherent.
  const handleBoardPress = useCallback(
    (next: ExamBoard) => {
      const norm = normaliseExamSelection(next, level);
      setBoard(norm.board);
      if (norm.level !== level) {
        setLevel(norm.level);
        const d = LEVEL_DEFAULTS[norm.level];
        setTeil(d.teil);
        setMinWords(String(d.minWords));
        setMaxWords(String(d.maxWords));
      }
    },
    [level]
  );

  // Picking a level re-seeds the recommended Teil + word range.
  const handleLevelPress = useCallback((next: ExamLevel) => {
    setLevel(next);
    const d = LEVEL_DEFAULTS[next];
    setTeil(d.teil);
    setMinWords(String(d.minWords));
    setMaxWords(String(d.maxWords));
  }, []);

  const trimmedTitle = title.trim();
  const min = Number.parseInt(minWords, 10);
  const max = Number.parseInt(maxWords, 10);
  const canSubmit =
    !submitting &&
    trimmedTitle.length >= 1 &&
    trimmedTitle.length <= TITLE_MAX &&
    Number.isInteger(min) &&
    min > 0 &&
    Number.isInteger(max) &&
    max > 0 &&
    max >= min;

  const handleSubmit = useCallback(async (): Promise<void> => {
    // Web delta: `isSubmittingRef` is checked synchronously, ahead of the
    // `submitting` state's DOM (`disabled`) update — a rapid double-click
    // inside a single React batch would otherwise see the button as still
    // enabled for the second click (see `LesenSessionScreen.handleSubmit`
    // precedent for the same guard, and its test for why the `disabled`
    // attribute alone doesn't isolate this).
    if (isSubmittingRef.current || !canSubmit) return;
    isSubmittingRef.current = true;
    setSubmitting(true);
    setErrorKey(null);
    try {
      await createPrompt(
        {
          examBoard: `${board}-${level}`,
          teil,
          titleDe: trimmedTitle,
          minWords: min,
          maxWords: max,
        },
        // Active exam-context key parts, NOT the board/level chips the
        // learner may have picked for this specific prompt (F6) — the
        // prompt list the learner returns to is fetched under the active
        // context, so that's the cache row that must be invalidated.
        { examBoard: storeBoard, examLevel: storeLevel }
      );
      router.replace(`/${locale}/app/schreiben?created=1`);
    } catch (err) {
      const code = err instanceof Error ? err.message : "";
      setErrorKey(KNOWN_ERROR_CODES.includes(code) ? code : "generic");
    } finally {
      isSubmittingRef.current = false;
      if (isMountedRef.current) setSubmitting(false);
    }
  }, [
    board,
    canSubmit,
    level,
    locale,
    max,
    min,
    router,
    storeBoard,
    storeLevel,
    teil,
    trimmedTitle,
  ]);

  if (!isExamContextLoaded) {
    return (
      <div
        className="mx-auto flex w-full max-w-2xl flex-col gap-4 px-4 py-8 lg:px-8"
        data-testid="schreiben-custom-prompt-loading"
      >
        <Skeleton.Card />
        <Skeleton.Card />
      </div>
    );
  }

  return (
    <div
      className="mx-auto flex w-full max-w-2xl flex-col gap-4 px-4 py-8 lg:px-8"
      data-testid="schreiben-custom-prompt-screen"
    >
      <div className="flex flex-col gap-1">
        <button
          type="button"
          onClick={() => router.back()}
          data-testid="schreiben-custom-prompt-cancel"
          className="self-start"
        >
          <AppText tone="secondary" size="body" weight="semi">
            {t("writing:customPrompt.cancel")}
          </AppText>
        </button>
        <AppText
          as="h1"
          family="serif"
          size="h1"
          weight="bold"
          testID="schreiben-custom-prompt-title"
        >
          {t("writing:customPrompt.title")}
        </AppText>
        <AppText tone="secondary" size="body" testID="schreiben-custom-prompt-subtitle">
          {t("writing:customPrompt.subtitle")}
        </AppText>
      </div>

      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-2">
          <AppText tone="primary" size="small" weight="bold">
            {t("writing:customPrompt.themeLabel")}
          </AppText>
          <Input
            testID="schreiben-custom-prompt-theme"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder={t("writing:customPrompt.themePlaceholder")}
            aria-label={t("writing:customPrompt.themeLabel")}
            maxLength={TITLE_MAX}
          />
        </div>

        <div className="flex flex-col gap-2">
          <AppText tone="primary" size="small" weight="bold">
            {t("writing:customPrompt.boardLabel")}
          </AppText>
          <div className="flex flex-wrap gap-2">
            {BOARD_OPTIONS.map((b) => (
              <Chip
                key={b}
                testID={`schreiben-custom-prompt-board-${b}`}
                label={formatBoardLabel(b)}
                selected={b === board}
                onClick={() => handleBoardPress(b)}
              />
            ))}
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <AppText tone="primary" size="small" weight="bold">
            {t("writing:customPrompt.levelLabel")}
          </AppText>
          <div className="flex flex-wrap gap-2">
            {levels.map((l) => (
              <Chip
                key={l}
                testID={`schreiben-custom-prompt-level-${l}`}
                label={l.toUpperCase()}
                selected={l === level}
                onClick={() => handleLevelPress(l)}
              />
            ))}
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <AppText tone="primary" size="small" weight="bold">
            {t("writing:customPrompt.teilLabel")}
          </AppText>
          <div className="flex flex-wrap gap-2">
            {TEIL_OPTIONS.map((tn) => (
              <Chip
                key={tn}
                testID={`schreiben-custom-prompt-teil-${tn}`}
                label={t("writing:customPrompt.teilOption", { teil: tn })}
                selected={tn === teil}
                onClick={() => setTeil(tn)}
              />
            ))}
          </div>
          <AppText tone="secondary" size="small" testID="schreiben-custom-prompt-teil-hint">
            {t("writing:customPrompt.teilHint", {
              teil: LEVEL_DEFAULTS[level].teil,
              level: level.toUpperCase(),
            })}
          </AppText>
        </div>

        <div className="flex flex-col gap-2">
          <AppText tone="primary" size="small" weight="bold">
            {t("writing:customPrompt.wordsLabel")}
          </AppText>
          <div className="flex gap-4">
            <div className="flex flex-1 flex-col gap-1">
              <AppText tone="secondary" size="small">
                {t("writing:customPrompt.minWords")}
              </AppText>
              <Input
                testID="schreiben-custom-prompt-min-words"
                value={minWords}
                onChange={(e) => setMinWords(e.target.value)}
                type="text"
                inputMode="numeric"
                aria-label={t("writing:customPrompt.minWords")}
              />
            </div>
            <div className="flex flex-1 flex-col gap-1">
              <AppText tone="secondary" size="small">
                {t("writing:customPrompt.maxWords")}
              </AppText>
              <Input
                testID="schreiben-custom-prompt-max-words"
                value={maxWords}
                onChange={(e) => setMaxWords(e.target.value)}
                type="text"
                inputMode="numeric"
                aria-label={t("writing:customPrompt.maxWords")}
              />
            </div>
          </div>
        </div>

        {errorKey ? (
          <AppText tone="warning" size="small" testID="schreiben-custom-prompt-error" role="alert">
            {t(`writing:customPrompt.errors.${errorKey}`)}
          </AppText>
        ) : null}

        <AppButton
          testID="schreiben-custom-prompt-submit"
          label={t("writing:customPrompt.submit")}
          onClick={() => void handleSubmit()}
          disabled={!canSubmit}
          loading={submitting}
          className="mt-2"
        />

        <AppText
          tone="secondary"
          size="small"
          align="center"
          testID="schreiben-custom-prompt-share-note"
        >
          {t("writing:customPrompt.shareNote")}
        </AppText>
      </div>
    </div>
  );
}
