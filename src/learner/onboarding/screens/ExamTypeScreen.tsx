"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useLocale } from "next-intl";
import { useTranslation } from "react-i18next";
import clsx from "clsx";

import { trackEvent } from "@/learner/core/analytics/posthog";
import { newIdempotencyKey } from "@/learner/core/api/client";
import { hydrateExamContext, useExamContextStore } from "@/learner/core/exam/examContext";
import {
  EXAM_BOARDS,
  EXAM_LEVELS,
  type ExamBoard,
  type ExamLevel,
} from "@/learner/core/exam/examTypes";
import { AppButton, AppText } from "@/learner/ui/primitives";

type DropdownKind = "board" | "level" | null;

/**
 * Onboarding step 1/3 — exam type (mandatory, post-Welcome). Web port of
 * `deutschfit-mobile/src/features/onboarding/screens/ExamTypeScreen.tsx`.
 *
 * Composition (top → bottom): progress line ("Étape 1 sur 3"), serif
 * title + subtitle, two labeled dropdown triggers (border turns
 * `accent-gold` once a value is chosen, `line-strong` otherwise), each
 * opening a fixed-inset overlay (`role="dialog"`) with a `role="radio"`
 * option list, and a sticky bottom primary CTA.
 *
 * Pre-seed rule (deviates slightly from the literal "seed whenever
 * isLoaded" mobile comment — see `examContext.ts`'s `ExamContextSource`
 * docstring: "onboarding can branch if the value is still the onboarding
 * default"): the store's `board`/`level` are never `null` — they start at
 * `DEFAULT_EXAM_BOARD`/`DEFAULT_EXAM_LEVEL` even before any real choice was
 * made. Seeding on `isLoaded` alone would pre-fill (and instantly enable
 * Continue for) a brand-new user who never touched this screen. Gating the
 * seed on `source === "settings"` instead only pre-selects for a user who
 * *actually* chose a track before (retake / revisit flows) — a brand-new
 * onboarding pass always starts from `source: "onboarding"` and sees
 * placeholders, matching mobile's product intent.
 */
export function ExamTypeScreen() {
  const router = useRouter();
  const locale = useLocale();
  const { t } = useTranslation(["onboarding", "common"]);

  const ctxBoard = useExamContextStore((s) => s.board);
  const ctxLevel = useExamContextStore((s) => s.level);
  const ctxSource = useExamContextStore((s) => s.source);
  const isLoaded = useExamContextStore((s) => s.isLoaded);
  const setExamContext = useExamContextStore((s) => s.setExamContext);

  const [board, setBoard] = useState<ExamBoard | null>(null);
  const [level, setLevel] = useState<ExamLevel | null>(null);
  const [busy, setBusy] = useState(false);
  const [saveError, setSaveError] = useState(false);
  const [openDropdown, setOpenDropdown] = useState<DropdownKind>(null);

  const seededRef = useRef(false);

  useEffect(() => {
    void hydrateExamContext();
  }, []);

  useEffect(() => {
    if (!isLoaded || seededRef.current) return;
    seededRef.current = true;
    if (ctxSource === "settings") {
      setBoard(ctxBoard);
      setLevel(ctxLevel);
    }
  }, [isLoaded, ctxSource, ctxBoard, ctxLevel]);

  useEffect(() => {
    if (openDropdown === null) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setOpenDropdown(null);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [openDropdown]);

  const canContinue = board !== null && level !== null && !busy;

  const handleContinue = async (): Promise<void> => {
    if (!canContinue || board === null || level === null) return;
    setBusy(true);
    setSaveError(false);
    try {
      await setExamContext({ board, level, source: "onboarding" });
      trackEvent("onboarding_step_completed", { step: "exam-type", index: 1 });
      router.push(
        `/${locale}/app/onboarding/diagnostic?attempt=${newIdempotencyKey()}&level=${level}&board=${board}&mode=onboarding`
      );
    } catch (err) {
      if (process.env.NODE_ENV !== "production") {
        console.warn("[onboarding] examType save failed:", err);
      }
      setSaveError(true);
      setBusy(false);
    }
  };

  const boardLabel =
    board !== null ? t(`common:examBoards.${board}`) : t("onboarding:exam.boardPlaceholder");
  const levelLabel =
    level !== null ? t(`common:examLevels.${level}`) : t("onboarding:exam.levelPlaceholder");

  return (
    <div data-testid="onboarding-exam-type-screen" className="flex min-h-screen flex-col">
      <div className="flex flex-1 flex-col gap-6">
        <AppText tone="tertiary" size="small">
          {t("onboarding:progress", { current: 1, total: 3 })}
        </AppText>

        <div className="flex flex-col gap-4">
          <AppText tone="primary" size="h1" weight="semi" family="serif">
            {t("onboarding:exam.title")}
          </AppText>
          <AppText tone="secondary" size="body">
            {t("onboarding:exam.subtitle")}
          </AppText>
        </div>

        <div className="flex flex-col gap-2">
          <AppText
            tone="secondary"
            size="small"
            weight="medium"
            className="tracking-wide uppercase"
          >
            {t("onboarding:exam.boardLabel")}
          </AppText>
          <DropdownTrigger
            testID="exam-board-trigger"
            label={boardLabel}
            selected={board !== null}
            expanded={openDropdown === "board"}
            onClick={() => setOpenDropdown("board")}
          />
        </div>

        <div className="flex flex-col gap-2">
          <AppText
            tone="secondary"
            size="small"
            weight="medium"
            className="tracking-wide uppercase"
          >
            {t("onboarding:exam.levelLabel")}
          </AppText>
          <DropdownTrigger
            testID="exam-level-trigger"
            label={levelLabel}
            selected={level !== null}
            expanded={openDropdown === "level"}
            onClick={() => setOpenDropdown("level")}
          />
        </div>

        {saveError ? (
          <AppText tone="warning" size="small" testID="onboarding-exam-type-save-error">
            {t("onboarding:exam.saveError")}
          </AppText>
        ) : null}
      </div>

      <div className="mt-auto pt-6">
        <AppButton
          label={t("onboarding:continue")}
          onClick={() => void handleContinue()}
          variant="solid"
          disabled={!canContinue}
          loading={busy}
          testID="onboarding-exam-type-continue"
        />
      </div>

      {openDropdown !== null ? (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--color-premium-black)]/60 px-6"
          onClick={() => setOpenDropdown(null)}
        >
          <div
            className="max-h-[70vh] w-full max-w-sm overflow-y-auto rounded-[var(--radius-lg)] bg-bg-card p-4 shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <AppText
              tone="secondary"
              size="small"
              weight="medium"
              className="mb-2 px-2 tracking-wide uppercase"
            >
              {openDropdown === "board"
                ? t("onboarding:exam.boardLabel")
                : t("onboarding:exam.levelLabel")}
            </AppText>
            {openDropdown === "board"
              ? EXAM_BOARDS.map((opt) => (
                  <DropdownOption
                    key={opt}
                    testID={`exam-board-option-${opt}`}
                    label={t(`common:examBoards.${opt}`)}
                    selected={board === opt}
                    onClick={() => {
                      setBoard(opt);
                      setOpenDropdown(null);
                    }}
                  />
                ))
              : EXAM_LEVELS.map((opt) => (
                  <DropdownOption
                    key={opt}
                    testID={`exam-level-option-${opt}`}
                    label={t(`common:examLevels.${opt}`)}
                    selected={level === opt}
                    onClick={() => {
                      setLevel(opt);
                      setOpenDropdown(null);
                    }}
                  />
                ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

interface DropdownTriggerProps {
  readonly testID: string;
  readonly label: string;
  readonly selected: boolean;
  readonly expanded: boolean;
  readonly onClick: () => void;
}

function DropdownTrigger({ testID, label, selected, expanded, onClick }: DropdownTriggerProps) {
  return (
    <button
      type="button"
      data-testid={testID}
      aria-expanded={expanded}
      onClick={onClick}
      className={clsx(
        "flex min-h-14 items-center justify-between rounded-[var(--radius-md)] border bg-bg-card px-4",
        "transition hover:opacity-90",
        selected ? "border-accent-gold" : "border-line-strong"
      )}
    >
      <AppText tone={selected ? "primary" : "tertiary"} size="body" weight="medium">
        {label}
      </AppText>
      <AppText tone="secondary" size="body" aria-hidden="true">
        ▾
      </AppText>
    </button>
  );
}

interface DropdownOptionProps {
  readonly testID: string;
  readonly label: string;
  readonly selected: boolean;
  readonly onClick: () => void;
}

function DropdownOption({ testID, label, selected, onClick }: DropdownOptionProps) {
  return (
    <button
      type="button"
      data-testid={testID}
      role="radio"
      aria-checked={selected}
      onClick={onClick}
      className={clsx(
        "flex min-h-[52px] w-full items-center justify-between rounded-[var(--radius-sm)] border-b border-line-soft px-2 text-left",
        "transition hover:opacity-90",
        selected ? "bg-bg-hero" : "bg-transparent"
      )}
    >
      <AppText tone="primary" size="body" weight={selected ? "semi" : "regular"}>
        {label}
      </AppText>
      {selected ? (
        <AppText tone="gold" size="body" weight="semi" aria-hidden="true">
          ✓
        </AppText>
      ) : null}
    </button>
  );
}
