import { act, cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// `vi.hoisted` — same TDZ rationale as `learner-hoeren-intro.test.tsx`:
// `vi.mock` factories are hoisted above the rest of the module, so any mock
// fn/state they reference must be built via `vi.hoisted`, not a plain
// top-level `const`.
const { pushMock, replaceMock, hydrateMock, listPromptsMock, searchParamsRef } = vi.hoisted(() => ({
  pushMock: vi.fn(),
  replaceMock: vi.fn(),
  hydrateMock: vi.fn(),
  listPromptsMock: vi.fn(),
  searchParamsRef: { current: new URLSearchParams() },
}));

// Feature code imports wire fns ONLY from the `examApi` facade
// (Constraint 15) — mock that surface, not the lower-level `./writing`
// module.
vi.mock("@/learner/core/api/examApi", () => ({
  listPrompts: (...args: unknown[]) => listPromptsMock(...args),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock, replace: replaceMock }),
  // `useSearchParams()` reads a mutable ref instead of the real Next.js
  // hook — tests set `searchParamsRef.current` before rendering. Because
  // `router.replace` is stubbed (not a real navigation), this ref is
  // NEVER auto-cleared after a "consume" — that's deliberate: it forces
  // the screen's own one-shot ref-guards to be what stops re-seeding, not
  // an accident of the URL actually changing.
  useSearchParams: () => searchParamsRef.current,
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
import type { WritingPrompt } from "@/learner/core/api/examApi";
import { PromptListScreen } from "@/learner/schreiben/screens/PromptListScreen";
import { renderWithI18n } from "./helpers/renderWithI18n";

function prompt(overrides: Partial<WritingPrompt>): WritingPrompt {
  return {
    id: "p1",
    exam_board: "goethe-b1",
    teil: 1,
    slug: "p1-slug",
    title_de: "Einladung",
    situation_de: "situation",
    bullet_points: [],
    min_words: 30,
    max_words: 40,
    ...overrides,
  };
}

const PROMPTS: WritingPrompt[] = [
  prompt({ id: "p1", exam_board: "goethe-b1", teil: 1, title_de: "Einladung schreiben" }),
  prompt({
    id: "p2",
    exam_board: "telc-b1",
    teil: 1,
    title_de: "Beschwerde formulieren",
    source: "community",
  }),
  prompt({
    id: "p3",
    exam_board: "telc-b2",
    teil: 2,
    title_de: "Bericht verfassen",
    min_words: 80,
    max_words: 100,
    source: "official",
  }),
];

describe("PromptListScreen — Schreiben prompt list (S6 Task 6.6)", () => {
  beforeEach(() => {
    listPromptsMock.mockReset();
    pushMock.mockReset();
    replaceMock.mockReset();
    hydrateMock.mockReset();
    searchParamsRef.current = new URLSearchParams();
    useExamContextStore.setState({ board: "telc", level: "b1", isLoaded: true } as never);
  });
  afterEach(cleanup);

  it("hydration gate: the fetch fires only after exam-context isLoaded flips true (guard-removal-verified) — deep-link/hard-refresh reproduction", async () => {
    listPromptsMock.mockResolvedValue(PROMPTS);
    // Reproduces a hard refresh / deep-link straight onto this route: the
    // store still holds the un-hydrated default and `isLoaded: false`.
    useExamContextStore.setState({ board: "telc", level: "b1", isLoaded: false } as never);

    renderWithI18n(<PromptListScreen />);

    await waitFor(() => expect(hydrateMock).toHaveBeenCalled());
    // Give any (incorrect) unconditional fetch a chance to fire before
    // asserting it did not — this is what fails if the `!isExamContextLoaded`
    // guard is removed from the screen's load effect.
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(listPromptsMock).not.toHaveBeenCalled();
    expect(screen.getByTestId("schreiben-prompt-list-loading")).toBeInTheDocument();
    expect(screen.queryByTestId("schreiben-prompt-list-screen")).not.toBeInTheDocument();

    // Hydration lands — NOW the fetch may run.
    act(() => {
      useExamContextStore.setState({ board: "telc", level: "b1", isLoaded: true } as never);
    });

    await waitFor(() => expect(listPromptsMock).toHaveBeenCalledWith("telc", "b1"));
    await waitFor(() =>
      expect(screen.getByTestId("schreiben-prompt-list-screen")).toBeInTheDocument()
    );
  });

  it("groups prompts by Teil and filters by board chip", async () => {
    listPromptsMock.mockResolvedValue(PROMPTS);
    renderWithI18n(<PromptListScreen />);

    await waitFor(() =>
      expect(screen.getByTestId("schreiben-prompt-list-screen")).toBeInTheDocument()
    );

    // Teil 1 (p1, p2) and Teil 2 (p3) both render as sections.
    expect(screen.getByTestId("schreiben-prompt-list-section-1").textContent).toBe("Teil 1");
    expect(screen.getByTestId("schreiben-prompt-list-section-2").textContent).toBe("Teil 2");
    expect(screen.getByTestId("schreiben-prompt-p1")).toBeInTheDocument();
    expect(screen.getByTestId("schreiben-prompt-p2")).toBeInTheDocument();
    expect(screen.getByTestId("schreiben-prompt-p3")).toBeInTheDocument();

    // Filtering to the telc-b2 chip leaves only p3 (Teil 2) — Teil 1's
    // section disappears entirely (no prompts survive the filter there).
    fireEvent.click(screen.getByTestId("schreiben-prompt-list-chip-telc-b2"));

    expect(screen.queryByTestId("schreiben-prompt-list-section-1")).not.toBeInTheDocument();
    expect(screen.getByTestId("schreiben-prompt-list-section-2")).toBeInTheDocument();
    expect(screen.queryByTestId("schreiben-prompt-p1")).not.toBeInTheDocument();
    expect(screen.queryByTestId("schreiben-prompt-p2")).not.toBeInTheDocument();
    expect(screen.getByTestId("schreiben-prompt-p3")).toBeInTheDocument();

    // Back to "all levels" restores every row.
    fireEvent.click(screen.getByTestId("schreiben-prompt-list-chip-all"));
    expect(screen.getByTestId("schreiben-prompt-p1")).toBeInTheDocument();
  });

  it("?board=telc-b1 seeds the filter exactly once and clears the param; a subsequent chip tap wins over the seed", async () => {
    listPromptsMock.mockResolvedValue(PROMPTS);
    searchParamsRef.current = new URLSearchParams("board=telc-b1");

    renderWithI18n(<PromptListScreen />);

    await waitFor(() =>
      expect(screen.getByTestId("schreiben-prompt-list-screen")).toBeInTheDocument()
    );

    // Seeded: only the telc-b1 prompt (p2) shows.
    await waitFor(() => expect(screen.getByTestId("schreiben-prompt-p2")).toBeInTheDocument());
    expect(screen.queryByTestId("schreiben-prompt-p1")).not.toBeInTheDocument();
    expect(
      screen.getByTestId("schreiben-prompt-list-chip-telc-b1").getAttribute("aria-pressed")
    ).toBe("true");

    // One-shot param cleared via `router.replace` of the bare path.
    await waitFor(() => expect(replaceMock).toHaveBeenCalledWith("/fr/app/schreiben"));

    // A chip tap after the seed wins — even though the mocked
    // `useSearchParams()` still returns `?board=telc-b1` (the mock never
    // actually navigates), the screen's own ref-guard must be what
    // prevents the seed from re-applying.
    fireEvent.click(screen.getByTestId("schreiben-prompt-list-chip-all"));
    expect(screen.getByTestId("schreiben-prompt-p1")).toBeInTheDocument();
    expect(
      screen.getByTestId("schreiben-prompt-list-chip-telc-b1").getAttribute("aria-pressed")
    ).toBe("false");
  });

  it("community badge renders only for source:community rows", async () => {
    listPromptsMock.mockResolvedValue(PROMPTS);
    renderWithI18n(<PromptListScreen />);

    await waitFor(() => expect(screen.getByTestId("schreiben-prompt-p2")).toBeInTheDocument());

    expect(screen.getByTestId("schreiben-prompt-p2-community-badge")).toBeInTheDocument();
    expect(screen.queryByTestId("schreiben-prompt-p1-community-badge")).not.toBeInTheDocument();
    expect(screen.queryByTestId("schreiben-prompt-p3-community-badge")).not.toBeInTheDocument();
  });

  it("«Au clavier» pushes /schreiben/compose/<id>; no photo/OCR affordance renders anywhere (Constraint 16)", async () => {
    listPromptsMock.mockResolvedValue(PROMPTS);
    renderWithI18n(<PromptListScreen />);

    await waitFor(() => expect(screen.getByTestId("schreiben-prompt-p1")).toBeInTheDocument());

    fireEvent.click(screen.getByTestId("schreiben-prompt-p1-keyboard"));
    expect(pushMock).toHaveBeenCalledWith("/fr/app/schreiben/compose/p1");

    // No camera/photo CTA — by testID convention, by literal French copy,
    // and by English copy (in case the FR string is ever swapped in
    // error), across every row.
    expect(screen.queryAllByTestId(/-camera$/)).toHaveLength(0);
    expect(screen.queryByText("En photo")).not.toBeInTheDocument();
    expect(screen.queryByText("Photo")).not.toBeInTheDocument();
  });

  it("?submitted=1 renders the schreiben-submitted-toast banner exactly once and clears the param", async () => {
    listPromptsMock.mockResolvedValue(PROMPTS);
    searchParamsRef.current = new URLSearchParams("submitted=1");

    renderWithI18n(<PromptListScreen />);

    await waitFor(() =>
      expect(screen.getByTestId("schreiben-submitted-toast")).toBeInTheDocument()
    );
    expect(screen.getAllByTestId("schreiben-submitted-toast")).toHaveLength(1);
    expect(screen.getByTestId("schreiben-submitted-toast").textContent).toBe(
      "Reçu · ta correction arrive dans ~3 min"
    );
    await waitFor(() => expect(replaceMock).toHaveBeenCalledWith("/fr/app/schreiben"));
  });

  it("list fetch failure renders the error banner with a retry that re-fires the fetch", async () => {
    listPromptsMock.mockRejectedValueOnce(new Error("network_down"));

    renderWithI18n(<PromptListScreen />);

    await waitFor(() =>
      expect(screen.getByTestId("schreiben-prompt-list-error")).toBeInTheDocument()
    );
    expect(screen.getByText("Impossible de charger les consignes")).toBeInTheDocument();

    listPromptsMock.mockResolvedValueOnce(PROMPTS);
    fireEvent.click(screen.getByTestId("schreiben-prompt-list-error-retry"));

    await waitFor(() => expect(listPromptsMock).toHaveBeenCalledTimes(2));
    await waitFor(() =>
      expect(screen.getByTestId("schreiben-prompt-list-screen")).toBeInTheDocument()
    );
  });

  it("zero prompts in the DB renders the empty state with a refresh CTA that re-fires the fetch", async () => {
    listPromptsMock.mockResolvedValueOnce([]);

    renderWithI18n(<PromptListScreen />);

    await waitFor(() =>
      expect(screen.getByTestId("schreiben-prompt-list-empty")).toBeInTheDocument()
    );

    listPromptsMock.mockResolvedValueOnce(PROMPTS);
    fireEvent.click(screen.getByTestId("schreiben-prompt-list-empty-state-cta"));

    await waitFor(() => expect(listPromptsMock).toHaveBeenCalledTimes(2));
    await waitFor(() =>
      expect(screen.getByTestId("schreiben-prompt-list-screen")).toBeInTheDocument()
    );
  });

  it("search excluding every row renders the inline no-results copy without dropping the controls", async () => {
    listPromptsMock.mockResolvedValue(PROMPTS);
    renderWithI18n(<PromptListScreen />);

    await waitFor(() =>
      expect(screen.getByTestId("schreiben-prompt-list-screen")).toBeInTheDocument()
    );

    // `Input`'s `data-testid` lands on its wrapping `<div>`, not the
    // native `<input>` (`Input.tsx`) — target the field by placeholder
    // text instead, same idiom `learner-primitives.test.tsx` uses.
    fireEvent.change(screen.getByPlaceholderText("Rechercher une consigne…"), {
      target: { value: "zzz-no-match" },
    });

    await waitFor(() =>
      expect(screen.getByTestId("schreiben-prompt-list-no-results")).toBeInTheDocument()
    );
    // Controls stay mounted — the search box itself is still there.
    expect(screen.getByPlaceholderText("Rechercher une consigne…")).toBeInTheDocument();
  });
});
