import { StrictMode, type ReactElement } from "react";
import { I18nextProvider } from "react-i18next";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// `vi.hoisted` — `vi.mock` factories are hoisted above the rest of the
// module, so any mock fn they reference must be built via `vi.hoisted`, not
// a plain top-level `const` (same TDZ rationale as every other S4-S8 screen
// test in this suite, e.g. `learner-exam-home.test.tsx`,
// `learner-sprechen-topic-picker.test.tsx`).
const { listModelltestsMock, pushMock, hydrateMock } = vi.hoisted(() => ({
  listModelltestsMock: vi.fn(),
  pushMock: vi.fn(),
  hydrateMock: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock, replace: vi.fn(), back: vi.fn() }),
}));
vi.mock("next-intl", () => ({ useLocale: () => "fr" }));

// Feature code imports `listModelltests` ONLY from the `examApi` facade
// (S8 Task 8.1 facade-hygiene) — mock the boundary the screen actually
// imports, same idiom as `learner-lesen-intro.test.tsx`.
vi.mock("@/learner/core/api/examApi", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/learner/core/api/examApi")>();
  return { ...actual, listModelltests: listModelltestsMock };
});

// Partial mock: keep the real `useExamContextStore` (tests drive it
// directly via `setState`) but stub `hydrateExamContext` so the screen's
// self-hydrate mount effect doesn't hit real localStorage/Supabase in
// jsdom — same idiom as `learner-exam-home.test.tsx`.
vi.mock("@/learner/core/exam/examContext", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/learner/core/exam/examContext")>();
  return { ...actual, hydrateExamContext: hydrateMock };
});

import { useExamContextStore } from "@/learner/core/exam/examContext";
import type { ModelltestRow } from "@/learner/core/api/examApi";
import { initLearnerI18n } from "@/learner/core/i18n";
import { ModelltestsListScreen } from "@/learner/exam/screens/ModelltestsListScreen";
import { renderWithI18n } from "./helpers/renderWithI18n";

/** Renders under `StrictMode` — used only by the guard-removal test. */
function renderStrict(ui: ReactElement) {
  const instance = initLearnerI18n("fr");
  return render(
    <I18nextProvider i18n={instance}>
      <StrictMode>{ui}</StrictMode>
    </I18nextProvider>
  );
}

function row(overrides: Partial<ModelltestRow> & { slug: string }): ModelltestRow {
  return {
    id: overrides.slug,
    title: "Modelltest",
    cert_code: "GOETHE",
    level_code: "B1",
    short_label: "MT",
    sequence_num: 1,
    ...overrides,
  };
}

describe("ModelltestsListScreen — S8 Task 8.4 (board/level-filtered full-simulation picker)", () => {
  beforeEach(() => {
    listModelltestsMock.mockReset();
    pushMock.mockReset();
    hydrateMock.mockReset();
    useExamContextStore.setState({ board: "goethe", level: "b1", isLoaded: true } as never);
  });
  afterEach(cleanup);

  it("gate: renders modelltestsList.gate and does not fetch while the exam context is not loaded", async () => {
    useExamContextStore.setState({ board: "goethe", level: "b1", isLoaded: false } as never);

    renderWithI18n(<ModelltestsListScreen />);

    expect(screen.getByTestId("modelltestsList.gate")).toBeInTheDocument();
    expect(screen.queryByTestId("modelltestsList")).not.toBeInTheDocument();
    await waitFor(() => expect(hydrateMock).toHaveBeenCalledTimes(1));
    expect(listModelltestsMock).not.toHaveBeenCalled();
  });

  it("renders header copy, filters rows to the context board/level (cert-code set x level), and lists survivors under mobile dot-case testIDs", async () => {
    listModelltestsMock.mockResolvedValue([
      // Survives: GOETHE ∈ CERT_CODES_BY_BOARD.goethe, level B1.
      row({ slug: "goethe-b1-01", title: "Modelltest 1", short_label: "MT 1" }),
      // Survives: GOETHE_OESD is also in CERT_CODES_BY_BOARD.goethe.
      row({
        slug: "goethe-b1-02",
        title: "Modelltest 2",
        short_label: "MT 2",
        cert_code: "GOETHE_OESD",
      }),
      // Excluded by cert: TELC is not in CERT_CODES_BY_BOARD.goethe.
      row({ slug: "telc-b1-01", title: "Telc test", cert_code: "TELC" }),
      // Excluded by level: B2 !== the context's B1.
      row({ slug: "goethe-b2-01", title: "Goethe B2 test", level_code: "B2" }),
    ]);

    renderWithI18n(<ModelltestsListScreen />);

    await waitFor(() =>
      expect(screen.getByTestId("modelltestsList.row.goethe-b1-01")).toBeInTheDocument()
    );

    expect(screen.getByTestId("modelltestsList.title").textContent).toBe("Modelltests");
    expect(screen.getByTestId("modelltestsList.subtitle").textContent).toBe(
      "Choisis un modelltest publié pour lancer la simulation complète."
    );

    expect(screen.getByTestId("modelltestsList.row.goethe-b1-01").textContent).toContain(
      "Modelltest 1"
    );
    expect(screen.getByTestId("modelltestsList.row.goethe-b1-01").textContent).toContain("MT 1");
    expect(screen.getByTestId("modelltestsList.row.goethe-b1-02")).toBeInTheDocument();
    expect(screen.queryByTestId("modelltestsList.row.telc-b1-01")).not.toBeInTheDocument();
    expect(screen.queryByTestId("modelltestsList.row.goethe-b2-01")).not.toBeInTheDocument();
  });

  it("hydration gate: the fetch fires only once after exam-context isLoaded flips true (guard-removal-verified) — StrictMode double-invoke + deep-link/hard-refresh reproduction", async () => {
    listModelltestsMock.mockResolvedValue([row({ slug: "goethe-b1-01" })]);
    // Reproduces a hard refresh / deep-link straight onto this route: the
    // store still holds the un-hydrated default and `isLoaded: false`.
    useExamContextStore.setState({ board: "goethe", level: "b1", isLoaded: false } as never);

    renderStrict(<ModelltestsListScreen />);

    await waitFor(() => expect(hydrateMock).toHaveBeenCalled());
    // Give any (incorrect) unconditional fetch — including a StrictMode
    // double-invoke of the mount-time effect — a chance to fire before
    // asserting it did not.
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(listModelltestsMock).not.toHaveBeenCalled();
    expect(screen.getByTestId("modelltestsList.gate")).toBeInTheDocument();

    // Hydration lands — NOW the fetch may run. This is a normal
    // (non-double-invoked) re-render, not the initial StrictMode mount.
    act(() => {
      useExamContextStore.setState({ board: "goethe", level: "b1", isLoaded: true } as never);
    });

    await waitFor(() =>
      expect(screen.getByTestId("modelltestsList.row.goethe-b1-01")).toBeInTheDocument()
    );
    // web#32 fix round 2 — one filtered request per module the chain
    // walks (LESEN, HOEREN, SCHREIBEN), not one LESEN-only request. See
    // `FULL_SIMULATION_REQUIRED_MODULES` in `ModelltestsListScreen`.
    expect(listModelltestsMock).toHaveBeenCalledTimes(3);
    expect(listModelltestsMock).toHaveBeenCalledWith({ module: "LESEN" });
    expect(listModelltestsMock).toHaveBeenCalledWith({ module: "HOEREN" });
    expect(listModelltestsMock).toHaveBeenCalledWith({ module: "SCHREIBEN" });
  });

  it("web#32: requests all three required-module-filtered lists on every fetch (LESEN, HOEREN, SCHREIBEN) — a Hören-only Modelltest is never even a candidate for the full-chain entry point, because the backend join never returns it in the LESEN-filtered response", async () => {
    // Simulates the backend's `?module=LESEN` inner-join gate: a
    // Hören-only row (e.g. dev's `telc-b1-hoeren-*`) is simply absent from
    // this response — the picker does no client-side module filtering of
    // its own, it trusts the server-side proxy filter, now applied across
    // every required module rather than one.
    listModelltestsMock.mockResolvedValue([row({ slug: "goethe-b1-01" })]);
    renderWithI18n(<ModelltestsListScreen />);

    await waitFor(() =>
      expect(screen.getByTestId("modelltestsList.row.goethe-b1-01")).toBeInTheDocument()
    );

    expect(listModelltestsMock).toHaveBeenCalledTimes(3);
    expect(listModelltestsMock).toHaveBeenCalledWith({ module: "LESEN" });
    expect(listModelltestsMock).toHaveBeenCalledWith({ module: "HOEREN" });
    expect(listModelltestsMock).toHaveBeenCalledWith({ module: "SCHREIBEN" });
    expect(screen.queryByTestId("modelltestsList.row.telc-b1-hoeren-01")).not.toBeInTheDocument();
  });

  it("web#32 fix round 1 finding: a Modelltest with LESEN present but HOEREN absent is not offered — presence is now checked across every module the chain walks, not LESEN alone", async () => {
    const completeRow = row({ slug: "goethe-b1-01" });
    const lesenOnlyRow = row({ slug: "goethe-b1-lesen-only" });
    // Per-module responses, exactly mirroring the backend's real
    // `?module=` inner-join semantics: `lesenOnlyRow` carries LESEN but
    // has no HOEREN row, so it's present in the LESEN-filtered response
    // and absent from the HOEREN-filtered one.
    listModelltestsMock.mockImplementation(async (args: { module?: string } = {}) => {
      if (args.module === "LESEN") return [completeRow, lesenOnlyRow];
      if (args.module === "HOEREN") return [completeRow];
      if (args.module === "SCHREIBEN") return [completeRow];
      return [];
    });

    renderWithI18n(<ModelltestsListScreen />);

    await waitFor(() =>
      expect(screen.getByTestId("modelltestsList.row.goethe-b1-01")).toBeInTheDocument()
    );
    expect(listModelltestsMock).toHaveBeenCalledWith({ module: "LESEN" });
    expect(listModelltestsMock).toHaveBeenCalledWith({ module: "HOEREN" });
    expect(listModelltestsMock).toHaveBeenCalledWith({ module: "SCHREIBEN" });
    // The Lesen-present/Hören-absent row must never be offered — this is
    // the exact case the round-1 review flagged as still slipping through.
    expect(
      screen.queryByTestId("modelltestsList.row.goethe-b1-lesen-only")
    ).not.toBeInTheDocument();
  });

  it("row click routes to the simulation route with exactly one query param (examSlug) — no moduleFilter anywhere", async () => {
    listModelltestsMock.mockResolvedValue([row({ slug: "goethe-b1-01" })]);
    renderWithI18n(<ModelltestsListScreen />);

    await waitFor(() =>
      expect(screen.getByTestId("modelltestsList.row.goethe-b1-01")).toBeInTheDocument()
    );

    fireEvent.click(screen.getByTestId("modelltestsList.row.goethe-b1-01"));

    expect(pushMock).toHaveBeenCalledTimes(1);
    const pushedUrl = pushMock.mock.calls[0]?.[0] as string;
    expect(pushedUrl).toBe("/fr/app/examen/simulation?examSlug=goethe-b1-01");
    const query = pushedUrl.split("?")[1] ?? "";
    expect(query.split("&")).toEqual(["examSlug=goethe-b1-01"]);
    expect(pushedUrl).not.toContain("moduleFilter");
  });

  it("error state: renders errorTitle/errorBody/errorRetry copy, and clicking retry refires the fetch", async () => {
    listModelltestsMock.mockRejectedValueOnce(new Error("network_error"));
    renderWithI18n(<ModelltestsListScreen />);

    await waitFor(() => expect(screen.getByTestId("modelltestsList.error")).toBeInTheDocument());
    expect(screen.getByTestId("modelltestsList.error").textContent).toContain(
      "Impossible de charger les modelltests"
    );
    expect(screen.getByTestId("modelltestsList.error").textContent).toContain(
      "Vérifie ta connexion puis réessaie."
    );
    // web#32 fix round 2 — one rejection among the 3 concurrent
    // per-module calls is enough to fail the whole `Promise.all` fetch;
    // all 3 still fire.
    expect(listModelltestsMock).toHaveBeenCalledTimes(3);

    // Persistent (not `Once`) — the retry issues 3 fresh concurrent
    // calls, and each needs a resolved value or the intersection logic
    // sees `undefined` for the un-stubbed ones.
    listModelltestsMock.mockResolvedValue([row({ slug: "goethe-b1-01" })]);
    fireEvent.click(screen.getByTestId("modelltestsList.error.retry"));

    await waitFor(() => expect(listModelltestsMock).toHaveBeenCalledTimes(6));
    await waitFor(() =>
      expect(screen.getByTestId("modelltestsList.row.goethe-b1-01")).toBeInTheDocument()
    );
    expect(screen.queryByTestId("modelltestsList.error")).not.toBeInTheDocument();
  });

  it("empty state: renders the German emptyTitle byte-identical (mobile-parity quirk, do NOT correct), and the emptyCta routes back to /examen", async () => {
    listModelltestsMock.mockResolvedValue([]);
    renderWithI18n(<ModelltestsListScreen />);

    await waitFor(() => expect(screen.getByTestId("modelltestsList.empty")).toBeInTheDocument());
    // N7 — fr `examen:modelltests.emptyTitle` is German, shipped
    // byte-identical to mobile. Do not "fix" this during a future edit.
    expect(screen.getByText("Keine Prüfungen verfügbar")).toBeInTheDocument();
    expect(
      screen.getByText(
        "Aucun modelltest publié pour l'instant. Tire vers le bas pour actualiser ou reviens plus tard."
      )
    ).toBeInTheDocument();

    fireEvent.click(screen.getByTestId("modelltestsList.empty-cta"));
    expect(pushMock).toHaveBeenCalledWith("/fr/app/examen");
  });

  it("empty state: an all-excluded fetch (rows exist but none match cert/level) also renders the empty state, not the list", async () => {
    listModelltestsMock.mockResolvedValue([row({ slug: "telc-b1-01", cert_code: "TELC" })]);
    renderWithI18n(<ModelltestsListScreen />);

    await waitFor(() => expect(screen.getByTestId("modelltestsList.empty")).toBeInTheDocument());
    expect(screen.queryByTestId("modelltestsList.row.telc-b1-01")).not.toBeInTheDocument();
  });

  it("back link routes to /examen", async () => {
    listModelltestsMock.mockResolvedValue([row({ slug: "goethe-b1-01" })]);
    renderWithI18n(<ModelltestsListScreen />);

    await waitFor(() =>
      expect(screen.getByTestId("modelltestsList.row.goethe-b1-01")).toBeInTheDocument()
    );

    fireEvent.click(screen.getByTestId("modelltestsList.back"));
    expect(pushMock).toHaveBeenCalledWith("/fr/app/examen");
  });
});
