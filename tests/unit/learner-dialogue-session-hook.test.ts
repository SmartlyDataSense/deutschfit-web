/**
 * `useDialogueSession` — S7 · Task 7.10.
 *
 * Port of `deutschfit-mobile/src/features/sprechen/dialogue/__tests__/useDialogueSession.test.tsx`'s
 * test surface, adapted for the web dep shape:
 *   - `submitStudentTurn` resolves the recorded `Blob` via an injected
 *     `getRecordingBlob(fileUri)` dep (7.2) before reserving/uploading —
 *     mobile PUTs a `file://` URI directly, web PUTs an already-resolved
 *     `Blob` (mirrors `useSprechenSession`'s `getRecordingBlobFn`).
 *   - `finalizeDialogue` takes a bare `sessionId` (not `{ sessionId }`).
 *   - `now` uses `vi.useFakeTimers()` + `vi.advanceTimersByTimeAsync` for
 *     the 1s wall-clock countdown (mobile's real-`Date.now()` + injected
 *     `now` dep collapses to the same seam here).
 *
 * Deps are scripted directly through the hook's `deps` argument — no
 * `vi.mock` of the facade — per this repo's established hook-test idiom
 * (`learner-sprechen-session-hook.test.ts`).
 *
 * Focus is the P20 per-turn idempotency contract (Constraint 7):
 *   - `start` forwards its args to `startDialogue`.
 *   - the first `submitStudentTurn` mints a truthy `clientTurnId`.
 *   - a RETRY after a transient failure replays the SAME `clientTurnId`
 *     (backend dedups on `(session_id, client_turn_id)`) — kept on error.
 *   - a fresh turn after a success mints a NEW `clientTurnId` — cleared on
 *     success.
 *   - a stale generation's completion after `reset()` is discarded
 *     (supersede token).
 *   - `finalize` calls `finalizeDialogue(sessionId)` and grades, stashing
 *     the result in `useDialogueResult`.
 */
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useDialogueResult } from "@/learner/sprechen/dialogue/resultStore";
import {
  useDialogueSession,
  type DialogueDeps,
} from "@/learner/sprechen/dialogue/hooks/useDialogueSession";
import type {
  DialogueResult,
  DialogueStartResult,
  DialogueTurnResult,
} from "@/learner/core/api/dialogue";

const startResult: DialogueStartResult = {
  sessionId: "sess-1",
  dialogueTeilKey: "b1_teil_3",
  taskNativeLabel: "Gemeinsam etwas planen",
  taskInstructionsDe: "Planen Sie gemeinsam einen Ausflug.",
  theme: null,
  partnerTurn: {
    text: "Wollen wir am Samstag etwas unternehmen?",
    audio_signed_url: "https://signed.example/0.mp3",
    audio_storage_path: "u1/dialogue/sess-1/0-partner.mp3",
    voice_id: "alloy",
  },
  turnMin: 4,
  turnMax: 8,
  budgetSec: 180,
};

function turnResult(
  turnCount: number,
  overrides: Partial<DialogueTurnResult> = {}
): DialogueTurnResult {
  return {
    candidateText: `Antwort ${turnCount}`,
    partnerTurn: {
      text: `Partner ${turnCount}`,
      audio_signed_url: `https://signed.example/${turnCount}.mp3`,
      audio_storage_path: `u1/dialogue/sess-1/${turnCount}-partner.mp3`,
    },
    turnCount,
    canFinalize: turnCount >= 4,
    mustFinalize: false,
    ...overrides,
  };
}

const graderResult: DialogueResult = {
  sessionId: "sess-1",
  status: "ready",
  overallScore: 22,
  band: "solide",
  resultKind: "entrainement",
  summaryFr: "Bien construit.",
  dimensions: [],
  prueferText: "Gut gemacht.",
  betreuerText: "Continue.",
};

/** Controllable promise so a test can drive a never-resolving / late
 *  async write deterministically without real timers. */
function deferred<T>(): {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (reason?: unknown) => void;
} {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

const RECORDING_ENTRY = { blob: new Blob(["x"], { type: "audio/webm" }), mimeType: "audio/webm" };

function makeDeps(overrides: Partial<DialogueDeps> = {}): DialogueDeps {
  return {
    startDialogue: vi.fn().mockResolvedValue(startResult),
    reserveStudentTurnUpload: vi.fn().mockResolvedValue({
      signedUploadUrl: "https://signed.example/put",
      storagePath: "u1/dialogue/sess-1/0-student.wav",
    }),
    putStudentAudio: vi.fn().mockResolvedValue(undefined),
    sendDialogueTurn: vi.fn().mockResolvedValue(turnResult(1)),
    finalizeDialogue: vi.fn().mockResolvedValue(graderResult),
    getRecordingBlob: vi.fn().mockReturnValue(RECORDING_ENTRY),
    now: () => 0,
    ...overrides,
  };
}

afterEach(() => {
  cleanup();
});

beforeEach(() => {
  useDialogueResult.getState().clear();
});

describe("useDialogueSession", () => {
  it("seeds with phase 'idle' and an empty history", () => {
    const { result } = renderHook(() => useDialogueSession(makeDeps()));
    expect(result.current.phase).toBe("idle");
    expect(result.current.history).toEqual([]);
    expect(result.current.sessionId).toBeNull();
  });

  it("start forwards its args to deps.startDialogue and seeds the session", async () => {
    const deps = makeDeps();
    const { result } = renderHook(() => useDialogueSession(deps));

    await act(async () => {
      await result.current.start({ board: "telc", level: "B1", teil: "b1_teil_3" });
    });

    expect(deps.startDialogue).toHaveBeenCalledTimes(1);
    expect(deps.startDialogue).toHaveBeenCalledWith({
      board: "telc",
      level: "B1",
      teil: "b1_teil_3",
    });
    expect(result.current.phase).toBe("awaiting_student");
    expect(result.current.sessionId).toBe("sess-1");
    expect(result.current.partnerAudioUrl).toBe("https://signed.example/0.mp3");
    expect(result.current.budgetSec).toBe(180);
    expect(result.current.timeRemainingSec).toBe(180);
  });

  it("start ticks the 1s wall-clock countdown down from budgetSec", async () => {
    vi.useFakeTimers();
    try {
      let now = 0;
      const deps = makeDeps({ now: () => now });
      const { result } = renderHook(() => useDialogueSession(deps));

      await act(async () => {
        await result.current.start({ board: "telc", level: "B1", teil: "b1_teil_3" });
      });
      expect(result.current.timeRemainingSec).toBe(180);

      now = 3_000;
      await act(async () => {
        await vi.advanceTimersByTimeAsync(3_000);
      });
      expect(result.current.timeRemainingSec).toBe(177);
    } finally {
      vi.useRealTimers();
    }
  });

  it("the first submitStudentTurn resolves the blob via getRecordingBlob and mints a truthy clientTurnId", async () => {
    const deps = makeDeps();
    const sendDialogueTurn = deps.sendDialogueTurn as ReturnType<typeof vi.fn>;
    const { result } = renderHook(() => useDialogueSession(deps));

    await act(async () => {
      await result.current.start({ board: "telc", level: "B1", teil: "b1_teil_3" });
    });
    await act(async () => {
      await result.current.submitStudentTurn({ fileUri: "blob:turn-1", userId: "user-1" });
    });

    expect(deps.getRecordingBlob).toHaveBeenCalledWith("blob:turn-1");
    expect(deps.putStudentAudio).toHaveBeenCalledWith(
      "https://signed.example/put",
      RECORDING_ENTRY.blob,
      "audio/webm"
    );
    expect(sendDialogueTurn).toHaveBeenCalledTimes(1);
    const firstCallArg = sendDialogueTurn.mock.calls[0]?.[0] as {
      clientTurnId: string;
      sessionId: string;
    };
    expect(firstCallArg.clientTurnId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    );
    expect(firstCallArg.sessionId).toBe("sess-1");
    expect(result.current.phase).toBe("awaiting_student");
    expect(result.current.turnCount).toBe(1);
  });

  it("no recorded blob -> ERROR('recording_not_found'), reserve/send never called", async () => {
    const deps = makeDeps({ getRecordingBlob: vi.fn().mockReturnValue(null) });
    const { result } = renderHook(() => useDialogueSession(deps));

    await act(async () => {
      await result.current.start({ board: "telc", level: "B1", teil: "b1_teil_3" });
    });
    await act(async () => {
      await result.current.submitStudentTurn({ fileUri: "blob:missing", userId: "user-1" });
    });

    expect(result.current.phase).toBe("failed");
    expect(result.current.errorMessage).toBe("recording_not_found");
    expect(deps.reserveStudentTurnUpload).not.toHaveBeenCalled();
    expect(deps.sendDialogueTurn).not.toHaveBeenCalled();
  });

  it("a retry after a transient failure replays the SAME clientTurnId (P20 core assertion)", async () => {
    const sendDialogueTurn = vi
      .fn()
      .mockRejectedValueOnce(new Error("concurrent_turn_conflict"))
      .mockResolvedValueOnce(turnResult(1));
    const deps = makeDeps({ sendDialogueTurn });
    const { result } = renderHook(() => useDialogueSession(deps));

    await act(async () => {
      await result.current.start({ board: "telc", level: "B1", teil: "b1_teil_3" });
    });

    // First attempt -> lands in ERROR. The pending id must be KEPT (not
    // cleared) so the retry below replays it.
    await act(async () => {
      await result.current.submitStudentTurn({ fileUri: "blob:turn-1", userId: "user-1" });
    });
    expect(result.current.phase).toBe("failed");
    expect(result.current.errorMessage).toBe("concurrent_turn_conflict");

    // Retry -> succeeds.
    await act(async () => {
      await result.current.submitStudentTurn({ fileUri: "blob:turn-1", userId: "user-1" });
    });

    expect(sendDialogueTurn).toHaveBeenCalledTimes(2);
    const idAttempt1 = (sendDialogueTurn.mock.calls[0]?.[0] as { clientTurnId: string })
      .clientTurnId;
    const idAttempt2 = (sendDialogueTurn.mock.calls[1]?.[0] as { clientTurnId: string })
      .clientTurnId;
    expect(idAttempt1).toBeTruthy();
    expect(idAttempt2).toBe(idAttempt1);
    expect(result.current.phase).toBe("awaiting_student");
  });

  it("a fresh turn after a success mints a NEW clientTurnId (cleared on success)", async () => {
    const sendDialogueTurn = vi
      .fn()
      .mockResolvedValueOnce(turnResult(1))
      .mockResolvedValueOnce(turnResult(2));
    const reserveStudentTurnUpload = vi
      .fn()
      .mockImplementation(async (args: { turnIndex: number }) => ({
        signedUploadUrl: "https://signed.example/put",
        storagePath: `u1/dialogue/sess-1/${args.turnIndex}-student.wav`,
      }));
    const deps = makeDeps({ sendDialogueTurn, reserveStudentTurnUpload });
    const { result } = renderHook(() => useDialogueSession(deps));

    await act(async () => {
      await result.current.start({ board: "telc", level: "B1", teil: "b1_teil_3" });
    });
    await act(async () => {
      await result.current.submitStudentTurn({ fileUri: "blob:turn-1", userId: "user-1" });
    });
    await act(async () => {
      await result.current.submitStudentTurn({ fileUri: "blob:turn-2", userId: "user-1" });
    });

    expect(sendDialogueTurn).toHaveBeenCalledTimes(2);
    const idTurn1 = (sendDialogueTurn.mock.calls[0]?.[0] as { clientTurnId: string }).clientTurnId;
    const idTurn2 = (sendDialogueTurn.mock.calls[1]?.[0] as { clientTurnId: string }).clientTurnId;
    expect(idTurn1).toBeTruthy();
    expect(idTurn2).toBeTruthy();
    expect(idTurn2).not.toBe(idTurn1);

    expect(reserveStudentTurnUpload).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ turnIndex: 0 })
    );
    expect(reserveStudentTurnUpload).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ turnIndex: 1 })
    );
  });

  it("mustFinalize from the turn response surfaces on state", async () => {
    const sendDialogueTurn = vi.fn().mockResolvedValue(turnResult(4, { mustFinalize: true }));
    const deps = makeDeps({ sendDialogueTurn });
    const { result } = renderHook(() => useDialogueSession(deps));

    await act(async () => {
      await result.current.start({ board: "telc", level: "B1", teil: "b1_teil_3" });
    });
    await act(async () => {
      await result.current.submitStudentTurn({ fileUri: "blob:turn-1", userId: "user-1" });
    });

    expect(result.current.mustFinalize).toBe(true);
    expect(result.current.canFinalize).toBe(true);
  });

  it("a null partnerTurn.audio_signed_url (M-2 idempotent replay) lands partnerAudioUrl null, text still renders", async () => {
    const sendDialogueTurn = vi.fn().mockResolvedValue(
      turnResult(1, {
        partnerTurn: {
          text: "Repeated partner line.",
          audio_signed_url: null,
          audio_storage_path: "p",
        },
        idempotentReplay: true,
      })
    );
    const deps = makeDeps({ sendDialogueTurn });
    const { result } = renderHook(() => useDialogueSession(deps));

    await act(async () => {
      await result.current.start({ board: "telc", level: "B1", teil: "b1_teil_3" });
    });
    await act(async () => {
      await result.current.submitStudentTurn({ fileUri: "blob:turn-1", userId: "user-1" });
    });

    // Web delta (M-2): null audio -> already-consumed state (screen skips
    // auto-play), but the turn's text is still appended to history.
    expect(result.current.partnerAudioUrl).toBeNull();
    const lastTurn = result.current.history[result.current.history.length - 1];
    expect(lastTurn?.text).toBe("Repeated partner line.");
    expect(lastTurn?.speaker).toBe("partner");
  });

  it("finalize calls deps.finalizeDialogue(sessionId) [bare string], grades, and stashes the result store", async () => {
    const deps = makeDeps();
    const { result } = renderHook(() => useDialogueSession(deps));

    await act(async () => {
      await result.current.start({ board: "telc", level: "B1", teil: "b1_teil_3" });
    });
    await act(async () => {
      await result.current.finalize();
    });

    expect(deps.finalizeDialogue).toHaveBeenCalledWith("sess-1");
    expect(result.current.phase).toBe("graded");
    expect(result.current.grader).toEqual(graderResult);
    expect(useDialogueResult.getState().result).toEqual(graderResult);
  });

  it("a second finalize call after grading is blocked (finalizeDialogue is non-idempotent server-side)", async () => {
    const deps = makeDeps();
    const { result } = renderHook(() => useDialogueSession(deps));

    await act(async () => {
      await result.current.start({ board: "telc", level: "B1", teil: "b1_teil_3" });
    });
    await act(async () => {
      await result.current.finalize();
    });
    expect(result.current.phase).toBe("graded");
    expect(deps.finalizeDialogue).toHaveBeenCalledTimes(1);

    // Web delta: a second finalize() call once already `graded` is a
    // client-side no-op — `finalizeDialogue` is NOT idempotent
    // server-side, so the hook must not re-invoke it.
    await act(async () => {
      await result.current.finalize();
    });
    expect(deps.finalizeDialogue).toHaveBeenCalledTimes(1);
    expect(result.current.phase).toBe("graded");
  });

  it("a second submitStudentTurn while the first is in flight short-circuits (re-entrancy guard)", async () => {
    const sendGate = deferred<DialogueTurnResult>();
    const sendDialogueTurn = vi.fn().mockReturnValue(sendGate.promise);
    const deps = makeDeps({ sendDialogueTurn });
    const reserveStudentTurnUpload = deps.reserveStudentTurnUpload as ReturnType<typeof vi.fn>;
    const { result } = renderHook(() => useDialogueSession(deps));

    await act(async () => {
      await result.current.start({ board: "telc", level: "B1", teil: "b1_teil_3" });
    });

    await act(async () => {
      void result.current.submitStudentTurn({ fileUri: "blob:turn-1", userId: "user-1" });
      void result.current.submitStudentTurn({ fileUri: "blob:turn-1b", userId: "user-1" });
    });

    expect(reserveStudentTurnUpload).toHaveBeenCalledTimes(1);
    expect(sendDialogueTurn).toHaveBeenCalledTimes(1);

    await act(async () => {
      sendGate.resolve(turnResult(1));
      await sendGate.promise;
    });
    expect(result.current.phase).toBe("awaiting_student");
  });

  it("clears the pending turn id across a reset + fresh start", async () => {
    const sendDialogueTurn = vi
      .fn()
      .mockRejectedValueOnce(new Error("concurrent_turn_conflict"))
      .mockResolvedValueOnce(turnResult(1));
    const deps = makeDeps({ sendDialogueTurn });
    const { result } = renderHook(() => useDialogueSession(deps));

    await act(async () => {
      await result.current.start({ board: "telc", level: "B1", teil: "b1_teil_3" });
    });
    await act(async () => {
      await result.current.submitStudentTurn({ fileUri: "blob:turn-1", userId: "user-1" });
    });
    expect(result.current.phase).toBe("failed");
    const failedTurnId = (sendDialogueTurn.mock.calls[0]?.[0] as { clientTurnId: string })
      .clientTurnId;

    act(() => result.current.reset());
    await act(async () => {
      await result.current.start({ board: "telc", level: "B1", teil: "b1_teil_3" });
    });
    await act(async () => {
      await result.current.submitStudentTurn({ fileUri: "blob:fresh-1", userId: "user-1" });
    });

    expect(sendDialogueTurn).toHaveBeenCalledTimes(2);
    const freshTurnId = (sendDialogueTurn.mock.calls[1]?.[0] as { clientTurnId: string })
      .clientTurnId;
    expect(freshTurnId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
    expect(freshTurnId).not.toBe(failedTurnId);
    expect(result.current.phase).toBe("awaiting_student");
  });

  it("ignores a late turn that resolves after reset() (stale-generation discard / supersede token)", async () => {
    const sendGate = deferred<DialogueTurnResult>();
    const sendDialogueTurn = vi.fn().mockReturnValue(sendGate.promise);
    const deps = makeDeps({ sendDialogueTurn });
    const { result } = renderHook(() => useDialogueSession(deps));

    await act(async () => {
      await result.current.start({ board: "telc", level: "B1", teil: "b1_teil_3" });
    });

    await act(async () => {
      void result.current.submitStudentTurn({ fileUri: "blob:turn-1", userId: "user-1" });
    });
    expect(sendDialogueTurn).toHaveBeenCalledTimes(1);

    act(() => result.current.reset());
    expect(result.current.phase).toBe("idle");

    await act(async () => {
      sendGate.resolve(turnResult(1));
      await sendGate.promise;
    });

    expect(result.current.phase).toBe("idle");
    expect(result.current.history).toEqual([]);
    expect(result.current.sessionId).toBeNull();
  });

  it("ignores a late start() completion superseded by a fresh start() (supersede token on start)", async () => {
    const firstStart = deferred<DialogueStartResult>();
    const startDialogue = vi
      .fn()
      .mockReturnValueOnce(firstStart.promise)
      .mockResolvedValueOnce({ ...startResult, sessionId: "sess-2" });
    const deps = makeDeps({ startDialogue });
    const { result } = renderHook(() => useDialogueSession(deps));

    let firstStartPromise!: Promise<void>;
    act(() => {
      firstStartPromise = result.current.start({ board: "telc", level: "B1", teil: "b1_teil_3" });
    });
    expect(result.current.phase).toBe("starting");

    // A second start() before the first resolves supersedes it.
    await act(async () => {
      await result.current.start({ board: "telc", level: "B1", teil: "b1_teil_3" });
    });
    expect(result.current.sessionId).toBe("sess-2");

    // The stale first start() now resolves — its result must be dropped.
    await act(async () => {
      firstStart.resolve(startResult);
      await firstStartPromise;
    });
    expect(result.current.sessionId).toBe("sess-2");
  });

  it("start() is re-runnable after a boot failure (mints a new generation)", async () => {
    const startDialogue = vi
      .fn()
      .mockRejectedValueOnce(new Error("network_down"))
      .mockResolvedValueOnce(startResult);
    const deps = makeDeps({ startDialogue });
    const { result } = renderHook(() => useDialogueSession(deps));

    await act(async () => {
      await result.current.start({ board: "telc", level: "B1", teil: "b1_teil_3" });
    });
    expect(result.current.phase).toBe("failed");
    expect(result.current.errorMessage).toBe("network_down");

    await act(async () => {
      await result.current.start({ board: "telc", level: "B1", teil: "b1_teil_3" });
    });
    expect(result.current.phase).toBe("awaiting_student");
    expect(result.current.sessionId).toBe("sess-1");
  });

  it("reset() stops the tick and returns to idle", async () => {
    vi.useFakeTimers();
    try {
      const deps = makeDeps();
      const { result } = renderHook(() => useDialogueSession(deps));

      await act(async () => {
        await result.current.start({ board: "telc", level: "B1", teil: "b1_teil_3" });
      });
      act(() => result.current.reset());

      expect(result.current.phase).toBe("idle");
      expect(result.current.sessionId).toBeNull();
      expect(result.current.timeRemainingSec).toBe(0);

      // Ticks stopped: advancing time after reset must not resurrect a
      // countdown (would throw/act-warn if a stray interval still dispatched).
      await act(async () => {
        await vi.advanceTimersByTimeAsync(5_000);
      });
      expect(result.current.timeRemainingSec).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });

  it("markPartnerAudioConsumed nulls partnerAudioUrl", async () => {
    const deps = makeDeps();
    const { result } = renderHook(() => useDialogueSession(deps));

    await act(async () => {
      await result.current.start({ board: "telc", level: "B1", teil: "b1_teil_3" });
    });
    expect(result.current.partnerAudioUrl).not.toBeNull();

    act(() => result.current.markPartnerAudioConsumed());
    expect(result.current.partnerAudioUrl).toBeNull();
  });
});
