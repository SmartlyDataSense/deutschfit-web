"use client";

/**
 * Cache-first SWR for profil stats — web port of
 * `mobile/src/features/profil/hooks/useProfilStats.ts`, Drizzle
 * `userStats` → the existing Dexie `userStats` table (schema v1,
 * `UserStatsRow` in core/db/types.ts — no schema bump).
 *
 * Invariants (mobile parity — do not weaken):
 *   - cache renders first, server result folds on top;
 *   - a server failure NEVER resets already-rendered stats to empty;
 *   - the mount effect follows the StrictMode `cancelled` idiom (web#38).
 */
import { useCallback, useEffect, useState } from "react";

import { getLearnerDb } from "../../core/db";
import type { UserStatsRow } from "../../core/db/types";
import { fetchUserStats, type ProfilStatsPayload } from "../api";
import { emptyProfilStats, type ProfilStats } from "../data/fixtures";

// Mobile parity (useProfilStats.ts:71-93): `previous` seeds the fields the
// row doesn't carry (legacyLevel, lessonsCompleted) AND is what a corrupt
// languages blob falls back to — mobile KEEPS previous.languages, it does
// not reset to [].
export function rowToStats(row: UserStatsRow, previous: ProfilStats): ProfilStats {
  let languages: string[] = [...previous.languages];
  try {
    const parsed: unknown = JSON.parse(row.languages);
    if (Array.isArray(parsed)) {
      languages = parsed.filter((l): l is string => typeof l === "string");
    }
  } catch {
    // corrupt blob — leave `languages` at the previous value (mobile
    // guard parity, useProfilStats.ts:79)
  }
  return {
    ...previous,
    fullName: row.full_name,
    location: row.location,
    languages,
    examLabel: row.exam_label,
    daysRemaining: row.days_remaining,
    reminderTime: row.reminder_time,
    offlineLessonsCount: row.offline_lessons_count,
    offlineSizeMb: row.offline_size_mb,
    dataSaverOn: row.data_saver_on === 1,
  };
}

export function foldPayload(prev: ProfilStats, payload: ProfilStatsPayload): ProfilStats {
  return { ...prev, ...payload };
}

export async function hydrateFromCache(
  userId: string
): Promise<{ stats: ProfilStats; updatedAt: number } | null> {
  const db = await getLearnerDb();
  const row = (await db.userStats.get(userId)) as UserStatsRow | undefined;
  if (!row) return null;
  // emptyProfilStats as `previous` — mobile precedent useProfilStats.ts:107.
  return { stats: rowToStats(row, emptyProfilStats), updatedAt: row.updated_at };
}

export async function commitToCache(
  userId: string,
  payload: ProfilStatsPayload,
  now: number
): Promise<void> {
  const db = await getLearnerDb();
  const row: UserStatsRow = {
    user_id: userId,
    full_name: payload.fullName,
    location: payload.location,
    languages: JSON.stringify(payload.languages),
    exam_label: payload.examLabel,
    days_remaining: payload.daysRemaining,
    reminder_time: payload.reminderTime,
    offline_lessons_count: payload.offlineLessonsCount,
    offline_size_mb: payload.offlineSizeMb,
    data_saver_on: payload.dataSaverOn ? 1 : 0,
    updated_at: now,
  };
  await db.userStats.put(row as unknown as Record<string, unknown>);
}

export function useProfilStats(userId: string | null): {
  stats: ProfilStats;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  updatedAt: number | null;
} {
  const [stats, setStats] = useState<ProfilStats>(emptyProfilStats);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [updatedAt, setUpdatedAt] = useState<number | null>(null);

  const refresh = useCallback(async (): Promise<void> => {
    if (!userId) return;
    try {
      const payload = await fetchUserStats();
      const now = Date.now();
      setStats((prev) => foldPayload(prev, payload));
      setUpdatedAt(now);
      setError(null);
      await commitToCache(userId, payload, now);
    } catch (err) {
      // Never reset stats to empty on server failure (mobile parity).
      setError(err instanceof Error ? err.message : "user_stats_transport_error");
    }
  }, [userId]);

  useEffect(() => {
    let cancelled = false;
    if (!userId) {
      setLoading(false);
      return;
    }
    void (async () => {
      // M-1 review fix: the whole body is wrapped in one try/catch/finally
      // (idiom precedent: `useAccueilHome.ts:104-118`) — `hydrateFromCache`
      // used to sit OUTSIDE the try, so a Dexie rejection (blocked
      // upgrade, private-mode quota — see the leg-2 comment in
      // `DeleteAccountScreen.tsx`) escaped as an unhandled rejection,
      // skipped the server `fetchUserStats()` call entirely, and pinned
      // `loading` true forever.
      try {
        // Cache hydration gets its OWN try/catch, nested inside the outer
        // one: a rejection here must be swallowed and fall through to the
        // server fetch below (cache-first is an optimization, not a
        // requirement — the server fetch is the source of truth), not
        // abort the whole effect the way letting it escape unguarded did.
        try {
          const cached = await hydrateFromCache(userId);
          if (cancelled) return;
          if (cached) {
            setStats(cached.stats);
            setUpdatedAt(cached.updatedAt);
          }
        } catch {
          if (cancelled) return;
          // Swallowed on purpose — the empty `emptyProfilStats` seed
          // already rendered stays on screen and the server fetch below
          // still runs to populate real data.
        }
        const payload = await fetchUserStats();
        if (cancelled) return;
        const now = Date.now();
        setStats((prev) => foldPayload(prev, payload));
        setUpdatedAt(now);
        setError(null);
        await commitToCache(userId, payload, now);
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "user_stats_transport_error");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // `refresh` is not referenced inside this effect — listing it would
    // trip react-hooks/exhaustive-deps ("unnecessary dependency") and
    // fail `npm run lint`.
  }, [userId]);

  return { stats, loading, error, refresh, updatedAt };
}
