// COPIED from deutschfit-mobile/src/theme/tokens.ts on 2026-04-25.
// When mobile tokens change, manually re-copy. No automated sync in v1.
// Source repo: https://github.com/SmartlyDataSense/deutschfit-mobile
//
// This file is the single source of truth for the web app's brand palette,
// spacing, radii, typography, shadow, and z-index scales. CSS custom
// properties in `app/globals.css` and Tailwind colour aliases in
// `tailwind.config.ts` derive from these constants — never hard-code hex.
//
// Web adaptation: `shadow` retains the mobile (React Native) shape
// (shadowColor, shadowOffset, shadowOpacity, shadowRadius, elevation) for
// cross-repo shape parity. Web consumers should compose CSS `box-shadow`
// from these fields when needed; the raw RN keys are not consumed by
// Tailwind directly.

import { FONT_FAMILY } from "./fonts";

export const palette = {
  cream: "#F2E9D8",
  creamDeep: "#EADFC8",
  creamInk: "#1A1714",
  premiumBlack: "#0F1012",
  premiumInk: "#F4EAD3",
  ctaOrange: "#D56E3A",
  ctaOrangeInk: "#FFFFFF",
  coachTeal: "#4DAC99",
  coachTealInk: "#FFFFFF",
  accentGold: "#E5B367",
  accentGoldInk: "#1A1714",
  warningRed: "#C2492E",
  successGreen: "#2E8B64",
  priorityAmber: "#D99B3C",
  textPrimary: "#1A1714",
  textSecondary: "#4A423B",
  textTertiary: "#6E6257",
  lineSoft: "#E0D3B8",
  lineStrong: "#BDAE91",
  overlayScrim: "rgba(15, 16, 18, 0.44)",
} as const;

export const theme = {
  bgHero: palette.cream,
  bgContent: palette.creamDeep,
  bgCard: "#FFFFFF",
  bgPremium: palette.premiumBlack,
  onPremium: palette.premiumInk,
  textPrimary: palette.textPrimary,
  textSecondary: palette.textSecondary,
  textTertiary: palette.textTertiary,
  cta: palette.ctaOrange,
  onCta: palette.ctaOrangeInk,
  coach: palette.coachTeal,
  onCoach: palette.coachTealInk,
  brandGold: palette.accentGold,
  onBrandGold: palette.accentGoldInk,
  warningRed: palette.warningRed,
  successGreen: palette.successGreen,
  priorityAmber: palette.priorityAmber,
  onPrimary: "#FFFFFF",
  lineSoft: palette.lineSoft,
  lineStrong: palette.lineStrong,
  lineSubtle: palette.lineSoft,
  textOnDark: palette.premiumInk,
  bgSurface: "#FFFFFF",
  navActive: palette.ctaOrange,
  overlayScrim: palette.overlayScrim,
} as const;

export type Theme = typeof theme;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  "2xl": 48,
  xxl: 48,
} as const;
export const radius = { sm: 8, md: 12, lg: 20, full: 999 } as const;

export const typography = {
  fontSerif: FONT_FAMILY.playfairRegular,
  fontSerifSemi: FONT_FAMILY.playfairSemiBold,
  fontSerifBold: FONT_FAMILY.playfairBold,
  fontSans: FONT_FAMILY.interRegular,
  fontSansMedium: FONT_FAMILY.interMedium,
  fontSansSemi: FONT_FAMILY.interSemiBold,
  fontSansBold: FONT_FAMILY.interBold,
  fontMono: FONT_FAMILY.plexMonoRegular,
  fontMonoSemi: FONT_FAMILY.plexMonoSemiBold,
  sizeCaption: 12,
  sizeSmall: 14,
  sizeBody: 16,
  sizeBodyLg: 18,
  sizeH3: 22,
  sizeH2: 28,
  sizeH1: 34,
  sizeDisplay: 42,
  weightRegular: "400" as const,
  weightMedium: "500" as const,
  weightSemi: "600" as const,
  weightBold: "700" as const,
  lineHeightBody: 1.5,
  lineHeightHeading: 1.15,
  trackingTight: -0.3,
  trackingWide: 0.8,
} as const;

export const shadow = {
  sm: {
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 2,
    elevation: 1,
  },
  md: {
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 3,
  },
  lg: {
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.14,
    shadowRadius: 20,
    elevation: 8,
  },
} as const;

export const zIndex = {
  base: 0,
  raised: 10,
  header: 20,
  modal: 100,
  toast: 200,
} as const;
