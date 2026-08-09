import { cleanup, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// `vi.hoisted` — `vi.mock` factories are hoisted above the rest of the
// module, so any mock fn they reference must be built via `vi.hoisted`, not
// a plain top-level `const` (same TDZ rationale as `learner-lesen-session.test.tsx`
// and `learner-hoeren-session.test.tsx`).
const { pushMock, replaceMock, backMock } = vi.hoisted(() => ({
  pushMock: vi.fn(),
  replaceMock: vi.fn(),
  backMock: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock, replace: replaceMock, back: backMock }),
}));
vi.mock("next-intl", () => ({ useLocale: () => "fr" }));

import { HoerenResultsScreen } from "@/learner/hoeren/screens/HoerenResultsScreen";
import { useHoerenResultsStore } from "@/learner/hoeren/resultsStore";
import type { SessionScore } from "@/learner/core/exam/engine/scoring";
import { renderWithI18n } from "./helpers/renderWithI18n";

// Two-part score, deliberately asymmetric (5/8 + 1/2) so the headline,
// pct, and per-Teil assertions can't pass on an accidental 50/50 or
// 100% stub — a crafted, non-round number per the brief's
// non-tautological-assertion requirement.
const twoPartScore: SessionScore = {
  correct: 6,
  total: 10,
  answered: 9,
  unanswered: 1,
  accuracy: 0.6,
  parts: [
    { partId: "b1-01-t1", teilNumber: 1, label: "Teil 1", correct: 5, total: 8, items: [] },
    { partId: "b1-01-t2", teilNumber: 2, label: "Teil 2", correct: 1, total: 2, items: [] },
  ],
};

describe("HoerenResultsScreen", () => {
  beforeEach(() => {
    pushMock.mockReset();
    replaceMock.mockReset();
    backMock.mockReset();
    useHoerenResultsStore.getState().clear();
  });
  afterEach(cleanup);

  it("empty store redirects to the practice hub and renders no results chrome", async () => {
    renderWithI18n(<HoerenResultsScreen />);

    await waitFor(() => expect(replaceMock).toHaveBeenCalledWith("/fr/app/apprendre/practice"));
    expect(screen.queryByTestId("hoeren-results-screen")).not.toBeInTheDocument();
  });

  it("populated store renders headline, pct, and answered/unanswered counts from a two-part score", async () => {
    useHoerenResultsStore.getState().set({
      submissionId: "mock-1",
      score: twoPartScore,
      mode: "practice",
    });

    renderWithI18n(<HoerenResultsScreen />);

    await waitFor(() => expect(screen.getByTestId("hoeren-results-screen")).toBeInTheDocument());
    expect(screen.getByTestId("hoeren-results-headline")).toHaveTextContent(
      "6 bonnes réponses sur 10"
    );
    expect(screen.getByText("60%")).toBeInTheDocument();
    expect(screen.getByText("9 / 10")).toBeInTheDocument();
    expect(screen.getByText("1")).toBeInTheDocument();
    expect(replaceMock).not.toHaveBeenCalled();
  });

  it("per-Teil rows carry each part's own correct/total — not a copy of the session total", () => {
    useHoerenResultsStore.getState().set({
      submissionId: "mock-1",
      score: twoPartScore,
      mode: "practice",
    });

    renderWithI18n(<HoerenResultsScreen />);

    const row1 = screen.getByTestId("hoeren-results-teil-1");
    const row2 = screen.getByTestId("hoeren-results-teil-2");
    expect(row1).toHaveTextContent("Teil 1");
    expect(row1).toHaveTextContent("5 / 8");
    expect(row2).toHaveTextContent("Teil 2");
    expect(row2).toHaveTextContent("1 / 2");
    // Guard against a vacuous pass where both rows render the session
    // total (6/10) instead of their own part total.
    expect(row1).not.toHaveTextContent("6 / 10");
    expect(row2).not.toHaveTextContent("6 / 10");
  });

  it("mode: practice — back CTA pushes the Apprendre practice hub", () => {
    useHoerenResultsStore.getState().set({
      submissionId: "mock-1",
      score: twoPartScore,
      mode: "practice",
    });

    renderWithI18n(<HoerenResultsScreen />);

    screen.getByTestId("hoeren-results-back").click();
    expect(pushMock).toHaveBeenCalledWith("/fr/app/apprendre/practice");
  });

  it("mode: graded — back CTA pushes the Examen hub, not the practice hub", () => {
    useHoerenResultsStore.getState().set({
      submissionId: "mock-1",
      score: twoPartScore,
      mode: "graded",
    });

    renderWithI18n(<HoerenResultsScreen />);

    screen.getByTestId("hoeren-results-back").click();
    expect(pushMock).toHaveBeenCalledWith("/fr/app/examen");
    expect(pushMock).not.toHaveBeenCalledWith("/fr/app/apprendre/practice");
  });

  it("skills bars render when payload.skills is provided", () => {
    useHoerenResultsStore.getState().set({
      submissionId: "mock-1",
      score: twoPartScore,
      mode: "graded",
      skills: [
        { key: "lesen", status: "scored", score: 45, max: 60 },
        { key: "hoeren", status: "scored", score: 6, max: 10 },
        { key: "schreiben", status: "pending", score: null, max: null },
        { key: "sprechen", status: "missing", score: null, max: null },
      ],
    });

    renderWithI18n(<HoerenResultsScreen />);

    // Skill labels reuse the existing `apprendre:cards.<key>.title` keys —
    // exact German board-native labels, not French translations.
    expect(screen.getByText("Lesen")).toBeInTheDocument();
    expect(screen.getByText("Hören", { selector: "p" })).toBeInTheDocument();
    expect(screen.getByText("Schreiben")).toBeInTheDocument();
    expect(screen.getByText("Sprechen")).toBeInTheDocument();
  });

  it("skills bars are absent when payload.skills is omitted", () => {
    useHoerenResultsStore.getState().set({
      submissionId: "mock-1",
      score: twoPartScore,
      mode: "graded",
    });

    renderWithI18n(<HoerenResultsScreen />);

    // "Compétences" is the skills-section heading — asserting it's absent
    // (rather than just an individual skill label, which "Hören" the
    // module eyebrow would also satisfy) is the non-vacuous check here.
    expect(screen.queryByText("Compétences")).not.toBeInTheDocument();
  });
});
