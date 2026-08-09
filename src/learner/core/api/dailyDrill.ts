/**
 * Daily-drill home client (S3 · Task 3.4).
 *
 * Ports `deutschfit-mobile/src/core/api/dailyDrill.ts` verbatim (reason
 * enum, item-count mapping, blanket error collapse) with only the
 * transport swapped: `supabase.functions.invoke` → `invokeFn`
 * (`./client`). `invokeFn` throws `ApiError` on transport/HTTP failure
 * instead of returning `{ data, error }`, so the whole call sits in a
 * try/catch that collapses any failure — thrown or malformed payload —
 * to the same `{ itemCount: 0, reason: "error" }` envelope mobile
 * returns.
 *
 * Wraps the `drill-recommend` edge function for the `home_daily` surface —
 * the engine that turns a learner's detected grammar gaps (gap_events →
 * BKT `user_concept_mastery`) into a recommended set of drill questions.
 *
 * This client lives in `core/api` (not under `accueil/`) because the
 * Accueil home screen is a *second* consumer of the same engine and
 * feature isolation forbids `accueil/` importing from a future `drill/`
 * feature. The drill feature keeps its own richer client that returns
 * the full item list it needs to run a session; the home card only needs
 * to know whether gaps exist and how many, so this client deliberately
 * returns a narrow `{ itemCount, reason }` envelope rather than the
 * items themselves.
 *
 * Errors collapse to `{ itemCount: 0, reason: "error" }` so the caller can
 * route to a single calm empty-state branch without try/catch — same
 * contract as mobile's `drillClient.fetchDrillRecommendation`.
 */
import { invokeFn } from "./client";

/**
 * Enumerated outcome of a `home_daily` recommendation. Mirrors the
 * `reason` union emitted by `drill-recommend`; kept in sync by hand
 * because the edge-function types are not shared into this repo.
 */
export type DailyDrillReason =
  | "ok"
  | "level_not_supported_yet"
  | "no_missing_structures"
  | "no_gaps_yet"
  | "review_mode"
  | "error";

export interface DailyDrillRecommendation {
  /** Number of recommended drill items for the `home_daily` surface. */
  readonly itemCount: number;
  readonly reason: DailyDrillReason;
}

const VALID_REASONS: ReadonlySet<string> = new Set<DailyDrillReason>([
  "ok",
  "level_not_supported_yet",
  "no_missing_structures",
  "no_gaps_yet",
  "review_mode",
  "error",
]);

/**
 * Fetch the learner's daily-drill recommendation for the home card.
 *
 * `maxItems` caps how many gap-derived questions the engine returns; the
 * home card uses the count only as a teaser (the session itself may top up
 * from `redo`), so a small default keeps the request cheap.
 */
export async function fetchDailyDrill(maxItems = 5): Promise<DailyDrillRecommendation> {
  try {
    const data = await invokeFn<unknown>("drill-recommend", {
      method: "POST",
      body: { surface: "home_daily", max_items: maxItems },
    });
    if (!data || typeof data !== "object") {
      return { itemCount: 0, reason: "error" };
    }
    const rec = data as { items?: unknown; reason?: unknown };
    const itemCount = Array.isArray(rec.items) ? rec.items.length : 0;
    const reason: DailyDrillReason =
      typeof rec.reason === "string" && VALID_REASONS.has(rec.reason)
        ? (rec.reason as DailyDrillReason)
        : "error";
    return { itemCount, reason };
  } catch {
    return { itemCount: 0, reason: "error" };
  }
}
