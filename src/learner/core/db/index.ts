/**
 * Learner IndexedDB entry point.
 *
 * `getLearnerDb()` lazily opens the Dexie database defined in
 * `schema.ts`. If `indexedDB` is unavailable at all (SSR, some webview
 * shells) or `Dexie#open()` rejects (Safari private-mode's quota-0 IDB,
 * user-disabled storage, etc.), it falls back to a dead-simple in-memory
 * store with the same minimal per-table surface
 * (`get`/`put`/`delete`/`whereEquals`/`toArray`).
 *
 * IMPORTANT: the fallback does NOT persist anything — it's a `Map` that
 * lives for the lifetime of the page. Any S-slice built on top of
 * `getLearnerDb()` must treat persistence as best-effort and degrade
 * gracefully when `isPersistent` is `false` (e.g. don't promise the
 * learner "your draft is saved" if it isn't).
 */
import type { Table } from "dexie";
import {
  createLearnerDexie,
  LEARNER_TABLE_NAMES,
  LEARNER_TABLE_PRIMARY_KEYS,
  type LearnerTableName,
} from "./schema";
import type { ContentCacheRow } from "./types";

/** Minimal per-table surface both the real Dexie backend and the fallback implement. */
export interface LearnerTableApi<T = Record<string, unknown>> {
  get(key: unknown): Promise<T | undefined>;
  put(item: T): Promise<unknown>;
  delete(key: unknown): Promise<void>;
  whereEquals(field: string, value: unknown): Promise<T[]>;
  toArray(): Promise<T[]>;
  clear(): Promise<void>;
}

/**
 * Row-type overrides for tables whose consumers benefit from a typed
 * `LearnerTableApi<Row>` instead of the untyped `Record<string, unknown>`
 * default. Only `contentCache` is threaded through today (needed by
 * `core/content/loadContent.ts`); other tables keep the untyped default and
 * their call sites cast explicitly (see `core/readiness/hydrate.ts`).
 */
interface LearnerTableRowOverrides {
  contentCache: ContentCacheRow;
}

type LearnerTableRow<K extends LearnerTableName> = K extends keyof LearnerTableRowOverrides
  ? LearnerTableRowOverrides[K]
  : Record<string, unknown>;

export type LearnerDbHandle = {
  /** `false` when this handle is the in-memory fallback — nothing written to it survives a reload. */
  readonly isPersistent: boolean;
} & { readonly [K in LearnerTableName]: LearnerTableApi<LearnerTableRow<K>> };

function wrapDexieTable(table: Table): LearnerTableApi {
  return {
    get: (key) => table.get(key as never),
    put: (item) => table.put(item as never),
    delete: (key) => table.delete(key as never),
    whereEquals: (field, value) =>
      table
        .where(field)
        .equals(value as never)
        .toArray(),
    toArray: () => table.toArray(),
    clear: () => table.clear(),
  };
}

function extractKey(primaryKey: readonly string[], item: Record<string, unknown>): unknown {
  return primaryKey.length === 1 ? item[primaryKey[0]!] : primaryKey.map((field) => item[field]);
}

/**
 * Dead-simple in-memory fallback table — a single `Map` keyed on the
 * JSON-serialized primary key (works for both single-field and
 * composite-key tables without needing real IndexedDB comparison
 * semantics). `whereEquals` is a linear scan: fine for a best-effort,
 * page-lifetime-only store that's never expected to hold more than a
 * few hundred rows.
 */
function createFallbackTable<T extends Record<string, unknown>>(
  primaryKey: readonly string[]
): LearnerTableApi<T> {
  const store = new Map<string, T>();
  const serializeKey = (key: unknown): string => JSON.stringify(key);

  return {
    async get(key) {
      return store.get(serializeKey(key));
    },
    async put(item) {
      const key = extractKey(primaryKey, item);
      store.set(serializeKey(key), item);
      return key;
    },
    async delete(key) {
      store.delete(serializeKey(key));
    },
    async whereEquals(field, value) {
      return Array.from(store.values()).filter((row) => row[field] === value);
    },
    async toArray() {
      return Array.from(store.values());
    },
    async clear() {
      store.clear();
    },
  };
}

function createFallbackDb(): LearnerDbHandle {
  const tables = Object.fromEntries(
    LEARNER_TABLE_NAMES.map((name) => [name, createFallbackTable(LEARNER_TABLE_PRIMARY_KEYS[name])])
  ) as Record<LearnerTableName, LearnerTableApi>;

  // `tables` is built generically (see `LearnerTableRowOverrides` above) —
  // the per-table row-type overrides are asserted here, not derived.
  return { isPersistent: false, ...tables } as unknown as LearnerDbHandle;
}

async function openLearnerDb(): Promise<LearnerDbHandle> {
  if (typeof indexedDB === "undefined") {
    return createFallbackDb();
  }

  const dexieDb = createLearnerDexie();
  try {
    await dexieDb.open();
  } catch {
    // Private-mode Safari (quota-0 IDB), storage disabled by the user, etc.
    return createFallbackDb();
  }

  const tables = Object.fromEntries(
    LEARNER_TABLE_NAMES.map((name) => [name, wrapDexieTable(dexieDb.table(name))])
  ) as Record<LearnerTableName, LearnerTableApi>;

  // `tables` is built generically (see `LearnerTableRowOverrides` above) —
  // the per-table row-type overrides are asserted here, not derived.
  return { isPersistent: true, ...tables } as unknown as LearnerDbHandle;
}

let dbPromise: Promise<LearnerDbHandle> | null = null;

/** Lazily opens (once) and returns the learner IndexedDB handle, or its in-memory fallback. */
export function getLearnerDb(): Promise<LearnerDbHandle> {
  if (!dbPromise) {
    dbPromise = openLearnerDb();
  }
  return dbPromise;
}

/** Test-only escape hatch: forces the next `getLearnerDb()` call to re-open from scratch. */
export function __resetLearnerDbForTests(): void {
  dbPromise = null;
}
