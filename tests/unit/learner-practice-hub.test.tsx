import { act, cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// `pushMock`/`hydrateMock` are built via `vi.hoisted` (not plain top-level
// `const`s) because `vi.mock` factories are hoisted above the rest of the
// module — see `tests/unit/learner-onboarding-exam-type.test.tsx`'s header
// comment for the TDZ rationale.
const { pushMock, hydrateMock } = vi.hoisted(() => ({
  pushMock: vi.fn(),
  hydrateMock: vi.fn(),
}));

const { listMock } = vi.hoisted(() => ({ listMock: vi.fn() }));
vi.mock("@/learner/core/storage/practiceProgress", () => ({
  listPracticeProgress: listMock,
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock, replace: vi.fn() }),
  usePathname: () => "/fr/app/apprendre/practice",
}));
vi.mock("next-intl", () => ({ useLocale: () => "fr" }));
// Partial mock: keep the real `useExamContextStore` (tests drive it
// directly via `setState`) but stub `hydrateExamContext` so the screen's
// self-hydrate mount effect (Task 4.7 fix round, adjudicated addition A)
// doesn't hit real localStorage/Supabase in jsdom — tests control
// `isLoaded` transitions explicitly instead.
vi.mock("@/learner/core/exam/examContext", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/learner/core/exam/examContext")>();
  return { ...actual, hydrateExamContext: hydrateMock };
});

import { useLearnerSession } from "@/learner/core/auth/useLearnerSession";
import { useExamContextStore } from "@/learner/core/exam/examContext";
import { renderWithI18n } from "./helpers/renderWithI18n";
import { PracticeHubScreen } from "@/learner/practice/screens/PracticeHubScreen";

describe("PracticeHubScreen — chips from IndexedDB only", () => {
  beforeEach(() => {
    listMock.mockReset();
    pushMock.mockReset();
    hydrateMock.mockReset();
    useLearnerSession.setState({
      status: "authenticated",
      session: { user: { id: "u1" } },
    } as never);
    useExamContextStore.setState({ board: "telc", level: "b1", isLoaded: true } as never);
  });
  afterEach(cleanup);

  it("renders done/todo chips from practice_progress records without any network", async () => {
    listMock.mockResolvedValue([
      {
        userId: "u1",
        board: "telc",
        level: "B1",
        moduleCode: "LESEN",
        quizSlug: "s1",
        answers: { q1: { key: "a", correct: true } },
        correctCount: 8,
        totalCount: 10,
        completedAt: 123,
        updatedAt: 2,
      },
      {
        userId: "u1",
        board: "telc",
        level: "B1",
        moduleCode: "SPRACHBAUSTEINE",
        quizSlug: "s2",
        answers: {},
        correctCount: 0,
        totalCount: 20,
        completedAt: null,
        updatedAt: 3,
      },
    ]);
    renderWithI18n(<PracticeHubScreen />);
    await waitFor(() => expect(screen.getByTestId("practice-hub-row-lesen")).toBeInTheDocument());
    expect(listMock).toHaveBeenCalledWith("u1", "telc", "B1");
    // lesen: completedAt set → done. sprachbausteine: answers {} → lockedCount 0 → todo.
    // Literal FR chip strings from fr/apprendre.json `practice.chips.{done,todo}`.
    await waitFor(() =>
      expect(screen.getByTestId("practice-hub-row-lesen").textContent).toContain("✓ Terminé")
    );
    expect(screen.getByTestId("practice-hub-row-sprachbausteine").textContent).toContain("À faire");
  });

  it("unsupported level renders the unsupported empty state", async () => {
    useExamContextStore.setState({ level: "c1" } as never);
    renderWithI18n(<PracticeHubScreen />);
    await waitFor(() =>
      expect(screen.getByText((s) => s.length > 0 && /niveau|level/i.test(s))).toBeInTheDocument()
    );
  });

  it("adjudicated addition A — self-hydrates on mount and renders once the store's isLoaded flag flips (deep-link/refresh regression)", async () => {
    listMock.mockResolvedValue([]);
    // Reproduces a hard refresh / deep-link straight onto this route:
    // before the fix, nothing ever called `hydrateExamContext()` for this
    // screen, so `isLoaded` stayed `false` forever and the loading skeleton
    // never resolved into the row chrome.
    useExamContextStore.setState({ board: "telc", level: "b1", isLoaded: false } as never);

    renderWithI18n(<PracticeHubScreen />);

    await waitFor(() => expect(hydrateMock).toHaveBeenCalledTimes(1));
    expect(screen.getByTestId("practice-hub-loading")).toBeInTheDocument();
    expect(screen.queryByTestId("practice-hub-row-lesen")).not.toBeInTheDocument();

    // Hydration lands (in real code this is `hydrateExamContext` flipping
    // the store; here the test drives it directly since `hydrateMock` is
    // stubbed).
    act(() => {
      useExamContextStore.setState({ isLoaded: true } as never);
    });

    await waitFor(() => expect(screen.getByTestId("practice-hub-row-lesen")).toBeInTheDocument());
    expect(screen.queryByTestId("practice-hub-loading")).not.toBeInTheDocument();
  });

  it("adjudicated addition B — clicking the lesen/sprachbausteine/hoeren/schreiben rows navigates each to its own destination", async () => {
    listMock.mockResolvedValue([]);
    renderWithI18n(<PracticeHubScreen />);

    await waitFor(() => expect(screen.getByTestId("practice-hub-row-lesen")).toBeInTheDocument());

    fireEvent.click(screen.getByTestId("practice-hub-row-lesen"));
    expect(pushMock).toHaveBeenCalledWith("/fr/app/apprendre/practice/lesen");

    fireEvent.click(screen.getByTestId("practice-hub-row-sprachbausteine"));
    expect(pushMock).toHaveBeenCalledWith("/fr/app/apprendre/practice/sprachbausteine");

    // Task 5.5 — hoeren flips from a disabled "coming soon" row to an
    // enabled one, exactly like lesen/sprachbausteine.
    fireEvent.click(screen.getByTestId("practice-hub-row-hoeren"));
    expect(pushMock).toHaveBeenCalledWith("/fr/app/apprendre/practice/hoeren");

    // Task 6.6 — schreiben flips from a disabled "coming soon" row to an
    // enabled one too, but its destination is the prompt list (not the
    // Übungstest picker), seeded with the learner's exam track
    // (`board:"telc"`, `level:"b1"` from `beforeEach`).
    fireEvent.click(screen.getByTestId("practice-hub-row-schreiben"));
    expect(pushMock).toHaveBeenCalledWith("/fr/app/schreiben?board=telc-b1");

    expect(pushMock).toHaveBeenCalledTimes(4);
  });

  it("Task 5.5 — hoeren row has no comingSoon pill and its chip always reads «À faire» (P13: no practice_progress row is ever derived for it)", async () => {
    listMock.mockResolvedValue([]);
    renderWithI18n(<PracticeHubScreen />);

    const hoerenRow = await waitFor(() => screen.getByTestId("practice-hub-row-hoeren"));
    // Literal FR chip string from fr/apprendre.json `practice.chips.todo`
    // — non-tautological: fails if the row still renders the distinct
    // `comingSoon` copy ("Bientôt disponible") instead.
    expect(hoerenRow.textContent).toContain("À faire");
    expect(hoerenRow.textContent).not.toContain("Bientôt disponible");
    expect(hoerenRow.getAttribute("aria-disabled")).toBeNull();
  });

  it("Task 6.6 — schreiben row has no comingSoon pill and its chip always reads «À faire» (writing_submissions isn't practice_progress)", async () => {
    listMock.mockResolvedValue([]);
    renderWithI18n(<PracticeHubScreen />);

    const schreibenRow = await waitFor(() => screen.getByTestId("practice-hub-row-schreiben"));
    expect(schreibenRow.textContent).toContain("À faire");
    expect(schreibenRow.textContent).not.toContain("Bientôt disponible");
    expect(schreibenRow.getAttribute("aria-disabled")).toBeNull();
    // The row itself is the clickable element (`Card` renders a `<button>`
    // when given `onClick`) — no separate nested button, matching the
    // lesen/sprachbausteine/hoeren row shape.
    expect(schreibenRow.tagName).toBe("BUTTON");
  });
});
