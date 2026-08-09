/**
 * Paired-Sprechen (dialogue) edge-function client — S7 · Task 7.10.
 *
 * Ports `deutschfit-mobile/src/features/sprechen/dialogue/{api,types}.ts`
 * verbatim (query shape, wire bodies, storage path, error taxonomy) onto
 * this repo's `invokeFn`/`ApiError` transport (`./client`) instead of
 * `supabase.functions.invoke`'s `{data,error}` envelope — the same swap
 * `./sprechen.ts` and `./sprechenTopics.ts` already made.
 *
 * Wraps the 3 dialogue edge functions and the `cert_dialogue_teile`
 * PostgREST table:
 *
 *   1. `listDialogueTeile`   — SELECT cert_dialogue_teile (board-blind filter)
 *   2. `startDialogue`       — POST sprechen-dialogue-start
 *   3. `sendDialogueTurn`    — POST sprechen-dialogue-turn (idempotent by
 *                              (session_id, client_turn_id))
 *   4. `finalizeDialogue`    — POST sprechen-dialogue-finalize; returns the
 *                              board-blind 5-key raster as
 *                              `dimensions: [{ nativeLabel, score, justificationFr }]`
 *
 * Audio upload helpers (mirrors `./sprechen.ts`'s `reserveUpload`/`putAudio`):
 *   5. `reserveStudentTurnUpload` — signs a PUT URL for the student WAV
 *   6. `putStudentAudio`          — PUT an already-resolved `Blob` to the URL
 *
 * Storage path: `${userId}/dialogue/${sessionId}/${turnIndex}-student.wav`
 * Bucket: `user-speech`, upsert: true — member names + path verbatim from
 * mobile `dialogue/api.ts:196-208` (Constraint 3).
 *
 * Web delta (M-2): `DialogueTurnResult.partnerTurn.audio_signed_url` is
 * `string | null` here (mobile has it as a non-nullable `string`) — the
 * backend's idempotent-replay branch (a retried `sendDialogueTurn` call
 * that dedups on `(session_id, client_turn_id)`) omits a fresh signed URL
 * on replay, so the wire type must allow `null`. `useDialogueSession`
 * (`../../sprechen/dialogue/hooks/useDialogueSession.ts`) passes the value
 * straight through into `partnerAudioUrl`, so a `null` naturally lands in
 * the same "already consumed" state `markPartnerAudioConsumed()` produces —
 * the screen skips auto-play, but the turn's `text` still renders (it's
 * carried on the same object, unaffected by the audio field).
 * `idempotentReplay` mirrors `sprechen-finalize`'s `replay` flag with the
 * same "this was a dedup, not a fresh grade" signal.
 *
 * Web delta: `finalizeDialogue` takes a bare `sessionId: string` (mobile
 * takes `{ sessionId }`) — the wire body sent is still `{ sessionId }`
 * (Constraint 4); only the function's own parameter shape is simplified
 * since it carries a single required field.
 *
 * Errors bubble as thrown `Error`s whose `.message` is the server error
 * code (e.g. `"concurrent_turn_conflict"`, `"session_not_active"`) so
 * callers can pattern-match — mirrors `./sprechen.ts`'s `ApiError` →
 * `Error(code)` translation, plus mobile's defensive `"error" in data`
 * check for a soft-error 200 (kept for wire-parity even though this
 * repo's `invokeFn` already throws `ApiError` for any non-2xx response).
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import { getBrowserClient } from "@/lib/supabase/browser";

import { ApiError, invokeFn } from "./client";

// ---------------------------------------------------------------------------
// cert_dialogue_teile row (PostgREST snake_case shape)
// ---------------------------------------------------------------------------

/** Raw PostgREST row from `cert_dialogue_teile`. Used internally for the
 *  DB→app mapping in `listDialogueTeile`. */
interface DialogueTeilRow {
  readonly dialogue_teil_key: string;
  readonly teil: string;
  readonly task_type: string;
  readonly native_label: string;
  readonly task_instructions_de: string;
  readonly moves: string[];
  readonly turn_min: number;
  readonly turn_max: number;
  readonly budget_sec: number;
  readonly themes: readonly {
    readonly slug: string;
    readonly title_de: string;
    readonly materials_de: string;
  }[];
  readonly display_order: number;
}

// ---------------------------------------------------------------------------
// App-internal camelCase types
// ---------------------------------------------------------------------------

/** A selectable theme for a dialogue teil, as surfaced in the app. */
export type DialogueTheme = {
  readonly slug: string;
  readonly titleDe: string;
  readonly materialsDe: string;
};

/** Per-teil config loaded dynamically from `cert_dialogue_teile`. */
export type DialogueTeilConfig = {
  readonly dialogueTeilKey: string;
  readonly teil: string;
  readonly taskType: string;
  readonly nativeLabel: string;
  readonly taskInstructionsDe: string;
  readonly moves: readonly string[];
  readonly turnMin: number;
  readonly turnMax: number;
  readonly budgetSec: number;
  readonly themes: readonly DialogueTheme[];
  readonly displayOrder: number;
};

// ---------------------------------------------------------------------------
// Edge-function response types.
// Wire convention: top-level camelCase; nested objects snake_case (mirrors
// mobile `dialogue/types.ts`).
// ---------------------------------------------------------------------------

/** Theme sub-object (snake_case — wire shape). */
export type DialogueThemeWire = {
  readonly slug: string;
  readonly title_de: string;
  readonly materials_de: string;
};

/** Response from `sprechen-dialogue-start` (POST -> 201). */
export type DialogueStartResult = {
  readonly sessionId: string;
  readonly dialogueTeilKey: string;
  readonly taskNativeLabel: string;
  readonly taskInstructionsDe: string;
  /** null when the teil has no theme selection step. */
  readonly theme: DialogueThemeWire | null;
  /** Opening partner turn — always carries a fresh signed URL + voice_id. */
  readonly partnerTurn: {
    readonly text: string;
    readonly audio_signed_url: string;
    readonly audio_storage_path: string;
    readonly voice_id: string;
  };
  readonly turnMin: number;
  readonly turnMax: number;
  readonly budgetSec: number;
};

/**
 * Response from `sprechen-dialogue-turn` (POST -> 200).
 *
 * Web delta (M-2): `audio_signed_url` is `string | null` — `null` on the
 * idempotent-replay branch (see file header).
 */
export type DialogueTurnResult = {
  readonly candidateText: string;
  readonly partnerTurn: {
    readonly text: string;
    readonly audio_signed_url: string | null;
    readonly audio_storage_path: string;
  };
  readonly turnCount: number;
  readonly canFinalize: boolean;
  readonly mustFinalize: boolean;
  readonly idempotentReplay?: boolean;
};

/** A single grader dimension in the finalize result. */
export type DialogueDimension = {
  readonly nativeLabel: string;
  readonly score: number;
  readonly justificationFr: string;
};

/** Response from `sprechen-dialogue-finalize` (POST -> 200). */
export type DialogueResult = {
  readonly sessionId: string;
  readonly status: "ready";
  readonly overallScore: number;
  readonly band: "solide" | "proche_du_seuil" | "a_retravailler";
  readonly resultKind: "entrainement";
  readonly summaryFr: string;
  readonly dimensions: readonly DialogueDimension[];
  readonly prueferText: string;
  readonly betreuerText: string;
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function mapRow(row: DialogueTeilRow): DialogueTeilConfig {
  return {
    dialogueTeilKey: row.dialogue_teil_key,
    teil: row.teil,
    taskType: row.task_type,
    nativeLabel: row.native_label,
    taskInstructionsDe: row.task_instructions_de,
    moves: row.moves,
    turnMin: row.turn_min,
    turnMax: row.turn_max,
    budgetSec: row.budget_sec,
    themes: row.themes.map((t) => ({
      slug: t.slug,
      titleDe: t.title_de,
      materialsDe: t.materials_de,
    })),
    displayOrder: row.display_order,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

/**
 * Server-coded soft-error check (mobile's `"error" in data` guard). Kept
 * even though `invokeFn` already throws `ApiError` on any non-2xx status,
 * in case a dialogue edge function ever answers 200 with an `{error}` body
 * — matches mobile's own defensive double-check on every dialogue call.
 */
function throwIfSoftError(data: unknown): void {
  if (isRecord(data) && "error" in data && typeof data.error === "string") {
    throw new Error(data.error);
  }
}

// ---------------------------------------------------------------------------
// 1. listDialogueTeile
// ---------------------------------------------------------------------------

/**
 * Fetch the live teil list for a given board+level from
 * `cert_dialogue_teile`. Board identity is data — no board token in code.
 *
 * Web delta: `cert_dialogue_teile` shipped in backend migrations 0128-0130
 * but this repo's generated `Database` type (`@/shared/database.types`,
 * synced via `npm run types:sync`) predates that migration, so the
 * strict `Database`-typed client would reject the table name at compile
 * time. Widen to the untyped `SupabaseClient` for this one query only —
 * mirrors mobile's `core/api/supabase.ts` client, which has never carried
 * a `Database` generic. Every other query in this codebase keeps the
 * strict generic; re-narrow this call once `types:sync` picks up the
 * table.
 */
export async function listDialogueTeile(args: {
  board: string;
  level: string;
}): Promise<DialogueTeilConfig[]> {
  const supabase = getBrowserClient() as unknown as SupabaseClient;
  const { data, error } = await supabase
    .from("cert_dialogue_teile")
    .select(
      "dialogue_teil_key, teil, task_type, native_label, task_instructions_de, moves, turn_min, turn_max, budget_sec, themes, display_order"
    )
    .eq("board", args.board)
    .eq("level", args.level)
    .order("display_order");

  if (error) {
    throw new Error((error as { message?: string }).message || "list_dialogue_teile_failed");
  }
  if (!data) return [];
  return (data as DialogueTeilRow[]).map(mapRow);
}

// ---------------------------------------------------------------------------
// 2. startDialogue
// ---------------------------------------------------------------------------

/** Start a new paired session and receive the opening partner turn. */
export async function startDialogue(args: {
  board: string;
  level: string;
  teil: string;
  themeId?: string;
  voice?: string;
}): Promise<DialogueStartResult> {
  const body: Record<string, unknown> = {
    board: args.board,
    level: args.level,
    teil: args.teil,
  };
  if (args.themeId !== undefined) body.themeId = args.themeId;
  if (args.voice !== undefined) body.voice = args.voice;

  let data: unknown;
  try {
    data = await invokeFn<unknown>("sprechen-dialogue-start", { method: "POST", body });
  } catch (err) {
    if (err instanceof ApiError) throw new Error(err.code);
    throw err;
  }
  throwIfSoftError(data);
  return data as DialogueStartResult;
}

// ---------------------------------------------------------------------------
// 3. sendDialogueTurn
// ---------------------------------------------------------------------------

/**
 * Run one turn of the loop. Caller is responsible for having already PUT
 * the recording via `putStudentAudio` before calling this.
 *
 * Body keys are camelCase (`audioPath`, `clientTurnId`) — the Slice-2 edge
 * function contract (Constraint 4).
 */
export async function sendDialogueTurn(args: {
  sessionId: string;
  audioPath: string;
  clientTurnId: string;
  voice?: string;
}): Promise<DialogueTurnResult> {
  const body: Record<string, unknown> = {
    sessionId: args.sessionId,
    audioPath: args.audioPath,
    clientTurnId: args.clientTurnId,
  };
  if (args.voice !== undefined) body.voice = args.voice;

  let data: unknown;
  try {
    data = await invokeFn<unknown>("sprechen-dialogue-turn", { method: "POST", body });
  } catch (err) {
    if (err instanceof ApiError) throw new Error(err.code);
    throw err;
  }
  throwIfSoftError(data);
  return data as DialogueTurnResult;
}

// ---------------------------------------------------------------------------
// 4. finalizeDialogue
// ---------------------------------------------------------------------------

/**
 * Close the session and receive the grader payload.
 *
 * Web delta: bare `sessionId` param (mobile takes `{ sessionId }`); the
 * wire body posted is still `{ sessionId }` (Constraint 4).
 */
export async function finalizeDialogue(sessionId: string): Promise<DialogueResult> {
  let data: unknown;
  try {
    data = await invokeFn<unknown>("sprechen-dialogue-finalize", {
      method: "POST",
      body: { sessionId },
    });
  } catch (err) {
    if (err instanceof ApiError) throw new Error(err.code);
    throw err;
  }
  throwIfSoftError(data);
  return data as DialogueResult;
}

// ---------------------------------------------------------------------------
// 5. reserveStudentTurnUpload
// ---------------------------------------------------------------------------

/**
 * Ask the `storage` REST endpoint for a signed PUT URL at the exact
 * storage path the student-turn handler expects. The returned URL is
 * single-shot and carries its own credentials. Member names + storage
 * path verbatim from mobile `dialogue/api.ts:196-208` (Constraint 3).
 */
export async function reserveStudentTurnUpload(args: {
  userId: string;
  sessionId: string;
  turnIndex: number;
}): Promise<{ signedUploadUrl: string; storagePath: string }> {
  const storagePath = `${args.userId}/dialogue/${args.sessionId}/${args.turnIndex}-student.wav`;
  const supabase = getBrowserClient();
  const { data, error } = await supabase.storage
    .from("user-speech")
    .createSignedUploadUrl(storagePath, { upsert: true });
  if (error) throw new Error(error.message || "signed_upload_failed");
  if (!data?.signedUrl) throw new Error("signed_upload_empty");
  return { signedUploadUrl: data.signedUrl, storagePath };
}

// ---------------------------------------------------------------------------
// 6. putStudentAudio
// ---------------------------------------------------------------------------

/**
 * Upload the recorded student audio to the signed PUT URL.
 *
 * Web delta vs mobile: takes an already-resolved `Blob` (the registry
 * entry `getRecordingBlob(fileUri)` returns, `../../sprechen/audio/webRecorder.ts`)
 * instead of re-`fetch`-ing a `file://` URI — mirrors
 * `./sprechen.ts::putAudio`'s signature exactly (P3 — content-type is
 * always the negotiated blob type, never a hardcoded value).
 */
export async function putStudentAudio(
  signedUploadUrl: string,
  blob: Blob,
  contentType: string
): Promise<void> {
  const res = await fetch(signedUploadUrl, {
    method: "PUT",
    headers: { "content-type": contentType },
    body: blob,
  });
  if (!res.ok) throw new Error(`audio_put_failed_${res.status}`);
}
