/**
 * `src/learner/ui/blocks/ModuleResultLayout.tsx` (+ `ScoreHeaderCard`,
 * `CompetenceBarRow`, `dimensionScoresFromWire`, `resultTypeFromScoreMax`)
 * — Task 6.5.
 *
 * `ModuleResultLayout` calls `useTranslation()`, so it's rendered inside a
 * real `I18nextProvider` via the shared `renderWithI18n` helper rather than
 * a mocked `t()` — this also catches a missing/renamed
 * `common:moduleResult.*` key.
 */
import { cleanup, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import {
  ModuleResultLayout,
  dimensionScoresFromWire,
  type DimensionScoreEntry,
  type ModuleResultLayoutProps,
} from "@/learner/ui/blocks/ModuleResultLayout";
import { resultTypeFromScoreMax } from "@/learner/core/api/resultType";
import type { DimensionScoresJson } from "@/learner/core/api/examApi";
import { renderWithI18n } from "./helpers/renderWithI18n";

afterEach(cleanup);

function baseProps(overrides: Partial<ModuleResultLayoutProps> = {}): ModuleResultLayoutProps {
  return {
    dimensionScores: [],
    coachFeedbackFr: null,
    nextDrillFr: null,
    focusAreas: [],
    personalizedModelDe: null,
    rawText: null,
    ...overrides,
  };
}

describe("dimensionScoresFromWire", () => {
  it("normalizes a legacy flat entry to a synthetic maxScore of 5", () => {
    const wire: DimensionScoresJson = { aufgabe: 3 };
    const result: DimensionScoreEntry[] = dimensionScoresFromWire(wire);
    expect(result).toEqual([{ key: "aufgabe", score: 3, maxScore: 5 }]);
  });

  it("passes a PR-3 nested entry through verbatim (score/max/pct)", () => {
    const wire: DimensionScoresJson = { aufgabe: { score: 7, max: 10, pct: 70 } };
    const result: DimensionScoreEntry[] = dimensionScoresFromWire(wire);
    expect(result).toEqual([{ key: "aufgabe", score: 7, maxScore: 10, pct: 70 }]);
  });

  it("returns an empty array for null/undefined wire", () => {
    expect(dimensionScoresFromWire(null)).toEqual([]);
    expect(dimensionScoresFromWire(undefined)).toEqual([]);
  });
});

describe("resultTypeFromScoreMax", () => {
  it.each([
    [45, "points"],
    [0, "band"],
    [null, "band"],
    [undefined, "band"],
    [Number.NaN, "band"],
    [Number.POSITIVE_INFINITY, "band"],
  ] as const)("scoreMax=%p resolves to %p", (input, expected) => {
    expect(resultTypeFromScoreMax(input)).toBe(expected);
  });
});

describe("ModuleResultLayout — points vs band dispatch", () => {
  it("points profile renders the scorecard (no donut), eyebrow, and objective marker label", () => {
    renderWithI18n(
      <ModuleResultLayout
        {...baseProps({
          score: 31,
          scoreMax: 45,
          passFloorPoints: 27,
          eyebrow: "Total · telc · B2 · Schreiben",
        })}
      />
    );

    expect(screen.getByTestId("module-result-scorecard")).toBeInTheDocument();
    expect(screen.queryByTestId("module-result-donut-block")).not.toBeInTheDocument();
    expect(screen.getByTestId("score-header-eyebrow")).toHaveTextContent(
      "Total · telc · B2 · Schreiben"
    );
    expect(screen.getByTestId("score-header-objective-label")).toHaveTextContent("📍 Objectif 27");
  });

  it("band profile (null scoreMax) renders the donut with normalizedTotalPct, no scorecard — F5: fixture keeps a non-empty dimensionScores array so the donut branch (mobile ModuleResultLayout.tsx:173, length > 0) actually fires", () => {
    renderWithI18n(
      <ModuleResultLayout
        {...baseProps({
          dimensionScores: [{ key: "aufgabe", score: 3, maxScore: 5 }],
          score: null,
          scoreMax: null,
          normalizedTotalPct: 72,
        })}
      />
    );

    expect(screen.queryByTestId("module-result-scorecard")).not.toBeInTheDocument();
    expect(screen.getByTestId("module-result-donut-block")).toBeInTheDocument();
    expect(screen.getByTestId("module-result-donut")).toHaveTextContent("72%");
  });
});

describe("ModuleResultLayout — rubric bars", () => {
  it("flips bar tone to teal at ratio 0.5 and keeps it amber just under 0.5", () => {
    renderWithI18n(
      <ModuleResultLayout
        {...baseProps({
          dimensionScores: [
            { key: "aufgabe", score: 5, maxScore: 10, pct: 50 },
            { key: "register", score: 4.9, maxScore: 10, pct: 49 },
          ],
        })}
      />
    );

    const tealRow = screen.getByTestId("module-result-competence-aufgabe");
    const amberRow = screen.getByTestId("module-result-competence-register");

    const tealFill = within(tealRow).getByRole("progressbar").firstElementChild;
    const amberFill = within(amberRow).getByRole("progressbar").firstElementChild;

    expect(tealFill).toHaveClass("bg-coach");
    expect(amberFill).toHaveClass("bg-accent-gold");
  });

  it("falls back to the generic Kompetenz/Compétence label for an unknown dimension key", () => {
    renderWithI18n(
      <ModuleResultLayout
        {...baseProps({
          dimensionScores: [{ key: "mystery_dimension", score: 2, maxScore: 5 }],
        })}
      />
    );

    const row = screen.getByTestId("module-result-competence-mystery_dimension");
    expect(row).toHaveTextContent("Kompetenz");
    expect(row).toHaveTextContent("Compétence");
  });
});

describe("ModuleResultLayout — P6 web delta (coach/focus/model sections)", () => {
  it("renders nothing for coachFeedbackFr/focusAreas/personalizedModelDe — sub-cards land in S7", () => {
    renderWithI18n(
      <ModuleResultLayout
        {...baseProps({
          coachFeedbackFr: "x",
          focusAreas: ["a"],
          personalizedModelDe: "y",
        })}
      />
    );

    expect(screen.queryByTestId("module-result-coach")).not.toBeInTheDocument();
    expect(screen.queryByTestId("module-result-focus-chips")).not.toBeInTheDocument();
    expect(screen.queryByTestId("module-result-model")).not.toBeInTheDocument();
  });
});

describe("ModuleResultLayout — raw transcript", () => {
  it("renders the transcript card (default title) when rawText is set", () => {
    renderWithI18n(<ModuleResultLayout {...baseProps({ rawText: "Ich bin ein Testtext." })} />);

    const card = screen.getByTestId("module-result-transcript");
    expect(card).toHaveTextContent("VOTRE TRANSCRIPTION");
    expect(card).toHaveTextContent("Ich bin ein Testtext.");
  });
});
