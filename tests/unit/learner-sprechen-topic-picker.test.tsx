import { StrictMode, type ReactElement } from "react";
import { I18nextProvider } from "react-i18next";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// `vi.hoisted` — `vi.mock` factories are hoisted above the rest of the
// module, so any mock fn they reference must be built via `vi.hoisted`, not
// a plain top-level `const` (same TDZ rationale as
// `learner-schreiben-prompt-list.test.tsx`).
const { pushMock, hydrateMock, fetchTopicsMock, trackEventMock } = vi.hoisted(() => ({
  pushMock: vi.fn(),
  hydrateMock: vi.fn(),
  fetchTopicsMock: vi.fn(),
  trackEventMock: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock, replace: vi.fn() }),
}));
vi.mock("next-intl", () => ({ useLocale: () => "fr" }));

// Feature code imports wire fns ONLY from the `examApi` facade
// (Constraint 15) — partial mock so `sortTopicsByCert` (a pure function
// the picker also imports) stays real while `fetchTopics` is stubbed.
vi.mock("@/learner/core/api/examApi", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/learner/core/api/examApi")>();
  return { ...actual, fetchTopics: fetchTopicsMock };
});

// Partial mock: keep the real `useExamContextStore` (tests drive it
// directly via `setState`) but stub `hydrateExamContext` so the screen's
// self-hydrate mount effect doesn't hit real localStorage/Supabase in
// jsdom — same idiom as `learner-schreiben-prompt-list.test.tsx`.
vi.mock("@/learner/core/exam/examContext", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/learner/core/exam/examContext")>();
  return { ...actual, hydrateExamContext: hydrateMock };
});

vi.mock("@/learner/core/analytics/posthog", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/learner/core/analytics/posthog")>();
  return { ...actual, trackEvent: trackEventMock };
});

import { useExamContextStore } from "@/learner/core/exam/examContext";
import type { TopicCard } from "@/learner/core/api/examApi";
import { initLearnerI18n } from "@/learner/core/i18n";
import { useTopicHandoff } from "@/learner/sprechen/topicHandoffStore";
import { TopicPickerScreen } from "@/learner/sprechen/screens/TopicPickerScreen";
import { renderWithI18n } from "./helpers/renderWithI18n";

const CUSTOM_THEME_ENV_KEY = "NEXT_PUBLIC_MONOLOGUE_CUSTOM_THEME_ENABLED";

function topic(overrides: Partial<TopicCard> & { id: string }): TopicCard {
  return {
    subgenre: "praesentation",
    level: "B1",
    titleDe: "Meine Familie",
    subtitleFr: "Présente ta famille en quelques phrases.",
    ...overrides,
  };
}

/** Renders under `StrictMode` — used only by the guard-removal test. */
function renderStrict(ui: ReactElement) {
  const instance = initLearnerI18n("fr");
  return render(
    <I18nextProvider i18n={instance}>
      <StrictMode>{ui}</StrictMode>
    </I18nextProvider>
  );
}

describe("TopicPickerScreen — sprechen monologue topic picker (S7 Task 7.6)", () => {
  beforeEach(() => {
    fetchTopicsMock.mockReset();
    pushMock.mockReset();
    hydrateMock.mockReset();
    trackEventMock.mockReset();
    useTopicHandoff.setState({ topic: null });
    delete process.env[CUSTOM_THEME_ENV_KEY];
    useExamContextStore.setState({ board: "goethe", level: "b1", isLoaded: true } as never);
  });
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it("hydration gate: the fetch fires only once after exam-context isLoaded flips true (guard-removal-verified) — StrictMode double-invoke + deep-link/hard-refresh reproduction", async () => {
    fetchTopicsMock.mockResolvedValue([topic({ id: "t1" })]);
    // Reproduces a hard refresh / deep-link straight onto this route: the
    // store still holds the un-hydrated default and `isLoaded: false`.
    useExamContextStore.setState({ board: "goethe", level: "b1", isLoaded: false } as never);

    renderStrict(<TopicPickerScreen />);

    await waitFor(() => expect(hydrateMock).toHaveBeenCalled());
    // Give any (incorrect) unconditional fetch — including a StrictMode
    // double-invoke of the mount-time effect — a chance to fire before
    // asserting it did not.
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(fetchTopicsMock).not.toHaveBeenCalled();
    expect(screen.getByTestId("sprechen-topic-picker-loading")).toBeInTheDocument();

    // Hydration lands — NOW the fetch may run. This is a normal
    // (non-double-invoked) re-render, not the initial StrictMode mount.
    act(() => {
      useExamContextStore.setState({ board: "goethe", level: "b1", isLoaded: true } as never);
    });

    await waitFor(() => expect(screen.getByTestId("sprechen-topic-card-t1")).toBeInTheDocument());
    expect(fetchTopicsMock).toHaveBeenCalledTimes(1);
    expect(fetchTopicsMock).toHaveBeenCalledWith({
      subgenre: "praesentation",
      level: "B1",
      certCode: "GOETHE",
    });
  });

  it("renders topic cards with title, subtitle, and cert pill", async () => {
    fetchTopicsMock.mockResolvedValue([
      topic({
        id: "t1",
        titleDe: "Meine Familie",
        subtitleFr: "Présente ta famille.",
        cert: "GOETHE",
      }),
    ]);
    renderWithI18n(<TopicPickerScreen />);

    await waitFor(() => expect(screen.getByTestId("sprechen-topic-card-t1")).toBeInTheDocument());
    const card = screen.getByTestId("sprechen-topic-card-t1");
    expect(card.textContent).toContain("Meine Familie");
    expect(card.textContent).toContain("Présente ta famille.");
    expect(screen.getByTestId("sprechen-topic-card-t1-cert").textContent).toBe("Goethe");
  });

  it("search filters client-side after the 250ms debounce", async () => {
    // `waitFor`'s internal polling relies on real timers, so this test
    // asserts directly after each explicit `advanceTimersByTimeAsync`
    // flush instead (same idiom as `learner-onboarding-diagnostic.test.tsx`'s
    // fake-timer test — no `waitFor` calls while fake timers are active).
    vi.useFakeTimers();
    fetchTopicsMock.mockResolvedValue([
      topic({ id: "t1", titleDe: "Meine Familie" }),
      topic({ id: "t2", titleDe: "Klimawandel und Umwelt" }),
    ]);
    renderWithI18n(<TopicPickerScreen />);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0); // flush the initial fetch
    });
    expect(screen.getByTestId("sprechen-topic-card-t1")).toBeInTheDocument();
    expect(screen.getByTestId("sprechen-topic-card-t2")).toBeInTheDocument();

    fireEvent.change(screen.getByPlaceholderText("Chercher un thème (allemand)…"), {
      target: { value: "Klima" },
    });

    // Before the debounce settles, both cards are still present.
    expect(screen.getByTestId("sprechen-topic-card-t1")).toBeInTheDocument();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(250);
    });

    expect(screen.queryByTestId("sprechen-topic-card-t1")).not.toBeInTheDocument();
    expect(screen.getByTestId("sprechen-topic-card-t2")).toBeInTheDocument();
    expect(trackEventMock).toHaveBeenCalledWith("topic_searched", {
      subgenre: "praesentation",
      level: "B1",
      query_length: 5,
      result_count: 1,
    });
  });

  it("empty result with a cert filter triggers the unfiltered fallback refetch (sorted user-cert-first) and fires topic_picker_fallback_triggered", async () => {
    fetchTopicsMock
      .mockResolvedValueOnce([]) // filtered call (certCode: GOETHE) — empty
      .mockResolvedValueOnce([
        topic({ id: "t-telc", titleDe: "TELC Thema", cert: "TELC" }),
        topic({ id: "t-goethe", titleDe: "Goethe Thema", cert: "GOETHE" }),
      ]);

    renderWithI18n(<TopicPickerScreen />);

    await waitFor(() => expect(fetchTopicsMock).toHaveBeenCalledTimes(2));
    expect(fetchTopicsMock).toHaveBeenNthCalledWith(1, {
      subgenre: "praesentation",
      level: "B1",
      certCode: "GOETHE",
    });
    expect(fetchTopicsMock).toHaveBeenNthCalledWith(2, { subgenre: "praesentation", level: "B1" });

    await waitFor(() =>
      expect(trackEventMock).toHaveBeenCalledWith("topic_picker_fallback_triggered", {
        board: "goethe",
        level: "B1",
        subgenre: "praesentation",
      })
    );

    // Sorted user-cert-first — the Goethe row renders before the TELC row.
    const list = await waitFor(() => screen.getByTestId("sprechen-topic-picker-list"));
    const cardIds = [...list.querySelectorAll('[data-testid^="sprechen-topic-card-"]')]
      .map((el) => el.getAttribute("data-testid"))
      .filter((id): id is string => id !== null && !id.endsWith("-cert"));
    expect(cardIds).toEqual(["sprechen-topic-card-t-goethe", "sprechen-topic-card-t-telc"]);
  });

  it("card click writes the handoff store, fires topic_card_started, and pushes the session route", async () => {
    fetchTopicsMock.mockResolvedValue([topic({ id: "t1", titleDe: "Meine Familie" })]);
    renderWithI18n(<TopicPickerScreen />);

    await waitFor(() => expect(screen.getByTestId("sprechen-topic-card-t1")).toBeInTheDocument());
    fireEvent.click(screen.getByTestId("sprechen-topic-card-t1"));

    expect(pushMock).toHaveBeenCalledWith("/fr/app/sprechen/session/t1");
    expect(useTopicHandoff.getState().topic?.id).toBe("t1");
    expect(trackEventMock).toHaveBeenCalledWith("topic_card_started", {
      topic_id: "t1",
      subgenre: "praesentation",
      level: "B1",
    });
  });

  it("dialogue entry card renders only when the exam board is telc, and navigates to /sprechen/dialogue", async () => {
    useExamContextStore.setState({ board: "telc", level: "b1", isLoaded: true } as never);
    fetchTopicsMock.mockResolvedValue([topic({ id: "t1" })]);
    renderWithI18n(<TopicPickerScreen />);

    await waitFor(() => expect(screen.getByTestId("sprechen-dialogue-entry")).toBeInTheDocument());
    fireEvent.click(screen.getByTestId("sprechen-dialogue-entry"));
    expect(pushMock).toHaveBeenCalledWith("/fr/app/sprechen/dialogue");
  });

  it("dialogue entry card does not render for non-telc boards", async () => {
    fetchTopicsMock.mockResolvedValue([topic({ id: "t1" })]);
    renderWithI18n(<TopicPickerScreen />);

    await waitFor(() => expect(screen.getByTestId("sprechen-topic-card-t1")).toBeInTheDocument());
    expect(screen.queryByTestId("sprechen-dialogue-entry")).not.toBeInTheDocument();
  });

  it("add-theme CTA is hidden when NEXT_PUBLIC_MONOLOGUE_CUSTOM_THEME_ENABLED is unset (default OFF)", async () => {
    fetchTopicsMock.mockResolvedValue([]);
    renderWithI18n(<TopicPickerScreen />);

    await waitFor(() => expect(screen.getByTestId("sprechen-topic-picker")).toBeInTheDocument());
    expect(screen.queryByTestId("sprechen-topic-picker-add-theme")).not.toBeInTheDocument();
  });

  it("add-theme CTA renders and navigates to /sprechen/new when the flag is enabled", async () => {
    process.env[CUSTOM_THEME_ENV_KEY] = "true";
    fetchTopicsMock.mockResolvedValue([]);
    renderWithI18n(<TopicPickerScreen />);

    await waitFor(() =>
      expect(screen.getByTestId("sprechen-topic-picker-add-theme")).toBeInTheDocument()
    );
    fireEvent.click(screen.getByTestId("sprechen-topic-picker-add-theme"));
    expect(pushMock).toHaveBeenCalledWith("/fr/app/sprechen/new");
    expect(trackEventMock).toHaveBeenCalledWith("custom_theme_opened", {
      subgenre: "praesentation",
      level: "B1",
    });
  });

  it("fetch failure renders the error state with a retry that re-fires the fetch", async () => {
    fetchTopicsMock.mockRejectedValueOnce(new Error("network_down"));
    renderWithI18n(<TopicPickerScreen />);

    await waitFor(() =>
      expect(screen.getByTestId("sprechen-topic-picker-error")).toBeInTheDocument()
    );

    fetchTopicsMock.mockResolvedValueOnce([topic({ id: "t1" })]);
    fireEvent.click(screen.getByTestId("sprechen-topic-picker-retry"));

    await waitFor(() => expect(screen.getByTestId("sprechen-topic-card-t1")).toBeInTheDocument());
    expect(fetchTopicsMock).toHaveBeenCalledTimes(2);
  });

  // Constraint 8 — LevelPopover/SubgenrePopover focus management. Follow-up
  // fix round: focus-on-open, roving ArrowUp/ArrowDown/Home/End highlight,
  // Enter/Space picks, and focus-restore-to-trigger on every close path
  // (SchreibenEditorScreen.tsx:130-140 precedent). Only `LevelPopover` is
  // exercised here — `SubgenrePopover` shares the identical implementation
  // (same `handlePanelKeyDown`/`close` shape), so these three tests are the
  // representative contract for both.
  it("LevelPopover: opens with focus inside the panel (Constraint 8 focus-on-open) — guard-removal-verified, see task-7.6-report.md", async () => {
    fetchTopicsMock.mockResolvedValue([topic({ id: "t1" })]);
    renderWithI18n(<TopicPickerScreen />);

    await waitFor(() => expect(screen.getByTestId("sprechen-topic-card-t1")).toBeInTheDocument());
    fireEvent.click(screen.getByTestId("sprechen-topic-picker-level"));

    expect(screen.getByTestId("sprechen-topic-picker-level-listbox")).toHaveFocus();
  });

  it("LevelPopover: ArrowDown then Enter moves the roving highlight and selects the next enabled level", async () => {
    fetchTopicsMock.mockResolvedValue([topic({ id: "t1" })]);
    renderWithI18n(<TopicPickerScreen />);

    await waitFor(() => expect(screen.getByTestId("sprechen-topic-card-t1")).toBeInTheDocument());
    fireEvent.click(screen.getByTestId("sprechen-topic-picker-level"));
    const listbox = screen.getByTestId("sprechen-topic-picker-level-listbox");

    fireEvent.keyDown(listbox, { key: "ArrowDown" }); // B1 -> B2 highlight
    fireEvent.keyDown(listbox, { key: "Enter" }); // picks the highlighted option

    expect(screen.queryByTestId("sprechen-topic-picker-level-listbox")).not.toBeInTheDocument();
    expect(trackEventMock).toHaveBeenCalledWith("level_chip_changed", {
      previous_level: "B1",
      new_level: "B2",
    });
    expect(screen.getByTestId("sprechen-topic-picker-level").textContent).toContain("B2");
  });

  it("LevelPopover: Escape closes the panel and returns focus to the trigger button", async () => {
    fetchTopicsMock.mockResolvedValue([topic({ id: "t1" })]);
    renderWithI18n(<TopicPickerScreen />);

    await waitFor(() => expect(screen.getByTestId("sprechen-topic-card-t1")).toBeInTheDocument());
    const trigger = screen.getByTestId("sprechen-topic-picker-level");
    fireEvent.click(trigger);
    const listbox = screen.getByTestId("sprechen-topic-picker-level-listbox");

    fireEvent.keyDown(listbox, { key: "Escape" });

    expect(screen.queryByTestId("sprechen-topic-picker-level-listbox")).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });
});
