/**
 * Block 3 of the diagnostic result screen — "Comment DeutschFit va te
 * faire passer B2" (spec 2026-05-04 §3.5).
 *
 * Verbatim port of `deutschfit-mobile/src/features/onboarding/services/
 * resultCtaConfig.ts`. All cards are currently disabled (reduced opacity,
 * "Bientôt" pill, no click handler) so the result screen telegraphs the
 * product roadmap without lying about what exists today — no live routes
 * in S2.
 */

export interface ResultCtaCard {
  readonly id: "drill-sprachbausteine" | "lesen-teil-4" | "schreiben-aperçu";
  readonly icon: string;
  readonly titleKey: string;
  readonly subtitleKey: string;
  readonly disabled: boolean;
  /** Route to navigate to when `disabled === false`. */
  readonly route?: { readonly screen: string; readonly params?: unknown };
}

export const RESULT_CTA_CARDS: readonly ResultCtaCard[] = [
  {
    id: "drill-sprachbausteine",
    icon: "🧱",
    titleKey: "onboarding:diagnosticResult.cta.drillSprachbausteine.title",
    subtitleKey: "onboarding:diagnosticResult.cta.drillSprachbausteine.subtitle",
    disabled: true,
  },
  {
    id: "lesen-teil-4",
    icon: "📖",
    titleKey: "onboarding:diagnosticResult.cta.lesenTeil4.title",
    subtitleKey: "onboarding:diagnosticResult.cta.lesenTeil4.subtitle",
    disabled: true,
  },
];
