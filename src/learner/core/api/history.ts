/**
 * History edge-function client (S3 · Task 3.4) — lives in `core/api` so
 * both `accueil` and (later) `coach` features can call it, mirroring
 * mobile's feature-isolation rule.
 *
 * Ports `deutschfit-mobile/src/core/api/history.ts` verbatim (runtime
 * guards, `normaliseFeedRow`, error-code strings) with only the transport
 * swapped: `supabase.functions.invoke` → `invokeFn` (`./client`).
 * `invokeFn` throws `ApiError` on transport/HTTP failure instead of
 * returning `{ data, error }`, so the `{ error }` branch below is a
 * try/catch that rethrows with the mobile transport-error message the
 * caller's guard tables expect.
 *
 * Wraps `history-get`, the single endpoint that backs
 * `PerformanceHistoryScreen`. The function returns two payloads in one
 * round-trip:
 *
 *   1. `pinnedDiagnostic` — the latest entry from
 *      `user_diagnostic_answers` plus a server-rendered French
 *      `deltaLabel` (e.g. "+1 niveau depuis le 1er mars"). The client
 *      blits this string directly so we don't reproduce CEFR
 *      arithmetic or French date formatting client-side.
 *   2. `feed` — paginated activity list (`writing_submissions` ∪
 *      `sprechen_submissions` filtered to schema_version=2). Each row
 *      carries a `deepLinkRoute { screen, params: { runId } }`.
 *
 * Errors bubble as thrown `Error`s with either the server `error` code
 * or a transport identifier; the hook pattern-matches.
 *
 * SHAPE IS FROZEN — see
 * `deutschfit-backend/supabase/functions/history-get/index.ts`. Any
 * payload change ships in lock-step on both sides.
 */
import { invokeFn } from "./client";

export type HistoryFeedKind = "schreiben" | "sprechen";

export interface HistoryDeepLinkRoute {
  readonly screen: string;
  readonly params: { readonly runId: string };
}

/**
 * Terminal-state markers (F-043). The backend surfaces both `status` and
 * `error_message` (renamed `errorMessage`) on every sprechen feed row so
 * the history list can render a "Non évaluée" pill instead of an
 * ambiguous 0/100 for rejected recordings. Schreiben rows are always
 * `status: null, errorMessage: null` today — the rejection lane is
 * sprechen-only. We keep both fields optional / nullable so the screen
 * branches defensively on `status === "rejected"`.
 */
export type HistoryRowStatus = "graded" | "rejected";

export interface HistoryFeedRow {
  readonly id: string;
  readonly kind: HistoryFeedKind;
  readonly createdAt: string;
  readonly score: number;
  readonly scoreMax: number;
  readonly level: string;
  /**
   * F-011 (#365): canonical board token the backend derives from the
   * submission's `exam_product` slug — `"goethe" | "telc" | "oesd" |
   * "testdaf" | "ecl"`, or `""` when the row carries no board signal.
   * The history card maps it to a display label; an empty / unknown
   * token renders no chip.
   */
  readonly board: string;
  /**
   * F-011 (#365): prompt title for the card subtitle. Schreiben rows
   * carry `writing_prompts.title_de`; sprechen rows have no joinable
   * prompt table, so `title` is `null` and the card falls back to the
   * board / level chips alone.
   */
  readonly title: string | null;
  readonly deepLinkRoute: HistoryDeepLinkRoute;
  readonly status: HistoryRowStatus | null;
  readonly errorMessage: string | null;
}

export interface HistoryDiagnosticAttempt {
  readonly attemptId: string;
  readonly estimatedLevel: string;
  readonly submittedAt: string;
}

export interface HistoryPinnedDiagnostic {
  readonly latest: HistoryDiagnosticAttempt;
  readonly previous: Pick<HistoryDiagnosticAttempt, "estimatedLevel" | "submittedAt"> | null;
  readonly deltaLabel: string | null;
}

export interface HistoryPayload {
  readonly pinnedDiagnostic: HistoryPinnedDiagnostic | null;
  readonly feed: readonly HistoryFeedRow[];
  readonly nextCursor: string | null;
}

export interface FetchHistoryArgs {
  readonly cursor?: string | null;
  readonly limit?: number;
}

interface ServerErrorPayload {
  readonly error?: string;
}

const EDGE_FUNCTION_NAME = "history-get";

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isDeepLink(value: unknown): value is HistoryDeepLinkRoute {
  if (!isRecord(value)) return false;
  if (typeof value.screen !== "string") return false;
  if (!isRecord(value.params)) return false;
  return typeof value.params.runId === "string";
}

function isFeedRow(value: unknown): value is HistoryFeedRow {
  if (!isRecord(value)) return false;
  const kindOk = value.kind === "schreiben" || value.kind === "sprechen";
  // F-043: backend always emits these two fields (null on schreiben),
  // but we accept legacy missing-keys responses to stay forward-compat
  // with edge functions deployed before the F-043 cut. Missing → null.
  const statusOk =
    value.status === null ||
    value.status === undefined ||
    value.status === "graded" ||
    value.status === "rejected";
  const errorMessageOk =
    value.errorMessage === null ||
    value.errorMessage === undefined ||
    typeof value.errorMessage === "string";
  // F-011: backend always emits `board` (possibly "") and `title`
  // (null on sprechen), but legacy pre-F-011 deployments omit them —
  // accept missing keys so the screen stays forward-compat. Missing →
  // coerced in `normaliseFeedRow`.
  const boardOk = value.board === undefined || typeof value.board === "string";
  const titleOk =
    value.title === undefined || value.title === null || typeof value.title === "string";
  return (
    typeof value.id === "string" &&
    kindOk &&
    typeof value.createdAt === "string" &&
    typeof value.score === "number" &&
    typeof value.scoreMax === "number" &&
    typeof value.level === "string" &&
    isDeepLink(value.deepLinkRoute) &&
    statusOk &&
    errorMessageOk &&
    boardOk &&
    titleOk
  );
}

function isDiagnosticAttempt(value: unknown): value is HistoryDiagnosticAttempt {
  if (!isRecord(value)) return false;
  return (
    typeof value.attemptId === "string" &&
    typeof value.estimatedLevel === "string" &&
    typeof value.submittedAt === "string"
  );
}

function isPinnedDiagnostic(value: unknown): value is HistoryPinnedDiagnostic {
  if (!isRecord(value)) return false;
  if (!isDiagnosticAttempt(value.latest)) return false;
  if (
    value.previous !== null &&
    !(
      isRecord(value.previous) &&
      typeof value.previous.estimatedLevel === "string" &&
      typeof value.previous.submittedAt === "string"
    )
  ) {
    return false;
  }
  return value.deltaLabel === null || typeof value.deltaLabel === "string";
}

function isPayload(value: unknown): value is HistoryPayload {
  if (!isRecord(value)) return false;
  if (value.pinnedDiagnostic !== null && !isPinnedDiagnostic(value.pinnedDiagnostic)) {
    return false;
  }
  if (!Array.isArray(value.feed)) return false;
  if (!value.feed.every(isFeedRow)) return false;
  return value.nextCursor === null || typeof value.nextCursor === "string";
}

/**
 * Coerce the wire row (which may legally omit `status` / `errorMessage`
 * on older edge-function deployments) to the strict `HistoryFeedRow`
 * shape with explicit `null`s. Keeps the screen-side branching simple:
 * `row.status === "rejected"` is the only truthy case it needs.
 */
function normaliseFeedRow(row: HistoryFeedRow): HistoryFeedRow {
  return {
    ...row,
    status: row.status ?? null,
    errorMessage: row.errorMessage ?? null,
    board: row.board ?? "",
    title: row.title ?? null,
  };
}

export async function fetchHistory(args: FetchHistoryArgs = {}): Promise<HistoryPayload> {
  const body: Record<string, unknown> = {};
  if (args.cursor !== undefined) body.cursor = args.cursor;
  if (args.limit !== undefined) body.limit = args.limit;

  let data: HistoryPayload | ServerErrorPayload;
  try {
    data = await invokeFn<HistoryPayload | ServerErrorPayload>(EDGE_FUNCTION_NAME, {
      method: "POST",
      body,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : undefined;
    throw new Error(message || "history_get_transport_error");
  }

  if (!isRecord(data)) {
    throw new Error("history_get_empty_response");
  }
  const maybeServerError = (data as ServerErrorPayload).error;
  if (typeof maybeServerError === "string") {
    throw new Error(maybeServerError);
  }
  if (!isPayload(data)) {
    throw new Error("history_get_malformed_response");
  }
  return {
    ...data,
    feed: data.feed.map(normaliseFeedRow),
  };
}
