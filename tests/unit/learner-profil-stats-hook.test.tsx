/**
 * `useProfilStats` — S11.2 fix-round-1 (review gap: the pure helpers
 * `rowToStats` / `commitToCache` / `hydrateFromCache` had coverage in
 * `learner-profil-data.test.ts`, but the hook itself — specifically its
 * mount effect's `cancelled` guard (useProfilStats.ts:113-147) — had
 * none. Stripping the guard left the full suite green.
 *
 * StrictMode double-invokes the mount effect synchronously — mount,
 * cleanup, remount — all before any microtask runs (see the identical
 * technique + rationale in `learner-lesen-session.test.tsx`'s
 * `(a) fires exam_module_started exactly once...` test). Because that
 * cleanup runs before `await hydrateFromCache(userId)` ever resolves,
 * the STALE (first) instance already has `cancelled = true` the moment
 * its `hydrateFromCache` promise settles — so the very first
 * `if (cancelled) return;` (useProfilStats.ts:121) stops it before it
 * ever calls `fetchUserStats()`. Two tests pin both checkpoints of the
 * guard:
 *   - under StrictMode, `invokeFn` (⇒ `fetchUserStats`) fires exactly
 *     ONCE despite the double-invoked effect, and the live instance
 *     still completes normally (not stuck loading forever) — pins the
 *     first `if (cancelled) return;`, right after `hydrateFromCache`;
 *   - a real `unmount()` followed by a resolve of an in-flight
 *     `fetchUserStats()` must not write to the cache — pins the second
 *     `if (cancelled) return;`, right after `fetchUserStats()`, i.e.
 *     "a resolve arriving after unmount does not set state."
 *
 * StrictMode is enabled via RTL's `reactStrictMode: true` render option,
 * not a manual `wrapper: () => <StrictMode>...` — empirically verified
 * (`@testing-library/react` 16.3.2 / React 19.1.0) that wrapping via the
 * `wrapper` option does NOT trigger the mount/cleanup/remount
 * double-invoke for `renderHook` in this repo's setup, while the
 * `reactStrictMode` render option does.
 */
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const invokeFn = vi.fn();
vi.mock("@/learner/core/api/client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/learner/core/api/client")>();
  return { ...actual, invokeFn: (...a: unknown[]) => invokeFn(...a) };
});

import { getLearnerDb, __resetLearnerDbForTests } from "@/learner/core/db";
import type { UserStatsRow } from "@/learner/core/db/types";
import { useProfilStats } from "@/learner/profil/hooks/useProfilStats";

const payload = {
  fullName: "Marie Dupont",
  location: "Douala",
  languages: ["Français"],
  examLabel: "B1",
  daysRemaining: 42,
  reminderTime: "",
  offlineLessonsCount: 0,
  offlineSizeMb: 0,
  dataSaverOn: false,
};

/** Each call returns its own manually resolvable promise. */
function deferred<T>(): { promise: Promise<T>; resolve: (v: T) => void } {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

beforeEach(() => {
  vi.clearAllMocks();
  __resetLearnerDbForTests();
});
afterEach(cleanup);

describe("useProfilStats mount effect — cancelled guard (S11.2 fix-round-1)", () => {
  it("under StrictMode's double-invoked effect, fetchUserStats fires exactly once and the live instance still completes", async () => {
    invokeFn.mockResolvedValue(payload);

    const { result } = renderHook(() => useProfilStats("u1"), { reactStrictMode: true });

    await waitFor(() => expect(result.current.loading).toBe(false));

    // The stale (first) StrictMode instance's `cancelled` was already
    // true by the time its `hydrateFromCache` resolved, so it returned
    // before ever calling `fetchUserStats()` — only the live (second)
    // instance's network call should have happened.
    expect(invokeFn).toHaveBeenCalledTimes(1);
    expect(result.current.stats.fullName).toBe("Marie Dupont");
    expect(result.current.updatedAt).not.toBeNull();
    const db = await getLearnerDb();
    const row = (await db.userStats.get("u1")) as UserStatsRow | undefined;
    expect(row?.full_name).toBe("Marie Dupont");
  });

  it("a resolve arriving after a real unmount does not write to the cache", async () => {
    const deferreds: ReturnType<typeof deferred<unknown>>[] = [];
    invokeFn.mockImplementation(() => {
      const d = deferred<unknown>();
      deferreds.push(d);
      return d.promise;
    });

    const { unmount } = renderHook(() => useProfilStats("u2"));
    await waitFor(() => expect(invokeFn).toHaveBeenCalledTimes(1));

    unmount();

    await act(async () => {
      deferreds[0]!.resolve(payload);
      await Promise.resolve();
      await Promise.resolve();
    });

    const db = await getLearnerDb();
    expect(await db.userStats.get("u2")).toBeUndefined();
  });
});
