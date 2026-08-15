/**
 * Exam-context store — localStorage cache + `user_profiles` server sync.
 *
 * Ports `deutschfit-mobile/src/core/exam/examContext.tsx` minus the React
 * provider. See `src/learner/core/exam/examContext.ts` for the web
 * deviations (localStorage, `getBrowserClient()` per call,
 * `useLearnerSession`, `NODE_ENV` dev guard).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const maybeSingle = vi.fn();
const upsert = vi.fn();
const from = vi.fn(() => ({
  select: vi.fn(() => ({ eq: vi.fn(() => ({ maybeSingle })) })),
  upsert,
}));
vi.mock("@/lib/supabase/browser", () => ({ getBrowserClient: () => ({ from }) }));

let mockUserId: string | null = "user-1";
vi.mock("@/learner/core/auth/useLearnerSession", () => ({
  useLearnerSession: {
    getState: () => ({ session: mockUserId ? { user: { id: mockUserId } } : null }),
  },
}));

import {
  EXAM_CONTEXT_STORAGE_KEY,
  subscribeExamContext,
  useExamContextStore,
} from "@/learner/core/exam/examContext";

function installMemoryStorage(): Record<string, string> {
  const data: Record<string, string> = {};
  const storage = {
    getItem: (k: string) => (k in data ? data[k] : null),
    setItem: (k: string, v: string) => {
      data[k] = v;
    },
    removeItem: (k: string) => {
      delete data[k];
    },
    clear: () => {
      for (const k of Object.keys(data)) delete data[k];
    },
    key: () => null,
    length: 0,
  } as unknown as Storage;
  Object.defineProperty(window, "localStorage", { value: storage, configurable: true });
  return data;
}

describe("examContext store", () => {
  let store: Record<string, string>;

  beforeEach(() => {
    store = installMemoryStorage();
    mockUserId = "user-1";
    maybeSingle.mockReset();
    upsert.mockReset();
    useExamContextStore.setState({
      board: "goethe",
      level: "b1",
      source: "onboarding",
      isLoaded: false,
    });
  });

  it("hydrate seeds from localStorage then lets the server win on drift", async () => {
    store[EXAM_CONTEXT_STORAGE_KEY] = JSON.stringify({
      board: "telc",
      level: "b2",
      source: "settings",
    });
    maybeSingle.mockResolvedValue({
      data: { exam_board: "goethe", exam_level: "b1" },
      error: null,
    });

    await useExamContextStore.getState().hydrate();

    const s = useExamContextStore.getState();
    expect(s.isLoaded).toBe(true);
    // server won:
    expect(s.board).toBe("goethe");
    expect(s.level).toBe("b1");
    // localStorage rewritten with the server value:
    expect(JSON.parse(store[EXAM_CONTEXT_STORAGE_KEY]!)).toMatchObject({
      board: "goethe",
      level: "b1",
    });
  });

  it("setExamContext clamps the combo, persists locally, upserts user_profiles, notifies subscribers", async () => {
    upsert.mockResolvedValue({ error: null });
    const seen: unknown[] = [];
    const unsub = subscribeExamContext((snap) => seen.push(snap));

    // testdaf does not ship c2 → clamped to b2 (normaliseExamSelection).
    await useExamContextStore
      .getState()
      .setExamContext({ board: "testdaf", level: "c2", source: "onboarding" });

    expect(useExamContextStore.getState().level).toBe("b2");
    expect(from).toHaveBeenCalledWith("user_profiles");
    expect(upsert).toHaveBeenCalledWith(
      { user_id: "user-1", exam_board: "testdaf", exam_level: "b2" },
      { onConflict: "user_id" }
    );
    expect(seen).toHaveLength(1);
    unsub();
  });

  it("setExamContext throws when the server upsert fails (post-F-6 semantics) but keeps the optimistic local value", async () => {
    upsert.mockResolvedValue({ error: { message: "rls_denied" } });
    await expect(
      useExamContextStore.getState().setExamContext({ board: "telc", level: "b1" })
    ).rejects.toThrow("rls_denied");
    expect(useExamContextStore.getState().board).toBe("telc"); // optimistic write stays
  });

  it("setExamContext skips the server upsert when signed out", async () => {
    mockUserId = null;
    await useExamContextStore.getState().setExamContext({ board: "telc", level: "b1" });
    expect(upsert).not.toHaveBeenCalled();
    expect(useExamContextStore.getState().board).toBe("telc");
  });
});
