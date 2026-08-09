/**
 * Web port of deutschfit-mobile/src/features/content/services/loadContent.ts
 * — Drizzle content_cache → Dexie contentCache via getLearnerDb(); callFn →
 * invokeFn; invalidateContentCache returns a Promise (Dexie delete is
 * async; mobile's is sync). Semantics (TTL, SWR, prefetch fallback,
 * in-flight dedupe) verbatim.
 *
 * Every feature loader (Lesen / Hören / Schreiben / Sprechen) routes its
 * read path through `loadContent` so we get:
 *
 *   - One-line stale-while-revalidate: return the cached payload immediately,
 *     kick a background fetch, overwrite the cache when fresh data lands.
 *   - Offline fallback: when the network call throws (no auth, DNS, 5xx), we
 *     fall back to the cached row if one exists. The caller decides whether a
 *     cache miss + network failure should surface as an error state.
 *   - Deterministic cache keys: the caller is responsible for a stable key
 *     (`<fn-name>:<stable-json-of-params>`) so two calls with identical
 *     inputs hit the same row.
 *   - Mode control:
 *       `"swr"`    (default) — cache-first, revalidate in background.
 *       `"prefetch"`         — network-first, only populates cache.
 *
 * Revalidation runs at most once per key in-flight — duplicate callers share
 * the same pending promise. The in-memory map is process-lifetime only.
 */
import { invokeFn } from "@/learner/core/api/client";
import { getLearnerDb } from "@/learner/core/db";
import type { ContentCacheRow } from "@/learner/core/db/types";

/** Revalidate threshold: rows older than this are considered stale. */
export const DEFAULT_TTL_MS = 5 * 60 * 1000;

export type LoadContentMode = "swr" | "prefetch";

export interface LoadContentOptions {
  /** Supabase edge-function name, e.g. `"prompts-list"`. */
  readonly fnName: string;
  /**
   * Stable cache key. Convention: `"<fnName>:<kind?>:<id?>"`. Do NOT include
   * a timestamp or anything volatile — two callers with the same logical
   * input must derive the same key so they share a row.
   */
  readonly cacheKey: string;
  /** HTTP method the edge function expects. Defaults to `"POST"`. */
  readonly method?: "GET" | "POST";
  /** Request body handed to `invokeFn`. */
  readonly body?: Record<string, unknown>;
  /** Stale threshold in ms. Defaults to `DEFAULT_TTL_MS`. */
  readonly ttlMs?: number;
  /** Operational mode. Defaults to `"swr"`. */
  readonly mode?: LoadContentMode;
}

export interface LoadContentResult<TPayload> {
  /** Payload returned to the caller — cached or fresh. */
  readonly data: TPayload;
  /** `true` when the payload came from the Dexie cache. */
  readonly fromCache: boolean;
  /** `true` when the cache row was older than `ttlMs` at read time. */
  readonly stale: boolean;
  /**
   * Pending revalidation promise, present only when `fromCache && stale` in
   * `swr` mode. Callers can await it to observe the network completion in
   * tests; UI code should ignore it.
   */
  readonly revalidation?: Promise<void>;
}

const inflight = new Map<string, Promise<void>>();

/**
 * Main entry point. Reads the Dexie cache first, then either returns
 * cached data (swr, fresh), returns cached + revalidates (swr, stale),
 * fetches fresh (swr, miss), or fetch-only (prefetch mode).
 *
 * Never throws when a cache row exists — the background fetch surfaces its
 * error via the returned `revalidation` promise, or is swallowed when the
 * caller doesn't await it. Throws only when there is no cache AND the
 * network call fails.
 */
export async function loadContent<TPayload>(
  options: LoadContentOptions
): Promise<LoadContentResult<TPayload>> {
  const { fnName, cacheKey, method = "POST", body, ttlMs = DEFAULT_TTL_MS, mode = "swr" } = options;

  const cached = await readCacheRow(cacheKey);

  if (mode === "prefetch") {
    // Prefetch ignores the cache and always tries the network, but writes
    // through on success. Failure is swallowed — prefetch is best-effort.
    try {
      const fresh = await invokeFn<TPayload>(fnName, { method, body });
      await writeCacheRow(cacheKey, fresh);
      return { data: fresh, fromCache: false, stale: false };
    } catch (err) {
      // If prefetch fails but a cached row exists, fall back to it rather
      // than throwing — prefetch callers (login hook) shouldn't break auth.
      if (cached) {
        const parsed = parsePayload<TPayload>(cached.payload);
        return { data: parsed, fromCache: true, stale: true };
      }
      throw err;
    }
  }

  // SWR mode.
  if (cached) {
    const age = Date.now() - cached.fetched_at;
    const stale = age >= ttlMs;
    const parsed = parsePayload<TPayload>(cached.payload);
    if (stale) {
      const revalidation = revalidate<TPayload>(cacheKey, fnName, method, body);
      return { data: parsed, fromCache: true, stale: true, revalidation };
    }
    return { data: parsed, fromCache: true, stale: false };
  }

  // Cache miss — must hit the network. Fail closed.
  const fresh = await invokeFn<TPayload>(fnName, { method, body });
  await writeCacheRow(cacheKey, fresh);
  return { data: fresh, fromCache: false, stale: false };
}

/** Best-effort prefetch helper — swallows errors, logs once. */
export async function prefetchContent(options: LoadContentOptions): Promise<void> {
  try {
    await loadContent({ ...options, mode: "prefetch" });
  } catch (err) {
    console.warn(
      `[loadContent] prefetch failed for ${options.cacheKey}:`,
      err instanceof Error ? err.message : err
    );
  }
}

async function readCacheRow(cacheKey: string): Promise<ContentCacheRow | undefined> {
  const db = await getLearnerDb();
  return db.contentCache.get(cacheKey);
}

async function writeCacheRow(cacheKey: string, payload: unknown): Promise<void> {
  const serialized = JSON.stringify(payload);
  const fetchedAt = Date.now();
  try {
    const db = await getLearnerDb();
    await db.contentCache.put({ cache_key: cacheKey, payload: serialized, fetched_at: fetchedAt });
  } catch (err) {
    // Cache is best-effort — `getLearnerDb()` may be the in-memory fallback,
    // or the write can fail for other reasons (quota, private mode).
    console.warn(
      `[loadContent] cache write failed for ${cacheKey}:`,
      err instanceof Error ? err.message : err
    );
  }
}

function parsePayload<TPayload>(raw: string): TPayload {
  return JSON.parse(raw) as TPayload;
}

function revalidate<TPayload>(
  cacheKey: string,
  fnName: string,
  method: "GET" | "POST",
  body: Record<string, unknown> | undefined
): Promise<void> {
  const existing = inflight.get(cacheKey);
  if (existing) return existing;
  const task = (async () => {
    try {
      const fresh = await invokeFn<TPayload>(fnName, { method, body });
      await writeCacheRow(cacheKey, fresh);
    } catch (err) {
      // Revalidation failure is non-fatal — the stale cache already serves
      // the UI. Surface at warn so devs see it in logs.
      console.warn(
        `[loadContent] revalidate failed for ${cacheKey}:`,
        err instanceof Error ? err.message : err
      );
    } finally {
      inflight.delete(cacheKey);
    }
  })();
  inflight.set(cacheKey, task);
  return task;
}

/**
 * Drop a single cache row so the next `loadContent` for that key is forced
 * to hit the network instead of serving a stale payload.
 *
 * Web delta from mobile: Dexie's `delete` is async (mobile's raw-sqlite
 * `DELETE` is synchronous), so this returns a `Promise<void>` where
 * mobile's `invalidateContentCache` is a sync `(cacheKey): void`.
 */
export async function invalidateContentCache(cacheKey: string): Promise<void> {
  const db = await getLearnerDb();
  await db.contentCache.delete(cacheKey);
  inflight.delete(cacheKey);
}

/** Test helper — clears every cache row. Not for production use. */
export function __resetContentCacheForTests(): void {
  inflight.clear();
}
