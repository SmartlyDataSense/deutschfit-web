/**
 * Sprechen monologue topic-picker edge-function client (S7 · Task 7.1).
 *
 * Ports `deutschfit-mobile/src/features/sprechen/topicsApi.ts` (623L) +
 * `utils/sortTopicsByCert.ts` (30L). Wraps `topics-list` (GET) and
 * `topic-create` (POST) — the two endpoints backing `TopicPickerScreen`
 * (7.6) and `CustomTopicScreen` (7.7).
 *
 * Web delta: the 24h offline cache is re-homed from mobile's Drizzle
 * `cached_topics` table (AsyncStorage-backed on-device SQLite) to the
 * pre-declared Dexie `cachedTopics` table (`core/db/types.ts:92–97`, PK
 * `[subgenre+level]`) via `getLearnerDb()`. Same keying `(subgenre,
 * level)`, same 24h TTL, same "keep last good data on refetch error"
 * rule. `fetchTopics` returns the flat `TopicCard[]` array (not mobile's
 * `{subgenre, level, certCode, topics}` envelope) — the web picker only
 * ever consumes the list. Malformed individual server rows are dropped
 * (filtered out) rather than failing the whole payload.
 *
 * Errors bubble up as thrown `Error`s with either the server `error` code
 * or a transport identifier (`topics_list_transport_error`,
 * `topics_list_empty_response`, `topics_list_malformed_response`).
 */
import { ApiError, invokeFn, rawGet } from "./client";
import { getLearnerDb } from "../db";

const EDGE_FUNCTION_NAME = "topics-list";

/** Cache freshness window — 24 hours in milliseconds. */
const CACHE_FRESHNESS_MS = 24 * 60 * 60 * 1000;

/**
 * Every subgenre the backend `qb_sl_topics` catalog can carry. The picker
 * surfaces the ones with seeded content (`praesentation`, `vortrag`,
 * `referat`); `bildbeschreibung` / `erzaehlung` stay in the contract so
 * the API layer still validates them, but they are not offered until
 * their catalogs are seeded.
 */
export type SprechenSubgenre =
  | "praesentation"
  | "vortrag"
  | "referat"
  | "bildbeschreibung"
  | "erzaehlung";

/** CEFR levels selectable in the picker (mobile `topicsApi.ts:58`). */
export type SprechenPickerLevel = "A1" | "A2" | "B1" | "B2" | "C1" | "C2";

/**
 * Cert codes shipped in v1.0. Mirrors the FK target on
 * `qb_sl_topics.cert_code`. The backend `topics-list` edge function
 * validates the param against the same set; an unknown value yields a 400.
 */
export type SprechenCertCode =
  | "GOETHE"
  | "OESD"
  | "GOETHE_OESD"
  | "TELC"
  | "TESTDAF"
  | "DSH"
  | "ECL";

/**
 * One curated Gliederung step a learner must cover during the monologue.
 * Mirrors `qb_sl_sections` as exposed by `topics-list` (`outline_steps:
 * [{ order, de, fr }]`).
 */
export interface OutlineStep {
  readonly order: number;
  readonly de: string;
  readonly fr: string | null;
}

export interface TopicCard {
  readonly id: string;
  readonly subgenre: SprechenSubgenre;
  readonly level: SprechenPickerLevel;
  readonly titleDe: string;
  readonly subtitleFr: string;
  /** Curated Gliederung steps the learner is graded against (issue #484). */
  readonly outlineSteps?: readonly OutlineStep[];
  /** Cert this topic belongs to (drives the cert pill on each card). */
  readonly cert?: SprechenCertCode;
  /** Optional tags shown as small chips ("CULTURE", "QUOTIDIEN", ...). */
  readonly tags?: readonly string[];
  /** Optional preparation-duration label ("8 min", "10 min"). */
  readonly durationLabel?: string;
}

export interface FetchTopicsArgs {
  readonly subgenre?: SprechenSubgenre;
  readonly level?: SprechenPickerLevel;
  /** Optional cert filter — when supplied, the edge function narrows the catalog. */
  readonly certCode?: SprechenCertCode;
}

/**
 * Level → derived monologue subgenre (design D3): B1 → Präsentation,
 * B2 → kurzer Vortrag, C1 → Referat. The backend `topic-create` edge
 * function derives `part_code` the same way.
 */
export const SUBGENRE_BY_LEVEL: Readonly<Record<"B1" | "B2" | "C1", SprechenSubgenre>> = {
  B1: "praesentation",
  B2: "vortrag",
  C1: "referat",
};

/**
 * Sort topics by certification code, prioritizing the user's cert. Stable
 * (relies on `Array.prototype.sort`'s ES2019+ stability guarantee) — used
 * by `TopicPickerScreen` when fallback mode is triggered (user's cert has
 * no topics, so the fetch is unfiltered and this sort re-prioritizes it
 * client-side).
 */
export function sortTopicsByCert(
  topics: readonly TopicCard[],
  cert: SprechenCertCode | undefined
): TopicCard[] {
  if (cert === undefined) return [...topics];
  return [...topics].sort((a, b) => {
    const aMatch = a.cert === cert ? 0 : 1;
    const bMatch = b.cert === cert ? 0 : 1;
    return aMatch - bMatch;
  });
}

// ---------------------------------------------------------------------------
// Wire-row validators — mirror mobile's `isServerTopicRow` / `isOutlineSteps`
// verbatim. Unlike mobile's all-or-nothing `isServerPayload`, `fetchTopics`
// below filters row-by-row so one malformed row never blanks the catalog.
// ---------------------------------------------------------------------------

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

const SUBGENRE_VALUES: ReadonlySet<string> = new Set([
  "praesentation",
  "vortrag",
  "referat",
  "bildbeschreibung",
  "erzaehlung",
]);

const LEVEL_VALUES: ReadonlySet<string> = new Set(["A1", "A2", "B1", "B2", "C1", "C2"]);

const CERT_CODE_VALUES: ReadonlySet<string> = new Set([
  "GOETHE",
  "OESD",
  "GOETHE_OESD",
  "TELC",
  "TESTDAF",
  "DSH",
  "ECL",
]);

function isSubgenre(value: unknown): value is SprechenSubgenre {
  return typeof value === "string" && SUBGENRE_VALUES.has(value);
}

function isLevel(value: unknown): value is SprechenPickerLevel {
  return typeof value === "string" && LEVEL_VALUES.has(value);
}

function isCertCode(value: unknown): value is SprechenCertCode {
  return typeof value === "string" && CERT_CODE_VALUES.has(value);
}

function isOutlineSteps(value: unknown): value is readonly OutlineStep[] {
  return (
    Array.isArray(value) &&
    value.every(
      (step) =>
        isRecord(step) &&
        typeof step.order === "number" &&
        typeof step.de === "string" &&
        (step.fr === null || typeof step.fr === "string")
    )
  );
}

interface ServerTopicRow {
  readonly id: string;
  readonly title_de: string;
  readonly subtitle_de: string | null;
  readonly level: SprechenPickerLevel;
  readonly subgenre: SprechenSubgenre;
  readonly cert_code?: SprechenCertCode;
  readonly tags?: readonly string[];
  readonly duration_label?: string;
  readonly outline_steps?: readonly OutlineStep[];
}

function isServerTopicRow(value: unknown): value is ServerTopicRow {
  if (!isRecord(value)) return false;
  if (typeof value.id !== "string") return false;
  if (!isSubgenre(value.subgenre)) return false;
  if (!isLevel(value.level)) return false;
  if (typeof value.title_de !== "string") return false;
  if (
    value.subtitle_de !== undefined &&
    value.subtitle_de !== null &&
    typeof value.subtitle_de !== "string"
  ) {
    return false;
  }
  if (value.cert_code !== undefined && !isCertCode(value.cert_code)) return false;
  if (
    value.tags !== undefined &&
    !(Array.isArray(value.tags) && value.tags.every((tag) => typeof tag === "string"))
  ) {
    return false;
  }
  if (value.duration_label !== undefined && typeof value.duration_label !== "string") return false;
  if (value.outline_steps !== undefined && !isOutlineSteps(value.outline_steps)) return false;
  return true;
}

function mapServerRow(row: ServerTopicRow): TopicCard {
  return {
    id: row.id,
    subgenre: row.subgenre,
    level: row.level,
    titleDe: row.title_de,
    subtitleFr: row.subtitle_de ?? "",
    ...(row.cert_code !== undefined ? { cert: row.cert_code } : {}),
    ...(row.tags !== undefined ? { tags: row.tags } : {}),
    ...(row.duration_label !== undefined ? { durationLabel: row.duration_label } : {}),
    ...(row.outline_steps !== undefined ? { outlineSteps: row.outline_steps } : {}),
  };
}

// ---------------------------------------------------------------------------
// Dexie offline cache — `cachedTopics` table, PK [subgenre+level].
// ---------------------------------------------------------------------------

async function readCachedTopics(
  subgenre: SprechenSubgenre,
  level: SprechenPickerLevel
): Promise<TopicCard[] | null> {
  try {
    const db = await getLearnerDb();
    const row = await db.cachedTopics.get([subgenre, level]);
    if (!row) return null;
    const fetchedAt = typeof row.fetched_at === "number" ? row.fetched_at : 0;
    if (Date.now() - fetchedAt > CACHE_FRESHNESS_MS) return null;
    const payload = typeof row.payload === "string" ? row.payload : undefined;
    if (payload === undefined) return null;
    const parsed: unknown = JSON.parse(payload);
    if (!Array.isArray(parsed)) return null;
    return parsed as TopicCard[];
  } catch {
    return null;
  }
}

/** Persist a successful payload to the offline cache. Failures are swallowed. */
async function writeCachedTopics(
  subgenre: SprechenSubgenre,
  level: SprechenPickerLevel,
  topics: TopicCard[]
): Promise<void> {
  try {
    const db = await getLearnerDb();
    await db.cachedTopics.put({
      subgenre,
      level,
      payload: JSON.stringify(topics),
      fetched_at: Date.now(),
    });
  } catch {
    // intentionally swallow — cache write is best-effort.
  }
}

/**
 * Drop every cached `topics-list` row. Mobile's `clearCachedTopics`
 * targets exactly the derived `(subgenre, level)` pair; web deletes every
 * row instead (the table is tiny, so a blanket invalidation is cheap and
 * simpler than threading the derived pair through) — a fresh community
 * topic must never hide behind a stale cache row regardless of which
 * `(subgenre, level)` a learner is currently browsing.
 */
async function clearCachedTopics(): Promise<void> {
  try {
    const db = await getLearnerDb();
    const rows = await db.cachedTopics.toArray();
    await Promise.all(
      rows.map((row) => {
        const r = row as { subgenre: string; level: string };
        return db.cachedTopics.delete([r.subgenre, r.level]);
      })
    );
  } catch {
    // intentionally swallow — cache invalidation is best-effort.
  }
}

/**
 * Fetch the curated topic catalog for `(subgenre, level[, certCode])`.
 *
 * Happy path: hit `topics-list`, drop malformed rows, persist the valid
 * rows to the offline cache (only when both `subgenre` and `level` are
 * present — same restriction mobile applies), resolve with the mapped
 * `TopicCard[]`.
 *
 * Network/transport failure: read the cache; if a fresh (<24h) row
 * exists, resolve with it instead of throwing. Otherwise re-throw.
 */
export async function fetchTopics(args: FetchTopicsArgs): Promise<TopicCard[]> {
  try {
    const params: Record<string, string> = {};
    if (args.subgenre !== undefined) params.subgenre = args.subgenre;
    if (args.level !== undefined) params.level = args.level;
    if (args.certCode !== undefined) params.cert_code = args.certCode;

    const data = await rawGet<unknown>(EDGE_FUNCTION_NAME, params);

    if (!isRecord(data)) {
      throw new Error("topics_list_empty_response");
    }
    const maybeError = data.error;
    if (typeof maybeError === "string") {
      throw new Error(maybeError);
    }
    const rawTopics = data.topics;
    if (!Array.isArray(rawTopics)) {
      throw new Error("topics_list_malformed_response");
    }
    const topics = rawTopics.filter(isServerTopicRow).map(mapServerRow);

    if (args.subgenre !== undefined && args.level !== undefined) {
      await writeCachedTopics(args.subgenre, args.level, topics);
    }
    return topics;
  } catch (err) {
    if (args.subgenre !== undefined && args.level !== undefined) {
      const cached = await readCachedTopics(args.subgenre, args.level);
      if (cached !== null) return cached;
    }
    if (err instanceof ApiError) {
      throw new Error(err.code);
    }
    throw err instanceof Error ? err : new Error("topics_list_transport_error");
  }
}

/**
 * Input for `createTopic()` — a learner-authored community Expression
 * theme. Durations are in seconds; the backend enforces
 * `0 < min ≤ max ≤ 600` (ASR cost cap, ADR-0007 §2.3).
 */
export type CreateTopicInput = {
  readonly certCode: SprechenCertCode;
  readonly level: "B1" | "B2" | "C1";
  readonly titleDe: string;
  readonly descriptionDe: string;
  readonly minDurationS: number;
  readonly maxDurationS: number;
};

interface ServerCreatedTopicRow {
  readonly id: string;
  readonly title_de: string;
  readonly situation_de?: string | null;
}

function isServerCreatedTopicRow(value: unknown): value is ServerCreatedTopicRow {
  if (!isRecord(value)) return false;
  if (typeof value.id !== "string") return false;
  if (typeof value.title_de !== "string") return false;
  if (
    value.situation_de !== undefined &&
    value.situation_de !== null &&
    typeof value.situation_de !== "string"
  ) {
    return false;
  }
  return true;
}

/**
 * Author a community Expression theme via the `topic-create` edge
 * function. The row lands in `qb_sl_topics` stamped `source='community'`
 * and surfaces to every learner through `topics-list`. On success the
 * entire offline topic cache is cleared (see `clearCachedTopics` above).
 *
 * Throws an `Error` whose message is the server `error` code
 * (`invalid_payload` / `invalid_json` / `grader_unavailable_for_pair` /
 * `db_write_failed` / …) so `CustomTopicScreen` can branch to specific
 * copy.
 */
export async function createTopic(input: CreateTopicInput): Promise<TopicCard> {
  let data: unknown;
  try {
    data = await invokeFn<unknown>("topic-create", {
      method: "POST",
      body: {
        cert_code: input.certCode,
        level: input.level,
        title_de: input.titleDe,
        description_de: input.descriptionDe,
        min_duration_s: input.minDurationS,
        max_duration_s: input.maxDurationS,
      },
    });
  } catch (err) {
    if (err instanceof ApiError) {
      throw new Error(err.code);
    }
    throw err;
  }
  if (!isRecord(data)) {
    throw new Error("topic_create_empty_response");
  }
  if ("error" in data && typeof data.error === "string") {
    throw new Error(data.error);
  }
  if (!("topic" in data) || !isServerCreatedTopicRow(data.topic)) {
    throw new Error("topic_create_empty_response");
  }
  const subgenre = SUBGENRE_BY_LEVEL[input.level];
  await clearCachedTopics();
  return {
    id: data.topic.id,
    subgenre,
    level: input.level,
    titleDe: data.topic.title_de,
    subtitleFr: data.topic.situation_de ?? "",
    cert: input.certCode,
  };
}
