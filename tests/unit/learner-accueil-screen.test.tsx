import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const push = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, replace: vi.fn(), back: vi.fn() }),
}));
vi.mock("next-intl", () => ({ useLocale: () => "fr" }));

const fetchAccueilHome = vi.fn();
const updateExamDate = vi.fn();
vi.mock("@/learner/accueil/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/learner/accueil/api")>();
  return {
    ...actual,
    fetchAccueilHome: (...a: unknown[]) => fetchAccueilHome(...a),
    updateExamDate: (...a: unknown[]) => updateExamDate(...a),
  };
});
const fetchDailyDrill = vi.fn();
vi.mock("@/learner/core/api/dailyDrill", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/learner/core/api/dailyDrill")>();
  return { ...actual, fetchDailyDrill: (...a: unknown[]) => fetchDailyDrill(...a) };
});
vi.mock("@/learner/core/auth/useLearnerSession", () => {
  const state = {
    status: "authenticated",
    session: {
      user: { id: "u1", email: "amadou@df.dev", user_metadata: { display_name: "Amadou" } },
    },
  };
  const hook = (selector?: (s: typeof state) => unknown) => (selector ? selector(state) : state);
  hook.getState = () => state;
  return { useLearnerSession: hook };
});

import { initLearnerI18n } from "@/learner/core/i18n";
import { LearnerI18nProvider } from "@/learner/core/i18n/LearnerI18nProvider";
import {
  __hydrateForBoot,
  __resetReadinessForTest,
  __setUserIdResolverForTest,
} from "@/learner/core/readiness";
import { useExamContextStore } from "@/learner/core/exam/examContext";
import { AccueilScreen } from "@/learner/accueil/screens/AccueilScreen";

afterEach(cleanup);
beforeAll(() => initLearnerI18n("fr"));
const ui = () =>
  render(
    <LearnerI18nProvider lng="fr">
      <AccueilScreen />
    </LearnerI18nProvider>
  );

const homeWithDate = {
  currentLevel: "b1",
  targetLevel: "b1",
  countdown: {
    daysRemaining: 42,
    examDateLabel: "17 juin 2026",
    preparationPct: 50,
    targetScore: 80,
  },
  priorityTask: {
    skill: "",
    title: "",
    level: "",
    teil: "",
    body: "",
    durationMinutes: 0,
    pointsDelta: 0,
    attempts: 0,
    bestScore: 0,
  },
  todayStats: { taskCount: 0, minutes: 0 },
};

beforeEach(() => {
  vi.clearAllMocks();
  __resetReadinessForTest();
  __setUserIdResolverForTest(() => null);
  useExamContextStore.setState({
    board: "goethe",
    level: "b1",
    source: "onboarding",
    isLoaded: true,
  });
  fetchDailyDrill.mockResolvedValue({ itemCount: 4, reason: "ok" });
});

describe("AccueilScreen", () => {
  it("skeleton → header/greeting/teaser/hero/drill card once the payload lands", async () => {
    fetchAccueilHome.mockResolvedValue(homeWithDate);
    ui();
    expect(screen.getByTestId("accueil-loading")).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.getByTestId("accueil-greeting")).toHaveTextContent("Bonjour, Amadou.")
    );
    expect(screen.getByTestId("accueil-current-level-pill")).toHaveTextContent("B1");
    expect(screen.getByTestId("accueil-date-eyebrow").textContent).toMatch(/·/);
    expect(screen.getByTestId("accueil-countdown-days-remaining")).toHaveTextContent("42");
    await waitFor(() => expect(screen.getByTestId("accueil-priority-task")).toBeInTheDocument());
  });

  it("no-date payload renders the inline exam-date picker instead of the hero; select saves + refetches", async () => {
    fetchAccueilHome.mockResolvedValue({
      ...homeWithDate,
      countdown: { daysRemaining: null, examDateLabel: null, preparationPct: 0, targetScore: 80 },
    });
    updateExamDate.mockResolvedValue(undefined);
    ui();
    await waitFor(() => expect(screen.getByTestId("accueil-exam-date-picker")).toBeInTheDocument());
    expect(screen.queryByTestId("accueil-countdown")).toBeNull();
    fireEvent.click(screen.getByTestId("accueil-exam-date-picker-toggle"));
    // Page to next month before picking a day — `MiniCalendar`'s 42-cell
    // grid only spans ~4-6 weeks from "today" (Task 3.8, locked by its own
    // test), so a fixed "+30 days" offset can land outside the initial
    // view depending on which weekday the current month starts on and how
    // far into the month "today" already is (e.g. it lands 2 days past the
    // grid edge when this suite runs in August 2026). Advancing one month
    // first is deterministic regardless of the run date: the grid always
    // renders every day of its visible month (a month never exceeds 6
    // calendar weeks), so day 15 of next month is always present and
    // always in the future.
    fireEvent.click(screen.getByTestId("accueil-exam-date-picker-mini-calendar-next"));
    const future = new Date();
    future.setMonth(future.getMonth() + 1);
    const iso = `${future.getFullYear()}-${String(future.getMonth() + 1).padStart(2, "0")}-15`;
    fireEvent.click(screen.getByTestId(`accueil-exam-date-picker-mini-calendar-day-${iso}`));
    await waitFor(() => expect(updateExamDate).toHaveBeenCalledWith(iso));
    await waitFor(() => expect(fetchAccueilHome).toHaveBeenCalledTimes(2)); // refetch after save
    expect(screen.getByTestId("accueil-exam-date-status")).toBeInTheDocument();
  });

  it("hard error state with retry when the initial fetch fails", async () => {
    fetchAccueilHome.mockRejectedValueOnce(new Error("net")).mockResolvedValueOnce(homeWithDate);
    ui();
    await waitFor(() => expect(screen.getByTestId("accueil-error")).toBeInTheDocument());
    fireEvent.click(screen.getByTestId("accueil-error-retry"));
    await waitFor(() => expect(screen.getByTestId("accueil-greeting")).toBeInTheDocument());
  });

  // P17 — StatusStrip's ready-tap deep-links straight to the module's
  // feedback screen (closes the loop `acknowledgeReadiness` needs) for
  // both Schreiben (S6 Task 6.9) and Sprechen (S7 Task 7.9).
  describe("StatusStrip ready-tap (P17 handleOpenReady)", () => {
    it("a schreiben ready signal pushes the feedback route", async () => {
      __hydrateForBoot(
        { submissionId: "s1", module: "schreiben", state: "ready", startedAt: 0 },
        true
      );
      fetchAccueilHome.mockResolvedValue(homeWithDate);
      ui();
      await waitFor(() => expect(screen.getByTestId("accueil-greeting")).toBeInTheDocument());
      fireEvent.click(screen.getByTestId("accueil-status-strip-press"));
      expect(push).toHaveBeenCalledWith("/fr/app/schreiben/feedback/s1");
    });

    it("a sprechen ready signal pushes the sprechen feedback route", async () => {
      __hydrateForBoot(
        { submissionId: "s2", module: "sprechen", state: "ready", startedAt: 0 },
        true
      );
      fetchAccueilHome.mockResolvedValue(homeWithDate);
      ui();
      await waitFor(() => expect(screen.getByTestId("accueil-greeting")).toBeInTheDocument());
      fireEvent.click(screen.getByTestId("accueil-status-strip-press"));
      expect(push).toHaveBeenCalledWith("/fr/app/sprechen/feedback/s2");
    });
  });
});
