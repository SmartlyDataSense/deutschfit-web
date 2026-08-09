import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import { initLearnerI18n } from "@/learner/core/i18n";
import { LearnerI18nProvider } from "@/learner/core/i18n/LearnerI18nProvider";
import { MiniCalendar } from "@/learner/accueil/components/MiniCalendar";
import { CountdownHeroCard } from "@/learner/accueil/components/CountdownHeroCard";
import { HeroCard } from "@/learner/accueil/components/HeroCard";
import { computeHeroState } from "@/learner/accueil/heroState";

afterEach(cleanup);
beforeAll(() => initLearnerI18n("fr"));
const ui = (node: React.ReactNode) => render(<LearnerI18nProvider lng="fr">{node}</LearnerI18nProvider>);

describe("MiniCalendar", () => {
  const ref = new Date(2026, 7, 15); // 15 Aug 2026

  it("renders a Monday-first 42-cell grid, disables past days, emits local ISO on select", () => {
    const onSelect = vi.fn();
    ui(<MiniCalendar referenceDate={ref} onSelect={onSelect} testID="cal" />);
    expect(screen.getByTestId("cal-day-2026-08-14")).toBeDisabled(); // past
    fireEvent.click(screen.getByTestId("cal-day-2026-08-20"));
    expect(onSelect).toHaveBeenCalledWith("2026-08-20");
  });

  it("month chevrons page the visible month", () => {
    ui(<MiniCalendar referenceDate={ref} onSelect={() => {}} testID="cal" />);
    fireEvent.click(screen.getByTestId("cal-next"));
    expect(screen.getByTestId("cal-month-label")).toHaveTextContent(/septembre 2026/i);
  });
});

describe("CountdownHeroCard", () => {
  const base = {
    daysRemaining: 42, examDateLabel: "17 juin 2026", preparationPct: 50, targetScore: 80,
    noDateSetLabel: "Aucune date d'examen",
  };

  it("with-date branch: day count, prep bar, OBJECTIF, readiness score when provided", () => {
    ui(<CountdownHeroCard {...base} readiness={{ score: 63, target: 80 }} testID="cd" />);
    expect(screen.getByTestId("cd-days-remaining")).toHaveTextContent("42");
    expect(screen.getByTestId("cd-preparation-label")).toHaveTextContent("PRÉPARATION · 50%");
    expect(screen.getByTestId("cd-readiness-score")).toHaveTextContent("63/100");
    expect(screen.getByTestId("cd-target-score")).toHaveTextContent("OBJECTIF 80");
  });

  it("showPreparationBar=false hides the bar + label (state A/C)", () => {
    ui(<CountdownHeroCard {...base} showPreparationBar={false} testID="cd" />);
    expect(screen.queryByTestId("cd-preparation-bar")).toBeNull();
    expect(screen.queryByTestId("cd-preparation-label")).toBeNull();
  });

  it("no-date branch with picker: placeholder toggles the inline MiniCalendar; select bubbles up", () => {
    const onSelectExamDate = vi.fn();
    ui(<CountdownHeroCard {...base} daysRemaining={null} examDateLabel={null}
      onSelectExamDate={onSelectExamDate} testID="cd" />);
    expect(screen.getByTestId("cd-no-date-set")).toHaveTextContent("Aucune date d'examen");
    fireEvent.click(screen.getByTestId("cd-pick-date"));
    expect(screen.getByTestId("cd-mini-calendar")).toBeInTheDocument();
  });

  it("date pill toggles the picker even when a date is set (bug #287 contract)", () => {
    ui(<CountdownHeroCard {...base} onSelectExamDate={() => {}} onPress={() => {}} testID="cd" />);
    fireEvent.click(screen.getByTestId("cd-date-pill"));
    expect(screen.getByTestId("cd-mini-calendar")).toBeInTheDocument();
  });
});

describe("HeroCard", () => {
  it("countdown payload delegates to CountdownHeroCard with the content-axis flags", () => {
    const payload = computeHeroState({ daysUntilExam: 42, submissionsCount: 2, readinessScore: 63 });
    ui(<HeroCard payload={payload} testID="hero"
      countdownProps={{ daysRemaining: 42, examDateLabel: "17 juin 2026", preparationPct: 50, targetScore: 80, noDateSetLabel: "x" }} />);
    expect(screen.getByTestId("hero-readiness-score")).toHaveTextContent("63/100");
  });

  it("post-session payload renders the dark card: overline, pulse line, CTA, milestone caption", () => {
    const payload = computeHeroState({ daysUntilExam: 42,
      submission: { status: "graded", ageHours: 1, correctionUnseen: true } });
    const onCtaPress = vi.fn();
    ui(<HeroCard payload={payload} onCtaPress={onCtaPress} testID="hero"
      countdownProps={{ daysRemaining: 42, examDateLabel: "x", preparationPct: 0, targetScore: 80, noDateSetLabel: "x" }} />);
    expect(screen.getByTestId("hero-overline")).toHaveTextContent("CORRECTION · PRÊTE");
    expect(screen.getByTestId("hero-readiness-pulse")).toHaveTextContent("Une nouvelle correction t'attend.");
    expect(screen.getByTestId("hero-milestone-caption")).toHaveTextContent("On regarde ça ensemble.");
    fireEvent.click(screen.getByTestId("hero-cta"));
    expect(onCtaPress).toHaveBeenCalled();
  });
});
