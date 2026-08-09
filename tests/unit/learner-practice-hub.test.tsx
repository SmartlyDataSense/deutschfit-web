import { cleanup, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { listMock } = vi.hoisted(() => ({ listMock: vi.fn() }));
vi.mock("@/learner/core/storage/practiceProgress", () => ({
  listPracticeProgress: listMock,
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  usePathname: () => "/fr/app/apprendre/practice",
}));

import { useLearnerSession } from "@/learner/core/auth/useLearnerSession";
import { useExamContextStore } from "@/learner/core/exam/examContext";
import { renderWithI18n } from "./helpers/renderWithI18n";
import { PracticeHubScreen } from "@/learner/practice/screens/PracticeHubScreen";

describe("PracticeHubScreen — chips from IndexedDB only", () => {
  beforeEach(() => {
    listMock.mockReset();
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
});
