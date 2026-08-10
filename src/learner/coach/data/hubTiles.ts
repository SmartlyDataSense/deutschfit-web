/**
 * Betreuer hub tile configuration (S9 Task 9.3). Web port of
 * `deutschfit-mobile/src/features/coach/data/hubTiles.ts` (D4 — drill
 * engine design spec 2026-05-18). The Betreuer tab is a mode-selection
 * grid, not a chat box. Four modes:
 *   - discuter   — the existing Betreuer chat (live in v1).
 *   - exercices  — the adaptive drill engine (follow-on plan).
 *   - correction — read-only walkthrough of grading data (follow-on plan).
 *   - oral       — guided-oral dialogue mode; no pipeline exists, shown
 *                  disabled ("À venir" — ADR-0007 locks v1 Sprechen to
 *                  monologue-only).
 *
 * `active: false` tiles render as disabled tiles — reduced emphasis,
 * "À venir" status, presses refused — mirroring mobile's pattern.
 *
 * Web delta from mobile: mobile's `HubTile` carries a discriminated
 * `icon: HubTileIcon` ref (`{set: "ionicons" | "custom", name}`) so the
 * screen picks a renderer per tile. Web's icon components
 * (`@/learner/core/icons`) are plain functions that already return a
 * `ReactElement`, so this port bakes each tile's icon straight into a
 * `ReactNode` at module load — no renderer dispatch needed downstream.
 * Every icon component defaults its `color` prop to `currentColor`
 * (undeclared here), so the screen controls active/disabled tinting via
 * a wrapping element's Tailwind text-color class, same CSS-inheritance
 * trick used throughout this app's icon badges.
 *
 * Mobile navigates via `@react-navigation` route names (`CoachChat`,
 * `DrillSkillProfile`, `CorrectionPicker`); web routes are plain URLs, so
 * each tile carries an `href(base)` builder instead — `base` is the
 * locale-prefixed app root (`/${locale}/app`), same convention every
 * other learner screen uses (see `PracticeHubScreen`, `Sidebar`). The
 * inactive `oral` tile's `href` returns `null` — there is nowhere for it
 * to navigate.
 */
import type { ReactNode } from "react";

import { Icon, bulbOutline, chatbubbleOutline, micOutline } from "@/learner/core/icons";

export type HubTileId = "discuter" | "exercices" | "correction" | "oral";

export interface HubTile {
  readonly id: HubTileId;
  readonly active: boolean;
  /** Glyph rendered in the tile's icon badge (renders via `currentColor`). */
  readonly icon: ReactNode;
  /** Route for an active tile; `null` for tiles with nowhere to navigate. */
  readonly href: (base: string) => string | null;
}

/** Matches the icon size other learner hub badges use (`PracticeHubScreen`). */
const TILE_ICON_SIZE = 24;

export const HUB_TILES: readonly HubTile[] = [
  {
    id: "discuter",
    active: true,
    icon: chatbubbleOutline({ size: TILE_ICON_SIZE }),
    href: (base) => `${base}/coach/chat`,
  },
  {
    id: "exercices",
    active: true,
    icon: Icon({ name: "target-focus", size: TILE_ICON_SIZE }),
    href: (base) => `${base}/drill/skills`,
  },
  {
    id: "correction",
    active: true,
    icon: bulbOutline({ size: TILE_ICON_SIZE }),
    href: (base) => `${base}/coach/correction`,
  },
  {
    id: "oral",
    active: false,
    icon: micOutline({ size: TILE_ICON_SIZE }),
    href: () => null,
  },
];
