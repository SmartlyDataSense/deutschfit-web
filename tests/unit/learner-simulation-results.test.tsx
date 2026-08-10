/**
 * `SimulationResultsScreen` + `buildSimulationResultsViewModel` — S8 Task
 * 8.8 Cycle B.
 *
 * The view-model tests exercise the exact backend default-report shape
 * (raw jsonb through `normaliseReport`, B2) — no `PerCompetenceReport`
 * type exists on web, `run.result.report` stays `unknown` passthrough.
 * The screen tests mount the real component with `useSimulationRun`
 * (a real zustand store, seeded via `setState`/`getState` like the S8
 * orchestrator suite) and `useExamContextStore`, and mock only
 * `next/navigation`/`next-intl`.
 */
import * as fs from "node:fs";
import * as path from "node:path";
import { cleanup, fireEvent, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { pushMock, replaceMock, backMock } = vi.hoisted(() => ({
  pushMock: vi.fn(),
  replaceMock: vi.fn(),
  backMock: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock, replace: replaceMock, back: backMock }),
}));
vi.mock("next-intl", () => ({ useLocale: () => "fr" }));

import { useExamContextStore } from "@/learner/core/exam/examContext";
import { useSimulationRun } from "@/learner/core/exam/simulationRunStore";
import {
  SimulationResultsScreen,
  buildSimulationResultsViewModel,
  type SimulationResultsRunInput,
} from "@/learner/exam/screens/SimulationResultsScreen";
import { toSkillScores } from "@/learner/core/exam/skillScores";
import { normaliseReport } from "@/learner/core/api/examApi";
import { buildVerdict } from "@/learner/exam/verdict";
import { renderWithI18n } from "./helpers/renderWithI18n";

function reportFixture(overrides: Record<string, unknown> = {}) {
  return {
    lesen: { status: "scored", scaled_score: 80 },
    hoeren: { status: "scored", scaled_score: 60 },
    schreiben: { status: "missing" },
    sprechen: { status: "deferred" },
    ...overrides,
  };
}

function runInputFromReport(
  report: Record<string, unknown>,
  outcomes: SimulationResultsRunInput["outcomes"] = {}
): SimulationResultsRunInput {
  const skills = toSkillScores(normaliseReport(report));
  return {
    result: { report, skills, finalizedAt: "2026-08-10T00:00:00.000Z" },
    outcomes,
  };
}

describe("buildSimulationResultsViewModel — S8 Task 8.8 Cycle B", () => {
  it("full fixture (lesen 80 + hoeren 60, schreiben missing, sprechen deferred) → percent 70, verdict band pass", () => {
    const vm = buildSimulationResultsViewModel(runInputFromReport(reportFixture()));

    expect(vm.percent).toBe(70);
    expect(vm.verdict.band).toBe("pass");
    expect(vm.verdict).toEqual(buildVerdict(0.7));
  });

  it("lesen/hoeren rows resolve effectiveMax 100; lesen fraction 0.8 → teal/no chip, hoeren fraction 0.6 → teal/no chip (mobile's >= 0.6 threshold, evaluated before the < 0.5/< 0.6 state checks)", () => {
    const vm = buildSimulationResultsViewModel(runInputFromReport(reportFixture()));
    const lesen = vm.rows.find((r) => r.key === "lesen");
    const hoeren = vm.rows.find((r) => r.key === "hoeren");

    expect(lesen).toEqual({
      key: "lesen",
      label: "Lesen",
      italicSubtitle: "Compréhension écrite",
      score: 80,
      max: 100,
      tone: "teal",
      state: undefined,
    });
    expect(hoeren).toEqual({
      key: "hoeren",
      label: "Hören",
      italicSubtitle: "Compréhension orale",
      score: 60,
      max: 100,
      tone: "teal",
      state: undefined,
    });
  });

  it("schreiben (missing) / sprechen (deferred) rows resolve the em-dash presentation {score:null, max:null, tone:'amber', state:'priorite'}", () => {
    const vm = buildSimulationResultsViewModel(runInputFromReport(reportFixture()));
    const schreiben = vm.rows.find((r) => r.key === "schreiben");
    const sprechen = vm.rows.find((r) => r.key === "sprechen");

    expect(schreiben).toEqual({
      key: "schreiben",
      label: "Schreiben",
      italicSubtitle: "Production écrite",
      score: null,
      max: null,
      tone: "amber",
      state: "priorite",
    });
    expect(sprechen).toEqual({
      key: "sprechen",
      label: "Sprechen",
      italicSubtitle: "Production orale",
      score: null,
      max: null,
      tone: "amber",
      state: "priorite",
    });
  });

  it("a fraction just under the 0.6 boundary (0.59) resolves amber + aTravailler, and just under 0.5 resolves amber + priorite", () => {
    const vm = buildSimulationResultsViewModel(
      runInputFromReport(
        reportFixture({
          lesen: { status: "scored", scaled_score: 59 },
          hoeren: { status: "scored", scaled_score: 49 },
        })
      )
    );
    const lesen = vm.rows.find((r) => r.key === "lesen");
    const hoeren = vm.rows.find((r) => r.key === "hoeren");

    expect(lesen?.tone).toBe("amber");
    expect(lesen?.state).toBe("aTravailler");
    expect(hoeren?.tone).toBe("amber");
    expect(hoeren?.state).toBe("priorite");
  });

  it("only lesen scored → percent equals its score alone", () => {
    const vm = buildSimulationResultsViewModel(
      runInputFromReport(
        reportFixture({
          lesen: { status: "scored", scaled_score: 80 },
          hoeren: { status: "missing" },
        })
      )
    );

    expect(vm.percent).toBe(80);
  });

  it("zero scored modules → percent 0 + verdict band fail", () => {
    const vm = buildSimulationResultsViewModel(
      runInputFromReport(
        reportFixture({
          lesen: { status: "missing" },
          hoeren: { status: "missing" },
        })
      )
    );

    expect(vm.percent).toBe(0);
    expect(vm.verdict.band).toBe("fail");
  });

  it("counts absent (no per-leg outcomes in the run store) → skippedFraction 0, counts null", () => {
    const vm = buildSimulationResultsViewModel(runInputFromReport(reportFixture(), {}));

    expect(vm.counts).toBeNull();
    expect(vm.skippedFraction).toBe(0);
  });

  it("counts present → exact sums and a skippedFraction capped at 1 - percent/100", () => {
    const vm = buildSimulationResultsViewModel(
      runInputFromReport(reportFixture(), {
        lesen: { raw: 12, total: 20, unanswered: 3 },
        hoeren: { raw: 12, total: 20, unanswered: 5 },
      })
    );

    expect(vm.counts).toEqual({ correct: 24, total: 40, unanswered: 8 });
    // percent 70 → remaining headroom 0.3; raw unanswered/total = 8/40 = 0.2 < 0.3, so the raw
    // fraction wins (not clamped).
    expect(vm.skippedFraction).toBeCloseTo(0.2, 5);
  });
});

describe("SimulationResultsScreen — S8 Task 8.8 Cycle B", () => {
  beforeEach(() => {
    pushMock.mockReset();
    replaceMock.mockReset();
    backMock.mockReset();
    useExamContextStore.setState({ board: "goethe", level: "b1", isLoaded: true } as never);
    useSimulationRun.getState().clear();
  });
  afterEach(cleanup);

  function seedFinalizedRun(
    report: Record<string, unknown> = reportFixture(),
    outcomes: SimulationResultsRunInput["outcomes"] = {
      lesen: { raw: 16, total: 20, unanswered: 2 },
      hoeren: { raw: 12, total: 20, unanswered: 4 },
    }
  ) {
    useSimulationRun.setState({
      examSlug: "goethe-b1-01",
      mockAttemptId: "mock-attempt-1",
      outcomes,
      durationMinutesTotal: 95,
      result: {
        report,
        skills: toSkillScores(normaliseReport(report)),
        finalizedAt: "2026-08-10T00:00:00.000Z",
      },
    } as never);
  }

  it("empty store → replaces to /fr/app/examen/simulation before any layout renders", () => {
    renderWithI18n(<SimulationResultsScreen />);

    expect(replaceMock).toHaveBeenCalledWith("/fr/app/examen/simulation");
    expect(screen.queryByTestId("simulation-results-scroll")).not.toBeInTheDocument();
  });

  it("renders 4 competence rows in SKILL_ORDER, with the schreiben/sprechen rows in the honest em-dash presentation (P8/B3 — no fabricated number, never a fake 0/0)", () => {
    seedFinalizedRun();
    renderWithI18n(<SimulationResultsScreen />);

    const rowIds = ["competence-row-lesen", "competence-row-hoeren", "competence-row-schreiben", "competence-row-sprechen"];
    for (const id of rowIds) {
      expect(screen.getByTestId(id)).toBeInTheDocument();
    }

    const schreibenRow = screen.getByTestId("competence-row-schreiben");
    const sprechenRow = screen.getByTestId("competence-row-sprechen");
    expect(schreibenRow.textContent).not.toMatch(/\d/);
    expect(sprechenRow.textContent).not.toMatch(/\d/);
    expect(schreibenRow).toHaveTextContent("—");
    expect(sprechenRow).toHaveTextContent("—");
  });

  it("verdict card renders the byte-exact buildVerdict title/body for the fixture's 70% pass band", () => {
    seedFinalizedRun();
    renderWithI18n(<SimulationResultsScreen />);

    const verdict = buildVerdict(0.7);
    const card = screen.getByTestId("simulation-verdict");
    expect(card).toHaveTextContent(verdict.title);
    expect(card).toHaveTextContent(verdict.body);
  });

  it("donut proxies carry the composed 'Acquis: N pourcent' / 'À consolider: N pourcent' aria-labels", () => {
    seedFinalizedRun();
    renderWithI18n(<SimulationResultsScreen />);

    expect(screen.getByTestId("simulation-donut-arc-correct")).toHaveAttribute(
      "aria-label",
      "Acquis: 70 pourcent"
    );
    // lesen+hoeren unanswered 2+4=6 / total 20+20=40 = 0.15 → 15 pourcent
    expect(screen.getByTestId("simulation-donut-arc-skipped")).toHaveAttribute(
      "aria-label",
      "À consolider: 15 pourcent"
    );
  });

  it("renders the 'Résultat · N sur M items' line and the donut's 'bonnes' line only when counts are present", () => {
    seedFinalizedRun();
    renderWithI18n(<SimulationResultsScreen />);

    expect(screen.getByTestId("simulation-competences-label").parentElement).toHaveTextContent(
      "Résultat · 28 sur 40 items"
    );
    expect(screen.getByTestId("simulation-donut")).toHaveTextContent("28/40 bonnes");
  });

  it("omits the 'Résultat' items line and the 'bonnes' line when either leg's outcome is absent from the run store", () => {
    seedFinalizedRun(reportFixture(), { lesen: { raw: 16, total: 20, unanswered: 2 } });
    renderWithI18n(<SimulationResultsScreen />);

    expect(screen.queryByText(/Résultat ·/)).not.toBeInTheDocument();
    expect(screen.getByTestId("simulation-donut")).not.toHaveTextContent("bonnes");
  });

  it("duration pill renders '<N> min' when durationMinutesTotal is set, and is hidden when 0", () => {
    seedFinalizedRun();
    renderWithI18n(<SimulationResultsScreen />);
    expect(screen.getByTestId("simulation-duration-badge")).toHaveTextContent("95 min");
    cleanup();

    useSimulationRun.setState({ durationMinutesTotal: 0 } as never);
    renderWithI18n(<SimulationResultsScreen />);
    expect(screen.queryByTestId("simulation-duration-badge")).not.toBeInTheDocument();
  });

  it("renders the meta submission line", () => {
    seedFinalizedRun();
    renderWithI18n(<SimulationResultsScreen />);
    expect(screen.getByText("Soumission · mock-attempt-1")).toBeInTheDocument();
  });

  it("does NOT render a 'Voir les corrections' review CTA (web delta, P14)", () => {
    seedFinalizedRun();
    renderWithI18n(<SimulationResultsScreen />);
    expect(screen.queryByTestId("simulation-review-cta")).not.toBeInTheDocument();
    expect(screen.queryByText("Voir les corrections")).not.toBeInTheDocument();
  });

  it("back CTA clears the run store and replaces to /fr/app/examen exactly once — no competing second replace from the now-empty-store redirect effect (final-review I-1: without the leaving-ref guard, clear() nulls `result`, the redirect effect re-fires on the next render, and a second replace to /examen/simulation supersedes this one)", () => {
    seedFinalizedRun();
    renderWithI18n(<SimulationResultsScreen />);

    fireEvent.click(screen.getByTestId("simulation-back-cta"));

    expect(useSimulationRun.getState().result).toBeNull();
    // Pin the FULL call list, not just `toHaveBeenCalledWith` — a bare
    // `toHaveBeenCalledWith` still passes even if a second, superseding
    // `replace("/fr/app/examen/simulation")` call follows the intended one,
    // which is exactly the bounce this guard prevents.
    expect(replaceMock.mock.calls).toEqual([["/fr/app/examen"]]);
  });

  it("anti-synthesis lock (P8): the screen source renders rows exclusively from result.skills and contains none of mobile's synthesis constants", () => {
    const source = fs.readFileSync(
      path.resolve(__dirname, "../../src/learner/exam/screens/SimulationResultsScreen.tsx"),
      "utf8"
    );
    expect(source).not.toMatch(/synthesiseSkillScores/);
    expect(source).not.toMatch(/\bOFFSETS\b/);
    expect(source).toMatch(/run\.result\.skills\.map\(resolveRow\)/);
  });

  it("anti-synthesis lock (behavioral): a differently-shaped skills array (not length 4) still renders exactly that many rows — no code path pads/truncates to a fixed count", () => {
    const report = reportFixture();
    const skills = toSkillScores(normaliseReport(report)).slice(0, 2);
    useSimulationRun.setState({
      examSlug: "goethe-b1-01",
      mockAttemptId: "mock-attempt-2",
      outcomes: {},
      durationMinutesTotal: 0,
      result: { report, skills, finalizedAt: "2026-08-10T00:00:00.000Z" },
    } as never);
    renderWithI18n(<SimulationResultsScreen />);

    expect(screen.getByTestId("competence-row-lesen")).toBeInTheDocument();
    expect(screen.getByTestId("competence-row-hoeren")).toBeInTheDocument();
    expect(screen.queryByTestId("competence-row-schreiben")).not.toBeInTheDocument();
    expect(screen.queryByTestId("competence-row-sprechen")).not.toBeInTheDocument();
  });

  it("root scroll region carries testID simulation-results-scroll (mobile parity)", () => {
    seedFinalizedRun();
    renderWithI18n(<SimulationResultsScreen />);
    expect(screen.getByTestId("simulation-results-scroll")).toBeInTheDocument();
  });

  it("legends render 'Acquis' and 'À consolider'", () => {
    seedFinalizedRun();
    renderWithI18n(<SimulationResultsScreen />);
    expect(within(screen.getByTestId("simulation-legend-correct")).getByText("Acquis")).toBeInTheDocument();
    expect(
      within(screen.getByTestId("simulation-legend-skipped")).getByText("À consolider")
    ).toBeInTheDocument();
  });
});
