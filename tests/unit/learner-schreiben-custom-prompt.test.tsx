import { act, cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// `vi.hoisted` — same TDZ rationale as `learner-schreiben-prompt-list.test.tsx`:
// `vi.mock` factories are hoisted above the rest of the module, so any mock
// fn/state they reference must be built via `vi.hoisted`, not a plain
// top-level `const`.
const { pushMock, replaceMock, backMock, hydrateMock, createPromptMock } = vi.hoisted(() => ({
  pushMock: vi.fn(),
  replaceMock: vi.fn(),
  backMock: vi.fn(),
  hydrateMock: vi.fn(),
  createPromptMock: vi.fn(),
}));

// Feature code imports wire fns ONLY from the `examApi` facade
// (Constraint 15) — mock that surface, not the lower-level `./writing`
// module.
vi.mock("@/learner/core/api/examApi", () => ({
  createPrompt: (...args: unknown[]) => createPromptMock(...args),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock, replace: replaceMock, back: backMock }),
}));
vi.mock("next-intl", () => ({ useLocale: () => "fr" }));
// Partial mock: keep the real `useExamContextStore` (tests drive it
// directly via `setState`) but stub `hydrateExamContext` so the screen's
// self-hydrate mount effect doesn't hit real localStorage/Supabase in
// jsdom — tests control `isLoaded` transitions explicitly instead.
vi.mock("@/learner/core/exam/examContext", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/learner/core/exam/examContext")>();
  return { ...actual, hydrateExamContext: hydrateMock };
});

import { useExamContextStore } from "@/learner/core/exam/examContext";
import { CustomPromptScreen } from "@/learner/schreiben/screens/CustomPromptScreen";
import { renderWithI18n } from "./helpers/renderWithI18n";

/** Manually-resolved promise — lets a test hold `createPrompt` pending so it
 * can assert on state *while* a submit is in flight. */
function createDeferred<T>(): {
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

function samplePrompt() {
  return {
    id: "p1",
    exam_board: "goethe-b1",
    teil: 2,
    slug: "p1-slug",
    title_de: "Eine Einladung",
    situation_de: "",
    bullet_points: [],
    min_words: 80,
    max_words: 100,
  };
}

describe("CustomPromptScreen — community prompt authoring (S6 Task 6.7)", () => {
  beforeEach(() => {
    pushMock.mockReset();
    replaceMock.mockReset();
    backMock.mockReset();
    hydrateMock.mockReset();
    createPromptMock.mockReset();
    useExamContextStore.setState({ board: "goethe", level: "b1", isLoaded: true } as never);
  });
  afterEach(cleanup);

  it("hydration gate: the form is gated behind exam-context isLoaded (deep-link/hard-refresh reproduction)", async () => {
    useExamContextStore.setState({ board: "goethe", level: "b1", isLoaded: false } as never);

    renderWithI18n(<CustomPromptScreen />);

    await waitFor(() => expect(hydrateMock).toHaveBeenCalled());
    expect(screen.getByTestId("schreiben-custom-prompt-loading")).toBeInTheDocument();
    expect(screen.queryByTestId("schreiben-custom-prompt-screen")).not.toBeInTheDocument();

    act(() => {
      useExamContextStore.setState({ board: "goethe", level: "b1", isLoaded: true } as never);
    });

    await waitFor(() =>
      expect(screen.getByTestId("schreiben-custom-prompt-screen")).toBeInTheDocument()
    );
  });

  it("picking a level re-seeds Teil + word-range defaults from LEVEL_DEFAULTS", async () => {
    renderWithI18n(<CustomPromptScreen />);
    await waitFor(() =>
      expect(screen.getByTestId("schreiben-custom-prompt-screen")).toBeInTheDocument()
    );

    // Initial seed: goethe/b1 → teil 2, 80–100.
    expect(screen.getByTestId("schreiben-custom-prompt-teil-2").getAttribute("aria-pressed")).toBe(
      "true"
    );
    expect(screen.getByLabelText("Minimum")).toHaveValue("80");
    expect(screen.getByLabelText("Maximum")).toHaveValue("100");

    // c1 → teil 3, 180–220.
    fireEvent.click(screen.getByTestId("schreiben-custom-prompt-level-c1"));

    expect(
      screen.getByTestId("schreiben-custom-prompt-level-c1").getAttribute("aria-pressed")
    ).toBe("true");
    expect(screen.getByTestId("schreiben-custom-prompt-teil-3").getAttribute("aria-pressed")).toBe(
      "true"
    );
    expect(screen.getByLabelText("Minimum")).toHaveValue("180");
    expect(screen.getByLabelText("Maximum")).toHaveValue("220");
  });

  it("picking a board that doesn't ship the current level clamps to the board's first shipped level and re-seeds defaults", async () => {
    renderWithI18n(<CustomPromptScreen />);
    await waitFor(() =>
      expect(screen.getByTestId("schreiben-custom-prompt-screen")).toBeInTheDocument()
    );

    // goethe/b1 → testdaf ships only [b2, c1] — b1 is stranded, clamps to b2.
    fireEvent.click(screen.getByTestId("schreiben-custom-prompt-board-testdaf"));

    expect(
      screen.getByTestId("schreiben-custom-prompt-board-testdaf").getAttribute("aria-pressed")
    ).toBe("true");
    expect(
      screen.getByTestId("schreiben-custom-prompt-level-b2").getAttribute("aria-pressed")
    ).toBe("true");
    // b2 defaults: teil 2, 120–150.
    expect(screen.getByTestId("schreiben-custom-prompt-teil-2").getAttribute("aria-pressed")).toBe(
      "true"
    );
    expect(screen.getByLabelText("Minimum")).toHaveValue("120");
    expect(screen.getByLabelText("Maximum")).toHaveValue("150");
  });

  it("empty title, title >200 chars, and max<min each disable submit; a valid form re-enables it", async () => {
    renderWithI18n(<CustomPromptScreen />);
    await waitFor(() =>
      expect(screen.getByTestId("schreiben-custom-prompt-screen")).toBeInTheDocument()
    );

    const submit = screen.getByTestId("schreiben-custom-prompt-submit");
    // Empty title (nothing typed yet) → disabled.
    expect(submit).toBeDisabled();

    fireEvent.change(screen.getByPlaceholderText("Ex. : Une invitation à un anniversaire"), {
      target: { value: "Eine Einladung" },
    });
    // Valid title + valid seeded defaults → enabled.
    expect(submit).not.toBeDisabled();

    // Title >200 chars → disabled again.
    fireEvent.change(screen.getByPlaceholderText("Ex. : Une invitation à un anniversaire"), {
      target: { value: "a".repeat(201) },
    });
    expect(submit).toBeDisabled();

    // Restore a valid title, then break the range (max < min) → disabled.
    fireEvent.change(screen.getByPlaceholderText("Ex. : Une invitation à un anniversaire"), {
      target: { value: "Eine Einladung" },
    });
    expect(submit).not.toBeDisabled();

    fireEvent.change(screen.getByLabelText("Maximum"), { target: { value: "10" } });
    expect(submit).toBeDisabled();

    fireEvent.change(screen.getByLabelText("Maximum"), { target: { value: "100" } });
    expect(submit).not.toBeDisabled();
  });

  it("successful submit calls createPrompt with the board-composed payload and the ACTIVE exam context for invalidation, then navigates to /schreiben?created=1", async () => {
    // Active context (telc/b1) differs from the board/level chips the
    // learner picks below (goethe/b2) — the second `createPrompt` argument
    // must reflect the ACTIVE context, not the form selection (F6).
    useExamContextStore.setState({ board: "telc", level: "b1", isLoaded: true } as never);
    createPromptMock.mockResolvedValue(samplePrompt());

    renderWithI18n(<CustomPromptScreen />);
    await waitFor(() =>
      expect(screen.getByTestId("schreiben-custom-prompt-screen")).toBeInTheDocument()
    );

    fireEvent.change(screen.getByPlaceholderText("Ex. : Une invitation à un anniversaire"), {
      target: { value: "Eine Einladung" },
    });
    fireEvent.click(screen.getByTestId("schreiben-custom-prompt-board-goethe"));
    fireEvent.click(screen.getByTestId("schreiben-custom-prompt-level-b2"));

    fireEvent.click(screen.getByTestId("schreiben-custom-prompt-submit"));

    await waitFor(() => expect(createPromptMock).toHaveBeenCalledTimes(1));
    expect(createPromptMock).toHaveBeenCalledWith(
      {
        examBoard: "goethe-b2",
        teil: 2,
        titleDe: "Eine Einladung",
        minWords: 120,
        maxWords: 150,
      },
      { examBoard: "telc", examLevel: "b1" }
    );

    await waitFor(() => expect(replaceMock).toHaveBeenCalledWith("/fr/app/schreiben?created=1"));
  });

  it.each([
    ["invalid_payload", "Vérifie le thème et le nombre de mots."],
    ["invalid_json", "Vérifie le thème et le nombre de mots."],
    ["db_write_failed", "Enregistrement impossible. Réessaie dans un instant."],
    ["some_unmapped_code", "Création impossible. Vérifie ta connexion et réessaie."],
  ])("server error code %s renders its mapped copy", async (code, expectedCopy) => {
    createPromptMock.mockRejectedValueOnce(new Error(code));

    renderWithI18n(<CustomPromptScreen />);
    await waitFor(() =>
      expect(screen.getByTestId("schreiben-custom-prompt-screen")).toBeInTheDocument()
    );

    fireEvent.change(screen.getByPlaceholderText("Ex. : Une invitation à un anniversaire"), {
      target: { value: "Eine Einladung" },
    });
    fireEvent.click(screen.getByTestId("schreiben-custom-prompt-submit"));

    await waitFor(() =>
      expect(screen.getByTestId("schreiben-custom-prompt-error")).toBeInTheDocument()
    );
    expect(screen.getByTestId("schreiben-custom-prompt-error").textContent).toBe(expectedCopy);
    expect(replaceMock).not.toHaveBeenCalled();
  });

  it("rapid double/triple-click on submit while createPrompt is pending calls createPrompt exactly once", async () => {
    const deferred = createDeferred<ReturnType<typeof samplePrompt>>();
    createPromptMock.mockReturnValue(deferred.promise);

    renderWithI18n(<CustomPromptScreen />);
    await waitFor(() =>
      expect(screen.getByTestId("schreiben-custom-prompt-screen")).toBeInTheDocument()
    );

    fireEvent.change(screen.getByPlaceholderText("Ex. : Une invitation à un anniversaire"), {
      target: { value: "Eine Einladung" },
    });

    const submitButton = screen.getByTestId("schreiben-custom-prompt-submit");
    // Three `fireEvent.click`s inside a single synchronous `act()` call —
    // same rationale as `LesenSessionScreen`'s equivalent test: nesting all
    // three inside one outer `act()` defers the `disabled`-attribute flush
    // to the end of the block, so all three `handleSubmit()` calls run
    // their synchronous prefix — including the `isSubmittingRef` check —
    // against the same not-yet-disabled render, genuinely isolating the
    // ref guard from the DOM.
    act(() => {
      fireEvent.click(submitButton);
      fireEvent.click(submitButton);
      fireEvent.click(submitButton);
    });

    expect(createPromptMock).toHaveBeenCalledTimes(1);

    await act(async () => {
      deferred.resolve(samplePrompt());
      await deferred.promise;
    });

    expect(createPromptMock).toHaveBeenCalledTimes(1);
  });

  it("cancel navigates back", async () => {
    renderWithI18n(<CustomPromptScreen />);
    await waitFor(() =>
      expect(screen.getByTestId("schreiben-custom-prompt-screen")).toBeInTheDocument()
    );

    fireEvent.click(screen.getByTestId("schreiben-custom-prompt-cancel"));
    expect(backMock).toHaveBeenCalledTimes(1);
  });
});
