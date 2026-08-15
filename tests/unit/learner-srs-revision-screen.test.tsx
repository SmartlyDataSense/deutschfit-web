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

async function seedVocabCard(id: string, overdueDays: number): Promise<void> {
  const db = await getLearnerDb();
  await db.srsCards.put({
    id,
    card_type: "vocab_word",
    prompt: {
      kind: "vocab",
      subjectLabel: "Wortschatz B1",
      headword: "die Verantwortung",
      translation: "la responsabilité",
      explanation: "Substantiv, feminin.",
    },
    answer: {
      options: [
        { id: "o1", label: "la responsabilité", isCorrect: true },
        { id: "o2", label: "la réponse", isCorrect: false },
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
  // S13 Task 5 · Step 3 (S10-T5): the loading-state skeletons must expose
  // an accessible name of "Chargement…" (`common:status.loading`), not
  // the screen title — a screen reader landing mid-load should hear
  // "loading", not the destination title read out prematurely for
  // content that isn't there yet.
  it("loading-state skeletons are labelled 'Chargement…', not the screen title", () => {
    renderWithI18n(<RevisionScreen />);
    const loadingLabelled = screen.getAllByLabelText("Chargement…");
    expect(loadingLabelled.length).toBeGreaterThanOrEqual(3);
    expect(screen.queryByLabelText("Réviser")).toBeNull();
  });

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
    await waitFor(() => {
      expect(screen.getByTestId("srs-revision-footer")).toHaveTextContent("Carte 1 / 2");
      expect(screen.getByTestId("srs-revision-footer")).toHaveTextContent("2 restantes");
    });

    fireEvent.click(screen.getByTestId("srs-revision-reveal"));
    expect(pushMock).toHaveBeenCalledWith("/fr/app/srs/reveal/card-0");
  });

  it("renders the error state when the due-queue query fails", async () => {
    const db = await getLearnerDb();
    vi.spyOn(db.srsCards, "toArray").mockRejectedValueOnce(new Error("boom"));

    renderWithI18n(<RevisionScreen />);

    await waitFor(() => {
      expect(screen.getByTestId("srs-revision-error")).toBeInTheDocument();
    });
    expect(screen.getByTestId("srs-revision-error")).toHaveTextContent("Erreur");
    expect(screen.queryByTestId("srs-revision-card")).not.toBeInTheDocument();
  });

  it("shows the due-today pill (not an overdue-days string) when next_due is not overdue", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    try {
      const now = new Date("2026-08-08T12:00:00.000Z");
      vi.setSystemTime(now);
      const db = await getLearnerDb();
      await db.srsCards.put({
        id: "card-today",
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
        next_due: now.getTime(),
        created_at: now.getTime() - 10 * DAY_MS,
      } as never);

      renderWithI18n(<RevisionScreen />);

      await waitFor(() => {
        expect(screen.getByTestId("srs-revision-card")).toBeInTheDocument();
      });
      expect(screen.getByTestId("srs-revision-card-due")).toHaveTextContent("Dû aujourd'hui");
      expect(screen.getByTestId("srs-revision-card-due")).not.toHaveTextContent("Dû depuis");
    } finally {
      vi.useRealTimers();
    }
  });

  it("renders the vocab instruction ('Traduisez') for a vocab-kind prompt, not the cloze one", async () => {
    await seedVocabCard("card-vocab", 1);
    renderWithI18n(<RevisionScreen />);

    await waitFor(() => {
      expect(screen.getByTestId("srs-revision-card")).toBeInTheDocument();
    });
    expect(screen.getByTestId("srs-revision-card")).toHaveTextContent("Traduisez");
    expect(screen.getByTestId("srs-revision-card")).not.toHaveTextContent("Complétez");
  });
});
