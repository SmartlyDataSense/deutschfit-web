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
import { CompetenceBarRow } from "@/learner/ui/blocks/CompetenceBarRow";
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

describe("ModuleResultLayout — S6 null/empty prop set (S7 non-regression)", () => {
  it("renders none of the three Betreuer sub-cards when props are null/empty", () => {
    renderWithI18n(<ModuleResultLayout {...baseProps()} />);

    expect(screen.queryByTestId("module-result-betreuer-card")).not.toBeInTheDocument();
    expect(screen.queryByTestId("module-result-focus-chips")).not.toBeInTheDocument();
    expect(screen.queryByTestId("module-result-personalized-model")).not.toBeInTheDocument();
  });
});

describe("ModuleResultLayout — sections 3-4 Betreuer sub-cards (Task 7.5)", () => {
  it("renders BetreuerCard with the mobile copy key + prose + next-drill line when coachFeedbackFr is set", () => {
    renderWithI18n(
      <ModuleResultLayout
        {...baseProps({
          coachFeedbackFr: "Ta réponse manque de connecteurs logiques.",
          nextDrillFr: "Essaie l'exercice sur les conjonctions.",
        })}
      />
    );

    const card = screen.getByTestId("module-result-betreuer-card");
    expect(card).toHaveTextContent("Retour du Betreuer");
    expect(card).toHaveTextContent("Ta réponse manque de connecteurs logiques.");
    expect(card).toHaveTextContent("Essaie l'exercice sur les conjonctions.");
  });

  it("renders FocusChips with the mobile copy key + one chip per focusAreas entry when focusAreas is non-empty", () => {
    renderWithI18n(
      <ModuleResultLayout
        {...baseProps({
          focusAreas: ["Grammaire", "Cohérence"],
        })}
      />
    );

    const group = screen.getByTestId("module-result-focus-chips");
    expect(group).toHaveAttribute("role", "group");
    expect(group).toHaveTextContent("Points à travailler");
    expect(group).toHaveTextContent("Grammaire");
    expect(group).toHaveTextContent("Cohérence");
  });

  it("renders PersonalizedModelCard with the mobile copy keys + German prose when personalizedModelDe is set", () => {
    renderWithI18n(
      <ModuleResultLayout
        {...baseProps({
          personalizedModelDe: "Ich würde vorschlagen, dass wir uns treffen.",
        })}
      />
    );

    const card = screen.getByTestId("module-result-personalized-model");
    expect(card).toHaveTextContent("Réponse modèle");
    expect(card).toHaveTextContent("Générée par IA à partir de ta réponse");
    expect(card).toHaveTextContent("Ich würde vorschlagen, dass wir uns treffen.");
  });
});

describe("ModuleResultLayout — ScoreHeaderCard composed aria-label carry-in", () => {
  it("composes the announcement with the objective sentence when passFloorPoints is set (ScoreHeaderCard.tsx:90-92)", () => {
    renderWithI18n(
      <ModuleResultLayout
        {...baseProps({
          score: 31,
          scoreMax: 45,
          passFloorPoints: 27,
          scoreUnitLabel: "points",
          objectiveLabel: "Objectif",
        })}
      />
    );

    expect(screen.getByTestId("module-result-scorecard")).toHaveAttribute(
      "aria-label",
      "31 sur 45 points. Objectif 27."
    );
  });

  it("composes the short-form announcement when passFloorPoints is absent", () => {
    renderWithI18n(
      <ModuleResultLayout
        {...baseProps({
          score: 31,
          scoreMax: 45,
          scoreUnitLabel: "points",
        })}
      />
    );

    expect(screen.getByTestId("module-result-scorecard")).toHaveAttribute(
      "aria-label",
      "31 sur 45 points."
    );
  });
});

describe("CompetenceBarRow — nullable score/max (S8 Task 8.8 Cycle A, B3 sub-step)", () => {
  it("renders an em-dash with NO digit characters when score is null (missing/deferred presentation)", () => {
    renderWithI18n(
      <CompetenceBarRow
        label="Schreiben"
        italicSubtitle="Production écrite"
        score={null}
        max={null}
        tone="amber"
        state="priorite"
        testID="row-schreiben"
      />
    );

    const row = screen.getByTestId("row-schreiben");
    expect(row).toHaveTextContent("—");
    expect(row.textContent).not.toMatch(/\d/);
    expect(row).toHaveAttribute("aria-label", "Schreiben: —, Priorité");

    const fill = within(row).getByRole("progressbar").firstElementChild;
    expect(fill).toHaveStyle({ width: "0%" });
  });

  it("composes the em-dash aria without a trailing state clause when state is absent", () => {
    renderWithI18n(
      <CompetenceBarRow label="Sprechen" score={null} max={null} testID="row-sprechen" />
    );

    const row = screen.getByTestId("row-sprechen");
    expect(row).toHaveAttribute("aria-label", "Sprechen: —");
    expect(row.textContent).not.toMatch(/\d/);
  });

  it("REGRESSION LOCK: numeric props still render the byte-identical X/N fraction + aria (S6/S7 non-regression)", () => {
    renderWithI18n(
      <CompetenceBarRow
        label="Lesen"
        italicSubtitle="Compréhension écrite"
        score={5}
        max={10}
        tone="teal"
        testID="row-lesen"
      />
    );

    const row = screen.getByTestId("row-lesen");
    expect(row).toHaveTextContent("5/10");
    expect(row).toHaveAttribute("aria-label", "Lesen: 5 sur 10");
  });

  it("REGRESSION LOCK: numeric props with a state chip still compose the exact 'X sur Y, <État>' aria (S6/S7 non-regression)", () => {
    renderWithI18n(
      <CompetenceBarRow
        label="Hören"
        score={3}
        max={10}
        tone="amber"
        state="priorite"
        testID="row-hoeren"
      />
    );

    const row = screen.getByTestId("row-hoeren");
    expect(row).toHaveTextContent("3/10");
    expect(row).toHaveAttribute("aria-label", "Hören: 3 sur 10, Priorité");
    expect(screen.getByText("Priorité")).toBeInTheDocument();
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
