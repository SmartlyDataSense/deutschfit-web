import { act, cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// `vi.hoisted` — same TDZ rationale as `learner-lesen-intro.test.tsx`:
// `vi.mock` factories are hoisted above the rest of the module, so any mock
// fn they reference must be built via `vi.hoisted`, not a plain top-level
// `const`.
const { listModelltestsMock, startSessionMock, pushMock, hydrateMock } = vi.hoisted(() => ({
  listModelltestsMock: vi.fn(),
  startSessionMock: vi.fn(),
  pushMock: vi.fn(),
  hydrateMock: vi.fn(),
}));

// The hook goes through the `examApi` facade (P10/Constraint 15), not
// `./mockExam` directly — mock that surface, not the lower-level module.
vi.mock("@/learner/core/api/examApi", () => ({
  listModelltests: (...args: unknown[]) => listModelltestsMock(...args),
}));
vi.mock("@/learner/core/exam/mockExamSession", () => ({
  startSession: (...args: unknown[]) => startSessionMock(...args),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock, replace: vi.fn(), back: vi.fn() }),
}));
vi.mock("next-intl", () => ({ useLocale: () => "fr" }));
// Partial mock: keep the real `useExamContextStore` (tests drive it
// directly via `setState`, same as `learner-lesen-intro.test.tsx`) but stub
// `hydrateExamContext` so the screen/hook's self-hydrate effects don't hit
// real localStorage/Supabase in jsdom — tests control `isLoaded`
// transitions explicitly instead.
vi.mock("@/learner/core/exam/examContext", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/learner/core/exam/examContext")>();
  return { ...actual, hydrateExamContext: hydrateMock };
});

import { useLearnerSession } from "@/learner/core/auth/useLearnerSession";
import { useExamContextStore } from "@/learner/core/exam/examContext";
import type { ModelltestRow } from "@/learner/core/api/examApi";
import { HoerenIntroScreen } from "@/learner/hoeren/screens/HoerenIntroScreen";
import { renderWithI18n } from "./helpers/renderWithI18n";

function row(overrides: Partial<ModelltestRow>): ModelltestRow {
  return {
    id: overrides.slug ?? "id",
    slug: "hoeren-b1-01",
    title: "Modelltest 1",
    cert_code: "GOETHE",
    level_code: "B1",
    short_label: "MT 1",
    sequence_num: 1,
    ...overrides,
  };
}

// dev serves 60 mixed B1+B2 HOEREN rows (P10) — the fixture models that
// mix: two B1 rows (out of sequence-asc order) + one B2 row that must be
// filtered out entirely for a b1 learner.
const ROWS: ModelltestRow[] = [
  row({
    slug: "hoeren-b1-02",
    title: "Modelltest 2",
    short_label: "MT 2",
    sequence_num: 2,
    level_code: "B1",
  }),
  row({
    slug: "hoeren-b1-01",
    title: "Modelltest 1",
    short_label: "MT 1",
    sequence_num: 1,
    level_code: "B1",
  }),
  row({
    slug: "hoeren-b2-01",
    title: "Modelltest B2",
    short_label: "MT B2",
    sequence_num: 1,
    level_code: "B2",
  }),
];

describe("HoerenIntroScreen — modelltest picker + live drill bootstrap", () => {
  beforeEach(() => {
    listModelltestsMock.mockReset();
    startSessionMock.mockReset();
    pushMock.mockReset();
    hydrateMock.mockReset();
    useLearnerSession.setState({
      status: "authenticated",
      session: { user: { id: "u1" } },
    } as never);
    useExamContextStore.setState({ board: "goethe", level: "b1", isLoaded: true } as never);
  });
  afterEach(cleanup);

  it("(a) filters to the learner's level (case-insensitive) and lists rows sorted by sequence_num asc under hoeren-modelltest-<slug> testIDs", async () => {
    listModelltestsMock.mockResolvedValue(ROWS);

    renderWithI18n(<HoerenIntroScreen />);

    await waitFor(() =>
      expect(screen.getByTestId("hoeren-modelltest-hoeren-b1-01")).toBeInTheDocument()
    );
    expect(listModelltestsMock).toHaveBeenCalledWith({ module: "HOEREN" });

    // Only the two B1 rows render — the B2 row is filtered out entirely,
    // not merely sorted last.
    const testIds = screen
      .getAllByTestId(/^hoeren-modelltest-/)
      .map((el) => el.getAttribute("data-testid"));
    expect(testIds).toEqual(["hoeren-modelltest-hoeren-b1-01", "hoeren-modelltest-hoeren-b1-02"]);
    expect(screen.queryByTestId("hoeren-modelltest-hoeren-b2-01")).not.toBeInTheDocument();

    expect(screen.getByTestId("hoeren-modelltest-hoeren-b1-01").textContent).toContain("MT 1");
    expect(screen.getByTestId("hoeren-modelltest-hoeren-b1-02").textContent).toContain("MT 2");

    // Byte-identical German exam copy, non-tautological.
    expect(screen.getByTestId("hoeren-intro-title").textContent).toBe("Hören · B1");
    expect(screen.getByTestId("hoeren-intro-eyebrow").textContent).toBe("B1");
    expect(screen.getByTestId("hoeren-intro-picker-title").textContent).toBe("Modelltest wählen");
    expect(screen.getByTestId("hoeren-intro-picker-meta").textContent).toBe(
      "2 Modelltests verfügbar"
    );
    // No "So funktioniert's" info card / shape line on this screen (P10).
    expect(screen.queryByTestId("hoeren-intro-info-card")).not.toBeInTheDocument();
  });

  it("(b) hydration gate: the fetch fires only after exam-context isLoaded flips true — deep-link/hard-refresh reproduction", async () => {
    listModelltestsMock.mockResolvedValue(ROWS);
    // Reproduces a hard refresh / deep-link straight onto this route: the
    // store still holds the un-hydrated default and `isLoaded: false`.
    useExamContextStore.setState({ board: "goethe", level: "b1", isLoaded: false } as never);

    renderWithI18n(<HoerenIntroScreen />);

    await waitFor(() => expect(hydrateMock).toHaveBeenCalled());
    // Give any (incorrect) unconditional fetch a chance to fire before
    // asserting it did not.
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(listModelltestsMock).not.toHaveBeenCalled();
    expect(screen.getByTestId("hoeren-intro-loading")).toBeInTheDocument();
    expect(screen.queryByTestId("hoeren-intro-screen")).not.toBeInTheDocument();

    // Hydration lands — NOW the fetch may run.
    act(() => {
      useExamContextStore.setState({ board: "goethe", level: "b1", isLoaded: true } as never);
    });

    await waitFor(() => expect(listModelltestsMock).toHaveBeenCalledWith({ module: "HOEREN" }));
    await waitFor(() => expect(screen.getByTestId("hoeren-intro-screen")).toBeInTheDocument());
  });

  it("(c)+(g) selecting a row enables Test starten; a double-click runs startSession exactly once with module:HOEREN and pushes the fresh route with attemptId+moduleFilter=HOEREN", async () => {
    listModelltestsMock.mockResolvedValue(ROWS);
    let resolveStart: (value: unknown) => void = () => {};
    startSessionMock.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveStart = resolve;
        })
    );

    renderWithI18n(<HoerenIntroScreen />);
    await waitFor(() =>
      expect(screen.getByTestId("hoeren-modelltest-hoeren-b1-01")).toBeInTheDocument()
    );

    const startButton = screen.getByTestId("hoeren-intro-start");
    // The first row is pre-selected as the default `effectiveSlug`, so the
    // button starts enabled — select the second row explicitly to prove
    // selection actually drives `effectiveSlug`.
    fireEvent.click(screen.getByTestId("hoeren-modelltest-hoeren-b1-02"));
    expect(startButton).not.toBeDisabled();

    // Fire both clicks before the in-flight promise resolves — the
    // re-entrancy ref (not just the disabled-button visual state) must be
    // what blocks the second call.
    fireEvent.click(startButton);
    fireEvent.click(startButton);

    expect(startSessionMock).toHaveBeenCalledTimes(1);
    expect(startSessionMock).toHaveBeenCalledWith({
      userId: "u1",
      examSlug: "hoeren-b1-02",
      module: "HOEREN",
    });

    act(() => {
      resolveStart({
        mockAttemptId: "mock-1",
        examSlug: "hoeren-b1-02",
        status: "in_progress",
        nextModule: "SCHREIBEN",
        lesenAttemptId: null,
        hoerenAttemptId: "hoeren-1",
        resumed: false,
      });
    });

    await waitFor(() =>
      expect(pushMock).toHaveBeenCalledWith(
        "/fr/app/hoeren/session?examSlug=hoeren-b1-02&mockAttemptId=mock-1&attemptId=hoeren-1&moduleFilter=HOEREN"
      )
    );
    expect(startSessionMock).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId("hoeren-intro-start-error")).not.toBeInTheDocument();
  });

  it("(d) resumed handle (resumed:true, hoerenAttemptId:null) pushes the route WITHOUT an attemptId param", async () => {
    listModelltestsMock.mockResolvedValue(ROWS);
    startSessionMock.mockResolvedValue({
      mockAttemptId: "mock-2",
      examSlug: "hoeren-b1-01",
      status: "in_progress",
      nextModule: "HOEREN",
      lesenAttemptId: "lesen-2",
      hoerenAttemptId: null,
      resumed: true,
    });

    renderWithI18n(<HoerenIntroScreen />);
    await waitFor(() =>
      expect(screen.getByTestId("hoeren-modelltest-hoeren-b1-01")).toBeInTheDocument()
    );

    fireEvent.click(screen.getByTestId("hoeren-intro-start"));

    await waitFor(() =>
      expect(pushMock).toHaveBeenCalledWith(
        "/fr/app/hoeren/session?examSlug=hoeren-b1-01&mockAttemptId=mock-2&moduleFilter=HOEREN"
      )
    );
  });

  it("(e) list rejection renders the S4 error pair verbatim; Erneut versuchen refires the fetch", async () => {
    listModelltestsMock.mockRejectedValueOnce(new Error("network_down"));

    renderWithI18n(<HoerenIntroScreen />);

    await waitFor(() => expect(screen.getByTestId("hoeren-intro-error")).toBeInTheDocument());
    expect(screen.getByText("Modelltests konnten nicht geladen werden")).toBeInTheDocument();
    expect(
      screen.getByText("Prüfe deine Internetverbindung und versuche es erneut.")
    ).toBeInTheDocument();
    // Not the session screen's error copy.
    expect(
      screen.queryByText("Der Modelltest konnte nicht geladen werden")
    ).not.toBeInTheDocument();

    listModelltestsMock.mockResolvedValueOnce(ROWS);
    fireEvent.click(screen.getByTestId("hoeren-intro-error-retry"));

    await waitFor(() => expect(listModelltestsMock).toHaveBeenCalledTimes(2));
    await waitFor(() =>
      expect(screen.getByTestId("hoeren-modelltest-hoeren-b1-01")).toBeInTheDocument()
    );
  });

  it("(f) zero rows surviving the level filter renders the empty state with the authorized Hören module-word swap", async () => {
    // Only a B2 row on the server — a b1 learner's filter zeroes it out.
    listModelltestsMock.mockResolvedValue([
      row({
        slug: "hoeren-b2-01",
        title: "Modelltest B2",
        short_label: "MT B2",
        sequence_num: 1,
        level_code: "B2",
      }),
    ]);

    renderWithI18n(<HoerenIntroScreen />);

    await waitFor(() => expect(screen.getByTestId("hoeren-intro-empty")).toBeInTheDocument());
    expect(screen.getByText("Noch keine Hören-Modelltests")).toBeInTheDocument();
    expect(
      screen.getByText(
        "Für diesen Kurs haben wir noch keine Hören-Inhalte im Content-Paket. Wechsle in den Einstellungen zu einem Kurs mit verfügbaren Modelltests, oder sieh bald wieder vorbei."
      )
    ).toBeInTheDocument();
  });

  it("startSession rejection renders the error banner with the message and does not navigate; a retry click re-fires startSession", async () => {
    listModelltestsMock.mockResolvedValue(ROWS);
    startSessionMock.mockRejectedValue(new Error("mock_exam_start_failed"));

    renderWithI18n(<HoerenIntroScreen />);
    await waitFor(() =>
      expect(screen.getByTestId("hoeren-modelltest-hoeren-b1-01")).toBeInTheDocument()
    );

    fireEvent.click(screen.getByTestId("hoeren-intro-start"));

    await waitFor(() => expect(screen.getByTestId("hoeren-intro-start-error")).toBeInTheDocument());
    expect(screen.getByTestId("hoeren-intro-start-error").textContent).toBe(
      "mock_exam_start_failed"
    );
    expect(pushMock).not.toHaveBeenCalled();

    startSessionMock.mockResolvedValueOnce({
      mockAttemptId: "mock-3",
      examSlug: "hoeren-b1-01",
      status: "in_progress",
      nextModule: "SCHREIBEN",
      lesenAttemptId: null,
      hoerenAttemptId: "hoeren-3",
      resumed: false,
    });
    fireEvent.click(screen.getByTestId("hoeren-intro-start"));
    await waitFor(() => expect(startSessionMock).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(pushMock).toHaveBeenCalledTimes(1));
  });
});
