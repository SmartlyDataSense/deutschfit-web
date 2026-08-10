import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithI18n } from "./helpers/renderWithI18n";
import { getLearnerDb, __resetLearnerDbForTests } from "../../src/learner/core/db";
import { DAY_MS } from "../../src/learner/core/srs/sm2";
import { RevealScreen } from "../../src/learner/srs/screens/RevealScreen";

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

describe("RevealScreen", () => {
  it("shows options with the correct answer highlighted and the explanation", async () => {
    await seedDueCard("card-1", 2);
    renderWithI18n(<RevealScreen cardId="card-1" />);

    await waitFor(() => {
      expect(screen.getByTestId("srs-reveal-screen")).toBeInTheDocument();
    });
    const radios = screen.getAllByRole("radio");
    expect(radios[0]).toHaveTextContent("weil ✓");
    expect(screen.getByTestId("srs-reveal-explanation")).toHaveTextContent(
      "« weil » introduit une cause et envoie le verbe à la fin."
    );
  });

  it("rating 'good' persists a review, bumps next_due, and replaces to /fr/app/srs", async () => {
    await seedDueCard("card-1", 2);
    renderWithI18n(<RevealScreen cardId="card-1" />);
    await waitFor(() => {
      expect(screen.getByTestId("srs-reveal-difficulty")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: /Bien/ }));

    await waitFor(() => {
      expect(replaceMock).toHaveBeenCalledWith("/fr/app/srs");
    });
    const db = await getLearnerDb();
    const reviews = await db.srsReviews.toArray();
    expect(reviews).toHaveLength(1);
    const card = (await db.srsCards.get("card-1")) as { next_due: number };
    expect(card.next_due).toBeGreaterThan(Date.now());
  });

  it("unknown card renders the missing state with an explicit back CTA (S10-D2)", async () => {
    renderWithI18n(<RevealScreen cardId="nope" />);
    await waitFor(() => {
      expect(screen.getByTestId("srs-reveal-missing")).toBeInTheDocument();
    });
    expect(screen.getByTestId("srs-reveal-missing")).toHaveTextContent("Carte introuvable");
    fireEvent.click(screen.getByTestId("srs-reveal-back"));
    expect(replaceMock).toHaveBeenCalledWith("/fr/app/srs");
  });

  it("renders the error state (not the missing state) when the due-queue query fails", async () => {
    const db = await getLearnerDb();
    vi.spyOn(db.srsCards, "toArray").mockRejectedValueOnce(new Error("boom"));

    renderWithI18n(<RevealScreen cardId="card-1" />);

    await waitFor(() => {
      expect(screen.getByTestId("srs-reveal-error")).toBeInTheDocument();
    });
    expect(screen.getByTestId("srs-reveal-error")).toHaveTextContent("Erreur");
    expect(screen.queryByTestId("srs-reveal-missing")).not.toBeInTheDocument();
    fireEvent.click(screen.getByTestId("srs-reveal-back"));
    expect(replaceMock).toHaveBeenCalledWith("/fr/app/srs");
  });

  it("does not flash the missing-card state while the due-queue query is still in flight", async () => {
    await seedDueCard("card-1", 2);
    const db = await getLearnerDb();
    const realToArray = db.srsCards.toArray.bind(db.srsCards);
    let resolvePending: (rows: unknown[]) => void = () => {};
    const pending = new Promise<unknown[]>((resolve) => {
      resolvePending = resolve;
    });
    vi.spyOn(db.srsCards, "toArray").mockReturnValueOnce(pending as Promise<never[]>);

    renderWithI18n(<RevealScreen cardId="card-1" />);

    // The due-queue query hasn't resolved yet (`cards` is still `[]`), so
    // without the `if (loading) return <Skeleton/>` guard `card` would be
    // `undefined` and the missing-card branch would render prematurely.
    expect(screen.queryByTestId("srs-reveal-missing")).not.toBeInTheDocument();
    expect(screen.getByTestId("srs-reveal-screen")).toBeInTheDocument();

    resolvePending(await realToArray());

    await waitFor(() => {
      expect(screen.getByTestId("srs-reveal-options")).toBeInTheDocument();
    });
    expect(screen.queryByTestId("srs-reveal-missing")).not.toBeInTheDocument();
  });

  it("persists the review before navigating away — the review row exists by the time router.replace fires", async () => {
    await seedDueCard("card-1", 2);
    renderWithI18n(<RevealScreen cardId="card-1" />);
    await waitFor(() => {
      expect(screen.getByTestId("srs-reveal-difficulty")).toBeInTheDocument();
    });

    const db = await getLearnerDb();
    const putSpy = vi.spyOn(db.srsReviews, "put");
    let putCallsAtNavigate = -1;
    replaceMock.mockImplementationOnce(() => {
      putCallsAtNavigate = putSpy.mock.calls.length;
    });

    fireEvent.click(screen.getByRole("button", { name: /Bien/ }));

    await waitFor(() => {
      expect(replaceMock).toHaveBeenCalledWith("/fr/app/srs");
    });
    // If `submit(...)` were fire-and-forget (`void submit(...)`) instead of
    // awaited, `router.replace` would fire before the review row is
    // written — this pins the ordering, not just the eventual outcome.
    expect(putCallsAtNavigate).toBe(1);
  });
});
