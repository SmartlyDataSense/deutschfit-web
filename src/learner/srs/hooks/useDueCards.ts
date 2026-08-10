/**
 * Due-queue query + hook. Port of mobile `src/features/srs/hooks/useDueCards.ts`
 * (Drizzle -> LearnerTableApi). S10-D4: `LearnerTableApi` has no range/order/
 * limit query, so this is toArray() -> JS filter/sort/slice — same precedent
 * as core/storage/practiceProgress.ts. Deck sizes are tens of rows.
 */
import { useCallback, useEffect, useState } from "react";
import { getLearnerDb } from "@/learner/core/db";
import type { SRSCardRow } from "@/learner/core/db/types";
import type { SRSAnswerPayload, SRSCard, SRSPromptPayload } from "../types";

const DEFAULT_LIMIT = 20;

export interface UseDueCardsOptions {
  readonly limit?: number;
  /** Optional filter on the card deck (e.g. `connector-weak-set`). */
  readonly deck?: string | null;
  /**
   * Injectable clock for tests — production code reads the wall
   * clock at query time.
   */
  readonly now?: () => Date;
}

export interface UseDueCardsResult {
  readonly cards: readonly SRSCard[];
  readonly loading: boolean;
  readonly error: Error | null;
  readonly refresh: () => Promise<void>;
}

export function mapRowToCard(row: SRSCardRow): SRSCard {
  return {
    id: row.id,
    cardType: row.card_type,
    prompt: row.prompt as SRSPromptPayload,
    answer: row.answer as SRSAnswerPayload,
    sourceRef: row.source_ref,
    deck: row.deck,
    nextDue: new Date(row.next_due),
    createdAt: new Date(row.created_at),
  };
}

export async function queryDueCards(options: UseDueCardsOptions = {}): Promise<readonly SRSCard[]> {
  const limit = options.limit ?? DEFAULT_LIMIT;
  const nowMs = (options.now?.() ?? new Date()).getTime();
  const deckFilter = options.deck;

  const db = await getLearnerDb();
  const rows = (await db.srsCards.toArray()) as unknown as SRSCardRow[];
  return rows
    .filter((row) => row.next_due <= nowMs)
    .filter((row) =>
      deckFilter === undefined
        ? true
        : deckFilter === null
          ? row.deck === null
          : row.deck === deckFilter
    )
    .sort((a, b) => a.next_due - b.next_due)
    .slice(0, limit)
    .map(mapRowToCard);
}

export function useDueCards(options: UseDueCardsOptions = {}): UseDueCardsResult {
  const { limit, deck, now } = options;
  const [cards, setCards] = useState<readonly SRSCard[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<Error | null>(null);

  const refresh = useCallback(async (): Promise<void> => {
    setLoading(true);
    setError(null);
    try {
      setCards(await queryDueCards({ limit, deck, now }));
    } catch (err) {
      setError(err instanceof Error ? err : new Error(String(err)));
    } finally {
      setLoading(false);
    }
  }, [limit, deck, now]);

  useEffect(() => {
    // StrictMode discipline: `cancelled` declared inside setup, set in cleanup.
    let cancelled = false;
    void (async () => {
      setLoading(true);
      setError(null);
      try {
        const rows = await queryDueCards({ limit, deck, now });
        if (!cancelled) setCards(rows);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err : new Error(String(err)));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [limit, deck, now]);

  return { cards, loading, error, refresh };
}
