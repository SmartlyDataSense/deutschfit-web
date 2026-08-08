/**
 * Row shapes for the learner IndexedDB (Dexie) tables.
 *
 * Mirrors `deutschfit-mobile`'s Drizzle schemas 1:1
 * (`deutschfit-mobile/src/core/db/schema/*.ts`) — field names are kept in
 * the same `snake_case` mobile uses on the wire/row level, since fidelity
 * with the mobile client (which reads/writes the same conceptual rows
 * against Supabase-shaped payloads) beats camelCase aesthetics here.
 * Only the Dexie *table* names are camelCase, per the web app's naming
 * convention for JS identifiers (see `schema.ts`).
 *
 * SQLite has no native boolean/JSON types; mobile stores booleans as
 * 0/1 integers and JSON-shaped columns as parsed objects (Drizzle's
 * `{ mode: "json" }`). We keep the 0/1 integer convention for parity
 * (`slow`, `is_correct`, `data_saver_on`) but store JSON-shaped columns
 * as real objects/arrays here — Dexie/IndexedDB natively supports
 * structured clone, so there's no text-blob round-trip to mirror.
 */

/** `writing_drafts` — one row per (user_id, prompt_id). */
export interface WritingDraftRow {
  user_id: string;
  prompt_id: string;
  body_de: string;
  updated_at: number;
}

/** Kinds of learnable atoms the SRS deck carries (mirrors mobile `SRSCardType`). */
export type SRSCardType = "grammar_connector" | "vocab" | "writing_chunk";

/** SM-2 self-rating buckets (mirrors mobile `SRSRating`). */
export type SRSRating = "again" | "hard" | "good" | "easy";

/** `srs_cards` — one row per learnable atom. */
export interface SRSCardRow {
  id: string;
  card_type: SRSCardType;
  prompt: unknown;
  answer: unknown;
  source_ref: string;
  deck: string | null;
  next_due: number;
  created_at: number;
}

/** `srs_reviews` — append-only log of SM-2 rating events. */
export interface SRSReviewRow {
  id: string;
  card_id: string;
  reviewed_at: number;
  rating: SRSRating;
  ease_after: number;
  interval_days_after: number;
  next_due: number;
}

/** `content_cache` — shared SWR cache for content loaders (E3). */
export interface ContentCacheRow {
  cache_key: string;
  payload: string;
  fetched_at: number;
}

/** `user_stats` — per-user Profil cache. */
export interface UserStatsRow {
  user_id: string;
  full_name: string;
  location: string;
  /** JSON-encoded `string[]` of language codes (e.g. `["fr"]`), mirroring mobile's text column. */
  languages: string;
  exam_label: string;
  days_remaining: number;
  reminder_time: string;
  offline_lessons_count: number;
  offline_size_mb: number;
  /** 0/1 — SQLite has no native boolean; mirrors mobile's integer column. */
  data_saver_on: number;
  updated_at: number;
}

/** `mock_exam_cache` — offline mirror of the server-owned `mock_exam_attempts` row. */
export interface MockExamCacheRow {
  user_id: string;
  modelltest_slug: string;
  mock_attempt_id: string;
  status: string;
  finalized_at: number | null;
  updated_at: number;
}

/** `cached_topics` — Sprechen monologue topic-picker offline cache, keyed on (subgenre, level). */
export interface CachedTopicsRow {
  subgenre: string;
  level: string;
  payload: string;
  fetched_at: number;
}

/** `active_submission` — single-slot per-user readiness state. */
export interface ActiveSubmissionRow {
  user_id: string;
  submission_id: string;
  module: string;
  state: string;
  /** 0/1 — flipped to 1 after 90s in `in-flight`. */
  slow: number;
  failed_reason: string | null;
  started_at: number;
  acknowledged_at: number | null;
}

/** One concept the learner missed, surfaced in the results recap (mirrors mobile `MissedConcept`). */
export interface MissedConcept {
  conceptCode: string;
  conceptName: string;
  explanationFr: string;
}

/** `drill_sessions` — completed drill-session summaries. */
export interface DrillSessionRow {
  id: string;
  completed_at: number;
  total: number;
  correct: number;
  led_with_redo: number;
  missed: MissedConcept[];
}

/** `drill_attempt_outbox` — failed drill-attempt POST retry queue (FIFO, ordered by `queued_at`). */
export interface DrillAttemptOutboxRow {
  id: string;
  drill_item_id: string;
  surface: string;
  selected: string;
  is_correct: number;
  queued_at: number;
  attempts: number;
}

/** One first-pick lock in the untimed practice surface (mirrors mobile `PracticeAnswerEntry`). */
export interface PracticeAnswerEntry {
  key: string;
  correct: boolean;
}

/** `practice_progress` — client-only first-pick locks + running score. No server copy. */
export interface PracticeProgressRow {
  user_id: string;
  board: string;
  level: string;
  module_code: string;
  quiz_slug: string;
  answers: Record<string, PracticeAnswerEntry>;
  correct_count: number;
  total_count: number;
  completed_at: number | null;
  updated_at: number;
}
