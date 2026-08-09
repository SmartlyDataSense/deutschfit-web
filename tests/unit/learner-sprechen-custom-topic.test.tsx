import { act, cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// `vi.hoisted` — `vi.mock` factories are hoisted above the rest of the
// module, so any mock fn they reference must be built via `vi.hoisted`, not
// a plain top-level `const` (same TDZ rationale as
// `learner-sprechen-topic-picker.test.tsx` / `learner-schreiben-custom-prompt.test.tsx`).
const { pushMock, backMock, hydrateMock, createTopicMock, trackEventMock } = vi.hoisted(() => ({
  pushMock: vi.fn(),
  backMock: vi.fn(),
  hydrateMock: vi.fn(),
  createTopicMock: vi.fn(),
  trackEventMock: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock, back: backMock, replace: vi.fn() }),
}));
vi.mock("next-intl", () => ({ useLocale: () => "fr" }));

// Feature code imports wire fns ONLY from the `examApi` facade
// (Constraint 15) — partial mock so `SUBGENRE_BY_LEVEL` (a pure constant the
// screen also imports for the derived-task hint) stays real while
// `createTopic` is stubbed. Same idiom as
// `learner-sprechen-topic-picker.test.tsx`'s `fetchTopics` partial mock.
vi.mock("@/learner/core/api/examApi", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/learner/core/api/examApi")>();
  return { ...actual, createTopic: createTopicMock };
});

// Partial mock: keep the real `useExamContextStore` (tests drive it
// directly via `setState`) but stub `hydrateExamContext` so the screen's
// self-hydrate mount effect doesn't hit real localStorage/Supabase in
// jsdom — same idiom as `learner-schreiben-custom-prompt.test.tsx`.
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
import { useTopicHandoff } from "@/learner/sprechen/topicHandoffStore";
import { CustomTopicScreen } from "@/learner/sprechen/screens/CustomTopicScreen";
import { renderWithI18n } from "./helpers/renderWithI18n";

function createdTopic(overrides: Partial<TopicCard> = {}): TopicCard {
  return {
    id: "topic-xyz",
    subgenre: "praesentation",
    level: "B1",
    titleDe: "Mein Thema",
    subtitleFr: "Eine Beschreibung.",
    cert: "GOETHE",
    ...overrides,
  };
}

async function renderReady() {
  const utils = renderWithI18n(<CustomTopicScreen />);
  await waitFor(() => expect(screen.getByTestId("sprechen-custom-topic")).toBeInTheDocument());
  return utils;
}

function fillValidForm() {
  fireEvent.change(screen.getByLabelText("Titre"), { target: { value: "Mein Thema" } });
  fireEvent.change(screen.getByLabelText("Description / consigne"), {
    target: { value: "Eine ausreichend lange Beschreibung des Themas." },
  });
}

describe("CustomTopicScreen — community sprechen theme authoring (S7 Task 7.7)", () => {
  beforeEach(() => {
    pushMock.mockReset();
    backMock.mockReset();
    hydrateMock.mockReset();
    createTopicMock.mockReset();
    trackEventMock.mockReset();
    useTopicHandoff.setState({ topic: null });
    useExamContextStore.setState({ board: "goethe", level: "b1", isLoaded: true } as never);
  });
  afterEach(cleanup);

  it("hydration gate: the form is gated behind exam-context isLoaded (deep-link/hard-refresh reproduction) — guard-removal-verified, see task-7.7-report.md", async () => {
    useExamContextStore.setState({ board: "goethe", level: "b1", isLoaded: false } as never);

    renderWithI18n(<CustomTopicScreen />);

    await waitFor(() => expect(hydrateMock).toHaveBeenCalled());
    expect(screen.getByTestId("sprechen-custom-topic-loading")).toBeInTheDocument();
    expect(screen.queryByTestId("sprechen-custom-topic")).not.toBeInTheDocument();

    act(() => {
      useExamContextStore.setState({ board: "goethe", level: "b1", isLoaded: true } as never);
    });

    await waitFor(() => expect(screen.getByTestId("sprechen-custom-topic")).toBeInTheDocument());
  });

  it("canSubmit gating: empty title blocks; max < min blocks; max 601 blocks; a valid form re-enables submit", async () => {
    await renderReady();
    const submit = screen.getByTestId("sprechen-custom-topic-submit");

    // Empty title (nothing typed yet) → disabled.
    expect(submit).toBeDisabled();

    fillValidForm();
    expect(submit).not.toBeDisabled();

    // max < min → disabled. Seeded B1 defaults are min=90/max=180.
    fireEvent.change(screen.getByLabelText("Maximum"), { target: { value: "10" } });
    expect(submit).toBeDisabled();

    // Restore max, then push it past the 600s ASR-cost-cap ceiling → disabled.
    fireEvent.change(screen.getByLabelText("Maximum"), { target: { value: "601" } });
    expect(submit).toBeDisabled();

    // Back to a valid range → enabled again.
    fireEvent.change(screen.getByLabelText("Maximum"), { target: { value: "180" } });
    expect(submit).not.toBeDisabled();
  });

  it("level change re-seeds duration defaults from DURATION_DEFAULTS", async () => {
    await renderReady();

    // Initial seed: goethe/b1 → B1 → 90/180.
    expect(screen.getByLabelText("Minimum")).toHaveValue("90");
    expect(screen.getByLabelText("Maximum")).toHaveValue("180");

    fireEvent.click(screen.getByTestId("sprechen-custom-topic-level-C1"));

    expect(screen.getByTestId("sprechen-custom-topic-level-C1").getAttribute("aria-pressed")).toBe(
      "true"
    );
    // C1 defaults: 180/300.
    expect(screen.getByLabelText("Minimum")).toHaveValue("180");
    expect(screen.getByLabelText("Maximum")).toHaveValue("300");
  });

  it("TELC board disables the C1 chip and clamps a selected C1 to B2", async () => {
    await renderReady();

    fireEvent.click(screen.getByTestId("sprechen-custom-topic-level-C1"));
    expect(screen.getByTestId("sprechen-custom-topic-level-C1").getAttribute("aria-pressed")).toBe(
      "true"
    );

    fireEvent.click(screen.getByTestId("sprechen-custom-topic-board-TELC"));

    expect(screen.getByTestId("sprechen-custom-topic-level-C1")).toBeDisabled();
    expect(screen.getByTestId("sprechen-custom-topic-level-B2").getAttribute("aria-pressed")).toBe(
      "true"
    );
    // B2 defaults: 150/240.
    expect(screen.getByLabelText("Minimum")).toHaveValue("150");
    expect(screen.getByLabelText("Maximum")).toHaveValue("240");
  });

  it("successful submit posts the mapped input, emits custom_theme_submitted, seeds the handoff store, and routes to the session path", async () => {
    createTopicMock.mockResolvedValue(createdTopic());
    await renderReady();

    fillValidForm();
    fireEvent.click(screen.getByTestId("sprechen-custom-topic-submit"));

    await waitFor(() => expect(createTopicMock).toHaveBeenCalledTimes(1));
    expect(createTopicMock).toHaveBeenCalledWith({
      certCode: "GOETHE",
      level: "B1",
      titleDe: "Mein Thema",
      descriptionDe: "Eine ausreichend lange Beschreibung des Themas.",
      minDurationS: 90,
      maxDurationS: 180,
    });

    expect(trackEventMock).toHaveBeenCalledWith("custom_theme_submitted", {
      subgenre: "praesentation",
      level: "B1",
      title_length: "Mein Thema".length,
      description_length: "Eine ausreichend lange Beschreibung des Themas.".length,
    });

    expect(useTopicHandoff.getState().topic?.id).toBe("topic-xyz");
    expect(pushMock).toHaveBeenCalledWith("/fr/app/sprechen/session/topic-xyz");
  });

  it("a grader_unavailable_for_pair rejection renders its exact locale copy and does not navigate", async () => {
    createTopicMock.mockRejectedValue(new Error("grader_unavailable_for_pair"));
    await renderReady();

    fillValidForm();
    fireEvent.click(screen.getByTestId("sprechen-custom-topic-submit"));

    await waitFor(() =>
      expect(screen.getByTestId("sprechen-custom-topic-error")).toBeInTheDocument()
    );
    expect(screen.getByTestId("sprechen-custom-topic-error").textContent).toBe(
      "Cet examen n'est pas disponible pour ce niveau. Choisis une autre combinaison."
    );
    expect(pushMock).not.toHaveBeenCalled();
    expect(useTopicHandoff.getState().topic).toBeNull();
  });

  it("cancel navigates back", async () => {
    await renderReady();
    fireEvent.click(screen.getByTestId("sprechen-custom-topic-cancel"));
    expect(backMock).toHaveBeenCalledTimes(1);
  });
});
