/**
 * Draft autosave hook for the writing composer.
 *
 * Port of `deutschfit-mobile/src/features/writing/hooks/useDraft.ts`
 * (Drizzle → Dexie via `getLearnerDb()`). Semantics are verbatim mobile
 * (3s-debounce upsert, flush-not-cancel on unmount); only storage is
 * adapted (P3):
 *
 *   - Mobile's `db.insert(...).onConflictDoUpdate(...)` becomes a single
 *     `(await getLearnerDb()).writingDrafts.put(...)` — Dexie's `put` is
 *     an upsert on the primary key, and `writingDrafts`' compound PK
 *     `[user_id+prompt_id]` (schema.ts, schema v1 — pre-declared by S0,
 *     NOT bumped here) already gives per-`(user_id, prompt_id)` isolation,
 *     mirroring mobile's §313 cross-user guarantee.
 *   - `getLearnerDb()` is async (resolves the `LearnerTableApi` handle,
 *     `core/db/index.ts:143-148`), so every table op here awaits it —
 *     mobile's Drizzle client is synchronous-looking (its async-ness is
 *     hidden behind query builder `await`s), this hook's is explicit.
 *   - Row field names stay `snake_case` (`WritingDraftRow`,
 *     `core/db/types.ts`) to mirror mobile's wire shape 1:1, per the
 *     schema module's stated convention.
 *
 * Contract (mirrors mobile spec §7.1/§7.2 + §313):
 *   - Drafts are scoped per `(user_id, prompt_id)` so two users on the
 *     same device cannot see each other's autosaved body.
 *   - On mount, seed local state from the row matching the current
 *     user + prompt (if any).
 *   - `setBody(next)` updates React state immediately and schedules a
 *     3-second debounced upsert against the Dexie table.
 *   - `clear()` cancels any pending write, then deletes the row (called
 *     after a successful submit).
 *
 * The debounce scheduler is extracted to `createDraftScheduler` so it
 * can be unit-tested without a render tree — the hook is a thin React
 * wrapper around it.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { getLearnerDb } from "@/learner/core/db";
import type { WritingDraftRow } from "@/learner/core/db/types";
import { useLearnerSession } from "@/learner/core/auth/useLearnerSession";

const DEBOUNCE_MS = 3_000;

export type DraftScheduler = {
  schedule: (body: string) => void;
  cancel: () => void;
  flush: () => Promise<void>;
};

export function createDraftScheduler(userId: string, promptId: string): DraftScheduler {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let pendingBody: string | null = null;

  const commit = async (body: string): Promise<void> => {
    const db = await getLearnerDb();
    const row: WritingDraftRow = {
      user_id: userId,
      prompt_id: promptId,
      body_de: body,
      updated_at: Date.now(),
    };
    // Compound-PK `put` is an upsert — Dexie passes compound keys through
    // the `LearnerTableApi` wrapper unchanged (core/db/index.ts).
    await db.writingDrafts.put(row as unknown as Record<string, unknown>);
  };

  const cancel = (): void => {
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }
    pendingBody = null;
  };

  const schedule = (body: string): void => {
    pendingBody = body;
    if (timer !== null) {
      clearTimeout(timer);
    }
    timer = setTimeout(() => {
      timer = null;
      const snapshot = pendingBody;
      pendingBody = null;
      if (snapshot !== null) {
        void commit(snapshot);
      }
    }, DEBOUNCE_MS);
  };

  const flush = async (): Promise<void> => {
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }
    if (pendingBody !== null) {
      const snapshot = pendingBody;
      pendingBody = null;
      await commit(snapshot);
    }
  };

  return { schedule, cancel, flush };
}

export async function clearDraft(userId: string, promptId: string): Promise<void> {
  const db = await getLearnerDb();
  await db.writingDrafts.delete([userId, promptId]);
}

export type UseDraftResult = {
  body: string;
  setBody: (next: string) => void;
  clear: () => Promise<void>;
  updatedAt: number | null;
  hydrated: boolean;
};

export function useDraft(promptId: string): UseDraftResult {
  const userId = useLearnerSession((s) => s.session?.user?.id ?? null);
  const [body, setBodyState] = useState<string>("");
  const [updatedAt, setUpdatedAt] = useState<number | null>(null);
  const [hydrated, setHydrated] = useState<boolean>(false);
  const schedulerRef = useRef<DraftScheduler | null>(null);

  const scheduler = useMemo<DraftScheduler | null>(() => {
    if (!userId) {
      schedulerRef.current = null;
      return null;
    }
    const s = createDraftScheduler(userId, promptId);
    schedulerRef.current = s;
    return s;
  }, [userId, promptId]);

  useEffect(() => {
    if (!userId) {
      setBodyState("");
      setUpdatedAt(null);
      setHydrated(false);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const db = await getLearnerDb();
        const row = (await db.writingDrafts.get([userId, promptId])) as WritingDraftRow | undefined;
        if (!cancelled) {
          if (row) {
            setBodyState(row.body_de);
            setUpdatedAt(row.updated_at);
          } else {
            setBodyState("");
            setUpdatedAt(null);
          }
        }
      } finally {
        if (!cancelled) setHydrated(true);
      }
    })();
    return () => {
      cancelled = true;
      // Flush (fire-and-forget) instead of cancelling — otherwise any text
      // typed inside the 3s debounce window is lost on unmount / promptId
      // change. The cleanup closure captures the OLD scheduler, so the write
      // still goes to the correct (userId, promptId) pair (mobile
      // useDraft.ts:165-173 parity).
      void scheduler?.flush();
    };
  }, [userId, promptId, scheduler]);

  const setBody = useCallback(
    (next: string): void => {
      setBodyState(next);
      scheduler?.schedule(next);
    },
    [scheduler]
  );

  const clear = useCallback(async (): Promise<void> => {
    scheduler?.cancel();
    if (userId) {
      await clearDraft(userId, promptId);
    }
    setBodyState("");
    setUpdatedAt(null);
  }, [userId, promptId, scheduler]);

  return { body, setBody, clear, updatedAt, hydrated };
}
