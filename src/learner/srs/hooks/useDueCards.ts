/**
 * Due-queue query + hook. Port of mobile `src/features/srs/hooks/useDueCards.ts`
 * (Drizzle -> LearnerTableApi). S10-D4: `LearnerTableApi` has no range/order/
 * limit query, so this is toArray() -> JS filter/sort/slice — same precedent
 * as core/storage/practiceProgress.ts. Deck sizes are tens of rows.
 *
 * web#43/#44 (S14 gate): two hardening passes on top of the S10 shape:
 *   - `mapRowToCard` no longer blind-casts `row.prompt`/`row.answer` (both
 *     `unknown` columns) to their payload types. It validates `prompt.kind`
 *     is a known kind and `answer.options` is a non-empty array, and
 *     returns `null` for anything else. `queryDueCards` drops nulls before
 *     they ever reach a screen — a malformed row degrades to "not in the
 *     queue" rather than rendering as a live-looking card that crashes on
 *     reveal (web#43).
 *   - `srsCards` moved to a `(user_id, id)` composite primary key (schema
 *     v2, `core/db/schema.ts`) so a browser-shared account can't inherit
 *     the previous account's deck. `queryDueCards` now takes a required
 *     `userId` and scopes the read via `whereEquals("user_id", userId)`;
 *     `useDueCards` sources it from `useLearnerSession` and returns an
 *     empty, non-loading queue when there is no session (web#44).
 *   - `refresh()` was exported with no caller and no coverage (web#44 part
 *     2) — deleted rather than wired. It was already flagged once for
 *     unmount-safety (no cancelled-guard) during the S10 review; nothing
 *     in the app needs a manual re-query today (both screens re-run the
 *     mount effect on every navigation via `useDueCards`'s own
 *     dependency array), so wiring it would mean adding guard logic and a
 *     test for an API surface nothing calls. Deleting closes both the
 *     dead-API and the unmount-safety points at once. If a real caller
 *     shows up (e.g. "refresh on window focus"), re-add it then with a
 *     cancelled-guard and a test that fails without one.
 */
import { useEffect, useState } from "react";
import { getLearnerDb } from "@/learner/core/db";
import type { SRSCardRow } from "@/learner/core/db/types";
import { useLearnerSession } from "@/learner/core/auth/useLearnerSession";
import type { SRSAnswerPayload, SRSCard, SRSPromptPayload } from "../types";

const DEFAULT_LIMIT = 20;

/** Known `SRSPromptPayload` tags — anything else fails validation. */
const KNOWN_PROMPT_KINDS = new Set<SRSPromptPayload["kind"]>(["cloze", "vocab"]);

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

export interface QueryDueCardsOptions extends UseDueCardsOptions {
  /** Scopes the read to this account's cards only (web#44). */
  readonly userId: string;
}

export interface UseDueCardsResult {
  readonly cards: readonly SRSCard[];
  readonly loading: boolean;
  readonly error: Error | null;
}

function isValidPrompt(value: unknown): value is SRSPromptPayload {
  if (typeof value !== "object" || value === null || !("kind" in value)) return false;
  return KNOWN_PROMPT_KINDS.has((value as { kind: unknown }).kind as SRSPromptPayload["kind"]);
}

function isValidAnswer(value: unknown): value is SRSAnswerPayload {
  if (typeof value !== "object" || value === null) return false;
  const options = (value as { options?: unknown }).options;
  return Array.isArray(options) && options.length > 0;
}

/**
 * Narrows a raw Dexie row into a render-safe `SRSCard`, or rejects it.
 * `row.prompt`/`row.answer` are stored as `unknown` — this is the one
 * place that's allowed to look inside them. Returns `null` (never throws)
 * for a row whose `prompt.kind` isn't a known kind or whose
 * `answer.options` is missing/empty, so a malformed row degrades to
 * "absent from the due queue" instead of reaching `RevisionScreen`/
 * `RevealScreen` as a half-formed card (web#43).
 */
export function mapRowToCard(row: SRSCardRow): SRSCard | null {
  if (!isValidPrompt(row.prompt) || !isValidAnswer(row.answer)) {
    // Log the id only — never the payload, it's learner content.
    console.warn(`useDueCards: rejected malformed srsCards row (id=${row.id})`);
    return null;
  }
  return {
    id: row.id,
    cardType: row.card_type,
    prompt: row.prompt,
    answer: row.answer,
    sourceRef: row.source_ref,
    deck: row.deck,
    nextDue: new Date(row.next_due),
    createdAt: new Date(row.created_at),
  };
}

export async function queryDueCards(options: QueryDueCardsOptions): Promise<readonly SRSCard[]> {
  const limit = options.limit ?? DEFAULT_LIMIT;
  const nowMs = (options.now?.() ?? new Date()).getTime();
  const deckFilter = options.deck;

  const db = await getLearnerDb();
  const rows = (await db.srsCards.whereEquals(
    "user_id",
    options.userId
  )) as unknown as SRSCardRow[];
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
    .map(mapRowToCard)
    .filter((card): card is SRSCard => card !== null);
}

export function useDueCards(options: UseDueCardsOptions = {}): UseDueCardsResult {
  const { limit, deck, now } = options;
  const userId = useLearnerSession((s) => s.session?.user?.id ?? null);
  const [cards, setCards] = useState<readonly SRSCard[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    if (!userId) {
      setCards([]);
      setError(null);
      setLoading(false);
      return;
    }
    // StrictMode discipline: `cancelled` declared inside setup, set in cleanup.
    let cancelled = false;
    void (async () => {
      setLoading(true);
      setError(null);
      try {
        const rows = await queryDueCards({ userId, limit, deck, now });
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
  }, [userId, limit, deck, now]);

  return { cards, loading, error };
}
