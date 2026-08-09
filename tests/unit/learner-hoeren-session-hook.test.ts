import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// `vi.hoisted` — `vi.mock` factories are hoisted above the rest of the
// module, so any mock fn they reference must be built via `vi.hoisted`, not
// a plain top-level `const` (same TDZ rationale as
// `learner-practice-session.test.tsx` / `learner-lesen-session.test.tsx`).
const { fetchHoerenSessionMock, fetchHoerenPracticeSessionMock, hydrateMock } = vi.hoisted(() => ({
  fetchHoerenSessionMock: vi.fn(),
  fetchHoerenPracticeSessionMock: vi.fn(),
  hydrateMock: vi.fn(),
}));

// Partial mock: keep the real facade surface (constraint 15 — this hook
// imports from `@/learner/core/api/examApi`, never `mockExam` directly, so
// that's what gets mocked here) but stub the two fetchers this hook calls.
vi.mock("@/learner/core/api/examApi", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/learner/core/api/examApi")>();
  return {
    ...actual,
    fetchHoerenSession: (...args: unknown[]) => fetchHoerenSessionMock(...args),
    fetchHoerenPracticeSession: (...args: unknown[]) => fetchHoerenPracticeSessionMock(...args),
  };
});

// Partial mock: keep the real `useExamContextStore` (tests drive it
// directly via `setState`, same as `learner-practice-session.test.tsx`) but
// stub `hydrateExamContext` so the hook's self-hydrate effect doesn't hit
// real localStorage/Supabase in jsdom — tests control `isLoaded`
// transitions explicitly instead.
vi.mock("@/learner/core/exam/examContext", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/learner/core/exam/examContext")>();
  return { ...actual, hydrateExamContext: hydrateMock };
});

import { useExamContextStore } from "@/learner/core/exam/examContext";
import { useHoerenSession } from "@/learner/hoeren/hooks/useHoerenSession";

const manifest = {
  modelltest: { slug: "hoeren-b1-01", title: "Modelltest 1", short_label: "MT 1" },
  modules: [{ code: "HOEREN", duration_minutes: 20, item_count: 1, instructions_de: "" }],
} as never;

const wireModule = {
  module_code: "HOEREN",
  source_slug: "hoeren-b1-01",
  parts: [
    {
      teil_number: 1,
      teil_label: "Teil 1",
      part_kind: "GLOBALVERSTEHEN",
      duration_minutes: 10,
      instructions_de: "Hör dir den Text an und beantworte die Fragen.",
      // track-2 carries a null `audio_url` — the "track exists, signing
      // failed" signal (F2). Must survive into `audioUrlBySlug` as a null
      // entry, not a dropped key.
      audio_tracks: [
        { slug: "track-1", label: "Track 1", audio_url: "https://cdn.example/track-1.mp3" },
        { slug: "track-2", label: "Track 2", audio_url: null },
      ],
      questions: [
        {
          id: "h1",
          item_number: 1,
          stem_de: "Frage 1",
          answer_format: "MC_SINGLE_3",
          options: [
            { key: "a", text: "Antwort A" },
            { key: "b", text: "Antwort B" },
            { key: "c", text: "Antwort C" },
          ],
          correct_answer: "a",
          audio_track_slug: "track-1",
        },
      ],
    },
  ],
} as never;

const readyPayload = {
  attemptId: "hoeren-1",
  examSlug: "hoeren-b1-01",
  manifest,
  module: wireModule,
};

describe("useHoerenSession", () => {
  beforeEach(() => {
    fetchHoerenSessionMock.mockReset();
    fetchHoerenPracticeSessionMock.mockReset();
    hydrateMock.mockReset();
    useExamContextStore.setState({ board: "telc", level: "b1", isLoaded: true } as never);
  });
  afterEach(cleanup);

  it("(a) attemptId calls fetchHoerenSession and reaches ready with a null audio_url kept as a null entry", async () => {
    fetchHoerenSessionMock.mockResolvedValue(readyPayload);

    const { result } = renderHook(() => useHoerenSession({ attemptId: "hoeren-1" }));

    await waitFor(() => expect(result.current.status).toBe("ready"));
    expect(fetchHoerenSessionMock).toHaveBeenCalledWith({ attemptId: "hoeren-1" });
    expect(fetchHoerenPracticeSessionMock).not.toHaveBeenCalled();
    // Non-tautological: if the hook dropped null-URL tracks (per mobile's
    // `audio_url` skip-on-null bug class), "track-2" would be absent from
    // this object and `toEqual` would fail.
    expect(result.current.audioUrlBySlug).toEqual({
      "track-1": "https://cdn.example/track-1.mp3",
      "track-2": null,
    });
    expect(result.current.attemptId).toBe("hoeren-1");
  });

  it("(b) examSlug calls the hoeren-start-backed fetch", async () => {
    fetchHoerenSessionMock.mockResolvedValue({ ...readyPayload, attemptId: "hoeren-2" });

    const { result } = renderHook(() => useHoerenSession({ examSlug: "hoeren-b1-01" }));

    await waitFor(() => expect(result.current.status).toBe("ready"));
    expect(fetchHoerenSessionMock).toHaveBeenCalledWith({ examSlug: "hoeren-b1-01" });
  });

  it("(c) practice with a supported level calls the practice fetch with (level, slug)", async () => {
    fetchHoerenPracticeSessionMock.mockResolvedValue({ ...readyPayload, attemptId: null });

    const { result } = renderHook(() => useHoerenSession({ slug: "practice-b1-set-1" }));

    await waitFor(() => expect(result.current.status).toBe("ready"));
    expect(fetchHoerenPracticeSessionMock).toHaveBeenCalledWith("B1", "practice-b1-set-1");
    expect(fetchHoerenSessionMock).not.toHaveBeenCalled();
    // Practice never fires with a genuine attempt id.
    expect(result.current.attemptId).toBeNull();
  });

  it("(d) practice with an unsupported level goes unsupported without calling the API (anti-#473)", async () => {
    useExamContextStore.setState({ level: "c1", isLoaded: true } as never);

    const { result } = renderHook(() => useHoerenSession({}));

    await waitFor(() => expect(result.current.status).toBe("unsupported"));
    expect(fetchHoerenPracticeSessionMock).not.toHaveBeenCalled();
    expect(fetchHoerenSessionMock).not.toHaveBeenCalled();
  });

  it("(e) hydration gate — the fetch does not fire until isLoaded (guard-removal: fails if the gate is removed)", async () => {
    // Reproduces a hard refresh / deep-link straight onto the practice
    // route: the store still holds the un-hydrated defaults, not the
    // learner's real track. `toPracticeLevel("b1")` is truthy, so a hook
    // without the gate would fetch against this wrong combo immediately.
    useExamContextStore.setState({ board: "goethe", level: "b1", isLoaded: false } as never);
    fetchHoerenPracticeSessionMock.mockResolvedValue(readyPayload);

    const { result } = renderHook(() => useHoerenSession({}));

    await waitFor(() => expect(hydrateMock).toHaveBeenCalledTimes(1));
    // Give any (incorrect, pre-gate) fetch a chance to fire before
    // asserting its absence.
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(fetchHoerenPracticeSessionMock).not.toHaveBeenCalled();
    expect(result.current.status).toBe("loading");

    // Hydration lands with the learner's REAL track.
    act(() => {
      useExamContextStore.setState({ board: "telc", level: "b1", isLoaded: true } as never);
    });

    await waitFor(() =>
      expect(fetchHoerenPracticeSessionMock).toHaveBeenCalledWith("B1", undefined)
    );
  });

  it("(f) fetch rejection surfaces an Error and reload() refires the fetch", async () => {
    fetchHoerenSessionMock.mockRejectedValueOnce(new Error("offline"));
    fetchHoerenSessionMock.mockResolvedValueOnce(readyPayload);

    const { result } = renderHook(() => useHoerenSession({ attemptId: "hoeren-1" }));

    await waitFor(() => expect(result.current.status).toBe("error"));
    expect(result.current.error).toBeInstanceOf(Error);
    expect(result.current.error?.message).toBe("offline");

    act(() => {
      result.current.reload();
    });

    await waitFor(() => expect(result.current.status).toBe("ready"));
    expect(fetchHoerenSessionMock).toHaveBeenCalledTimes(2);
  });

  it("(g) empty-parts payload reaches ready with 0 items — isEmpty stays false (screen owns the empty gate)", async () => {
    const emptyWireModule = {
      module_code: "HOEREN",
      source_slug: "hoeren-b1-01",
      parts: [],
    } as never;
    fetchHoerenSessionMock.mockResolvedValue({
      ...readyPayload,
      module: emptyWireModule,
    });

    const { result } = renderHook(() => useHoerenSession({ attemptId: "hoeren-1" }));

    await waitFor(() => expect(result.current.status).toBe("ready"));
    expect(result.current.player.session.parts).toHaveLength(0);
    expect(result.current.isEmpty).toBe(false);
  });
});
