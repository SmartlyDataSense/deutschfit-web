import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { invokeFnMock } = vi.hoisted(() => ({ invokeFnMock: vi.fn() }));
vi.mock("@/learner/core/api/client", () => ({ invokeFn: invokeFnMock }));

import { __resetLearnerDbForTests, getLearnerDb } from "@/learner/core/db";
import {
  __resetContentCacheForTests,
  DEFAULT_TTL_MS,
  invalidateContentCache,
  loadContent,
  prefetchContent,
} from "@/learner/core/content/loadContent";

describe("loadContent (web port of mobile loadContent.ts)", () => {
  beforeEach(() => {
    __resetLearnerDbForTests();
    __resetContentCacheForTests();
    invokeFnMock.mockReset();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-09T10:00:00Z"));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("swr: cache miss fetches, caches, returns fromCache=false", async () => {
    invokeFnMock.mockResolvedValueOnce({ prompts: [{ slug: "a" }] });
    const res = await loadContent<{ prompts: unknown[] }>({
      fnName: "prompts-list",
      cacheKey: "prompts-list:writing:telc:b1",
      method: "GET",
    });
    expect(res.data.prompts).toHaveLength(1);
    expect(res.fromCache).toBe(false);
    expect(res.stale).toBe(false);
    const db = await getLearnerDb();
    const row = await db.contentCache.get("prompts-list:writing:telc:b1");
    expect(row).toBeDefined();
  });

  it("swr: fresh cache hit returns without any network call", async () => {
    const db = await getLearnerDb();
    await db.contentCache.put({
      cache_key: "k1",
      payload: JSON.stringify({ v: 1 }),
      fetched_at: Date.now(),
    });
    const res = await loadContent<{ v: number }>({ fnName: "x", cacheKey: "k1" });
    expect(res.data.v).toBe(1);
    expect(res.fromCache).toBe(true);
    expect(res.stale).toBe(false);
    expect(invokeFnMock).not.toHaveBeenCalled();
  });

  it("swr: stale cache returns immediately and revalidates in background (deduped)", async () => {
    const db = await getLearnerDb();
    await db.contentCache.put({
      cache_key: "k2",
      payload: JSON.stringify({ v: 1 }),
      fetched_at: Date.now() - DEFAULT_TTL_MS - 1,
    });
    invokeFnMock.mockResolvedValue({ v: 2 });
    const [a, b] = await Promise.all([
      loadContent<{ v: number }>({ fnName: "x", cacheKey: "k2" }),
      loadContent<{ v: number }>({ fnName: "x", cacheKey: "k2" }),
    ]);
    expect(a.data.v).toBe(1);
    expect(a.stale).toBe(true);
    await a.revalidation; // Promise<void> — observe completion only
    await b.revalidation;
    expect(invokeFnMock).toHaveBeenCalledTimes(1); // in-flight dedupe
    const row = await db.contentCache.get("k2");
    expect(JSON.parse(row!.payload).v).toBe(2);
  });

  it("prefetch: network-first, falls back to cache on failure, prefetchContent never throws", async () => {
    const db = await getLearnerDb();
    await db.contentCache.put({
      cache_key: "k3",
      payload: JSON.stringify({ v: 7 }),
      fetched_at: Date.now() - DEFAULT_TTL_MS * 10,
    });
    invokeFnMock.mockRejectedValueOnce(new Error("offline"));
    const res = await loadContent<{ v: number }>({ fnName: "x", cacheKey: "k3", mode: "prefetch" });
    expect(res.data.v).toBe(7);
    expect(res.fromCache).toBe(true);
    invokeFnMock.mockRejectedValueOnce(new Error("offline"));
    await expect(
      prefetchContent({ fnName: "x", cacheKey: "nope", mode: "prefetch" })
    ).resolves.toBeUndefined();
  });

  it("invalidateContentCache removes the row", async () => {
    const db = await getLearnerDb();
    await db.contentCache.put({ cache_key: "k4", payload: "{}", fetched_at: Date.now() });
    await invalidateContentCache("k4");
    expect(await db.contentCache.get("k4")).toBeUndefined();
  });
});
