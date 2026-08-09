"use client";

/**
 * `CustomTopicScreen` — community sprechen theme authoring form (S7 Task
 * 7.7). Web port of `deutschfit-mobile/src/features/sprechen/screens/
 * CustomTopicScreen.tsx` (553L) — read fully before touching this file.
 * Parity with `CustomPromptScreen` (Schreiben, S6 Task 6.7): collects a
 * title, exam board, CEFR level, description, and a min/max duration
 * range in seconds. Board + level pick the `(cert_code, level)` pair the
 * backend `topic-create` edge function persists to `qb_sl_topics` with
 * `source='community'`.
 *
 * Subgenre is NOT a field — derived from level server-side (B1 →
 * Präsentation, B2 → kurzer Vortrag, C1 → Referat; design D3, mirrored
 * client-side by `SUBGENRE_BY_LEVEL`). A hint line states the derived
 * task. Board × level combos the live grader cannot serve are disabled
 * (telc has no presentation-family monologue grader at C1 —
 * `LEVELS_BY_BOARD`). On success the screen seeds the topic handoff store
 * from the created row and navigates straight into the session route.
 *
 * Exam-context hydration gate (S4/S6/S7 idiom — see `CustomPromptScreen`,
 * the direct Schreiben analog of this screen, and `TopicPickerScreen`
 * 7.6): this route is deep-linkable and its ancestor layout chain never
 * calls `hydrateExamContext()`, so the screen self-hydrates on mount.
 * Unlike `TopicPickerScreen` (which only gates a data *fetch* on
 * `isLoaded`), this screen's initial board/level/duration defaults are
 * *seeded from* the exam context — same rationale as `CustomPromptScreen`
 * — so the whole form is gated behind `isExamContextLoaded` via a
 * `seededRef` guard: seeding from the un-hydrated (goethe, b1) default on
 * a fresh reload/deep-link would silently pre-fill the wrong board/level.
 * See `learner-sprechen-custom-topic.test.tsx`'s hydration-gate test
 * (guard-removal-verified — see task-7.7-report.md).
 *
 * Web deltas from mobile (already-made decisions, not re-litigated here):
 *   - No `useHaptic()` — no web equivalent, mobile's haptic calls are
 *     dropped entirely (same as every other web screen ported from
 *     mobile).
 *   - No `useNavigation()` — `router.back()` replaces
 *     `navigation.goBack()`; `router.push(...)` replaces
 *     `navigation.navigate("Session", {...})`, landing on
 *     `/sprechen/session/[topicId]` (spec §4) after seeding
 *     `useTopicHandoff` with the created `TopicCard` — same handoff
 *     contract `TopicPickerScreen` uses for a catalog pick (mobile passes
 *     the topic envelope through React Navigation params instead; web has
 *     no params channel for a route param, hence the store — parity note
 *     P18, `topicHandoffStore.ts`).
 *   - `createTopic` on web already returns the mapped `TopicCard` shape
 *     (not mobile's separate `CreatedTopic`), so no extra mapping step is
 *     needed before seeding the handoff store.
 *   - Submit re-entrancy: mobile's `submitting` state disables the
 *     button, but a `disabled` attribute update lags one render behind a
 *     synchronous double-click in a test harness. Ported here as the same
 *     `isSubmittingRef` guard idiom `CustomPromptScreen` uses (checked
 *     synchronously at the top of `handleSubmit`, ahead of the `disabled`
 *     DOM update).
 *
 * Constraint 15 (binding): feature code imports wire functions ONLY from
 * `@/learner/core/api/examApi` — never `./sprechenTopics` directly.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useLocale } from "next-intl";
import { useTranslation } from "react-i18next";

import { AppButton, AppText, Chip, Input, Skeleton, Textarea } from "@/learner/ui/primitives";

import { createTopic, SUBGENRE_BY_LEVEL, type SprechenCertCode } from "@/learner/core/api/examApi";
import { trackEvent } from "@/learner/core/analytics/posthog";
import { hydrateExamContext, useExamContextStore } from "@/learner/core/exam/examContext";

import { useTopicHandoff } from "../topicHandoffStore";

type Level = "B1" | "B2" | "C1";

const BOARD_OPTIONS: readonly SprechenCertCode[] = ["GOETHE", "OESD", "ECL", "TELC"];

/**
 * User-facing cert label. Proper nouns rendered in canonical casing —
 * ported verbatim from mobile's hardcoded `BOARD_LABELS` (brand-voice
 * §12), not sourced from `sprechen.json`. Duplicated (not imported) from
 * `TopicPickerScreen`'s module-private `CERT_LABELS` — same rationale as
 * mobile keeping its own copy beside `topicsApi.ts`'s constants.
 */
const BOARD_LABELS: Readonly<Record<SprechenCertCode, string>> = {
  GOETHE: "Goethe",
  OESD: "ÖSD",
  GOETHE_OESD: "Goethe / ÖSD",
  TELC: "telc",
  TESTDAF: "TestDaF",
  DSH: "DSH",
  ECL: "ECL",
};

const LEVEL_OPTIONS: readonly Level[] = ["B1", "B2", "C1"];

const LEVELS_BY_BOARD: Readonly<Record<SprechenCertCode, readonly Level[]>> = {
  GOETHE: ["B1", "B2", "C1"],
  OESD: ["B1", "B2", "C1"],
  GOETHE_OESD: ["B1", "B2", "C1"],
  ECL: ["B1", "B2", "C1"],
  TELC: ["B1", "B2"],
  TESTDAF: [],
  DSH: [],
};

const DURATION_DEFAULTS: Readonly<Record<Level, { min: number; max: number }>> = {
  B1: { min: 90, max: 180 },
  B2: { min: 150, max: 240 },
  C1: { min: 180, max: 300 },
};

const TITLE_MAX = 200;
const DESCRIPTION_MAX = 600;
const DURATION_CEILING_S = 600;

/** Server error codes with dedicated copy; anything else falls back to `generic`. */
const KNOWN_ERROR_CODES = [
  "invalid_payload",
  "invalid_json",
  "grader_unavailable_for_pair",
  "db_write_failed",
];

function resolveInitialBoard(examBoard: string): SprechenCertCode {
  const upper = examBoard.toUpperCase();
  return (BOARD_OPTIONS as readonly string[]).includes(upper)
    ? (upper as SprechenCertCode)
    : "GOETHE";
}

function resolveInitialLevel(examLevel: string): Level {
  const upper = examLevel.toUpperCase();
  return upper === "B2" || upper === "C1" ? (upper as Level) : "B1";
}

export function CustomTopicScreen() {
  const router = useRouter();
  const locale = useLocale();
  const { t } = useTranslation(["sprechen"]);

  const storeBoard = useExamContextStore((s) => s.board);
  const storeLevel = useExamContextStore((s) => s.level);
  const isExamContextLoaded = useExamContextStore((s) => s.isLoaded);
  const setHandoffTopic = useTopicHandoff((s) => s.setTopic);

  // This route has no ancestor that hydrates the exam-context store — same
  // idiom as `TopicPickerScreen`/`CustomPromptScreen`. Idempotent/cheap to
  // call again if some other screen already did.
  useEffect(() => {
    void hydrateExamContext();
  }, []);

  const [board, setBoard] = useState<SprechenCertCode>("GOETHE");
  const [level, setLevel] = useState<Level>("B1");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [minDuration, setMinDuration] = useState(String(DURATION_DEFAULTS.B1.min));
  const [maxDuration, setMaxDuration] = useState(String(DURATION_DEFAULTS.B1.max));
  const [submitting, setSubmitting] = useState(false);
  const [errorKey, setErrorKey] = useState<string | null>(null);

  const isSubmittingRef = useRef(false);
  const isMountedRef = useRef(true);
  useEffect(() => {
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  // Seed the form's initial board/level/duration defaults from the active
  // exam context exactly once, as soon as hydration lands. Gating the whole
  // form (not just a fetch, unlike `TopicPickerScreen`) behind
  // `isExamContextLoaded` avoids briefly seeding from the un-hydrated
  // (goethe, b1) default on a fresh reload/deep-link — same rationale as
  // `CustomPromptScreen`.
  const seededRef = useRef(false);
  useEffect(() => {
    if (!isExamContextLoaded || seededRef.current) return;
    seededRef.current = true;
    const initialBoard = resolveInitialBoard(storeBoard);
    const initialLevel = resolveInitialLevel(storeLevel);
    setBoard(initialBoard);
    setLevel(initialLevel);
    const d = DURATION_DEFAULTS[initialLevel];
    setMinDuration(String(d.min));
    setMaxDuration(String(d.max));
  }, [isExamContextLoaded, storeBoard, storeLevel]);

  const supportedLevels = LEVELS_BY_BOARD[board];

  const handleBoardPress = useCallback(
    (next: SprechenCertCode) => {
      setBoard(next);
      if (!LEVELS_BY_BOARD[next].includes(level)) {
        const clamped: Level = "B2";
        setLevel(clamped);
        const d = DURATION_DEFAULTS[clamped];
        setMinDuration(String(d.min));
        setMaxDuration(String(d.max));
      }
    },
    [level]
  );

  const handleLevelPress = useCallback(
    (next: Level) => {
      if (!supportedLevels.includes(next)) return;
      setLevel(next);
      const d = DURATION_DEFAULTS[next];
      setMinDuration(String(d.min));
      setMaxDuration(String(d.max));
    },
    [supportedLevels]
  );

  const trimmedTitle = title.trim();
  const trimmedDescription = description.trim();
  const min = Number.parseInt(minDuration, 10);
  const max = Number.parseInt(maxDuration, 10);
  const canSubmit =
    !submitting &&
    trimmedTitle.length >= 1 &&
    trimmedTitle.length <= TITLE_MAX &&
    trimmedDescription.length >= 1 &&
    trimmedDescription.length <= DESCRIPTION_MAX &&
    Number.isInteger(min) &&
    min > 0 &&
    Number.isInteger(max) &&
    max >= min &&
    max <= DURATION_CEILING_S;

  const handleSubmit = useCallback(async (): Promise<void> => {
    // Web delta: `isSubmittingRef` is checked synchronously, ahead of the
    // `submitting` state's DOM (`disabled`) update — same
    // `CustomPromptScreen`/`LesenSessionScreen` precedent for isolating a
    // rapid double-click inside a single React batch from the `disabled`
    // attribute's one-render lag.
    if (isSubmittingRef.current || !canSubmit) return;
    isSubmittingRef.current = true;
    setSubmitting(true);
    setErrorKey(null);
    try {
      const topicCard = await createTopic({
        certCode: board,
        level,
        titleDe: trimmedTitle,
        descriptionDe: trimmedDescription,
        minDurationS: min,
        maxDurationS: max,
      });
      trackEvent("custom_theme_submitted", {
        subgenre: topicCard.subgenre,
        level: topicCard.level,
        title_length: trimmedTitle.length,
        description_length: trimmedDescription.length,
      });
      setHandoffTopic(topicCard);
      router.push(`/${locale}/app/sprechen/session/${topicCard.id}`);
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
    setHandoffTopic,
    trimmedDescription,
    trimmedTitle,
  ]);

  if (!isExamContextLoaded) {
    return (
      <div
        className="mx-auto flex w-full max-w-2xl flex-col gap-4 px-4 py-8 lg:px-8"
        data-testid="sprechen-custom-topic-loading"
      >
        <Skeleton.Card />
        <Skeleton.Card />
      </div>
    );
  }

  return (
    <div
      className="mx-auto flex w-full max-w-2xl flex-col gap-4 px-4 py-8 lg:px-8"
      data-testid="sprechen-custom-topic"
    >
      <div className="flex flex-col gap-1">
        <button
          type="button"
          onClick={() => router.back()}
          data-testid="sprechen-custom-topic-cancel"
          className="self-start"
        >
          <AppText tone="secondary" size="body" weight="semi">
            {t("sprechen:customTopic.cancel")}
          </AppText>
        </button>
        <AppText
          as="h1"
          family="serif"
          size="h1"
          weight="bold"
          testID="sprechen-custom-topic-title"
        >
          {t("sprechen:customTopic.title")}
        </AppText>
        <AppText tone="secondary" size="body" testID="sprechen-custom-topic-subtitle">
          {t("sprechen:customTopic.subtitle")}
        </AppText>
      </div>

      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-2">
          <AppText tone="primary" size="small" weight="bold">
            {t("sprechen:customTopic.titleLabel")}
          </AppText>
          <Input
            testID="sprechen-custom-topic-theme"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder={t("sprechen:customTopic.titlePlaceholder")}
            aria-label={t("sprechen:customTopic.titleLabel")}
            maxLength={TITLE_MAX}
          />
        </div>

        <div className="flex flex-col gap-2">
          <AppText tone="primary" size="small" weight="bold">
            {t("sprechen:customTopic.boardLabel")}
          </AppText>
          <div className="flex flex-wrap gap-2">
            {BOARD_OPTIONS.map((b) => (
              <Chip
                key={b}
                testID={`sprechen-custom-topic-board-${b}`}
                label={BOARD_LABELS[b]}
                selected={b === board}
                onClick={() => handleBoardPress(b)}
              />
            ))}
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <AppText tone="primary" size="small" weight="bold">
            {t("sprechen:customTopic.levelLabel")}
          </AppText>
          <div className="flex flex-wrap gap-2">
            {LEVEL_OPTIONS.map((l) => (
              <Chip
                key={l}
                testID={`sprechen-custom-topic-level-${l}`}
                label={l}
                selected={l === level}
                disabled={!supportedLevels.includes(l)}
                onClick={() => handleLevelPress(l)}
              />
            ))}
          </div>
          <AppText tone="secondary" size="small" testID="sprechen-custom-topic-hint">
            {t("sprechen:customTopic.taskHint", {
              level,
              task: t(`sprechen:customTopic.tasks.${SUBGENRE_BY_LEVEL[level]}`),
            })}
          </AppText>
        </div>

        <div className="flex flex-col gap-2">
          <AppText tone="primary" size="small" weight="bold">
            {t("sprechen:customTopic.descriptionLabel")}
          </AppText>
          <Textarea
            testID="sprechen-custom-topic-description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder={t("sprechen:customTopic.descriptionPlaceholder")}
            aria-label={t("sprechen:customTopic.descriptionLabel")}
            maxLength={DESCRIPTION_MAX}
          />
        </div>

        <div className="flex flex-col gap-2">
          <AppText tone="primary" size="small" weight="bold">
            {t("sprechen:customTopic.durationLabel")}
          </AppText>
          <div className="flex gap-4">
            <div className="flex flex-1 flex-col gap-1">
              <AppText tone="secondary" size="small">
                {t("sprechen:customTopic.minDuration")}
              </AppText>
              <Input
                testID="sprechen-custom-topic-min-duration"
                value={minDuration}
                onChange={(e) => setMinDuration(e.target.value)}
                type="text"
                inputMode="numeric"
                aria-label={t("sprechen:customTopic.minDuration")}
              />
            </div>
            <div className="flex flex-1 flex-col gap-1">
              <AppText tone="secondary" size="small">
                {t("sprechen:customTopic.maxDuration")}
              </AppText>
              <Input
                testID="sprechen-custom-topic-max-duration"
                value={maxDuration}
                onChange={(e) => setMaxDuration(e.target.value)}
                type="text"
                inputMode="numeric"
                aria-label={t("sprechen:customTopic.maxDuration")}
              />
            </div>
          </div>
        </div>

        {errorKey ? (
          <AppText tone="warning" size="small" testID="sprechen-custom-topic-error" role="alert">
            {t(`sprechen:customTopic.errors.${errorKey}`)}
          </AppText>
        ) : null}

        <AppButton
          testID="sprechen-custom-topic-submit"
          label={t("sprechen:customTopic.submit")}
          onClick={() => void handleSubmit()}
          disabled={!canSubmit}
          loading={submitting}
          className="mt-2"
        />

        <AppText
          tone="secondary"
          size="small"
          align="center"
          testID="sprechen-custom-topic-share-note"
        >
          {t("sprechen:customTopic.shareNote")}
        </AppText>
      </div>
    </div>
  );
}
