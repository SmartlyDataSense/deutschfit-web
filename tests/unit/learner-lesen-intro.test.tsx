import { act, cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// `vi.hoisted` — same TDZ rationale as `learner-practice-picker.test.tsx`:
// `vi.mock` factories are hoisted above the rest of the module, so any mock
// fn they reference must be built via `vi.hoisted`, not a plain top-level
// `const`.
const { listModelltestsMock, startSessionMock, pushMock, hydrateMock } = vi.hoisted(() => ({
  listModelltestsMock: vi.fn(),
  startSessionMock: vi.fn(),
  pushMock: vi.fn(),
  hydrateMock: vi.fn(),
}));

vi.mock("@/learner/core/api/mockExam", () => ({
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
// directly via `setState`, same as `learner-practice-picker.test.tsx`) but
// stub `hydrateExamContext` so the screen's self-hydrate effect doesn't
// hit real localStorage/Supabase in jsdom — tests control `isLoaded`
// transitions explicitly instead.
vi.mock("@/learner/core/exam/examContext", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/learner/core/exam/examContext")>();
  return { ...actual, hydrateExamContext: hydrateMock };
});

import { useLearnerSession } from "@/learner/core/auth/useLearnerSession";
import { useExamContextStore } from "@/learner/core/exam/examContext";
import type { ModelltestRow } from "@/learner/core/api/mockExam";
import { LesenIntroScreen } from "@/learner/lesen/screens/LesenIntroScreen";
import { renderWithI18n } from "./helpers/renderWithI18n";

function row(overrides: Partial<ModelltestRow>): ModelltestRow {
  return {
    id: overrides.slug ?? "id",
    slug: "lesen-b1-01",
    title: "Modelltest 1",
    cert_code: "GOETHE",
    level_code: "B1",
    short_label: "MT 1",
    sequence_num: 1,
    ...overrides,
  };
}

const ROWS: ModelltestRow[] = [
  row({ slug: "lesen-b1-03", title: "Modelltest 3", short_label: "MT 3", sequence_num: 3 }),
  row({ slug: "lesen-b1-01", title: "Modelltest 1", short_label: "MT 1", sequence_num: 1 }),
  // nulls-last: this row has no sequence_num and must sort after every
  // numbered row, even though it's listed second here (server order is
  // slug-asc, unrelated to the expected client sort).
  row({ slug: "lesen-b1-02", title: "Modelltest 2", short_label: "MT 2", sequence_num: null }),
];

describe("LesenIntroScreen — modelltest picker + live drill bootstrap", () => {
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

  it("lists picker rows sorted by sequence_num nulls-last, short_label under lesen-modelltest-<slug> testIDs", async () => {
    listModelltestsMock.mockResolvedValue(ROWS);

    renderWithI18n(<LesenIntroScreen />);

    await waitFor(() =>
      expect(screen.getByTestId("lesen-modelltest-lesen-b1-01")).toBeInTheDocument()
    );
    expect(listModelltestsMock).toHaveBeenCalledWith({ module: "LESEN" });

    // Order in the DOM must be 01 (seq 1), 03 (seq 3), 02 (seq null, last) —
    // NOT the server's slug-asc order the fixture is listed in above.
    const testIds = screen
      .getAllByTestId(/^lesen-modelltest-/)
      .map((el) => el.getAttribute("data-testid"));
    expect(testIds).toEqual([
      "lesen-modelltest-lesen-b1-01",
      "lesen-modelltest-lesen-b1-03",
      "lesen-modelltest-lesen-b1-02",
    ]);

    expect(screen.getByTestId("lesen-modelltest-lesen-b1-01").textContent).toContain("MT 1");
    expect(screen.getByTestId("lesen-modelltest-lesen-b1-03").textContent).toContain("MT 3");
    expect(screen.getByTestId("lesen-modelltest-lesen-b1-02").textContent).toContain("MT 2");

    // Byte-identical German exam copy (mobile parity), non-tautological —
    // fails if the hardcoded strings regress or get routed through i18n.
    expect(screen.getByTestId("lesen-intro-title").textContent).toBe("Modul Lesen");
    expect(screen.getByTestId("lesen-intro-picker-title").textContent).toBe("Modelltest wählen");
    expect(screen.getByTestId("lesen-intro-picker-meta").textContent).toBe(
      "3 Modelltests verfügbar"
    );
    expect(screen.getByTestId("lesen-intro-info-card").textContent).toContain(
      "5 Teile · 65 Minuten"
    );
  });

  it("Test starten runs startSession exactly once under a double-click and pushes the LESEN session route with examSlug, mockAttemptId, attemptId and moduleFilter=LESEN", async () => {
    listModelltestsMock.mockResolvedValue(ROWS);
    let resolveStart: (value: unknown) => void = () => {};
    startSessionMock.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveStart = resolve;
        })
    );

    renderWithI18n(<LesenIntroScreen />);
    await waitFor(() =>
      expect(screen.getByTestId("lesen-modelltest-lesen-b1-01")).toBeInTheDocument()
    );

    const startButton = screen.getByTestId("lesen-intro-start");
    // Fire both clicks before the in-flight promise resolves — the
    // re-entrancy ref (not just the disabled-button visual state) must be
    // what blocks the second call.
    fireEvent.click(startButton);
    fireEvent.click(startButton);

    expect(startSessionMock).toHaveBeenCalledTimes(1);
    expect(startSessionMock).toHaveBeenCalledWith({ userId: "u1", examSlug: "lesen-b1-01" });

    act(() => {
      resolveStart({
        mockAttemptId: "mock-1",
        examSlug: "lesen-b1-01",
        status: "in_progress",
        nextModule: "HOEREN",
        lesenAttemptId: "lesen-1",
        resumed: false,
      });
    });

    await waitFor(() =>
      expect(pushMock).toHaveBeenCalledWith(
        "/fr/app/examen/lesen/session?examSlug=lesen-b1-01&mockAttemptId=mock-1&attemptId=lesen-1&moduleFilter=LESEN"
      )
    );
    expect(startSessionMock).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId("lesen-intro-start-error")).not.toBeInTheDocument();
  });

  it("pushes without an attemptId param on a resumed attempt (no lesenAttemptId)", async () => {
    listModelltestsMock.mockResolvedValue(ROWS);
    startSessionMock.mockResolvedValue({
      mockAttemptId: "mock-2",
      examSlug: "lesen-b1-01",
      status: "in_progress",
      nextModule: "LESEN",
      lesenAttemptId: null,
      resumed: true,
    });

    renderWithI18n(<LesenIntroScreen />);
    await waitFor(() =>
      expect(screen.getByTestId("lesen-modelltest-lesen-b1-01")).toBeInTheDocument()
    );

    fireEvent.click(screen.getByTestId("lesen-intro-start"));

    await waitFor(() =>
      expect(pushMock).toHaveBeenCalledWith(
        "/fr/app/examen/lesen/session?examSlug=lesen-b1-01&mockAttemptId=mock-2&moduleFilter=LESEN"
      )
    );
  });

  it("startSession rejection renders the error banner with the message and does not navigate", async () => {
    listModelltestsMock.mockResolvedValue(ROWS);
    startSessionMock.mockRejectedValue(new Error("mock_exam_start_failed"));

    renderWithI18n(<LesenIntroScreen />);
    await waitFor(() =>
      expect(screen.getByTestId("lesen-modelltest-lesen-b1-01")).toBeInTheDocument()
    );

    fireEvent.click(screen.getByTestId("lesen-intro-start"));

    await waitFor(() => expect(screen.getByTestId("lesen-intro-start-error")).toBeInTheDocument());
    expect(screen.getByTestId("lesen-intro-start-error").textContent).toBe(
      "mock_exam_start_failed"
    );
    expect(pushMock).not.toHaveBeenCalled();

    // The learner can retry — a second click re-fires startSession rather
    // than being stuck behind the re-entrancy guard forever.
    startSessionMock.mockResolvedValueOnce({
      mockAttemptId: "mock-3",
      examSlug: "lesen-b1-01",
      status: "in_progress",
      nextModule: "HOEREN",
      lesenAttemptId: "lesen-3",
      resumed: false,
    });
    fireEvent.click(screen.getByTestId("lesen-intro-start"));
    await waitFor(() => expect(startSessionMock).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(pushMock).toHaveBeenCalledTimes(1));
  });

  it("fix round guard — waits for exam-context hydration before rendering the eyebrow/shape label, then uses the hydrated level", async () => {
    listModelltestsMock.mockResolvedValue(ROWS);
    // Reproduces a hard refresh / deep-link straight onto this route: the
    // store still holds the un-hydrated default (`goethe`/`b1`, not the
    // learner's real track) and `isLoaded: false`.
    useExamContextStore.setState({ board: "goethe", level: "b1", isLoaded: false } as never);

    renderWithI18n(<LesenIntroScreen />);

    await waitFor(() => expect(hydrateMock).toHaveBeenCalledTimes(1));
    // The modelltest fetch resolves independently of exam-context — give
    // it a chance to land before asserting the screen is still gated.
    await waitFor(() => expect(listModelltestsMock).toHaveBeenCalled());
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(screen.getByTestId("lesen-intro-loading")).toBeInTheDocument();
    expect(screen.queryByTestId("lesen-intro-screen")).not.toBeInTheDocument();

    // Hydration lands with the learner's REAL track — telc/b2, not the
    // un-hydrated goethe/b1 default.
    act(() => {
      useExamContextStore.setState({ board: "telc", level: "b2", isLoaded: true } as never);
    });

    await waitFor(() => expect(screen.getByTestId("lesen-intro-screen")).toBeInTheDocument());
    expect(screen.getByTestId("lesen-intro-eyebrow").textContent).toBe("B2");
    expect(screen.getByTestId("lesen-intro-info-card").textContent).toContain(
      "5 Teile · 65 Minuten"
    );
  });
});
