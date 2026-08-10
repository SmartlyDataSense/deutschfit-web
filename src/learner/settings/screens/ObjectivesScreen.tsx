"use client";

/**
 * `ObjectivesScreen` — web port of
 * `mobile/src/features/settings/screens/ObjectivesScreen.tsx`.
 * Hydrates from `user_objectives` (cancelled-flag mount effect —
 * web#38), edits motivation + daily minutes via SettingsPickerRow,
 * upserts on save. Option labels reuse the onboarding namespace
 * (mobile parity). Inline captions replace mobile toasts (S11-D17).
 * No exam-context store read here — this screen edits `user_objectives`
 * only, so it does not need its own `hydrateExamContext()` call.
 */
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslation } from "react-i18next";

import { Icon } from "@/learner/core/icons/Icon";
import { AppText } from "@/learner/ui/primitives";
import type {
  OnboardingMotivation,
  OnboardingSchedule,
} from "@/learner/onboarding/state/useOnboardingAnswers";

import { SettingsPickerRow } from "../components/SettingsPickerRow";
import { readUserObjectives, updateUserObjectives } from "../services/userObjectives";

const MOTIVATIONS: readonly OnboardingMotivation[] = [
  "travel",
  "work",
  "studies",
  "immigration",
  "other",
] as const;

const SCHEDULES: readonly OnboardingSchedule[] = ["5", "10", "20", "30", "45", "60"] as const;

const SCHEDULE_NUMERIC: Record<OnboardingSchedule, number> = {
  "5": 5,
  "10": 10,
  "20": 20,
  "30": 30,
  "45": 45,
  "60": 60,
};

/**
 * Exact-match daily_minutes → schedule option, else null.
 *
 * RESOLVED (orchestrator, verified against
 * `mobile/src/features/settings/screens/ObjectivesScreen.tsx:74-80`): mobile loops SCHEDULES and
 * returns the first whose SCHEDULE_NUMERIC equals `n`, else null. Exact-match is correct — there
 * is no nearest-match behaviour to mirror. Do not re-derive this.
 */
export function numericToSchedule(n: number | null): OnboardingSchedule | null {
  if (n == null) return null;
  for (const s of SCHEDULES) {
    if (SCHEDULE_NUMERIC[s] === n) return s;
  }
  return null;
}

export function ObjectivesScreen() {
  const router = useRouter();
  const { t } = useTranslation(["settings", "onboarding", "common", "profil"]);

  const [hydrated, setHydrated] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [saveError, setSaveError] = useState(false);
  const [busy, setBusy] = useState(false);

  const [savedMotivation, setSavedMotivation] = useState<OnboardingMotivation | null>(null);
  const [savedSchedule, setSavedSchedule] = useState<OnboardingSchedule | null>(null);
  const [motivation, setMotivation] = useState<OnboardingMotivation | null>(null);
  const [schedule, setSchedule] = useState<OnboardingSchedule | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const row = await readUserObjectives();
        if (cancelled) return;
        const initialMotivation = row?.motivation ?? null;
        const initialSchedule = numericToSchedule(row?.dailyMinutes ?? null);
        setSavedMotivation(initialMotivation as OnboardingMotivation | null);
        setSavedSchedule(initialSchedule);
        setMotivation(initialMotivation as OnboardingMotivation | null);
        setSchedule(initialSchedule);
      } catch {
        if (cancelled) return;
        setLoadError(true);
      } finally {
        if (!cancelled) setHydrated(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const isDirty = motivation !== savedMotivation || schedule !== savedSchedule;

  const handleSave = (): void => {
    if (!isDirty || busy || !hydrated) return;
    setBusy(true);
    setSaveError(false);
    void (async () => {
      try {
        // Save the raw state, not a `??`-defaulted stand-in (I-1 review
        // fix): `motivation`/`schedule` can each be null after hydration
        // (no row yet, `daily_minutes` NULL, or a non-bucket value —
        // `numericToSchedule` returns null). Defaulting an untouched null
        // field to "other"/"10" here would fabricate a preference the
        // learner never chose and invent `daily_minutes: 10` on the
        // shared `user_objectives` row, which mobile then displays as a
        // schedule the learner never picked. `updateUserObjectives` mirrors
        // mobile's null handling (userObjectives.ts:60): a null schedule
        // upserts `daily_minutes: null`, not a bucket.
        await updateUserObjectives({
          motivation,
          schedule,
        });
        router.back();
      } catch {
        setSaveError(true);
        setBusy(false);
      }
    })();
  };

  return (
    <div
      className="mx-auto flex w-full max-w-2xl flex-col gap-4 px-4 py-8 lg:px-8"
      data-testid="settings-objectives-screen"
    >
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => router.back()}
          aria-label={t("profil:header.backA11y")}
          className="flex h-9 w-9 items-center justify-center rounded-full bg-bg-card transition hover:opacity-90"
        >
          <Icon name="back" size={18} label={t("profil:header.backA11y")} />
        </button>
        <AppText
          as="h1"
          family="serif"
          size="h3"
          weight="bold"
          tone="primary"
          className="flex-1 text-center"
        >
          {t("settings:objectives.title")}
        </AppText>
        <div className="h-9 w-9" aria-hidden="true" />
      </div>

      <AppText size="body" tone="secondary">
        {t("settings:objectives.subtitle")}
      </AppText>

      {loadError ? (
        <div role="status" data-testid="settings-objectives-load-error">
          <AppText size="small" tone="warning" weight="medium">
            {t("settings:objectives.loadError")}
          </AppText>
        </div>
      ) : null}

      {!hydrated ? (
        <div
          role="progressbar"
          aria-label={t("settings:objectives.title")}
          data-testid="settings-objectives-loading"
          className="h-14 animate-pulse rounded-[var(--radius-md)] bg-bg-card"
        />
      ) : (
        <>
          <SettingsPickerRow
            label={t("settings:objectives.motivationLabel")}
            value={motivation ?? "other"}
            options={MOTIVATIONS.map((value) => ({
              value,
              label: t(`onboarding:motivation.options.${value}`),
            }))}
            onChange={setMotivation}
            dirty={motivation !== savedMotivation}
            testID="settings-objectives-motivation"
          />
          <SettingsPickerRow
            label={t("settings:objectives.scheduleLabel")}
            value={schedule ?? "10"}
            options={SCHEDULES.map((value) => ({
              value,
              label: t(`onboarding:schedule.options.${value}`),
              caveat: value === "60" ? t("onboarding:schedule.caveat.intensif") : undefined,
            }))}
            onChange={setSchedule}
            dirty={schedule !== savedSchedule}
            testID="settings-objectives-schedule"
          />

          <button
            type="button"
            data-testid="settings-objectives-save"
            disabled={!isDirty || busy || !hydrated}
            onClick={handleSave}
            className="min-h-11 rounded-full bg-cta px-4 transition hover:opacity-90 disabled:bg-line-soft"
          >
            <AppText size="body" weight="semi" tone={isDirty ? "inverse" : "tertiary"}>
              {t("common:actions.save")}
            </AppText>
          </button>
        </>
      )}

      {saveError ? (
        <div role="status" data-testid="settings-objectives-save-error">
          <AppText size="small" tone="warning" weight="medium">
            {t("settings:objectives.saveError")}
          </AppText>
        </div>
      ) : null}
    </div>
  );
}
