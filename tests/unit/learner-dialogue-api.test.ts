/**
 * `listDialogueTeile` / `startDialogue` / `sendDialogueTurn` /
 * `finalizeDialogue` / `reserveStudentTurnUpload` / `putStudentAudio` —
 * S7 · Task 7.10.
 *
 * Port of `deutschfit-mobile/src/features/sprechen/dialogue/__tests__/api.test.ts`'s
 * test surface, adapted for the web transport (`invokeFn`/`ApiError`
 * instead of `supabase.functions.invoke`'s `{data,error}` envelope).
 * `reserveStudentTurnUpload` and `listDialogueTeile` mock
 * `@/lib/supabase/browser` per the `learner-accueil-api.test.ts` /
 * mobile `dialogue/__tests__/api.test.ts` chainable-builder idiom.
 *
 * Mocks only the transport boundaries (`@/learner/core/api/client`,
 * `@/lib/supabase/browser`, global `fetch`) per Constraint 15 / this
 * repo's test idiom — `dialogue.ts` itself runs for real.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { invokeFnMock, ApiErrorCtor } = vi.hoisted(() => {
  class ApiError extends Error {
    readonly bodyJson?: unknown;
    constructor(
      readonly status: number,
      readonly code: string,
      readonly detail?: string,
      bodyJson?: unknown
    ) {
      super(detail ?? code);
      this.name = "ApiError";
      this.bodyJson = bodyJson;
    }
  }
  return { invokeFnMock: vi.fn(), ApiErrorCtor: ApiError };
});

vi.mock("@/learner/core/api/client", () => ({
  invokeFn: invokeFnMock,
  ApiError: ApiErrorCtor,
}));

// Chainable builder for supabase.from(…).select(…).eq(…).eq(…).order(…) —
// mirrors mobile `dialogue/__tests__/api.test.ts:17-43`.
type ChainResult = { data: unknown; error: unknown };
let mockFromResult: ChainResult = { data: null, error: null };
const mockEq = vi.fn();
const mockOrder = vi.fn();
const mockSelect = vi.fn();
const mockFrom = vi.fn(() => ({
  select: (...args: unknown[]) => {
    mockSelect(...args);
    return {
      eq: (...a: unknown[]) => {
        mockEq(...a);
        return {
          eq: (...b: unknown[]) => {
            mockEq(...b);
            return {
              order: (...c: unknown[]) => {
                mockOrder(...c);
                return Promise.resolve(mockFromResult);
              },
            };
          },
        };
      },
    };
  },
}));

const mockCreateSignedUploadUrl = vi.fn();
const mockStorageFrom = vi.fn(() => ({
  createSignedUploadUrl: (path: string, opts?: { upsert?: boolean }): unknown =>
    mockCreateSignedUploadUrl(path, opts),
}));

vi.mock("@/lib/supabase/browser", () => ({
  getBrowserClient: () => ({
    from: mockFrom,
    storage: { from: mockStorageFrom },
  }),
}));

import {
  finalizeDialogue,
  listDialogueTeile,
  putStudentAudio,
  reserveStudentTurnUpload,
  sendDialogueTurn,
  startDialogue,
  type DialogueResult,
  type DialogueStartResult,
  type DialogueTurnResult,
} from "@/learner/core/api/dialogue";
import * as examApi from "@/learner/core/api/examApi";

// ---------------------------------------------------------------------------
// Fixtures — mirror mobile `dialogue/__tests__/api.test.ts:63-124`.
// ---------------------------------------------------------------------------

const TEIL_ROW_FIXTURE = {
  dialogue_teil_key: "telc-b1-teil_1a",
  teil: "teil_1a",
  task_type: "planning",
  native_label: "Gemeinsam etwas planen",
  task_instructions_de: "Planen Sie gemeinsam...",
  moves: ["greet", "propose", "agree"],
  turn_min: 3,
  turn_max: 8,
  budget_sec: 180,
  themes: [{ slug: "urlaub", title_de: "Urlaub planen", materials_de: "Ihr Freund möchte..." }],
  display_order: 1,
};

const START_RESULT_FIXTURE: DialogueStartResult = {
  sessionId: "sess-abc",
  dialogueTeilKey: "telc-b1-teil_1a",
  taskNativeLabel: "Gemeinsam etwas planen",
  taskInstructionsDe: "Planen Sie gemeinsam...",
  theme: { slug: "urlaub", title_de: "Urlaub planen", materials_de: "..." },
  partnerTurn: {
    text: "Hallo! Ich habe eine Idee.",
    audio_signed_url: "https://signed/partner-0.mp3",
    audio_storage_path: "dialogue/sess-abc/0-partner.mp3",
    voice_id: "alloy",
  },
  turnMin: 3,
  turnMax: 8,
  budgetSec: 180,
};

const TURN_RESULT_FIXTURE: DialogueTurnResult = {
  candidateText: "Ja, das klingt gut.",
  partnerTurn: {
    text: "Super, dann machen wir das.",
    audio_signed_url: "https://signed/partner-2.mp3",
    audio_storage_path: "dialogue/sess-abc/2-partner.mp3",
  },
  turnCount: 3,
  canFinalize: false,
  mustFinalize: false,
};

const FINALIZE_RESULT_FIXTURE: DialogueResult = {
  sessionId: "sess-abc",
  status: "ready",
  overallScore: 14,
  band: "solide",
  resultKind: "entrainement",
  summaryFr: "Très bien.",
  dimensions: [{ nativeLabel: "Aufgabenerfüllung", score: 3, justificationFr: "Bon." }],
  prueferText: "Bonne performance globale.",
  betreuerText: "Tu as bien réussi !",
};

beforeEach(() => {
  invokeFnMock.mockReset();
  mockFrom.mockClear();
  mockSelect.mockClear();
  mockEq.mockClear();
  mockOrder.mockClear();
  mockFromResult = { data: null, error: null };
  mockCreateSignedUploadUrl.mockReset();
  mockStorageFrom.mockClear();
});

// ---------------------------------------------------------------------------
// listDialogueTeile
// ---------------------------------------------------------------------------

describe("listDialogueTeile", () => {
  it("maps snake_case row to camelCase DialogueTeilConfig", async () => {
    mockFromResult = { data: [TEIL_ROW_FIXTURE], error: null };
    const result = await listDialogueTeile({ board: "telc", level: "B1" });
    expect(result).toHaveLength(1);
    const cfg = result[0];
    if (!cfg) throw new Error("expected one config");
    expect(cfg.dialogueTeilKey).toBe("telc-b1-teil_1a");
    expect(cfg.teil).toBe("teil_1a");
    expect(cfg.taskType).toBe("planning");
    expect(cfg.turnMin).toBe(3);
    expect(cfg.turnMax).toBe(8);
    expect(cfg.budgetSec).toBe(180);
    expect(cfg.displayOrder).toBe(1);
    const theme = cfg.themes[0];
    if (!theme) throw new Error("expected one theme");
    expect(theme.slug).toBe("urlaub");
    expect(theme.titleDe).toBe("Urlaub planen");
    expect(theme.materialsDe).toBe("Ihr Freund möchte...");
  });

  it("filters by board and level via .eq, selects from cert_dialogue_teile", async () => {
    mockFromResult = { data: [], error: null };
    await listDialogueTeile({ board: "telc", level: "B2" });
    expect(mockFrom).toHaveBeenCalledWith("cert_dialogue_teile");
    expect(mockEq).toHaveBeenCalledWith("board", "telc");
    expect(mockEq).toHaveBeenCalledWith("level", "B2");
    expect(mockOrder).toHaveBeenCalledWith("display_order");
  });

  it("returns empty array when data is null", async () => {
    mockFromResult = { data: null, error: null };
    const result = await listDialogueTeile({ board: "telc", level: "B1" });
    expect(result).toEqual([]);
  });

  it("throws when PostgREST returns an error", async () => {
    mockFromResult = { data: null, error: { message: "permission_denied" } };
    await expect(listDialogueTeile({ board: "telc", level: "B1" })).rejects.toThrow(
      "permission_denied"
    );
  });
});

// ---------------------------------------------------------------------------
// startDialogue
// ---------------------------------------------------------------------------

describe("startDialogue", () => {
  it("returns the camelCase payload on success", async () => {
    invokeFnMock.mockResolvedValueOnce(START_RESULT_FIXTURE);
    const result = await startDialogue({
      board: "telc",
      level: "B1",
      teil: "teil_1a",
      themeId: "urlaub",
    });
    expect(result.sessionId).toBe("sess-abc");
    expect(result.partnerTurn.voice_id).toBe("alloy");
    expect(result.theme?.slug).toBe("urlaub");
  });

  it("invokes sprechen-dialogue-start with the exact camelCase body", async () => {
    invokeFnMock.mockResolvedValueOnce(START_RESULT_FIXTURE);
    await startDialogue({
      board: "telc",
      level: "B1",
      teil: "teil_1a",
      themeId: "urlaub",
      voice: "alloy",
    });
    expect(invokeFnMock).toHaveBeenCalledWith("sprechen-dialogue-start", {
      method: "POST",
      body: { board: "telc", level: "B1", teil: "teil_1a", themeId: "urlaub", voice: "alloy" },
    });
  });

  it("omits absent optional themeId/voice", async () => {
    invokeFnMock.mockResolvedValueOnce(START_RESULT_FIXTURE);
    await startDialogue({ board: "telc", level: "B1", teil: "teil_1a" });
    expect(invokeFnMock).toHaveBeenCalledWith("sprechen-dialogue-start", {
      method: "POST",
      body: { board: "telc", level: "B1", teil: "teil_1a" },
    });
  });

  it("throws Error(serverCode) on an ApiError (hard HTTP error)", async () => {
    invokeFnMock.mockRejectedValueOnce(new ApiErrorCtor(400, "invalid_teil"));
    await expect(startDialogue({ board: "telc", level: "B1", teil: "teil_1a" })).rejects.toThrow(
      "invalid_teil"
    );
  });

  it("throws the server-coded error on a soft-error 200 body", async () => {
    invokeFnMock.mockResolvedValueOnce({ error: "invalid_teil" });
    await expect(startDialogue({ board: "telc", level: "B1", teil: "teil_1a" })).rejects.toThrow(
      "invalid_teil"
    );
  });
});

// ---------------------------------------------------------------------------
// sendDialogueTurn
// ---------------------------------------------------------------------------

describe("sendDialogueTurn", () => {
  it("forwards the exact camelCase body and returns candidateText + partnerTurn", async () => {
    invokeFnMock.mockResolvedValueOnce(TURN_RESULT_FIXTURE);
    const result = await sendDialogueTurn({
      sessionId: "sess-abc",
      audioPath: "user-123/dialogue/sess-abc/1-student.wav",
      clientTurnId: "ct-1",
      voice: "alloy",
    });
    expect(invokeFnMock).toHaveBeenCalledWith("sprechen-dialogue-turn", {
      method: "POST",
      body: {
        sessionId: "sess-abc",
        audioPath: "user-123/dialogue/sess-abc/1-student.wav",
        clientTurnId: "ct-1",
        voice: "alloy",
      },
    });
    expect(result.candidateText).toBe("Ja, das klingt gut.");
    expect(result.partnerTurn.audio_signed_url).toBe("https://signed/partner-2.mp3");
  });

  it("omits absent optional voice", async () => {
    invokeFnMock.mockResolvedValueOnce(TURN_RESULT_FIXTURE);
    await sendDialogueTurn({ sessionId: "sess-abc", audioPath: "p", clientTurnId: "ct-1" });
    expect(invokeFnMock).toHaveBeenCalledWith("sprechen-dialogue-turn", {
      method: "POST",
      body: { sessionId: "sess-abc", audioPath: "p", clientTurnId: "ct-1" },
    });
  });

  it("accepts a null audio_signed_url (M-2 idempotent-replay branch)", async () => {
    invokeFnMock.mockResolvedValueOnce({
      ...TURN_RESULT_FIXTURE,
      partnerTurn: { ...TURN_RESULT_FIXTURE.partnerTurn, audio_signed_url: null },
      idempotentReplay: true,
    });
    const result = await sendDialogueTurn({
      sessionId: "sess-abc",
      audioPath: "p",
      clientTurnId: "ct-1",
    });
    expect(result.partnerTurn.audio_signed_url).toBeNull();
    expect(result.partnerTurn.text).toBe("Super, dann machen wir das.");
    expect(result.idempotentReplay).toBe(true);
  });

  it("surfaces server-coded concurrent_turn_conflict", async () => {
    invokeFnMock.mockResolvedValueOnce({ error: "concurrent_turn_conflict" });
    await expect(
      sendDialogueTurn({ sessionId: "sess-abc", audioPath: "p", clientTurnId: "ct-2" })
    ).rejects.toThrow("concurrent_turn_conflict");
  });

  it("throws Error(serverCode) on an ApiError (hard HTTP error)", async () => {
    invokeFnMock.mockRejectedValueOnce(new ApiErrorCtor(409, "concurrent_turn_conflict"));
    await expect(
      sendDialogueTurn({ sessionId: "sess-abc", audioPath: "p", clientTurnId: "ct-2" })
    ).rejects.toThrow("concurrent_turn_conflict");
  });
});

// ---------------------------------------------------------------------------
// finalizeDialogue
// ---------------------------------------------------------------------------

describe("finalizeDialogue", () => {
  it("returns status ready + overallScore + dimensions + betreuerText", async () => {
    invokeFnMock.mockResolvedValueOnce(FINALIZE_RESULT_FIXTURE);
    const result = await finalizeDialogue("sess-abc");
    expect(result.status).toBe("ready");
    expect(result.overallScore).toBe(14);
    expect(result.band).toBe("solide");
    expect(result.betreuerText).toBe("Tu as bien réussi !");
    const dim = result.dimensions[0];
    if (!dim) throw new Error("expected one dimension");
    expect(dim.nativeLabel).toBe("Aufgabenerfüllung");
  });

  it("takes a bare sessionId param but sends body { sessionId } only", async () => {
    invokeFnMock.mockResolvedValueOnce(FINALIZE_RESULT_FIXTURE);
    await finalizeDialogue("sess-abc");
    expect(invokeFnMock).toHaveBeenCalledWith("sprechen-dialogue-finalize", {
      method: "POST",
      body: { sessionId: "sess-abc" },
    });
  });

  it("throws Error(serverCode) on an ApiError", async () => {
    invokeFnMock.mockRejectedValueOnce(new ApiErrorCtor(409, "session_not_active"));
    await expect(finalizeDialogue("sess-abc")).rejects.toThrow("session_not_active");
  });
});

// ---------------------------------------------------------------------------
// reserveStudentTurnUpload
// ---------------------------------------------------------------------------

describe("reserveStudentTurnUpload", () => {
  it("builds the exact storage path the server expects, with upsert:true", async () => {
    mockCreateSignedUploadUrl.mockResolvedValueOnce({
      data: { signedUrl: "https://put.example/abc" },
      error: null,
    });
    const r = await reserveStudentTurnUpload({
      userId: "user-123",
      sessionId: "sess-1",
      turnIndex: 1,
    });
    expect(r.storagePath).toBe("user-123/dialogue/sess-1/1-student.wav");
    expect(r.signedUploadUrl).toBe("https://put.example/abc");
    expect(mockStorageFrom).toHaveBeenCalledWith("user-speech");
    expect(mockCreateSignedUploadUrl).toHaveBeenCalledWith(
      "user-123/dialogue/sess-1/1-student.wav",
      {
        upsert: true,
      }
    );
  });

  it("throws signed_upload_failed on a storage error", async () => {
    mockCreateSignedUploadUrl.mockResolvedValueOnce({
      data: null,
      error: { message: "not_authorized" },
    });
    await expect(
      reserveStudentTurnUpload({ userId: "user-123", sessionId: "sess-1", turnIndex: 0 })
    ).rejects.toThrow("not_authorized");
  });
});

// ---------------------------------------------------------------------------
// putStudentAudio
// ---------------------------------------------------------------------------

describe("putStudentAudio", () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    global.fetch = vi.fn();
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it("PUTs the blob with the exact content-type header passed in", async () => {
    const fetchMock = global.fetch as ReturnType<typeof vi.fn>;
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 200 }));
    const blob = new Blob(["audio-bytes"], { type: "audio/webm;codecs=opus" });

    await putStudentAudio("https://storage.example/put-url", blob, "audio/webm;codecs=opus");

    expect(fetchMock).toHaveBeenCalledWith("https://storage.example/put-url", {
      method: "PUT",
      headers: { "content-type": "audio/webm;codecs=opus" },
      body: blob,
    });
  });

  it("throws audio_put_failed_<status> on a non-ok response", async () => {
    const fetchMock = global.fetch as ReturnType<typeof vi.fn>;
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 403 }));
    const blob = new Blob(["x"], { type: "audio/wav" });
    await expect(
      putStudentAudio("https://storage.example/put-url", blob, "audio/wav")
    ).rejects.toThrow("audio_put_failed_403");
  });
});

// ---------------------------------------------------------------------------
// facade re-exports (examApi) — Constraint 15
// ---------------------------------------------------------------------------

describe("facade re-exports (examApi)", () => {
  it("resolves the dialogue wire functions from the facade — identical references", () => {
    expect(examApi.listDialogueTeile).toBe(listDialogueTeile);
    expect(examApi.startDialogue).toBe(startDialogue);
    expect(examApi.sendDialogueTurn).toBe(sendDialogueTurn);
    expect(examApi.finalizeDialogue).toBe(finalizeDialogue);
    expect(examApi.reserveStudentTurnUpload).toBe(reserveStudentTurnUpload);
    expect(examApi.putStudentAudio).toBe(putStudentAudio);
  });

  it("type-level: dialogue types resolve through the facade (compile-time; npm run typecheck enforces this)", () => {
    const result: DialogueResult = FINALIZE_RESULT_FIXTURE;
    expect(result.status).toBe("ready");
  });
});
