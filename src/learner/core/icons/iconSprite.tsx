/**
 * Custom DeutschFit icon set (spec §8) — ported verbatim from
 * `repos/deutschfit-mobile/src/core/ui/iconSprite.ts`. Each entry is the
 * inner SVG markup of a 24×24 viewBox icon, rendered by the `Icon`
 * component. Strokes/fills use `currentColor` so `Icon` can tint via the
 * CSS `color` property. No external icon library.
 *
 * Path data (`d` / `cx,cy,r` / `x,y,width,height,rx`) is copied
 * **verbatim** from the mobile source, which is itself copied verbatim
 * from the `<symbol>` defs in `repos/correction-walkthrough-design.html`
 * — the canonical DeutschFit symbol sheet. Do not redraw or approximate
 * these glyphs; if a new icon is needed, add it to the symbol sheet
 * first, then port it to mobile, then here.
 */
import type { ReactNode } from "react";
import { createElement } from "react";

export type IconName =
  | "home"
  | "practice"
  | "betreuer"
  | "exam"
  | "profile"
  | "schreiben"
  | "sprechen"
  | "lesen"
  | "hoeren"
  | "discuter"
  | "target-focus"
  | "review"
  | "headset"
  | "back"
  | "chevron"
  | "arrow-right"
  | "search"
  | "check"
  | "close";

/** All `IconName` values, in the order declared on mobile's union. */
export const ICON_NAMES: readonly IconName[] = [
  "home",
  "practice",
  "betreuer",
  "exam",
  "profile",
  "schreiben",
  "sprechen",
  "lesen",
  "hoeren",
  "discuter",
  "target-focus",
  "review",
  "headset",
  "back",
  "chevron",
  "arrow-right",
  "search",
  "check",
  "close",
];

/** Shared stroke props for line icons. */
const L = {
  stroke: "currentColor" as const,
  strokeWidth: 1.7,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  fill: "none" as const,
};

/** Shared fill props for filled marks (the betreuer sparkle). */
const F = { fill: "currentColor" as const, stroke: "none" as const };

/** Build a keyed `<path>` list from raw `d` strings (verbatim sheet data). */
const lines = (ds: readonly string[]): ReactNode =>
  ds.map((d, i) => createElement("path", { ...L, key: i, d }));

export const ICON_SPRITE: Record<IconName, ReactNode> = {
  home: lines(["M3.5 11 L12 4 L20.5 11", "M5.5 9.7 V20 H18.5 V9.7", "M9.7 20 V14 H14.3 V20"]),
  practice: lines([
    "M12 3.5 L21 8 L12 12.5 L3 8 Z",
    "M3 12 L12 16.5 L21 12",
    "M3 16 L12 20.5 L21 16",
  ]),
  betreuer: [
    createElement("path", {
      ...F,
      key: 0,
      d: "M9.5 2.2 C10 6 13 9 16.8 9.5 C13 10 10 13 9.5 16.8 C9 13 6 10 2.2 9.5 C6 9 9 6 9.5 2.2 Z",
    }),
    createElement("path", {
      ...F,
      key: 1,
      d: "M17.5 13.2 C17.8 15.7 19.3 17.2 21.8 17.5 C19.3 17.8 17.8 19.3 17.5 21.8 C17.2 19.3 15.7 17.8 13.2 17.5 C15.7 17.2 17.2 15.7 17.5 13.2 Z",
    }),
  ],
  exam: lines([
    "M6 3 H13.5 L18 7.5 V21 H6 Z",
    "M13.5 3 V7.5 H18",
    "M9 11.5 H15",
    "M9 14.5 H15",
    "M9 17.5 H12.6",
  ]),
  profile: [
    createElement("circle", { ...L, key: "head", cx: 12, cy: 8.4, r: 3.7 }),
    createElement("path", {
      ...L,
      key: "body",
      d: "M5 20 C5 16.2 8.1 14 12 14 C15.9 14 19 16.2 19 20",
    }),
  ],
  schreiben: lines([
    "M15.4 3.9 L20.1 8.6 L10 18.7 L5 19.7 L6 14.7 Z",
    "M13.3 6 L18 10.7",
    "M4 22 C6 20.6 8 20.6 10 22 C12 23.4 14 23.4 16 22",
  ]),
  sprechen: [
    createElement("rect", {
      ...L,
      key: "cap",
      x: 9,
      y: 2.5,
      width: 6,
      height: 11,
      rx: 3,
    }),
    createElement("path", {
      ...L,
      key: "arc",
      d: "M5.5 11 A6.5 6.5 0 0 0 18.5 11",
    }),
    createElement("path", { ...L, key: "stem", d: "M12 17.5 V21" }),
    createElement("path", { ...L, key: "base", d: "M8.5 21 H15.5" }),
  ],
  lesen: lines([
    "M12 6.5 C9.5 4.8 6 4.8 3.5 5.6 V18.4 C6 17.6 9.5 17.6 12 19.3",
    "M12 6.5 C14.5 4.8 18 4.8 20.5 5.6 V18.4 C18 17.6 14.5 17.6 12 19.3",
    "M12 6.5 V19.3",
  ]),
  hoeren: lines([
    "M6 8.5 a6.5 6.5 0 1 1 13 0 c0 6 -6 6 -6 10 a3.5 3.5 0 1 1 -7 0",
    "M15 8.5 a2.5 2.5 0 0 0 -5 0 v1 a2 2 0 1 1 0 4",
  ]),
  discuter: lines([
    "M3 5 H13.8 V11.8 H7.8 L4.4 15 V11.8 H3 Z",
    "M10.2 10.6 H21 V17.4 H15 L11.6 20.6 V17.4 H10.2 Z",
  ]),
  "target-focus": [
    createElement("circle", { ...L, key: "o", cx: 12, cy: 12, r: 7.8 }),
    createElement("circle", { ...L, key: "i", cx: 12, cy: 12, r: 2.8 }),
    createElement("path", { ...L, key: "n", d: "M12 1.6 V5" }),
    createElement("path", { ...L, key: "s", d: "M12 19 V22.4" }),
    createElement("path", { ...L, key: "w", d: "M1.6 12 H5" }),
    createElement("path", { ...L, key: "e", d: "M19 12 H22.4" }),
  ],
  review: [
    createElement("path", { ...L, key: "l1", d: "M4 5.5 H15" }),
    createElement("path", { ...L, key: "l2", d: "M4 9.5 H12" }),
    createElement("path", { ...L, key: "l3", d: "M4 13.5 H9" }),
    createElement("circle", { ...L, key: "lens", cx: 14.6, cy: 14.2, r: 4.6 }),
    createElement("path", { ...L, key: "handle", d: "M18 17.6 L21.5 21.1" }),
  ],
  headset: lines([
    "M4.5 14.5 V12 A7.5 7.5 0 0 1 19.5 12 V14.5",
    "M4.5 13.6 H7 V19.6 H5.7 A1.2 1.2 0 0 1 4.5 18.4 Z",
    "M19.5 13.6 H17 V19.6 H18.3 A1.2 1.2 0 0 0 19.5 18.4 Z",
    "M17 19.6 V20.6 A2.6 2.6 0 0 1 14.4 23.2 H11.6",
  ]),
  back: lines(["M15 4.5 L7.5 12 L15 19.5"]),
  chevron: lines(["M9 4.5 L16.5 12 L9 19.5"]),
  "arrow-right": lines(["M3.5 12 H20", "M13.5 5.5 L20 12 L13.5 18.5"]),
  search: [
    createElement("circle", { ...L, key: "lens", cx: 11, cy: 11, r: 6.6 }),
    createElement("path", { ...L, key: "handle", d: "M15.7 15.7 L21 21" }),
  ],
  check: lines(["M4.5 12.5 L9.7 17.7 L19.5 6.3"]),
  close: lines(["M6 6 L18 18", "M18 6 L6 18"]),
};
