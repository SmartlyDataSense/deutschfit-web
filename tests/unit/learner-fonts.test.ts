import { existsSync, readFileSync } from "fs";
import { resolve } from "path";
import { describe, it, expect } from "vitest";

describe("learner-fonts", () => {
  const FONT_FILES = [
    "SourceSerif4-Regular.ttf",
    "SourceSerif4-Semibold.ttf",
    "SourceSerif4-Bold.ttf",
  ];

  it("should have the three Source Serif 4 TTF files under public/fonts/", () => {
    FONT_FILES.forEach((file) => {
      const filePath = resolve(__dirname, "../../public/fonts", file);
      expect(existsSync(filePath), `Missing font file: public/fonts/${file}`).toBe(true);
    });
  });

  it("should register the Source Serif 4 family in the locale layout", () => {
    const layoutPath = resolve(__dirname, "../../src/app/[locale]/layout.tsx");
    const source = readFileSync(layoutPath, "utf-8");

    expect(source).toContain("--font-source-serif");

    FONT_FILES.forEach((file) => {
      expect(source, `layout.tsx should reference public/fonts/${file}`).toContain(
        `public/fonts/${file}`
      );
    });
  });
});
