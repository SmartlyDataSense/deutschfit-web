import { readdirSync, readFileSync } from "fs";
import path from "path";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, it, expect, vi } from "vitest";

// vitest.config.ts runs with `globals: false`, so @testing-library/react's
// auto-cleanup (which detects a global `afterEach`) never registers. Several
// tests below render more than once per describe block, so clean the DOM
// between every test explicitly.
afterEach(cleanup);

import {
  AppText,
  AppButton,
  Chip,
  Card,
  EmptyState,
  ProgressBar,
  TimerPill,
  formatMs,
  ScoreBadge,
} from "@/learner/ui/primitives";
import { Donut, arcPath, describeArc, polarToCartesian } from "@/learner/ui/primitives/Donut";
import { SegmentedControl } from "@/learner/ui/primitives/SegmentedControl";
import { Input } from "@/learner/ui/primitives/Input";
import { Textarea } from "@/learner/ui/primitives/Textarea";
import { Skeleton } from "@/learner/ui/primitives/Skeleton";
import { Waveform } from "@/learner/ui/primitives/Waveform";
import { GlassSurface } from "@/learner/ui/primitives/GlassSurface";

describe("AppText — variant to class mapping", () => {
  it("maps tone to the matching text-color class", () => {
    // S13 Task 10 (axe sweep): "cta" resolves to the AA-safe `text-cta-text`
    // shade, not the vivid decorative `text-cta` — see AppText.tsx TONE_CLASS.
    render(<AppText tone="cta">Hallo</AppText>);
    expect(screen.getByText("Hallo").className).toMatch(/\btext-cta-text\b/);
  });

  it("maps size to the matching type-scale class", () => {
    render(<AppText size="display">Groß</AppText>);
    const el = screen.getByText("Groß");
    expect(el.className).toMatch(/\btext-display\b/);
    // display defaults to an <h1> tag (heading tier)
    expect(el.tagName.toLowerCase()).toBe("h1");
  });

  it("maps every size to its own class and h1/h2/h3/p tag", () => {
    const cases: Array<[import("@/learner/ui/primitives").AppTextSize, string]> = [
      ["caption", "p"],
      ["small", "p"],
      ["body", "p"],
      ["bodyLg", "p"],
      ["h3", "h3"],
      ["h2", "h2"],
      ["h1", "h1"],
      ["display", "h1"],
    ];
    cases.forEach(([size, tag]) => {
      const { unmount, getByText } = render(<AppText size={size}>{`x-${size}`}</AppText>);
      const el = getByText(`x-${size}`);
      expect(el.tagName.toLowerCase()).toBe(tag);
      unmount();
    });
  });

  it("maps weight to the matching font-weight class", () => {
    render(<AppText weight="bold">Fett</AppText>);
    expect(screen.getByText("Fett").className).toMatch(/\bfont-bold\b/);
  });

  it("maps family=serif to the learner serif class", () => {
    render(<AppText family="serif">Serif</AppText>);
    expect(screen.getByText("Serif").className).toMatch(/\bfont-serif-learner\b/);
  });

  it("numeric forces mono regardless of family", () => {
    render(
      <AppText family="serif" numeric>
        42
      </AppText>
    );
    expect(screen.getByText("42").className).toMatch(/\bfont-mono\b/);
  });
});

describe("AppButton — variants + disabled/loading states", () => {
  it.each(["solid", "outline", "ghost", "premium"] as const)(
    "renders the %s variant",
    (variant) => {
      const onClick = vi.fn();
      render(<AppButton label={`btn-${variant}`} onClick={onClick} variant={variant} />);
      const btn = screen.getByRole("button", { name: `btn-${variant}` });
      fireEvent.click(btn);
      expect(onClick).toHaveBeenCalledTimes(1);
    }
  );

  it("disabled blocks the onClick handler", () => {
    const onClick = vi.fn();
    render(<AppButton label="disabled-btn" onClick={onClick} disabled />);
    const btn = screen.getByRole("button", { name: "disabled-btn" });
    expect(btn).toBeDisabled();
    fireEvent.click(btn);
    expect(onClick).not.toHaveBeenCalled();
  });

  it("loading blocks the onClick handler and sets aria-busy", () => {
    const onClick = vi.fn();
    render(<AppButton label="loading-btn" onClick={onClick} loading />);
    const btn = screen.getByRole("button");
    expect(btn).toHaveAttribute("aria-busy", "true");
    fireEvent.click(btn);
    expect(onClick).not.toHaveBeenCalled();
  });
});

describe("Chip", () => {
  it("renders selected vs idle with different background classes", () => {
    const { rerender } = render(<Chip label="A1" />);
    expect(screen.getByText("A1").parentElement?.className).toMatch(/bg-bg-hero/);
    rerender(<Chip label="A1" selected />);
    expect(screen.getByText("A1").parentElement?.className).toMatch(/bg-cta/);
  });

  it("fires onClick when pressable and not disabled", () => {
    const onClick = vi.fn();
    render(<Chip label="B1" onClick={onClick} />);
    fireEvent.click(screen.getByRole("button", { name: "B1" }));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  // #51 items 1/6/7 (parity): tone prop, mirrors mobile's Pill palette.
  it("defaults to the neutral tone (byte-identical to the pre-tone idle look)", () => {
    render(<Chip label="Neutral" />);
    const el = screen.getByText("Neutral").parentElement;
    expect(el?.className).toMatch(/border-line-soft/);
    expect(el?.className).toMatch(/bg-bg-hero/);
  });

  it("renders the success tone with the AA-safe success-text color, not the vivid one", () => {
    render(<Chip label="Solide" tone="success" />);
    const el = screen.getByText("Solide").parentElement;
    expect(el?.className).toMatch(/border-success-green/);
    expect(el?.className).toMatch(/bg-bg-hero/);
    expect(screen.getByText("Solide").className).toMatch(/text-success-text/);
    expect(screen.getByText("Solide").className).not.toMatch(/text-success-green/);
  });

  it("renders the warning tone", () => {
    render(<Chip label="Focus" tone="warning" />);
    const el = screen.getByText("Focus").parentElement;
    expect(el?.className).toMatch(/border-warning-red\b/);
    expect(screen.getByText("Focus").className).toMatch(/text-warning-red-text/);
  });

  it("renders the gold tone", () => {
    render(<Chip label="Fast-B2" tone="gold" />);
    const el = screen.getByText("Fast-B2").parentElement;
    expect(el?.className).toMatch(/border-accent-gold/);
    expect(el?.className).toMatch(/bg-accent-gold/);
  });

  it("selected always wins over tone (still routes through ctaLabel)", () => {
    render(<Chip label="Selected" tone="warning" selected />);
    const el = screen.getByText("Selected").parentElement;
    expect(el?.className).toMatch(/bg-cta\b/);
    expect(el?.className).not.toMatch(/bg-warning/);
    expect(screen.getByText("Selected").className).toMatch(/text-cta-label/);
  });
});

describe("Card", () => {
  it("renders children in a bg-bg-card panel", () => {
    render(<Card testID="card">content</Card>);
    expect(screen.getByTestId("card").className).toMatch(/bg-bg-card/);
    expect(screen.getByText("content")).toBeInTheDocument();
  });

  // S13 Task 5 · Step 2: `ariaLabel` gives a non-interactive Card a
  // recognized accessibility host — mobile `accessibilityLabel` parity
  // (mobile Card.tsx sets `accessibilityRole="button"` only when
  // `onPress` is set, and `accessibilityLabel` either way).
  it("non-clickable: ariaLabel renders role=group with that aria-label (no ariaLabel = no role/label at all)", () => {
    const { rerender } = render(<Card testID="card">content</Card>);
    expect(screen.getByTestId("card")).not.toHaveAttribute("role");
    expect(screen.getByTestId("card")).not.toHaveAttribute("aria-label");
    rerender(
      <Card testID="card" ariaLabel="Résumé de la carte">
        content
      </Card>
    );
    expect(screen.getByRole("group", { name: "Résumé de la carte" })).toBe(
      screen.getByTestId("card")
    );
  });

  it("clickable: ariaLabel sets aria-label on the button (already has an implicit role)", () => {
    render(
      <Card testID="card" onClick={() => {}} ariaLabel="Résumé de la carte">
        content
      </Card>
    );
    expect(screen.getByRole("button", { name: "Résumé de la carte" })).toBe(
      screen.getByTestId("card")
    );
  });
});

describe("EmptyState", () => {
  // web#60 — no default illustration any more (the old 📖 default was
  // outside the brand-voice emoji lock `📍 ⏱ ✓ ✕`, and neither the icon
  // sprite nor the 5 inlined Ionicons carry a dedicated "empty" mark).
  // Omitting `illustration` now renders no illustration wrapper at all.
  it("renders no illustration wrapper when illustration is omitted", () => {
    render(<EmptyState testID="empty" title="Rien ici" />);
    const root = screen.getByTestId("empty");
    expect(within(root).queryByText("\u{1F4D6}")).not.toBeInTheDocument();
    expect(root.querySelector('[aria-hidden="true"]')).not.toBeInTheDocument();
  });

  it("renders a caller-supplied illustration node", () => {
    render(<EmptyState testID="empty" title="Rien ici" illustration={<span>custom-glyph</span>} />);
    expect(screen.getByText("custom-glyph")).toBeInTheDocument();
  });

  // web#60 — the wrapper used to carry `role="group"` + `aria-label`
  // composed from `description ? \`${title}. ${description}\` : title` —
  // duplicating the title/description `AppText` children rendered right
  // below it. `role="group"` is not children-presentational on web, so a
  // screen reader announced the composed name and then re-read those
  // children a second time. This pins the wrapper carrying no role or
  // aria-label at all — the children read on their own.
  it("carries no wrapper role/aria-label — title and description read naturally, not duplicated", () => {
    render(<EmptyState testID="empty" title="Rien ici" description="Reviens plus tard." />);
    const root = screen.getByTestId("empty");
    expect(root).not.toHaveAttribute("role");
    expect(root).not.toHaveAttribute("aria-label");
    expect(screen.getByText("Rien ici")).toBeInTheDocument();
    expect(screen.getByText("Reviens plus tard.")).toBeInTheDocument();
  });
});

describe("ProgressBar", () => {
  it("clamps value to 0-100 for aria-valuenow", () => {
    render(<ProgressBar value={1.5} aria-label="progress" />);
    expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "100");
  });

  it("renders 25% for indeterminate mode (no value)", () => {
    const { container } = render(<ProgressBar aria-label="progress" />);
    const fill = container.querySelector("[style]");
    expect(fill).toHaveStyle({ width: "25%" });
  });
});

describe("TimerPill / formatMs", () => {
  it("formats ms as mm:ss", () => {
    expect(formatMs(0)).toBe("00:00");
    expect(formatMs(65_000)).toBe("01:05");
    expect(formatMs(-5)).toBe("00:00");
  });

  it("renders the formatted label with a timer role", () => {
    render(<TimerPill remainingMs={65_000} />);
    expect(screen.getByRole("timer")).toHaveTextContent("01:05");
  });
});

describe("ScoreBadge", () => {
  it("renders the score and total", () => {
    render(<ScoreBadge score={68} total={100} label="Gesamt" />);
    expect(screen.getByText("68")).toBeInTheDocument();
    expect(screen.getByText("/100")).toBeInTheDocument();
    expect(screen.getByText("Gesamt")).toBeInTheDocument();
  });
});

describe("Donut — arc math (pure functions)", () => {
  it("polarToCartesian places 0/90/180/270deg at top/right/bottom/left", () => {
    expect(polarToCartesian(50, 50, 40, 0)).toEqual({ x: 50, y: 10 });
    expect(polarToCartesian(50, 50, 40, 90)).toEqual({ x: 90, y: 50 });
    expect(polarToCartesian(50, 50, 40, 180)).toEqual({ x: 50, y: 90 });
    expect(polarToCartesian(50, 50, 40, 270)).toEqual({ x: 10, y: 50 });
  });

  it("arcPath returns empty string at 0%", () => {
    expect(arcPath(100, 20, 0)).toBe("");
    expect(arcPath(100, 20, -1)).toBe("");
  });

  it("arcPath draws a small-arc (flag 0) half-circle at 50%", () => {
    const d = arcPath(100, 20, 0.5);
    // r = (100-20)/2 = 40, c = 50 — half circle from bottom (50,90) to top (50,10)
    expect(d).toBe("M 50 90 A 40 40 0 0 0 50 10");
  });

  it("arcPath draws a large-arc (flag 1) near-full-circle at 100%", () => {
    const d = arcPath(100, 20, 1);
    expect(d).not.toBe("");
    expect(d).toMatch(/A 40 40 0 1 0/);
    // Distinct from the 50% path (different sweep).
    expect(d).not.toBe(arcPath(100, 20, 0.5));
  });

  it("describeArc matches arcPath for an equivalent single-arc call", () => {
    expect(describeArc(50, 50, 40, 0, 180)).toBe(arcPath(100, 20, 0.5));
  });

  it("Donut exposes the summed fraction via aria-valuenow", () => {
    render(<Donut value={0.6} testID="d" />);
    expect(screen.getByTestId("d")).toHaveAttribute("aria-valuenow", "0.6");
  });

  it("clamps out-of-range values", () => {
    render(<Donut value={1.5} testID="hi" />);
    expect(screen.getByTestId("hi")).toHaveAttribute("aria-valuenow", "1");
    render(<Donut value={-0.5} testID="lo" />);
    expect(screen.getByTestId("lo")).toHaveAttribute("aria-valuenow", "0");
  });

  it("sums segment values into the reported fraction", () => {
    render(
      <Donut
        testID="seg"
        segments={[
          { value: 0.5, tone: "teal" },
          { value: 0.25, tone: "amber" },
        ]}
      />
    );
    expect(screen.getByTestId("seg")).toHaveAttribute("aria-valuenow", "0.75");
  });
});

describe("SegmentedControl", () => {
  it("calls onChange with the pressed option's value", () => {
    const onChange = vi.fn();
    render(
      <SegmentedControl
        options={[
          { label: "FR", value: "fr" },
          { label: "EN", value: "en" },
        ]}
        value="fr"
        onChange={onChange}
      />
    );
    fireEvent.click(screen.getByText("EN"));
    expect(onChange).toHaveBeenCalledWith("en");
  });
});

describe("Input / Textarea", () => {
  it("Input renders label + error", () => {
    render(<Input label="E-Mail" error="Required" placeholder="you@example.com" />);
    expect(screen.getByText("E-Mail")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("you@example.com")).toBeInTheDocument();
    expect(screen.getByText("Required")).toBeInTheDocument();
  });

  it("Textarea renders as a multiline field", () => {
    render(<Textarea label="Antwort" placeholder="Schreib hier…" />);
    const el = screen.getByPlaceholderText("Schreib hier…");
    expect(el.tagName.toLowerCase()).toBe("textarea");
  });
});

describe("Skeleton", () => {
  it("Block/Text/Card render with the loading a11y label", () => {
    render(<Skeleton.Block testID="b" />);
    render(<Skeleton.Text testID="t" />);
    render(<Skeleton.Card testID="c" />);
    expect(screen.getByTestId("b")).toHaveAttribute("aria-label", "Contenu en cours de chargement");
    expect(screen.getByTestId("t")).toBeInTheDocument();
    expect(screen.getByTestId("c")).toBeInTheDocument();
  });
});

describe("Waveform — bar count (pad/truncate semantics)", () => {
  it("renders exactly 45 bars by default (idle pattern)", () => {
    const { container } = render(<Waveform testID="wf" />);
    expect(container.querySelectorAll(".learner-waveform-bar")).toHaveLength(45);
  });

  it("renders exactly 45 bars from a shorter levels array (padded via resampling)", () => {
    const { container } = render(<Waveform testID="wf-short" levels={[0.1, 0.9]} />);
    expect(container.querySelectorAll(".learner-waveform-bar")).toHaveLength(45);
  });

  it("renders exactly 45 bars from a longer levels array (truncated via resampling)", () => {
    const levels = Array.from({ length: 200 }, (_, i) => i / 200);
    const { container } = render(<Waveform testID="wf-long" levels={levels} />);
    expect(container.querySelectorAll(".learner-waveform-bar")).toHaveLength(45);
  });

  it("honors an explicit bars override", () => {
    const { container } = render(<Waveform testID="wf-8" bars={8} />);
    expect(container.querySelectorAll(".learner-waveform-bar")).toHaveLength(8);
  });
});

describe("GlassSurface", () => {
  it("renders children inside the blur surface class", () => {
    render(<GlassSurface testID="glass">frosted</GlassSurface>);
    expect(screen.getByTestId("glass").className).toMatch(/learner-glass-surface/);
    expect(screen.getByText("frosted")).toBeInTheDocument();
  });
});

describe("source scan — no hex color literals in the primitives", () => {
  const dir = path.resolve(__dirname, "../../src/learner/ui/primitives");
  const files = readdirSync(dir).filter((f) => f.endsWith(".tsx"));
  const hexPattern = /#[0-9a-fA-F]{3,8}\b/g;

  it("scans at least the 14 expected primitive files", () => {
    expect(files.length).toBeGreaterThanOrEqual(14);
  });

  it.each(files)("%s has no hex color literals", (file) => {
    const content = readFileSync(path.join(dir, file), "utf-8");
    const matches = content.match(hexPattern) ?? [];
    expect(matches).toEqual([]);
  });
});
