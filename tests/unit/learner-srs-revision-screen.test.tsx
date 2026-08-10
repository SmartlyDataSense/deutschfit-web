import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithI18n } from "./helpers/renderWithI18n";
import { getLearnerDb, __resetLearnerDbForTests } from "../../src/learner/core/db";
import { DAY_MS } from "../../src/learner/core/srs/sm2";
import { RevisionScreen } from "../../src/learner/srs/screens/RevisionScreen";

const { pushMock, replaceMock, backMock } = vi.hoisted(() => ({
  pushMock: vi.fn(),
  replaceMock: vi.fn(),
  backMock: vi.fn(),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock, replace: replaceMock, back: backMock }),
}));
vi.mock("next-intl", () => ({ useLocale: () => "fr" }));

async function seedDueCard(id: string, overdueDays: number): Promise<void> {
  const db = await getLearnerDb();
  await db.srsCards.put({
    id,
    card_type: "grammar_connector",
    prompt: {
      kind: "cloze",
      subjectLabel: "Connecteurs B1",
      before: "Ich bleibe zu Hause,",
      after: "es regnet.",
      translation: "Je reste à la maison parce qu'il pleut.",
      explanation: "« weil » introduit une cause et envoie le verbe à la fin.",
    },
    answer: {
      options: [
        { id: "o1", label: "weil", isCorrect: true },
        { id: "o2", label: "obwohl", isCorrect: false },
      ],
    },
    source_ref: "test-seed",
    deck: null,
    next_due: Date.now() - overdueDays * DAY_MS,
    created_at: Date.now() - 10 * DAY_MS,
  } as never);
}

beforeEach(() => {
  __resetLearnerDbForTests();
  pushMock.mockReset();
  replaceMock.mockReset();
  backMock.mockReset();
});

afterEach(() => {
  cleanup();
});

describe("RevisionScreen", () => {
  it("renders the empty state when no cards are due", async () => {
    renderWithI18n(<RevisionScreen />);
    await waitFor(() => {
      expect(screen.getByTestId("srs-revision-empty")).toBeInTheDocument();
    });
    expect(screen.getByTestId("srs-revision-empty")).toHaveTextContent("Aucune carte à réviser");
    expect(screen.queryByTestId("srs-revision-card")).not.toBeInTheDocument();
  });

  it("renders the first due card with overdue pill + footer, and reveal navigates", async () => {
    await seedDueCard("card-1", 2);
    await seedDueCard("card-0", 3);
    renderWithI18n(<RevisionScreen />);

    await waitFor(() => {
      expect(screen.getByTestId("srs-revision-card")).toBeInTheDocument();
    });
    // earliest-due first: card-0 (3 days overdue)
    expect(screen.getByTestId("srs-revision-card-due")).toHaveTextContent("Dû depuis 3j");
    expect(screen.getByTestId("srs-revision-footer")).toHaveTextContent("Carte 1 / 2");
    expect(screen.getByTestId("srs-revision-footer")).toHaveTextContent("2 restantes");

    fireEvent.click(screen.getByTestId("srs-revision-reveal"));
    expect(pushMock).toHaveBeenCalledWith("/fr/app/srs/reveal/card-0");
  });
});
