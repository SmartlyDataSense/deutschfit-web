/**
 * `DialogueTeilPickerScreen` / `DialogueSessionScreen` / `DialogueFeedbackScreen`
 * — S7 · Task 7.11.
 *
 * Every native/browser dependency is injected through each screen's test
 * seams (`sessionDeps` / `recorderFactory` / `replayFactory` on the session
 * screen) rather than mocked at the module level — same idiom as
 * `learner-sprechen-session.test.tsx` and `learner-dialogue-session-hook.test.ts`.
 * `listDialogueTeile` (picker only) and `hydrateExamContext` are partial-mocked
 * on the facade — same idiom as `learner-sprechen-topic-picker.test.tsx`
 * (Constraint 15: feature code imports wire fns ONLY from the `examApi`
 * facade, so that facade is the correct mock seam for the picker's fetch).
 *
 * No live-backend calls anywhere in this file, no dialogue calls outside
 * this file (Constraint 7).
 */
import { StrictMode } from "react";
import { I18nextProvider } from "react-i18next";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactElement } from "react";

// `vi.hoisted` — `vi.mock` factories are hoisted above the rest of the
// module, so any mock fn they reference must be built via `vi.hoisted`
// (same TDZ rationale as `learner-sprechen-topic-picker.test.tsx`).
const {
  pushMock,
  replaceMock,
  listDialogueTeileMock,
  hydrateExamContextMock,
  useDialogueSessionOverride,
} = vi.hoisted(() => ({
  pushMock: vi.fn(),
  replaceMock: vi.fn(),
  listDialogueTeileMock: vi.fn(),
  hydrateExamContextMock: vi.fn(),
  // Step-3 (S7-7.11) BUSY_PHASES gate pin — a settable escape hatch so one
  // dedicated describe block can force `useDialogueSession`'s return value
  // to an arbitrary phase without disturbing every other test in this file,
  // which all drive the REAL hook through `sessionDeps`.
  useDialogueSessionOverride: { current: null as ((deps?: unknown) => unknown) | null },
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock, replace: replaceMock }),
}));
vi.mock("next-intl", () => ({ useLocale: () => "fr" }));

// Constraint 15 — feature code imports wire fns only from the `examApi`
// facade. Partial mock: keep every real export except `listDialogueTeile`,
// the picker's only network call.
vi.mock("@/learner/core/api/examApi", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/learner/core/api/examApi")>();
  return { ...actual, listDialogueTeile: listDialogueTeileMock };
});

// Partial mock: keep the real `useExamContextStore` (driven directly via
// `setState`) but stub `hydrateExamContext` so the picker's self-hydrate
// mount effect doesn't hit real localStorage/Supabase in jsdom.
vi.mock("@/learner/core/exam/examContext", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/learner/core/exam/examContext")>();
  return { ...actual, hydrateExamContext: hydrateExamContextMock };
});

// Partial mock: keep the real `useDialogueSession` for every test in this
// file EXCEPT the BUSY_PHASES gate describe block below, which flips
// `useDialogueSessionOverride.current` to force an arbitrary phase.
vi.mock("@/learner/sprechen/dialogue/hooks/useDialogueSession", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@/learner/sprechen/dialogue/hooks/useDialogueSession")>();
  return {
    ...actual,
    useDialogueSession: (...args: [deps?: unknown]) =>
      useDialogueSessionOverride.current
        ? useDialogueSessionOverride.current(...args)
        : actual.useDialogueSession(...(args as Parameters<typeof actual.useDialogueSession>)),
  };
});

import { useExamContextStore } from "@/learner/core/exam/examContext";
import { useLearnerSession } from "@/learner/core/auth/useLearnerSession";
import { initLearnerI18n } from "@/learner/core/i18n";
import type {
  DialogueResult,
  DialogueStartResult,
  DialogueTeilConfig,
  DialogueTurnResult,
} from "@/learner/core/api/examApi";
import {
  INITIAL_DIALOGUE_STATE,
  type DialogueDeps,
  type UseDialogueSessionApi,
} from "@/learner/sprechen/dialogue/hooks/useDialogueSession";
import type { NativePlayer } from "@/learner/sprechen/hooks/useAudioReplay";
import type { NativeRecorder } from "@/learner/sprechen/hooks/useRecorder";
import { useDialogueResult } from "@/learner/sprechen/dialogue/resultStore";
import { DialogueFeedbackScreen } from "@/learner/sprechen/dialogue/screens/DialogueFeedbackScreen";
import {
  BUSY_PHASES,
  DialogueSessionScreen,
} from "@/learner/sprechen/dialogue/screens/DialogueSessionScreen";
import { DialogueTeilPickerScreen } from "@/learner/sprechen/dialogue/screens/DialogueTeilPickerScreen";
import { renderWithI18n } from "./helpers/renderWithI18n";

// ---------------------------------------------------------------------------
// Shared fixtures
// ---------------------------------------------------------------------------

function teilConfig(overrides: Partial<DialogueTeilConfig> = {}): DialogueTeilConfig {
  return {
    dialogueTeilKey: "telc_b1_teil_3",
    teil: "teil_3",
    taskType: "planen",
    nativeLabel: "Gemeinsam etwas planen",
    taskInstructionsDe: "Planen Sie gemeinsam einen Ausflug.",
    moves: [],
    turnMin: 4,
    turnMax: 8,
    budgetSec: 180,
    themes: [{ slug: "ausflug", titleDe: "Ein Ausflug", materialsDe: "" }],
    displayOrder: 1,
    ...overrides,
  };
}

const startResult: DialogueStartResult = {
  sessionId: "sess-1",
  dialogueTeilKey: "telc_b1_teil_3",
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

/** B1 fixture: three board-blind keys collapse onto the SAME `nativeLabel`
 *  ("Formale Richtigkeit") — the third (aussprache) entry is inert (empty
 *  justification) and must be dropped, not rendered as a third row. */
const b1FeedbackResult: DialogueResult = {
  sessionId: "sess-1",
  status: "ready",
  overallScore: 74,
  band: "solide",
  resultKind: "entrainement",
  summaryFr: "Bien construit dans l'ensemble.",
  dimensions: [
    { nativeLabel: "Inhaltliche Bewältigung", score: 4, justificationFr: "Contenu pertinent." },
    { nativeLabel: "Formale Richtigkeit", score: 3, justificationFr: "Peu d'erreurs." },
    { nativeLabel: "Formale Richtigkeit", score: 3, justificationFr: "Vocabulaire adapté." },
    { nativeLabel: "Formale Richtigkeit", score: 0, justificationFr: "" },
  ],
  prueferText: "Gut gemacht, weiter so.",
  betreuerText: "Continue comme ça.",
};

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

/** Fake `NativeRecorder` — never touches MediaRecorder/getUserMedia. */
function makeFakeRecorder(overrides: Partial<NativeRecorder> = {}): NativeRecorder {
  return {
    requestPermissions: vi.fn().mockResolvedValue({ granted: true }),
    startRecording: vi.fn().mockResolvedValue(undefined),
    stopRecording: vi.fn().mockResolvedValue({ uri: "blob:recorded-uri", durationMs: 4_000 }),
    pollStatus: vi.fn().mockReturnValue({ durationMs: 0, metering: -10 }),
    ...overrides,
  };
}

/** Fake `NativePlayer` — never touches `HTMLAudioElement`. */
function makeFakeReplay(overrides: Partial<NativePlayer> = {}): NativePlayer {
  return {
    load: vi.fn(),
    play: vi.fn(),
    pause: vi.fn(),
    pollStatus: vi.fn().mockReturnValue(null),
    release: vi.fn(),
    ...overrides,
  };
}

/** Controllable promise so a test can drive a busy phase deterministically
 *  without real timers (mirrors `learner-dialogue-session-hook.test.ts`). */
function deferred<T>(): {
  promise: Promise<T>;
  resolve: (value: T) => void;
} {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

/** Renders under `StrictMode` — used only by the picker's guard-removal test. */
function renderStrict(ui: ReactElement) {
  const instance = initLearnerI18n("fr");
  return render(
    <I18nextProvider i18n={instance}>
      <StrictMode>{ui}</StrictMode>
    </I18nextProvider>
  );
}

function renderSessionScreen(
  props: {
    teil?: string;
    themeId?: string;
    sessionDeps?: Partial<DialogueDeps>;
    recorderFactory?: () => NativeRecorder | null;
    replayFactory?: () => NativePlayer | null;
  } = {},
  { strict = false }: { strict?: boolean } = {}
) {
  const ui = (
    <DialogueSessionScreen
      teil={props.teil ?? "teil_3"}
      themeId={props.themeId}
      sessionDeps={props.sessionDeps}
      recorderFactory={props.recorderFactory ?? (() => makeFakeRecorder())}
      replayFactory={props.replayFactory ?? (() => makeFakeReplay())}
    />
  );
  return renderWithI18n(strict ? <StrictMode>{ui}</StrictMode> : ui);
}

beforeEach(() => {
  pushMock.mockReset();
  replaceMock.mockReset();
  listDialogueTeileMock.mockReset();
  hydrateExamContextMock.mockReset();
  useExamContextStore.setState({ board: "telc", level: "b1", isLoaded: true } as never);
  useLearnerSession.setState({
    session: { user: { id: "user-1" } } as never,
    status: "authenticated",
  } as never);
  useDialogueResult.getState().clear();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

// ---------------------------------------------------------------------------
// DialogueTeilPickerScreen
// ---------------------------------------------------------------------------

describe("DialogueTeilPickerScreen (S7 Task 7.11)", () => {
  it("renders teile cards with nativeLabel + task-type copy + theme line, and NO numeric budget/turn text (F-3 board-blind rule)", async () => {
    listDialogueTeileMock.mockResolvedValue([teilConfig()]);
    renderWithI18n(<DialogueTeilPickerScreen />);

    await waitFor(() =>
      expect(screen.getByTestId("dialogue-teil-card-teil_3")).toBeInTheDocument()
    );
    const card = screen.getByTestId("dialogue-teil-card-teil_3");
    expect(card.textContent).toContain("Gemeinsam etwas planen");
    expect(card.textContent).toContain(
      "Organisez un projet commun et prenez vos décisions ensemble."
    );
    expect(card.textContent).toContain("Ein Ausflug");

    // F-3: no board branding, no numeric budgets/turn counts on the card.
    expect(card.textContent).not.toContain("telc");
    expect(card.textContent).not.toContain("B1");
    expect(card.textContent).not.toMatch(/180/);
    expect(card.textContent).not.toMatch(/\b4\b/);
    expect(card.textContent).not.toMatch(/\b8\b/);
  });

  it("shows the empty state when listDialogueTeile returns no rows", async () => {
    listDialogueTeileMock.mockResolvedValue([]);
    renderWithI18n(<DialogueTeilPickerScreen />);

    await waitFor(() =>
      expect(screen.getByTestId("dialogue-teil-picker-empty")).toBeInTheDocument()
    );
  });

  it("fetch failure renders the error state with a retry that re-fires the fetch", async () => {
    listDialogueTeileMock.mockRejectedValueOnce(new Error("network_down"));
    renderWithI18n(<DialogueTeilPickerScreen />);

    await waitFor(() =>
      expect(screen.getByTestId("dialogue-teil-picker-error")).toBeInTheDocument()
    );

    listDialogueTeileMock.mockResolvedValueOnce([teilConfig()]);
    fireEvent.click(screen.getByTestId("dialogue-teil-picker-retry"));

    await waitFor(() =>
      expect(screen.getByTestId("dialogue-teil-card-teil_3")).toBeInTheDocument()
    );
    expect(listDialogueTeileMock).toHaveBeenCalledTimes(2);
  });

  it("card select routes to the session route with teil + first-theme query params", async () => {
    listDialogueTeileMock.mockResolvedValue([teilConfig()]);
    renderWithI18n(<DialogueTeilPickerScreen />);

    await waitFor(() =>
      expect(screen.getByTestId("dialogue-teil-card-teil_3")).toBeInTheDocument()
    );
    fireEvent.click(screen.getByTestId("dialogue-teil-card-teil_3"));

    expect(pushMock).toHaveBeenCalledWith(
      "/fr/app/sprechen/dialogue/session?teil=teil_3&themeId=ausflug"
    );
  });

  it("hydration gate: listDialogueTeile fires only once after exam-context isLoaded flips true (guard-removal-verified) — StrictMode double-invoke + deep-link/hard-refresh reproduction", async () => {
    listDialogueTeileMock.mockResolvedValue([teilConfig()]);
    // Reproduces a hard refresh / deep-link straight onto this route: the
    // store still holds the un-hydrated default and `isLoaded: false`.
    useExamContextStore.setState({ board: "telc", level: "b1", isLoaded: false } as never);

    renderStrict(<DialogueTeilPickerScreen />);

    await waitFor(() => expect(hydrateExamContextMock).toHaveBeenCalled());
    // Give any (incorrect) unconditional fetch — including a StrictMode
    // double-invoke of the mount-time effect — a chance to fire before
    // asserting it did not.
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(listDialogueTeileMock).not.toHaveBeenCalled();
    expect(screen.getByTestId("dialogue-teil-picker-loading")).toBeInTheDocument();

    // Hydration lands — NOW the fetch may run. This is a normal
    // (non-double-invoked) re-render, not the initial StrictMode mount.
    act(() => {
      useExamContextStore.setState({ board: "telc", level: "b1", isLoaded: true } as never);
    });

    await waitFor(() =>
      expect(screen.getByTestId("dialogue-teil-card-teil_3")).toBeInTheDocument()
    );
    expect(listDialogueTeileMock).toHaveBeenCalledTimes(1);
    // Web delta — level casing: the store's `level` is lower-case; the wire
    // call must upper-case it.
    expect(listDialogueTeileMock).toHaveBeenCalledWith({ board: "telc", level: "B1" });
  });
});

// ---------------------------------------------------------------------------
// DialogueSessionScreen
// ---------------------------------------------------------------------------

describe("DialogueSessionScreen (S7 Task 7.11)", () => {
  it("boots by calling start() with the board/level (upper-cased) + teil + themeId; boot failure renders the in-screen retry error state, and retry re-calls start", async () => {
    const startDialogue = vi
      .fn()
      .mockRejectedValueOnce(new Error("start_failed"))
      .mockResolvedValueOnce(startResult);
    const deps = makeDeps({ startDialogue });

    renderSessionScreen({ themeId: "ausflug", sessionDeps: deps });

    await waitFor(() =>
      expect(screen.getByTestId("dialogue-session-start-error")).toBeInTheDocument()
    );
    expect(startDialogue).toHaveBeenCalledTimes(1);
    expect(startDialogue).toHaveBeenCalledWith({
      board: "telc",
      level: "B1",
      teil: "teil_3",
      themeId: "ausflug",
    });

    fireEvent.click(screen.getByTestId("dialogue-session-start-error-retry"));

    await waitFor(() =>
      expect(screen.queryByTestId("dialogue-session-start-error")).not.toBeInTheDocument()
    );
    expect(startDialogue).toHaveBeenCalledTimes(2);
  });

  it("record toggle is disabled while the session phase is 'uploading' (BUSY_PHASES gate)", async () => {
    const reserveGate = deferred<{ signedUploadUrl: string; storagePath: string }>();
    const deps = makeDeps({
      reserveStudentTurnUpload: vi.fn().mockReturnValue(reserveGate.promise),
    });
    const fakeRecorder = makeFakeRecorder();

    renderSessionScreen({ sessionDeps: deps, recorderFactory: () => fakeRecorder });

    await waitFor(() =>
      expect(screen.getByTestId("dialogue-session-record-toggle")).not.toBeDisabled()
    );

    // Start recording.
    fireEvent.click(screen.getByTestId("dialogue-session-record-toggle"));
    await waitFor(() => expect(fakeRecorder.startRecording).toHaveBeenCalledTimes(1));
    await waitFor(() =>
      expect(screen.getByTestId("dialogue-session-record-toggle").textContent).toContain("Arrêter")
    );

    // Stop -> submitStudentTurn -> RECORDING_STARTED/UPLOAD_STARTED dispatch
    // synchronously, before `reserveStudentTurnUpload` (gated) resolves —
    // the toggle must be disabled for the whole in-flight upload window.
    fireEvent.click(screen.getByTestId("dialogue-session-record-toggle"));

    await waitFor(() =>
      expect(screen.getByTestId("dialogue-session-record-toggle")).toBeDisabled()
    );

    reserveGate.resolve({ signedUploadUrl: "https://signed.example/put", storagePath: "p" });
  });

  it("auto-finalize calls deps.finalizeDialogue exactly once when mustFinalize lands while awaiting_student (StrictMode guard-removal-verified)", async () => {
    const finalizeDialogue = vi.fn().mockResolvedValue(graderResult);
    const sendDialogueTurn = vi
      .fn()
      .mockResolvedValue(turnResult(4, { mustFinalize: true, canFinalize: true }));
    const deps = makeDeps({ sendDialogueTurn, finalizeDialogue });
    const fakeRecorder = makeFakeRecorder();

    renderSessionScreen(
      { sessionDeps: deps, recorderFactory: () => fakeRecorder },
      { strict: true }
    );

    await waitFor(() =>
      expect(screen.getByTestId("dialogue-session-record-toggle")).not.toBeDisabled()
    );
    fireEvent.click(screen.getByTestId("dialogue-session-record-toggle"));
    await waitFor(() => expect(fakeRecorder.startRecording).toHaveBeenCalledTimes(1));
    fireEvent.click(screen.getByTestId("dialogue-session-record-toggle"));

    await waitFor(() => expect(finalizeDialogue).toHaveBeenCalledTimes(1));
    // Give StrictMode's synchronous double-invoke of the auto-finalize
    // effect (mustFinalizeRef guard) a chance to double-fire before
    // asserting it did not.
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(finalizeDialogue).toHaveBeenCalledTimes(1);
  });

  it("graded phase seeds the result store and replaces to the feedback route exactly once (notifiedRef, StrictMode guard-removal-verified)", async () => {
    const finalizeDialogue = vi.fn().mockResolvedValue(graderResult);
    const sendDialogueTurn = vi
      .fn()
      .mockResolvedValue(turnResult(4, { mustFinalize: true, canFinalize: true }));
    const deps = makeDeps({ sendDialogueTurn, finalizeDialogue });
    const fakeRecorder = makeFakeRecorder();

    renderSessionScreen(
      { sessionDeps: deps, recorderFactory: () => fakeRecorder },
      { strict: true }
    );

    await waitFor(() =>
      expect(screen.getByTestId("dialogue-session-record-toggle")).not.toBeDisabled()
    );
    fireEvent.click(screen.getByTestId("dialogue-session-record-toggle"));
    await waitFor(() => expect(fakeRecorder.startRecording).toHaveBeenCalledTimes(1));
    fireEvent.click(screen.getByTestId("dialogue-session-record-toggle"));

    await waitFor(() =>
      expect(replaceMock).toHaveBeenCalledWith("/fr/app/sprechen/dialogue/feedback")
    );
    expect(replaceMock).toHaveBeenCalledTimes(1);
    expect(useDialogueResult.getState().result).toEqual(graderResult);

    // Give StrictMode's synchronous double-invoke of the graded effect
    // (notifiedRef guard) a chance to double-fire before asserting it did
    // not push a second replace.
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(replaceMock).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------------
// DialogueSessionScreen — BUSY_PHASES gate (Step 3 / S7-7.11 regression pin)
//
// Iterates the module's REAL exported `BUSY_PHASES` set (not a copy — a
// hand-copied list would diverge silently the next time a phase is added
// to/removed from the set) via a controllable `useDialogueSession` stub,
// so each phase can be asserted in isolation without driving the full
// async start/record/upload/finalize flow through every one of them.
// ---------------------------------------------------------------------------

describe("DialogueSessionScreen — BUSY_PHASES gate (S7 Task 7.11, Step 3)", () => {
  afterEach(() => {
    useDialogueSessionOverride.current = null;
  });

  function stubSession(phase: (typeof INITIAL_DIALOGUE_STATE)["phase"]): UseDialogueSessionApi {
    return {
      ...INITIAL_DIALOGUE_STATE,
      phase,
      start: vi.fn().mockResolvedValue(undefined),
      submitStudentTurn: vi.fn().mockResolvedValue(undefined),
      finalize: vi.fn().mockResolvedValue(undefined),
      markPartnerAudioConsumed: vi.fn(),
      reset: vi.fn(),
    };
  }

  it.each([...BUSY_PHASES])("record toggle is disabled while phase is '%s'", async (phase) => {
    useDialogueSessionOverride.current = () => stubSession(phase);

    renderSessionScreen();

    await waitFor(() =>
      expect(screen.getByTestId("dialogue-session-record-toggle")).toBeDisabled()
    );
  });

  it("control: 'awaiting_student' is NOT a member of BUSY_PHASES and leaves the toggle enabled", async () => {
    expect(BUSY_PHASES.has("awaiting_student")).toBe(false);
    useDialogueSessionOverride.current = () => stubSession("awaiting_student");

    renderSessionScreen();

    await waitFor(() =>
      expect(screen.getByTestId("dialogue-session-record-toggle")).not.toBeDisabled()
    );
  });
});

// ---------------------------------------------------------------------------
// DialogueFeedbackScreen
// ---------------------------------------------------------------------------

describe("DialogueFeedbackScreen (S7 Task 7.11)", () => {
  it("groups B1 dimensions by nativeLabel, drops the inert empty-justification entry, and merges justifications into one row", async () => {
    useDialogueResult.setState({ result: b1FeedbackResult });
    renderWithI18n(<DialogueFeedbackScreen />);

    await waitFor(() => expect(screen.getByTestId("dialogue-feedback-graded")).toBeInTheDocument());

    // Two surviving criterion rows: "Inhaltliche Bewältigung" (index 0) and
    // the merged "Formale Richtigkeit" (index 1) — the inert aussprache
    // entry (empty justificationFr) contributes no third row.
    expect(screen.getByTestId("dialogue-feedback-criterion-0").textContent).toContain(
      "Inhaltliche Bewältigung"
    );
    const merged = screen.getByTestId("dialogue-feedback-criterion-1");
    expect(merged.textContent).toContain("Formale Richtigkeit");
    expect(merged.textContent).toContain("Peu d'erreurs.");
    expect(merged.textContent).toContain("Vocabulaire adapté.");
    expect(screen.queryByTestId("dialogue-feedback-criterion-2")).not.toBeInTheDocument();
  });

  it("renders the practice score as the ONLY number on the page (telc per-Teil lock — per-criterion scores never rendered)", async () => {
    useDialogueResult.setState({ result: b1FeedbackResult });
    renderWithI18n(<DialogueFeedbackScreen />);

    await waitFor(() => expect(screen.getByTestId("dialogue-feedback-graded")).toBeInTheDocument());

    expect(screen.getByTestId("dialogue-feedback-practice-score").textContent).toBe(
      "Score de préparation : 74 / 100"
    );

    const rootEl = screen.getByTestId("dialogue-feedback-screen");
    const occurrences = (rootEl.textContent ?? "").match(/\/\s*100/g) ?? [];
    // The ONLY "/ 100" occurrence on the whole page is the practice-score
    // line — per-criterion numeric scores are never rendered anywhere.
    expect(occurrences).toHaveLength(1);
  });

  it("a null result (cold refresh / deep link / already-cleared store) redirects to the Teil picker instead of rendering (P11)", async () => {
    useDialogueResult.setState({ result: null });
    renderWithI18n(<DialogueFeedbackScreen />);

    await waitFor(() => expect(replaceMock).toHaveBeenCalledWith("/fr/app/sprechen/dialogue"));
    expect(screen.queryByTestId("dialogue-feedback-screen")).not.toBeInTheDocument();
  });

  it("retake clears the result store and routes back to the Teil picker", async () => {
    useDialogueResult.setState({ result: b1FeedbackResult });
    renderWithI18n(<DialogueFeedbackScreen />);

    await waitFor(() => expect(screen.getByTestId("dialogue-feedback-retake")).toBeInTheDocument());
    fireEvent.click(screen.getByTestId("dialogue-feedback-retake"));

    expect(useDialogueResult.getState().result).toBeNull();
    expect(replaceMock).toHaveBeenCalledWith("/fr/app/sprechen/dialogue");
  });

  it("done clears the result store and routes to /app", async () => {
    useDialogueResult.setState({ result: b1FeedbackResult });
    renderWithI18n(<DialogueFeedbackScreen />);

    await waitFor(() => expect(screen.getByTestId("dialogue-feedback-done")).toBeInTheDocument());
    fireEvent.click(screen.getByTestId("dialogue-feedback-done"));

    expect(useDialogueResult.getState().result).toBeNull();
    expect(replaceMock).toHaveBeenCalledWith("/fr/app");
  });
});
