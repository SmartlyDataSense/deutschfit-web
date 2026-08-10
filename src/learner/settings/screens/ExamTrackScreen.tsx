"use client";

/**
 * `ExamTrackScreen` — web port of
 * `mobile/src/features/settings/screens/ExamTrackScreen.tsx`.
 * Beta-gated level picker (non-beta levels disabled with the
 * coming-soon caveat unless it's the CURRENT level), all-boards board
 * picker, diagnostic retake row, ConfirmExamChangeModal on save. On
 * save failure the modal stays open (mobile parity) and an inline
 * caption replaces mobile's warning toast (S11-D17).
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useLocale } from "next-intl";
import { useTranslation } from "react-i18next";

import { Icon } from "@/learner/core/icons/Icon";
import { AppText } from "@/learner/ui/primitives";
import { hydrateExamContext, useExamContextStore } from "@/learner/core/exam/examContext";
import {
  EXAM_BOARDS,
  EXAM_LEVELS,
  classifyExamChange,
  type ExamBoard,
  type ExamLevel,
} from "@/learner/core/exam/examTypes";
import { isLevelInBeta } from "@/learner/core/flags/betaLevels";
import { ConfirmExamChangeModal } from "@/learner/ui/blocks/ConfirmExamChangeModal";

import { SettingsPickerRow } from "../components/SettingsPickerRow";
import { SettingsRow } from "@/learner/profil/components/SettingsRow";

export function ExamTrackScreen() {
  const router = useRouter();
  const locale = useLocale();
  const { t } = useTranslation(["settings", "profil", "common"]);
  const { board: ctxBoard, level: ctxLevel, isLoaded, setExamContext } = useExamContextStore();

  const [board, setBoard] = useState<ExamBoard>(ctxBoard);
  const [level, setLevel] = useState<ExamLevel>(ctxLevel);
  const [modalOpen, setModalOpen] = useState(false);
  const [saveError, setSaveError] = useState(false);
  const savingRef = useRef(false);
  const seededRef = useRef(false);

  // Per-screen exam-context hydration (precedent AccueilScreen.tsx:103;
  // no ancestor layout does it). Idempotent + StrictMode-safe.
  useEffect(() => {
    void hydrateExamContext();
  }, []);

  // Seed the local picks from the store ONCE hydration completes. On a
  // direct page load `useState(ctxBoard)` above captured the unhydrated
  // defaults (goethe/b1) — without this one-shot re-seed, a telc/B2
  // learner's editor would baseline (and dirty-classify) against the
  // wrong pair. The UI below is gated on `isLoaded`, so the learner
  // cannot dirty the state before the seed lands.
  useEffect(() => {
    if (!isLoaded || seededRef.current) return;
    seededRef.current = true;
    setBoard(ctxBoard);
    setLevel(ctxLevel);
  }, [isLoaded, ctxBoard, ctxLevel]);

  const changeType = classifyExamChange({
    from: { board: ctxBoard, level: ctxLevel },
    to: { board, level },
  });
  const isDirty = changeType !== "none";

  const boardOptions = useMemo(
    () =>
      EXAM_BOARDS.map((value) => ({
        value,
        label: t(`common:examBoards.${value}`),
      })),
    [t]
  );
  const levelOptions = useMemo(
    () =>
      EXAM_LEVELS.map((value) => {
        const selectable = isLevelInBeta(value) || value === ctxLevel;
        return {
          value,
          label: t(`common:examLevels.${value}`),
          disabled: !selectable,
          caveat: selectable ? undefined : t("settings:exam.levelComingSoon"),
        };
      }),
    [t, ctxLevel]
  );

  const variant = changeType === "board" ? "board" : "level";
  const bullets =
    variant === "board"
      ? [
          t("profil:confirmExamChange.consequences.board.contentReset"),
          t("profil:confirmExamChange.consequences.board.diagnosticArchive"),
          t("profil:confirmExamChange.consequences.board.rePrompt"),
        ]
      : [
          t("profil:confirmExamChange.consequences.level.subsliceShift"),
          t("profil:confirmExamChange.consequences.level.keepsHistory"),
        ];

  const handleConfirm = (): void => {
    if (savingRef.current) return;
    savingRef.current = true;
    setSaveError(false);
    void (async () => {
      try {
        await setExamContext({ board, level, source: "settings" });
        setModalOpen(false);
        router.back();
      } catch {
        // Mobile parity: keep the modal OPEN on failure so the learner
        // can retry without re-picking.
        setSaveError(true);
      } finally {
        savingRef.current = false;
      }
    })();
  };

  // Loading gate until the exam context hydrates (see seed effect above).
  if (!isLoaded) {
    return (
      <div
        className="mx-auto flex w-full max-w-2xl flex-col gap-4 px-4 py-8 lg:px-8"
        data-testid="settings-exam-track-screen"
      >
        <div
          role="progressbar"
          aria-label={t("settings:exam.title")}
          data-testid="settings-exam-loading"
          className="h-14 animate-pulse rounded-[var(--radius-md)] bg-bg-card"
        />
      </div>
    );
  }

  return (
    <div
      className="mx-auto flex w-full max-w-2xl flex-col gap-4 px-4 py-8 lg:px-8"
      data-testid="settings-exam-track-screen"
    >
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => router.back()}
          aria-label={t("profil:header.backA11y")}
          data-testid="settings-exam-back"
          className="flex h-9 w-9 items-center justify-center rounded-full bg-bg-card transition hover:opacity-90"
        >
          <Icon name="back" size={18} label={t("profil:header.backA11y")} />
        </button>
        <AppText as="h1" family="serif" size="h3" weight="bold" tone="primary" className="flex-1 text-center">
          {t("settings:exam.title")}
        </AppText>
        <div className="h-9 w-9" aria-hidden="true" />
      </div>

      {/* Mobile renders exam.subtitle (ExamTrackScreen.tsx:187) — the
          betaSubtitle key exists in the locale files but is dead on mobile. */}
      <AppText size="body" tone="secondary">{t("settings:exam.subtitle")}</AppText>

      <SettingsPickerRow
        label={t("settings:exam.boardLabel")}
        value={board}
        options={boardOptions}
        onChange={setBoard}
        dirty={board !== ctxBoard}
        testID="settings-exam-board"
      />
      <SettingsPickerRow
        label={t("settings:exam.levelLabel")}
        value={level}
        options={levelOptions}
        onChange={setLevel}
        dirty={level !== ctxLevel}
        testID="settings-exam-level"
      />

      <SettingsRow
        label={t("settings:exam.retakeTitle")}
        value={t("settings:exam.retakeSubtitle")}
        onClick={() => router.push(`/${locale}/app/onboarding/diagnostic?mode=retake`)}
        testID="settings-exam-retake-row"
      />

      <button
        type="button"
        data-testid="settings-exam-save"
        disabled={!isDirty}
        onClick={() => setModalOpen(true)}
        className="min-h-11 rounded-full bg-cta px-4 transition hover:opacity-90 disabled:bg-line-soft"
      >
        <AppText size="body" weight="semi" tone={isDirty ? "inverse" : "tertiary"}>
          {t("common:actions.save")}
        </AppText>
      </button>

      {saveError ? (
        <div role="status" data-testid="settings-exam-save-error">
          <AppText size="small" tone="warning" weight="medium">
            {t("settings:exam.saveError")}
          </AppText>
        </div>
      ) : null}

      <ConfirmExamChangeModal
        visible={modalOpen}
        variant={variant}
        title={t(`profil:confirmExamChange.${variant}.title`)}
        subtitle={t("profil:confirmExamChange.transition", {
          // Mobile passes all four via the common:* labels
          // (ExamTrackScreen.tsx:148-152); the fr string consumes only
          // fromLevel/toLevel today, but the label source must match.
          fromBoard: t(`common:examBoards.${ctxBoard}`),
          fromLevel: t(`common:examLevels.${ctxLevel}`),
          toBoard: t(`common:examBoards.${board}`),
          toLevel: t(`common:examLevels.${level}`),
        })}
        bullets={bullets}
        confirmLabel={t("profil:confirmExamChange.confirm")}
        cancelLabel={t("profil:confirmExamChange.cancel")}
        onConfirm={handleConfirm}
        onCancel={() => setModalOpen(false)}
      />
    </div>
  );
}
