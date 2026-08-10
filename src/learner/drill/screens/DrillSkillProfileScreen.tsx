"use client";

/**
 * `DrillSkillProfileScreen` — the "Mes points" surface (S9 · Task 9.7).
 * Web port of
 * `deutschfit-mobile/src/features/drill/screens/DrillSkillProfileScreen.tsx`.
 *
 * Lists every drill skill the learner has touched, grouped by mastery
 * bucket (À renforcer → En progrès → Maîtrisé → Pas encore évalué). A
 * footer CTA opens the adaptive drill session (Task 9.6's
 * `DrillSessionScreen`, reached via `${base}/drill/session`).
 *
 * Reachable from the Betreuer hub `exercices` tile
 * (`BetreuerHubScreen`'s `coach:hub.tiles.exercices` → `/drill/skills`).
 *
 * Structural idiom matches the other drill/module screens in this app
 * (`DrillSessionScreen`, `LesenIntroScreen`): eyebrow/title/intro block,
 * a `Skeleton.Card` loading state (founding-doc §17 — no spinner/percent
 * copy), a dedicated error branch, and `useLocale()` (not `useParams()`)
 * for the route base — this screen has no dynamic segment.
 *
 * Deviation from mobile (brief step 3, task-9.7-brief.md): mobile's
 * per-skill row renders only the label, no progress indicator. The web
 * brief explicitly asks for "grouped rows (label + mastery
 * `ProgressBar`)" — this port adds the bar mobile does not have. Per
 * this slice's standing rule ("where mobile and the brief disagree,
 * follow the brief"), the bar ships here.
 */
import Link from "next/link";
import { useEffect, useState } from "react";
import { useLocale } from "next-intl";
import { useTranslation } from "react-i18next";

import { AppText, Card, ProgressBar, Skeleton } from "@/learner/ui/primitives";

import { fetchSkillProfile, type SkillProfileRow } from "../api/skillProfileClient";
import { BUCKET_ORDER, classifySkill, type SkillBucket } from "../logic/skillBuckets";

type LoadState = "loading" | "ready" | "error";

export function DrillSkillProfileScreen() {
  const { t } = useTranslation(["drill"]);
  const locale = useLocale();
  const base = `/${locale}/app`;

  const [state, setState] = useState<LoadState>("loading");
  const [rows, setRows] = useState<readonly SkillProfileRow[]>([]);

  useEffect(() => {
    let isMounted = true;
    setState("loading");
    void fetchSkillProfile()
      .then((result) => {
        if (!isMounted) return;
        setRows(result);
        setState("ready");
      })
      .catch(() => {
        if (!isMounted) return;
        setState("error");
      });
    return () => {
      isMounted = false;
    };
  }, []);

  if (state === "loading") {
    return (
      <div
        className="mx-auto flex w-full max-w-2xl flex-col gap-4 px-4 py-8 lg:px-8"
        data-testid="drill-skill-profile-loading"
      >
        <Skeleton.Card />
        <Skeleton.Card />
        <Skeleton.Card />
      </div>
    );
  }

  if (state === "error") {
    return (
      <div
        className="mx-auto flex w-full max-w-2xl flex-col gap-4 px-4 py-8 lg:px-8"
        data-testid="drill-skill-profile-error"
      >
        <AppText size="body" tone="secondary">
          {t("drill:skillProfile.error")}
        </AppText>
      </div>
    );
  }

  if (rows.length === 0) {
    return (
      <div
        className="mx-auto flex w-full max-w-2xl flex-col gap-4 px-4 py-8 lg:px-8"
        data-testid="drill-skill-profile-empty"
      >
        <AppText size="body" tone="secondary">
          {t("drill:skillProfile.empty")}
        </AppText>
      </div>
    );
  }

  const groups = BUCKET_ORDER.map((bucket) => ({
    bucket,
    rows: rows.filter((row) => classifySkill(row.attempts, row.mastery) === bucket),
  })).filter((group) => group.rows.length > 0);

  return (
    <div
      className="mx-auto flex w-full max-w-2xl flex-col gap-4 px-4 py-8 lg:px-8"
      data-testid="drill-skill-profile-screen"
    >
      <AppText
        size="caption"
        weight="semi"
        tone="tertiary"
        className="tracking-wide uppercase"
        testID="drill-skill-profile-eyebrow"
      >
        {t("drill:skillProfile.eyebrow")}
      </AppText>
      <AppText as="h1" family="serif" size="h1" weight="bold" testID="drill-skill-profile-title">
        {t("drill:skillProfile.title")}
      </AppText>
      <AppText size="body" tone="secondary" testID="drill-skill-profile-intro">
        {t("drill:skillProfile.intro")}
      </AppText>

      {groups.map((group) => (
        <SkillBucketGroup key={group.bucket} bucket={group.bucket} rows={group.rows} t={t} />
      ))}

      <Link
        href={`${base}/drill/session`}
        data-testid="drill-skill-profile-cta"
        className="inline-flex min-h-11 items-center justify-center rounded-[var(--radius-md)] bg-cta px-6 transition hover:opacity-90"
      >
        <AppText tone="inverse" size="body" weight="semi">
          {t("drill:skillProfile.cta")}
        </AppText>
      </Link>
    </div>
  );
}

function SkillBucketGroup({
  bucket,
  rows,
  t,
}: {
  readonly bucket: SkillBucket;
  readonly rows: readonly SkillProfileRow[];
  readonly t: (key: string) => string;
}) {
  return (
    <div className="flex flex-col gap-2">
      <AppText
        size="caption"
        weight="semi"
        tone="tertiary"
        testID={`drill-skill-profile-bucket-${bucket}`}
      >
        {t(`drill:skillProfile.bucket.${bucket}`)}
      </AppText>
      <div className="flex flex-col gap-2">
        {rows.map((row) => (
          <Card key={row.concept_code} testID={`drill-skill-profile-row-${row.concept_code}`}>
            <AppText size="body" weight="semi" tone="primary">
              {row.label}
            </AppText>
            <ProgressBar
              value={row.mastery}
              tone="coach"
              className="mt-2"
              aria-label={row.label}
              testID={`drill-skill-profile-row-${row.concept_code}-progress`}
            />
          </Card>
        ))}
      </div>
    </div>
  );
}
