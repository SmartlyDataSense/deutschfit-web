"use client";

/**
 * `BetreuerHubScreen` — the Betreuer tab landing surface (S9 Task 9.3).
 * Web port of
 * `deutschfit-mobile/src/features/coach/screens/BetreuerHubScreen.tsx` +
 * `data/hubTiles.ts`. D4 (drill engine design spec, 2026-05-18): the
 * Betreuer tab is a mode-selection grid, not a chat box. "Discuter"
 * routes to the existing chat; "Exercices ciblés" and "Comprendre une
 * correction" route to their own follow-on surfaces; "Entraînement à
 * l'oral guidé" renders disabled ("À venir" — ADR-0007 locks v1
 * Sprechen to monologue-only).
 *
 * Web layout delta: mobile chunks tiles into `numColumns` (1 below a
 * 360px viewport, else 2) rows built at render time from
 * `useWindowDimensions`. This port has no per-screen viewport-width
 * hook wired in, so it replaces the manual chunking with a responsive
 * CSS grid (`grid-cols-1 sm:grid-cols-2`) — same visual outcome
 * (single column on narrow viewports, two columns above `sm`), no JS
 * resize logic required.
 *
 * `useLocale()` (not `useParams()`) supplies the `/${locale}/app` route
 * base — every other learner screen in this app builds its route base
 * this way (see `PracticeHubScreen`, `Sidebar`); `useParams()` is
 * reserved for routes with a dynamic segment, which this one has none
 * of.
 *
 * Active tiles render as `<Link>` (real anchors, so `href` is
 * inspectable and the app's normal client-side nav applies); the
 * inactive `oral` tile renders as a non-interactive `<div
 * aria-disabled="true">` — same disabled-tile pattern used elsewhere
 * in this app (e.g. `src/features/apprendre/data/cards.ts` on mobile).
 *
 * Icon tinting: `HUB_TILES` bakes each tile's icon as a `ReactNode`
 * with an unset `color` prop (defaults to `currentColor`), so the tint
 * here is applied purely via the wrapping badge's Tailwind text-color
 * class — active tiles get the teal Betreuer tint (`text-coach` /
 * `bg-coach-subtle`, mirrors mobile's `tokens.coach` /
 * `tokens.coachSubtle`), the disabled `oral` tile gets the gold
 * "locked" tint (`text-accent-gold` / `bg-warning-subtle`, mirrors
 * mobile's `tokens.brandGold` / `tokens.warningSubtle`).
 */
import type { ReactNode } from "react";
import Link from "next/link";
import { useLocale } from "next-intl";
import { useTranslation } from "react-i18next";
import clsx from "clsx";

import { sparklesOutline } from "@/learner/core/icons";
import { AppText, Chip } from "@/learner/ui/primitives";

import { HUB_TILES, type HubTile } from "../data/hubTiles";

export function BetreuerHubScreen() {
  const { t } = useTranslation(["coach"]);
  const locale = useLocale();
  const base = `/${locale}/app`;

  return (
    <div
      className="mx-auto flex w-full max-w-3xl flex-col gap-4 px-4 py-8 lg:px-8"
      data-testid="betreuer-hub-screen"
    >
      <div className="flex items-center gap-2" data-testid="betreuer-hub-eyebrow">
        <span className="text-coach" aria-hidden="true">
          {sparklesOutline({ size: 16 })}
        </span>
        <AppText
          as="span"
          tone="coach"
          size="caption"
          weight="semi"
          className="tracking-wide uppercase"
        >
          {t("coach:hub.eyebrow")}
        </AppText>
      </div>

      <AppText as="h1" family="serif" size="h1" weight="bold" testID="betreuer-hub-title">
        {t("coach:hub.titleLead")}{" "}
        <AppText as="span" tone="cta" family="serif" className="italic">
          {t("coach:hub.titleAccent")}
        </AppText>{" "}
        {t("coach:hub.titleTrail")}
      </AppText>

      <AppText tone="secondary" size="body" testID="betreuer-hub-subtitle">
        {t("coach:hub.subtitle")}
      </AppText>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {HUB_TILES.map((tile) => (
          <HubTileCard key={tile.id} tile={tile} base={base} />
        ))}
      </div>
    </div>
  );
}

function HubTileCard({ tile, base }: { tile: HubTile; base: string }) {
  const { t } = useTranslation(["coach"]);
  const disabled = !tile.active;
  const tileTitle = t(`coach:hub.tiles.${tile.id}.title`);
  const statusLabel = disabled ? t("coach:hub.comingSoon") : t("coach:hub.available");
  const a11yLabel = `${tileTitle} – ${statusLabel}`;
  const testID = `betreuer-hub-tile-${tile.id}`;

  const cardClassName = "flex flex-col gap-2 rounded-[var(--radius-lg)] border p-4 text-left";
  const surfaceClassName = disabled
    ? "border-line-soft bg-bg-content"
    : "border-line-soft bg-bg-card transition-colors hover:bg-bg-subtle";

  const content: ReactNode = (
    <>
      <span
        className={clsx(
          "flex h-11 w-11 items-center justify-center rounded-[var(--radius-md)]",
          disabled ? "bg-warning-subtle text-accent-gold" : "bg-coach-subtle text-coach"
        )}
        aria-hidden="true"
      >
        {tile.icon}
      </span>
      <AppText family="serif" size="h3" weight="bold">
        {tileTitle}
      </AppText>
      <AppText tone="secondary" size="small">
        {t(`coach:hub.tiles.${tile.id}.description`)}
      </AppText>
      <Chip testID={`${testID}-status`} label={statusLabel} disabled={disabled} className="mt-1" />
    </>
  );

  if (disabled) {
    return (
      <div
        data-testid={testID}
        aria-disabled="true"
        aria-label={a11yLabel}
        className={clsx(cardClassName, surfaceClassName, "cursor-not-allowed opacity-70")}
      >
        {content}
      </div>
    );
  }

  const href = tile.href(base) ?? base;

  return (
    <Link
      href={href}
      data-testid={testID}
      aria-label={a11yLabel}
      className={clsx(cardClassName, surfaceClassName)}
    >
      {content}
    </Link>
  );
}
