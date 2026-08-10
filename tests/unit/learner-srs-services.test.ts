import { beforeEach, describe, expect, it } from "vitest";
import { getLearnerDb, __resetLearnerDbForTests } from "../../src/learner/core/db";
import type { SRSCardRow, SRSReviewRow } from "../../src/learner/core/db/types";
import { queryDueCards } from "../../src/learner/srs/hooks/useDueCards";
import { submitReview } from "../../src/learner/srs/hooks/useSubmitReview";
import { SM2_DEFAULT_EASE, DAY_MS } from "../../src/learner/core/srs/sm2";

const FIXED_NOW = new Date("2026-04-23T12:00:00.000Z");

function cardRow(id: string, nextDue: number, deck: string | null = null): SRSCardRow {
  return {
    id,
    card_type: "grammar_connector",
    prompt: {
      kind: "cloze",
      subjectLabel: "Connecteurs B1",
      before: "Ich bleibe zu Hause,",
      after: "es regnet.",
      explanation: "« weil » introduit une cause et envoie le verbe à la fin.",
    },
    answer: { options: [{ id: "o1", label: "weil", isCorrect: true }] },
    source_ref: "test-seed",
    deck,
    next_due: nextDue,
    created_at: FIXED_NOW.getTime() - 2 * DAY_MS,
  };
}

beforeEach(() => {
  __resetLearnerDbForTests();
});

describe("queryDueCards", () => {
  it("returns only cards with next_due <= now, earliest first, capped at limit", async () => {
    const db = await getLearnerDb();
    await db.srsCards.put(cardRow("late", FIXED_NOW.getTime() + DAY_MS) as never);
    await db.srsCards.put(cardRow("due-2", FIXED_NOW.getTime() - DAY_MS) as never);
    await db.srsCards.put(cardRow("due-1", FIXED_NOW.getTime() - 3 * DAY_MS) as never);

    const cards = await queryDueCards({ now: () => FIXED_NOW });
    expect(cards.map((c) => c.id)).toEqual(["due-1", "due-2"]);
    expect(cards[0]!.nextDue).toBeInstanceOf(Date);
    expect(cards[0]!.prompt.subjectLabel).toBe("Connecteurs B1");

    const limited = await queryDueCards({ now: () => FIXED_NOW, limit: 1 });
    expect(limited.map((c) => c.id)).toEqual(["due-1"]);
  });

  it("includes a card whose next_due exactly equals now (inclusive boundary)", async () => {
    const db = await getLearnerDb();
    await db.srsCards.put(cardRow("due-exact", FIXED_NOW.getTime()) as never);

    const cards = await queryDueCards({ now: () => FIXED_NOW });
    expect(cards.map((c) => c.id)).toEqual(["due-exact"]);
  });

  it("filters deck: undefined = all, null = deckless only, string = exact match", async () => {
    const db = await getLearnerDb();
    await db.srsCards.put(cardRow("no-deck", FIXED_NOW.getTime() - DAY_MS, null) as never);
    await db.srsCards.put(
      cardRow("weak-set", FIXED_NOW.getTime() - DAY_MS, "connector-weak-set") as never
    );

    expect((await queryDueCards({ now: () => FIXED_NOW })).length).toBe(2);
    expect((await queryDueCards({ now: () => FIXED_NOW, deck: null })).map((c) => c.id)).toEqual([
      "no-deck",
    ]);
    expect(
      (await queryDueCards({ now: () => FIXED_NOW, deck: "connector-weak-set" })).map((c) => c.id)
    ).toEqual(["weak-set"]);
  });
});

describe("submitReview", () => {
  it("fresh card + 'good': inserts review with SM-2 fresh ramp and bumps srs_cards.next_due", async () => {
    const db = await getLearnerDb();
    await db.srsCards.put(cardRow("card-abc", FIXED_NOW.getTime() - DAY_MS) as never);

    const result = await submitReview({
      cardId: "card-abc",
      rating: "good",
      now: FIXED_NOW,
      reviewId: "rev-fixed-1",
    });

    expect(result.id).toBe("rev-fixed-1");
    expect(result.easeAfter).toBeCloseTo(SM2_DEFAULT_EASE, 5);
    expect(result.intervalDaysAfter).toBe(1);
    expect(result.nextDue.getTime()).toBe(FIXED_NOW.getTime() + DAY_MS);

    const reviews = (await db.srsReviews.toArray()) as unknown as SRSReviewRow[];
    expect(reviews).toHaveLength(1);
    expect(reviews[0]!.card_id).toBe("card-abc");
    expect(reviews[0]!.reviewed_at).toBe(FIXED_NOW.getTime());

    const card = (await db.srsCards.get("card-abc")) as unknown as SRSCardRow;
    expect(card.next_due).toBe(FIXED_NOW.getTime() + DAY_MS);
    // the reviewed card no longer shows in the due queue
    expect((await queryDueCards({ now: () => FIXED_NOW })).length).toBe(0);
  });

  it("seeds SM-2 from the most recent prior review row (10d/2.5 + 'good' -> 25d)", async () => {
    const db = await getLearnerDb();
    await db.srsCards.put(cardRow("card-xyz", FIXED_NOW.getTime()) as never);
    await db.srsReviews.put({
      id: "rev-prev",
      card_id: "card-xyz",
      reviewed_at: FIXED_NOW.getTime() - 10 * DAY_MS,
      rating: "good",
      ease_after: 2.5,
      interval_days_after: 10,
      next_due: FIXED_NOW.getTime(),
    } as never);

    const result = await submitReview({
      cardId: "card-xyz",
      rating: "good",
      now: FIXED_NOW,
      reviewId: "rev-fixed-2",
    });
    expect(result.intervalDaysAfter).toBe(25);
    expect(result.easeAfter).toBe(2.5);
    expect(result.nextDue.getTime()).toBe(FIXED_NOW.getTime() + 25 * DAY_MS);
  });

  it("maps 'again' back to a 1-day reset on a graduated card", async () => {
    const db = await getLearnerDb();
    await db.srsCards.put(cardRow("card-q", FIXED_NOW.getTime()) as never);
    await db.srsReviews.put({
      id: "rev-old",
      card_id: "card-q",
      reviewed_at: FIXED_NOW.getTime() - 6 * DAY_MS,
      rating: "good",
      ease_after: 2.5,
      interval_days_after: 6,
      next_due: FIXED_NOW.getTime(),
    } as never);

    const result = await submitReview({ cardId: "card-q", rating: "again", now: FIXED_NOW });
    expect(result.intervalDaysAfter).toBe(1);
    expect(result.easeAfter).toBeCloseTo(2.3, 5);
    expect(result.id).toMatch(/^rev_/);
  });

  it("seeds from the truly latest prior review even when reviewed_at is out of insertion order", async () => {
    const db = await getLearnerDb();
    await db.srsCards.put(cardRow("card-multi", FIXED_NOW.getTime()) as never);
    // Insert the OLDER review first, then the NEWER one second — insertion
    // order (what a naive `priorReviews[0]` would read under the in-memory
    // fallback's Map-backed whereEquals) disagrees with chronological order
    // (what "latest prior review" must actually mean), so this pins the sort.
    await db.srsReviews.put({
      id: "rev-multi-old",
      card_id: "card-multi",
      reviewed_at: FIXED_NOW.getTime() - 20 * DAY_MS,
      rating: "again",
      ease_after: 1.5,
      interval_days_after: 1,
      next_due: FIXED_NOW.getTime() - 19 * DAY_MS,
    } as never);
    await db.srsReviews.put({
      id: "rev-multi-new",
      card_id: "card-multi",
      reviewed_at: FIXED_NOW.getTime() - 5 * DAY_MS,
      rating: "good",
      ease_after: 2.2,
      interval_days_after: 8,
      next_due: FIXED_NOW.getTime(),
    } as never);

    const result = await submitReview({
      cardId: "card-multi",
      rating: "good",
      now: FIXED_NOW,
    });

    // schedule({ ease: 2.2, intervalDays: 8 }, "good") -> easeAfter=2.2,
    // intervalDaysAfter=round(8*2.2)=18. Seeding from the older row instead
    // would yield easeAfter=1.5, intervalDaysAfter=round(1*1.5)=2.
    expect(result.easeAfter).toBe(2.2);
    expect(result.intervalDaysAfter).toBe(18);
  });
});
