// COPIED from deutschfit-mobile/src/theme/fonts.ts on 2026-04-25.
// When mobile fonts change, manually re-copy. No automated sync in v1.
// Source repo: https://github.com/SmartlyDataSense/deutschfit-mobile
//
// Web adaptation: the mobile file uses `require("../../assets/fonts/*.ttf")` to
// register font assets with Expo. On the web the same TTF files are registered
// via `next/font/local` in `src/app/layout.tsx`. Here we only export the
// family-name constants so token consumers stay in sync with mobile.

export const FONT_FAMILY = {
  playfairRegular: "Playfair-Regular",
  playfairSemiBold: "Playfair-SemiBold",
  playfairBold: "Playfair-Bold",
  interRegular: "Inter-Regular",
  interMedium: "Inter-Medium",
  interSemiBold: "Inter-SemiBold",
  interBold: "Inter-Bold",
  plexMonoRegular: "PlexMono-Regular",
  plexMonoSemiBold: "PlexMono-SemiBold",
} as const;

export type FontFamilyKey = keyof typeof FONT_FAMILY;
export type FontFamilyName = (typeof FONT_FAMILY)[FontFamilyKey];
