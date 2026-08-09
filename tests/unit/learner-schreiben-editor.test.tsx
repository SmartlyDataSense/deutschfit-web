import { act, cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// `vi.hoisted` — `vi.mock` factories are hoisted above the rest of the
// module, so any mock fn/state they reference must be built here, not a
// plain top-level `const` (same TDZ rationale as the other S6 screen
// tests, e.g. `learner-schreiben-custom-prompt.test.tsx`).
const {
  pushMock,
  replaceMock,
  hydrateMock,
  listPromptsMock,
  submitWritingMock,
  logSubmitErrorMock,
  markSubmissionInFlightMock,
  trackEventMock,
} = vi.hoisted(() => ({
  pushMock: vi.fn(),
  replaceMock: vi.fn(),
  hydrateMock: vi.fn(),
  listPromptsMock: vi.fn(),
  submitWritingMock: vi.fn(),
  logSubmitErrorMock: vi.fn(),
  markSubmissionInFlightMock: vi.fn(),
  trackEventMock: vi.fn(),
}));

// Constraint 15: feature code imports wire fns ONLY from the `examApi`
// facade — mock that surface, not the lower-level `./writing` module.
vi.mock("@/learner/core/api/examApi", () => ({
  listPrompts: (...args: unknown[]) => listPromptsMock(...args),
  submitWriting: (...args: unknown[]) => submitWritingMock(...args),
  logSubmitError: (...args: unknown[]) => logSubmitErrorMock(...args),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock, replace: replaceMock }),
}));
vi.mock("next-intl", () => ({ useLocale: () => "fr" }));
// Partial mock: keep the real `useExamContextStore` (tests drive it
// directly via `setState`) but stub `hydrateExamContext` so the screen's
// self-hydrate mount effect doesn't hit real localStorage/Supabase in
// jsdom — same idiom as `PromptListScreen`/`CustomPromptScreen` tests.
vi.mock("@/learner/core/exam/examContext", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/learner/core/exam/examContext")>();
  return { ...actual, hydrateExamContext: hydrateMock };
});
vi.mock("@/learner/core/readiness", () => ({
  markSubmissionInFlight: (...args: unknown[]) => markSubmissionInFlightMock(...args),
}));
vi.mock("@/learner/core/analytics/posthog", () => ({
  trackEvent: (...args: unknown[]) => trackEventMock(...args),
}));

import { useExamContextStore } from "@/learner/core/exam/examContext";
import { useLearnerSession } from "@/learner/core/auth/useLearnerSession";
import { __resetLearnerDbForTests } from "@/learner/core/db";
import { SchreibenEditorScreen } from "@/learner/schreiben/screens/SchreibenEditorScreen";
import { renderWithI18n } from "./helpers/renderWithI18n";

type FakeSession = { user: { id: string } };

function setSession(userId: string | null): void {
  const session = (userId ? { user: { id: userId } } : null) as FakeSession | null;
  useLearnerSession.setState({
    session: session as never,
    status: userId ? "authenticated" : "unauthenticated",
  });
}

/** Manually-resolved promise — lets a test hold `submitWriting` pending so
 * it can assert on state *while* a submit is in flight. */
function createDeferred<T>(): {
  promise: Promise<T>;
  resolve: (value: T) => void;
} {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

function samplePrompt() {
  return {
    id: "p1",
    exam_board: "goethe-b1",
    teil: 2,
    slug: "p1-slug",
    title_de: "Eine Einladung",
    situation_de: "Du lädst einen Freund zu deiner Geburtstagsfeier ein.",
    bullet_points: ["Nenne den Grund", "Schlage einen Termin vor"],
    min_words: 5,
    max_words: 8,
  };
}

const WORDS = ["eins", "zwei", "drei", "vier", "fünf", "sechs", "sieben", "acht", "neun"];
function words(n: number): string {
  return WORDS.slice(0, n).join(" ");
}

// `Textarea`'s `testID` lands on the wrapping `<div>`, not the `<textarea>`
// itself (`ui/primitives/Textarea.tsx`) — `fireEvent.change`/`.value`
// need the actual form control, found via `within(...).getByRole`.
function getDraftInput(): HTMLTextAreaElement {
  return within(screen.getByTestId("schreiben-draft-input")).getByRole(
    "textbox"
  ) as HTMLTextAreaElement;
}

async function renderReady() {
  renderWithI18n(<SchreibenEditorScreen promptId="p1" />);
  await waitFor(() => expect(screen.getByTestId("schreiben-editor")).toBeInTheDocument());
}

async function fillAndOpenConfirm(body: string) {
  fireEvent.change(getDraftInput(), { target: { value: body } });
  fireEvent.click(screen.getByTestId("schreiben-submit"));
  await waitFor(() => expect(screen.getByTestId("schreiben-confirm-submit")).toBeInTheDocument());
}

describe("SchreibenEditorScreen — composer (S6 Task 6.8)", () => {
  beforeEach(() => {
    __resetLearnerDbForTests();
    pushMock.mockReset();
    replaceMock.mockReset();
    hydrateMock.mockReset();
    listPromptsMock.mockReset();
    submitWritingMock.mockReset();
    logSubmitErrorMock.mockReset();
    markSubmissionInFlightMock.mockReset();
    trackEventMock.mockReset();
    listPromptsMock.mockResolvedValue([samplePrompt()]);
    setSession("user-a");
    useExamContextStore.setState({ board: "goethe", level: "b1", isLoaded: true } as never);
  });
  afterEach(cleanup);

  it("hydration gate: the fetch fires only after exam-context isLoaded flips true (guard-removal-verified) — deep-link/hard-refresh reproduction", async () => {
    useExamContextStore.setState({ board: "goethe", level: "b1", isLoaded: false } as never);

    renderWithI18n(<SchreibenEditorScreen promptId="p1" />);

    await waitFor(() => expect(hydrateMock).toHaveBeenCalled());
    expect(screen.getByTestId("schreiben-editor-loading")).toBeInTheDocument();
    expect(listPromptsMock).not.toHaveBeenCalled();

    act(() => {
      useExamContextStore.setState({ board: "goethe", level: "b1", isLoaded: true } as never);
    });

    await waitFor(() => expect(listPromptsMock).toHaveBeenCalledWith("goethe", "b1"));
    await waitFor(() => expect(screen.getByTestId("schreiben-editor")).toBeInTheDocument());
  });

  it("missing prompt (fetch succeeds but id absent) renders a not-found error state; back CTA navigates to the prompt list", async () => {
    listPromptsMock.mockResolvedValue([{ ...samplePrompt(), id: "other-id" }]);

    renderWithI18n(<SchreibenEditorScreen promptId="p1" />);

    await waitFor(() =>
      expect(screen.getByTestId("schreiben-editor-not-found")).toBeInTheDocument()
    );
    expect(screen.queryByTestId("schreiben-editor")).not.toBeInTheDocument();

    fireEvent.click(screen.getByText("Retour aux sujets"));
    expect(pushMock).toHaveBeenCalledWith("/fr/app/schreiben");
  });

  it("word gating: below min disables submit + danger colour, in range enables + success colour, above max disables + amber colour", async () => {
    await renderReady();

    const submit = screen.getByTestId("schreiben-submit");
    const input = getDraftInput();
    const countEl = screen.getByTestId("schreiben-word-count");

    // Below min (5) — 2 words.
    fireEvent.change(input, { target: { value: words(2) } });
    expect(submit).toBeDisabled();
    expect(countEl.style.color).toBe("var(--color-warning-red)");

    // In range — 6 words.
    fireEvent.change(input, { target: { value: words(6) } });
    expect(submit).not.toBeDisabled();
    expect(countEl.style.color).toBe("var(--color-success-green)");

    // Above max (8) — 9 words.
    fireEvent.change(input, { target: { value: words(9) } });
    expect(submit).toBeDisabled();
    expect(countEl.style.color).toBe("var(--color-priority-amber)");
  });

  it("word-hint copy (F2) — writing:composer.wordHint.tooShort / .tooLong, gap-count interpolated", async () => {
    await renderReady();
    const input = getDraftInput();

    fireEvent.change(input, { target: { value: words(2) } });
    expect(screen.getByTestId("schreiben-word-hint")).toHaveTextContent(
      "Trop court — il te manque 3 mots."
    );

    fireEvent.change(input, { target: { value: words(9) } });
    expect(screen.getByTestId("schreiben-word-hint")).toHaveTextContent(
      "Trop long — réduis de 1 mots."
    );

    fireEvent.change(input, { target: { value: words(6) } });
    expect(screen.queryByTestId("schreiben-word-hint")).not.toBeInTheDocument();
  });

  it("submit tap opens a confirm dialog and does NOT call submitWriting on the first tap", async () => {
    await renderReady();
    await fillAndOpenConfirm(words(6));

    expect(submitWritingMock).not.toHaveBeenCalled();

    fireEvent.click(screen.getByTestId("schreiben-confirm-cancel"));
    expect(screen.queryByTestId("schreiben-confirm-submit")).not.toBeInTheDocument();
    expect(submitWritingMock).not.toHaveBeenCalled();
  });

  it("F8 guard #2 (Web delta, in-flight): rapid double/triple-click on confirm while submitWriting is pending calls it exactly once (guard-removal-verified)", async () => {
    const deferred = createDeferred<{ ok: true; value: { id: string; status: string } }>();
    submitWritingMock.mockReturnValue(deferred.promise);

    await renderReady();
    await fillAndOpenConfirm(words(6));

    const confirmButton = screen.getByTestId("schreiben-confirm-confirm");
    // All three clicks inside one `act()` — defers the `disabled`-attribute
    // flush to the end of the block, so all three handler invocations run
    // their synchronous prefix (including the `inFlightRef` check) against
    // the same not-yet-disabled render, genuinely isolating the ref guard
    // from the DOM. Removing the `inFlightRef` guard makes this fail
    // (3 calls instead of 1) — that's the "guard-removal-verified" check.
    act(() => {
      fireEvent.click(confirmButton);
      fireEvent.click(confirmButton);
      fireEvent.click(confirmButton);
    });

    expect(submitWritingMock).toHaveBeenCalledTimes(1);

    await act(async () => {
      deferred.resolve({ ok: true, value: { id: "sub-1", status: "pending" } });
      await deferred.promise;
    });

    expect(submitWritingMock).toHaveBeenCalledTimes(1);
  });

  it("ok-path: clears the draft, marks the submission in-flight, emits writing_draft_submitted, redirects to ?submitted=1", async () => {
    submitWritingMock.mockResolvedValue({ ok: true, value: { id: "sub-1", status: "pending" } });

    await renderReady();
    await fillAndOpenConfirm(words(6));

    fireEvent.click(screen.getByTestId("schreiben-confirm-confirm"));

    await waitFor(() => expect(replaceMock).toHaveBeenCalledWith("/fr/app/schreiben?submitted=1"));

    expect(submitWritingMock).toHaveBeenCalledWith({ promptId: "p1", bodyDe: words(6) });
    expect(markSubmissionInFlightMock).toHaveBeenCalledWith("sub-1", "schreiben");
    expect(trackEventMock).toHaveBeenCalledWith("writing_draft_submitted", {
      prompt_id: "p1",
      word_count: 6,
      action: "submitted-optimistic",
    });
    expect(getDraftInput()).toHaveValue("");
  });

  it("too_short: flat writing:composer.errors.tooShort, server-provided min interpolated when present", async () => {
    submitWritingMock.mockResolvedValue({ ok: false, error: { kind: "too_short", min: 12 } });

    await renderReady();
    await fillAndOpenConfirm(words(6));
    fireEvent.click(screen.getByTestId("schreiben-confirm-confirm"));

    await waitFor(() =>
      expect(screen.getByTestId("schreiben-error-too_short")).toBeInTheDocument()
    );
    expect(screen.getByTestId("schreiben-error-too_short")).toHaveTextContent(
      "Trop court — il faut au moins 12 mots."
    );
    expect(logSubmitErrorMock).toHaveBeenCalledWith({ kind: "too_short", min: 12 });
    expect(replaceMock).not.toHaveBeenCalled();
  });

  it("too_short: falls back to the prompt-local min_words when the server omits the bound", async () => {
    submitWritingMock.mockResolvedValue({ ok: false, error: { kind: "too_short" } });

    await renderReady();
    await fillAndOpenConfirm(words(6));
    fireEvent.click(screen.getByTestId("schreiben-confirm-confirm"));

    await waitFor(() =>
      expect(screen.getByTestId("schreiben-error-too_short")).toBeInTheDocument()
    );
    // samplePrompt().min_words === 5.
    expect(screen.getByTestId("schreiben-error-too_short")).toHaveTextContent(
      "Trop court — il faut au moins 5 mots."
    );
  });

  it("body_language_not_german: renders the open-draft CTA and no retry CTA", async () => {
    submitWritingMock.mockResolvedValue({ ok: false, error: { kind: "body_language_not_german" } });

    await renderReady();
    await fillAndOpenConfirm(words(6));
    fireEvent.click(screen.getByTestId("schreiben-confirm-confirm"));

    await waitFor(() =>
      expect(screen.getByTestId("schreiben-error-body_language_not_german")).toBeInTheDocument()
    );
    expect(screen.getByTestId("schreiben-error-cta-open-draft")).toBeInTheDocument();
    expect(screen.queryByTestId("schreiben-error-cta-retry")).not.toBeInTheDocument();
  });

  it("rate_limit_exceeded: no CTA — P4 (retry_after_seconds is always undefined on web, messageFallback copy)", async () => {
    submitWritingMock.mockResolvedValue({ ok: false, error: { kind: "rate_limit_exceeded" } });

    await renderReady();
    await fillAndOpenConfirm(words(6));
    fireEvent.click(screen.getByTestId("schreiben-confirm-confirm"));

    await waitFor(() =>
      expect(screen.getByTestId("schreiben-error-rate_limit_exceeded")).toBeInTheDocument()
    );
    expect(screen.getByTestId("schreiben-error-rate_limit_exceeded")).toHaveTextContent(
      "Tu as soumis beaucoup d'exercices. Réessaie un peu plus tard."
    );
    expect(screen.queryByTestId("schreiben-error-cta-retry")).not.toBeInTheDocument();
    expect(screen.queryByTestId("schreiben-error-cta-open-draft")).not.toBeInTheDocument();
    expect(screen.queryByTestId("schreiben-error-cta-view")).not.toBeInTheDocument();
  });

  it("typing after a failed submit clears the sticky error banner", async () => {
    submitWritingMock.mockResolvedValue({ ok: false, error: { kind: "network" } });

    await renderReady();
    await fillAndOpenConfirm(words(6));
    fireEvent.click(screen.getByTestId("schreiben-confirm-confirm"));

    await waitFor(() => expect(screen.getByTestId("schreiben-error")).toBeInTheDocument());

    fireEvent.change(getDraftInput(), { target: { value: words(7) } });

    expect(screen.queryByTestId("schreiben-error")).not.toBeInTheDocument();
  });

  it("draft body survives an unmount/remount of the screen (in-memory Dexie-fallback handle)", async () => {
    const { unmount } = renderWithI18n(<SchreibenEditorScreen promptId="p1" />);
    await waitFor(() => expect(screen.getByTestId("schreiben-editor")).toBeInTheDocument());

    fireEvent.change(getDraftInput(), { target: { value: "Liebe Anna," } });

    // Unmount flushes the pending debounced write (useDraft cleanup —
    // Task 6.3), so no fake-timer advance is needed here.
    unmount();
    await act(async () => {
      await Promise.resolve();
    });

    renderWithI18n(<SchreibenEditorScreen promptId="p1" />);
    await waitFor(() => expect(getDraftInput()).toHaveValue("Liebe Anna,"));
  });
});
