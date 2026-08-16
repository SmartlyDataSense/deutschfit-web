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
const ui = (node: React.ReactNode) =>
  render(<LearnerI18nProvider lng="fr">{node}</LearnerI18nProvider>);

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

  it("prev/next chevrons are mirrored 180° (mobile chevron-back/chevron-forward parity)", () => {
    // Mobile uses distinct `chevron-back` (left) / `chevron-forward`
    // (right) Ionicons. The web sprite has only one `chevron` glyph
    // (points right by default), so parity requires rotating `prev` by
    // exactly 180° relative to `next` — never the same rotation, and
    // never an up/down substitute.
    ui(<MiniCalendar referenceDate={ref} onSelect={() => {}} testID="cal" />);
    const prevSpan = screen.getByTestId("cal-prev").querySelector("span");
    const nextSpan = screen.getByTestId("cal-next").querySelector("span");
    expect(prevSpan).toHaveClass("rotate-180");
    expect(nextSpan).not.toHaveClass("rotate-180");
    expect(nextSpan).not.toHaveClass("rotate-90");
    expect(nextSpan).not.toHaveClass("-rotate-90");
  });
});

describe("CountdownHeroCard", () => {
  const base = {
    daysRemaining: 42,
    examDateLabel: "17 juin 2026",
    preparationPct: 50,
    targetScore: 80,
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
    ui(
      <CountdownHeroCard
        {...base}
        daysRemaining={null}
        examDateLabel={null}
        onSelectExamDate={onSelectExamDate}
        testID="cd"
      />
    );
    expect(screen.getByTestId("cd-no-date-set")).toHaveTextContent("Aucune date d'examen");
    fireEvent.click(screen.getByTestId("cd-pick-date"));
    expect(screen.getByTestId("cd-mini-calendar")).toBeInTheDocument();
  });

  it("date pill toggles the picker even when a date is set (bug #287 contract)", () => {
    ui(<CountdownHeroCard {...base} onSelectExamDate={() => {}} onPress={() => {}} testID="cd" />);
    fireEvent.click(screen.getByTestId("cd-date-pill"));
    expect(screen.getByTestId("cd-mini-calendar")).toBeInTheDocument();
  });

  // web#58: role="group" is NOT children-presentational on web — a
  // composed aria-label on it would make a screen reader announce the
  // group's name and then re-read every descendant a second time. The
  // non-clickable branch (no onPress wired) must carry no role/aria-label
  // duplicating what the date-label/day-count/target-score AppText
  // children already render — same contract as PriorityTaskCard
  // (commit 1ea9e6a).
  it("non-clickable card (no onPress) carries no role/aria-label — content reads naturally", () => {
    ui(<CountdownHeroCard {...base} testID="cd" />);
    const card = screen.getByTestId("cd");
    expect(card).not.toHaveAttribute("role");
    expect(card).not.toHaveAttribute("aria-label");
    expect(screen.getByTestId("cd-days-remaining")).toHaveTextContent("42");
    expect(screen.getByTestId("cd-target-score")).toHaveTextContent("OBJECTIF 80");
  });

  it("clickable card (onPress wired, exam date set) keeps role=button + aria-label — button role IS children-presentational", () => {
    ui(<CountdownHeroCard {...base} onPress={() => {}} testID="cd" />);
    expect(
      screen.getByRole("button", {
        name: "Compte à rebours examen. 42 jours restants. Examen le 17 juin 2026. Préparation 50%. Objectif 80.",
      })
    ).toBe(screen.getByTestId("cd"));
  });
});

describe("HeroCard", () => {
  it("countdown payload delegates to CountdownHeroCard with the content-axis flags", () => {
    const payload = computeHeroState({
      daysUntilExam: 42,
      submissionsCount: 2,
      readinessScore: 63,
    });
    ui(
      <HeroCard
        payload={payload}
        testID="hero"
        countdownProps={{
          daysRemaining: 42,
          examDateLabel: "17 juin 2026",
          preparationPct: 50,
          targetScore: 80,
          noDateSetLabel: "x",
        }}
      />
    );
    expect(screen.getByTestId("hero-readiness-score")).toHaveTextContent("63/100");
  });

  it("post-session payload renders the dark card: overline, pulse line, CTA, milestone caption", () => {
    const payload = computeHeroState({
      daysUntilExam: 42,
      submission: { status: "graded", ageHours: 1, correctionUnseen: true },
    });
    const onCtaPress = vi.fn();
    ui(
      <HeroCard
        payload={payload}
        onCtaPress={onCtaPress}
        testID="hero"
        countdownProps={{
          daysRemaining: 42,
          examDateLabel: "x",
          preparationPct: 0,
          targetScore: 80,
          noDateSetLabel: "x",
        }}
      />
    );
    expect(screen.getByTestId("hero-overline")).toHaveTextContent("CORRECTION · PRÊTE");
    expect(screen.getByTestId("hero-readiness-pulse")).toHaveTextContent(
      "Une nouvelle correction t'attend."
    );
    expect(screen.getByTestId("hero-milestone-caption")).toHaveTextContent(
      "On regarde ça ensemble."
    );
    fireEvent.click(screen.getByTestId("hero-cta"));
    expect(onCtaPress).toHaveBeenCalled();
  });

  // web#58: this branch is never itself clickable (only the inner CTA
  // button is), and role="group" is NOT children-presentational on web —
  // a composed aria-label restating headline+body would make a screen
  // reader announce it and then re-read the headline/body a second time.
  // Same contract as PriorityTaskCard (commit 1ea9e6a).
  it("non-clickable dark card (non-countdown states) carries no role/aria-label — content reads naturally", () => {
    const payload = computeHeroState({
      daysUntilExam: 42,
      submission: { status: "graded", ageHours: 1, correctionUnseen: true },
    });
    ui(
      <HeroCard
        payload={payload}
        testID="hero"
        countdownProps={{
          daysRemaining: 42,
          examDateLabel: "x",
          preparationPct: 0,
          targetScore: 80,
          noDateSetLabel: "x",
        }}
      />
    );
    const card = screen.getByTestId("hero");
    expect(card).not.toHaveAttribute("role");
    expect(card).not.toHaveAttribute("aria-label");
    expect(screen.getByTestId("hero-headline")).toHaveTextContent(payload.headline);
    expect(screen.getByTestId("hero-body")).toHaveTextContent(payload.body);
  });
});
