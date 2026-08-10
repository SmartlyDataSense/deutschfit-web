import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("next-intl", () => ({ useLocale: () => "fr" }));

import { initLearnerI18n } from "@/learner/core/i18n";
import { LearnerI18nProvider } from "@/learner/core/i18n/LearnerI18nProvider";
import { BetreuerHubScreen } from "@/learner/coach/screens/BetreuerHubScreen";

afterEach(cleanup);
beforeAll(() => initLearnerI18n("fr"));

const ui = () =>
  render(
    <LearnerI18nProvider lng="fr">
      <BetreuerHubScreen />
    </LearnerI18nProvider>
  );

describe("BetreuerHubScreen", () => {
  it("renders the two-tone hub title from coach:hub.title{Lead,Accent,Trail}", () => {
    ui();
    const title = screen.getByTestId("betreuer-hub-title");
    expect(title).toHaveTextContent("Que veux-tu travailler aujourd'hui ?");
  });

  it("renders exactly the four hub tiles", () => {
    ui();
    expect(screen.getByTestId("betreuer-hub-tile-discuter")).toBeInTheDocument();
    expect(screen.getByTestId("betreuer-hub-tile-exercices")).toBeInTheDocument();
    expect(screen.getByTestId("betreuer-hub-tile-correction")).toBeInTheDocument();
    expect(screen.getByTestId("betreuer-hub-tile-oral")).toBeInTheDocument();
  });

  it("marks discuter/exercices/correction as available and links to their routes", () => {
    ui();
    const discuter = screen.getByTestId("betreuer-hub-tile-discuter");
    expect(discuter).toHaveTextContent("Disponible");
    expect(discuter).toHaveAttribute("href", "/fr/app/coach/chat");
    expect(discuter).toHaveAttribute("aria-label", "Discuter – Disponible");

    const exercices = screen.getByTestId("betreuer-hub-tile-exercices");
    expect(exercices).toHaveTextContent("Disponible");
    expect(exercices).toHaveAttribute("href", "/fr/app/drill/skills");
    expect(exercices).toHaveAttribute("aria-label", "Exercices ciblés – Disponible");

    const correction = screen.getByTestId("betreuer-hub-tile-correction");
    expect(correction).toHaveTextContent("Disponible");
    expect(correction).toHaveAttribute("href", "/fr/app/coach/correction");
    expect(correction).toHaveAttribute("aria-label", "Comprendre une correction – Disponible");
  });

  it("marks oral as coming soon, aria-disabled, and not a link", () => {
    ui();
    const oral = screen.getByTestId("betreuer-hub-tile-oral");
    expect(oral).toHaveTextContent("À venir");
    expect(oral).toHaveAttribute("aria-disabled", "true");
    expect(oral).not.toHaveAttribute("href");
    expect(oral.tagName).not.toBe("A");
    expect(oral).toHaveAttribute("aria-label", "Entraînement à l'oral guidé – À venir");
  });
});
