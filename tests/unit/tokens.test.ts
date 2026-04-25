import { describe, it, expect } from "vitest";
import { palette, theme, spacing, radius, typography } from "@/theme/tokens";
import { FONT_FAMILY } from "@/theme/fonts";

describe("theme tokens", () => {
  it("palette exposes the canonical brand keys", () => {
    expect(palette.cream).toBe("#F2E9D8");
    expect(palette.ctaOrange).toBe("#D56E3A");
    expect(palette.coachTeal).toBe("#4DAC99");
    expect(palette.premiumBlack).toBe("#0F1012");
  });

  it("theme aliases re-use palette values (no hex drift)", () => {
    expect(theme.cta).toBe(palette.ctaOrange);
    expect(theme.coach).toBe(palette.coachTeal);
    expect(theme.bgHero).toBe(palette.cream);
    expect(theme.textPrimary).toBe(palette.textPrimary);
  });

  it("spacing scale is the mobile 4-pt scale", () => {
    expect(spacing.xs).toBe(4);
    expect(spacing.sm).toBe(8);
    expect(spacing.md).toBe(16);
    expect(spacing.lg).toBe(24);
    expect(spacing.xl).toBe(32);
  });

  it("radius scale matches mobile", () => {
    expect(radius.sm).toBe(8);
    expect(radius.md).toBe(12);
    expect(radius.lg).toBe(20);
    expect(radius.full).toBe(999);
  });

  it("typography exposes heading + body sizes", () => {
    expect(typography.sizeBody).toBe(16);
    expect(typography.sizeH1).toBe(34);
    expect(typography.sizeDisplay).toBe(42);
  });

  it("font families match mobile family-name constants", () => {
    expect(FONT_FAMILY.interRegular).toBe("Inter-Regular");
    expect(FONT_FAMILY.playfairBold).toBe("Playfair-Bold");
    expect(FONT_FAMILY.plexMonoRegular).toBe("PlexMono-Regular");
  });
});
