"use client";

/**
 * Apprendre — skill selection screen (Task 4.5). Web port of
 * `deutschfit-mobile/src/features/apprendre/screens/ApprendreScreen.tsx`,
 * replacing the S1 placeholder (`AppText` + generic `EmptyState`).
 *
 * Composition (top → bottom): serif title + subtitle → retake-diagnostic
 * block (links to `/{locale}/app/onboarding/diagnostic?mode=retake`,
 * route verified in `PerformanceHistoryScreen.tsx`) → skill-card grid
 * from `data/cards.ts`.
 *
 * Only `lesen` and `sprachbausteine` are `active` this slice (see
 * `cards.ts`'s doc comment for why web's flags diverge from mobile's).
 * Both active cards route to the same destination — the Übungen hub at
 * `/{locale}/app/apprendre/practice` — so `handlePress` doesn't need
 * mobile's per-id `switch`; it's a single push, guarded by `card.active`.
 *
 * Parity note P4 — mobile's disabled "Bientôt" badge pairs a lock glyph
 * (`Ionicons name="lock-closed"`) with the label. The disabled cards here
 * render the label only (via the plain, tone-less `Chip` primitive) with
 * no icon — there is no lock glyph in this app's 5-icon Ionicons subset
 * (`@/learner/core/icons/ionicons.tsx`) and the icon source is canonical
 * (never invent glyphs), so the badge drops the icon rather than
 * substitute an unapproved one.
 *
 * Disabled cards are non-interactive (`role="group"`, `aria-disabled`,
 * `aria-label` pairing title + "Bientôt disponible" — same idiom as
 * `EmptyState`/`AccueilScreen`'s labeled non-interactive containers).
 * Active cards render as a `Card` with `onClick` (native `<button>`).
 */
import { useCallback } from "react";
import { useRouter } from "next/navigation";
import { useLocale } from "next-intl";
import { useTranslation } from "react-i18next";
import clsx from "clsx";

import { Icon } from "@/learner/core/icons/Icon";
import type { IconName } from "@/learner/core/icons/iconSprite";
import { AppText, Card, Chip } from "@/learner/ui/primitives";

import { skillCards, type SkillCard } from "../data/cards";

// Canonical sprite glyphs only — `srs` substitutes `review` (approved
// substitute, no dedicated "flashcards" glyph in the sprite set).
const CARD_ICON: Record<SkillCard["id"], IconName> = {
  sprechen: "sprechen",
  schreiben: "schreiben",
  hoeren: "hoeren",
  lesen: "lesen",
  sprachbausteine: "target-focus",
  srs: "review",
};

export function ApprendreScreen() {
  const { t } = useTranslation(["apprendre"]);
  const router = useRouter();
  const locale = useLocale();

  const handleRetakeDiagnostic = useCallback((): void => {
    router.push(`/${locale}/app/onboarding/diagnostic?mode=retake`);
  }, [router, locale]);

  const handlePress = useCallback(
    (card: SkillCard): void => {
      if (!card.active) return;
      // `sprechen` (Task 7.6) has no Übungstest picker — same routing
      // shape as `schreiben`'s own gap (PracticeHubScreen wires its
      // dedicated destination; this card routes straight to the topic
      // picker). Every other active card keeps the shared Übungen hub
      // destination.
      if (card.id === "sprechen") {
        router.push(`/${locale}/app/sprechen`);
        return;
      }
      router.push(`/${locale}/app/apprendre/practice`);
    },
    [router, locale]
  );

  const comingSoonLabel = t("apprendre:comingSoon");

  return (
    <div
      className="mx-auto flex w-full max-w-2xl flex-col gap-4 px-4 py-8 lg:px-8"
      data-testid="apprendre-screen"
    >
      <AppText as="h1" family="serif" size="h1" weight="bold" testID="apprendre-title">
        {t("apprendre:title")}
      </AppText>
      <AppText tone="secondary" size="body" testID="apprendre-subtitle">
        {t("apprendre:subtitle")}
      </AppText>

      <Card
        testID="apprendre-retake-block"
        onClick={handleRetakeDiagnostic}
        className="flex items-center gap-4"
      >
        <div className="flex flex-1 flex-col gap-1 text-left">
          <AppText family="serif" size="h3" weight="bold">
            {t("apprendre:retake.title")}
          </AppText>
          <AppText tone="secondary" size="body">
            {t("apprendre:retake.subtitle")}
          </AppText>
        </div>
        <Icon name="review" size={24} />
      </Card>

      <div className="flex flex-col gap-3">
        {skillCards.map((card) => {
          const disabled = !card.active;
          const title = t(`apprendre:cards.${card.id}.title`);
          const description = t(`apprendre:cards.${card.id}.description`);
          const cardBody = (
            <div className="flex flex-col items-start gap-2">
              <Icon name={CARD_ICON[card.id]} size={28} />
              <AppText family="serif" size="h3" weight="bold">
                {title}
              </AppText>
              <AppText tone="secondary" size="body">
                {description}
              </AppText>
              {disabled ? (
                <Chip
                  label={comingSoonLabel}
                  testID={`apprendre-card-${card.id}-coming-soon`}
                  className="mt-1"
                />
              ) : null}
            </div>
          );

          if (disabled) {
            return (
              <div
                key={card.id}
                role="group"
                aria-disabled="true"
                aria-label={`${title} – ${comingSoonLabel}`}
                data-testid={`apprendre-card-${card.id}`}
              >
                <Card className={clsx("opacity-55")}>{cardBody}</Card>
              </div>
            );
          }

          return (
            <Card
              key={card.id}
              testID={`apprendre-card-${card.id}`}
              onClick={() => handlePress(card)}
            >
              {cardBody}
            </Card>
          );
        })}
      </div>
    </div>
  );
}
