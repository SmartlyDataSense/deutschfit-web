/**
 * `ProfilScreen` — S11 · Task 4.
 *
 * Beyond the brief's happy-path coverage, this suite pins the invariants
 * that Tasks 2 and 3 each burned a fix-round on (see task-4-brief.md):
 *   - sign-out cannot fire without going through the confirm dialog;
 *   - the exam pill follows the hydrated exam-context store once it
 *     loads, not the `useProfilStats` fallback forever;
 *   - every settings/account row routes to its declared destination;
 *   - user-visible copy is sourced from the i18n catalog, not a
 *     hardcoded literal (mobile hardcodes the Suggestions row — S11-D6
 *     promotes it to i18n; a locale-catalog mutation must show up here).
 */
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const push = vi.fn();
const replace = vi.fn();
const back = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, replace, back }),
}));
vi.mock("next-intl", () => ({ useLocale: () => "fr" }));

const signOut = vi.fn().mockResolvedValue(undefined);
vi.mock("@/learner/core/auth/useLearnerSession", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/learner/core/auth/useLearnerSession")>();
  return {
    ...actual,
    useLearnerSession: (selector?: (s: unknown) => unknown) => {
      const state = {
        session: { user: { id: "u1", email: "qa1@df.dev" } },
        status: "authenticated",
        signOut,
        setSession: vi.fn(),
        setStatus: vi.fn(),
      };
      return selector ? selector(state) : state;
    },
  };
});

const fetchUserStats = vi.fn();
vi.mock("@/learner/profil/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/learner/profil/api")>();
  return { ...actual, fetchUserStats: (...a: unknown[]) => fetchUserStats(...a) };
});

// Keep the real store but neuter the network/localStorage hydration the
// screen fires on mount (pattern: tests/unit/learner-drill-session-screen.test.tsx:31-37).
// `vi.hoisted` gives us an importable, assertable handle on the mock —
// a plain `vi.fn()` created inline inside the factory below has no such
// handle, so a test file that only drives `isLoaded`/`board`/`level`
// via `useExamContextStore.setState(...)` (as this one does) would never
// notice if the screen stopped calling `hydrateExamContext()` at all.
const { hydrateExamContextMock } = vi.hoisted(() => ({
  hydrateExamContextMock: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@/learner/core/exam/examContext", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/learner/core/exam/examContext")>();
  return { ...actual, hydrateExamContext: hydrateExamContextMock };
});

import { initLearnerI18n } from "@/learner/core/i18n";
import { LearnerI18nProvider } from "@/learner/core/i18n/LearnerI18nProvider";
import { __resetLearnerDbForTests } from "@/learner/core/db";
import { useExamContextStore, type ExamContextState } from "@/learner/core/exam/examContext";
import { DEFAULT_EXAM_BOARD, DEFAULT_EXAM_LEVEL, DEFAULT_EXAM_SOURCE } from "@/learner/core/exam/examTypes";
import { ProfilScreen } from "@/learner/profil/screens/ProfilScreen";
import frProfil from "@/learner/locales/fr/profil.json";

const INITIAL_EXAM_STATE: ExamContextState = {
  board: DEFAULT_EXAM_BOARD,
  level: DEFAULT_EXAM_LEVEL,
  source: DEFAULT_EXAM_SOURCE,
  isLoaded: false,
};

afterEach(cleanup);
beforeAll(() => initLearnerI18n("fr"));
beforeEach(() => {
  vi.clearAllMocks();
  __resetLearnerDbForTests();
  useExamContextStore.setState(INITIAL_EXAM_STATE);
  fetchUserStats.mockResolvedValue({
    fullName: "Marie Dupont",
    location: "Douala",
    languages: ["Français"],
    examLabel: "B1",
    daysRemaining: 30,
    reminderTime: "",
    offlineLessonsCount: 0,
    offlineSizeMb: 0,
    dataSaverOn: false,
  });
});

const ui = () =>
  render(
    <LearnerI18nProvider lng="fr">
      <ProfilScreen />
    </LearnerI18nProvider>
  );

describe("ProfilScreen (S11.4)", () => {
  // Named invariant: the mount effect must actually call
  // `hydrateExamContext()`. This is distinct from the "pill follows the
  // hydrated store" tests below, which drive `isLoaded`/`board`/`level`
  // directly via `useExamContextStore.setState(...)` and would stay
  // green even if the screen never called the real hydration function —
  // in the live app that would leave `isLoaded` false forever and the
  // exam pill stuck on the unhydrated fallback.
  it("hydrates the exam-context store on mount", async () => {
    ui();
    await waitFor(() => expect(hydrateExamContextMock).toHaveBeenCalled());
  });

  it("renders identity card from user-stats and the settings rows", async () => {
    ui();
    await waitFor(() => expect(screen.getByText("Marie Dupont")).toBeInTheDocument());
    expect(screen.getByTestId("profil-settings-change-exam")).toBeInTheDocument();
    expect(screen.getByTestId("profil-settings-change-exam-date")).toBeInTheDocument();
    expect(screen.getByTestId("profil-settings-history")).toBeInTheDocument();
    expect(screen.getByTestId("profil-settings-suggestions")).toBeInTheDocument();
    // S11-D4: no notifications row on web.
    expect(screen.queryByTestId("profil-settings-notifications")).toBeNull();
    // Product lock: no fullPrep / premium copy anywhere.
    expect(screen.queryByText(/Full Prep/i)).toBeNull();
  });

  it("navigates: exam row → exam-track, suggestions → coach, delete → delete-account", async () => {
    ui();
    await waitFor(() => expect(screen.getByTestId("profil-settings-list")).toBeInTheDocument());
    fireEvent.click(screen.getByTestId("profil-settings-change-exam"));
    expect(push).toHaveBeenCalledWith("/fr/app/profil/settings/exam-track");
    fireEvent.click(screen.getByTestId("profil-settings-suggestions"));
    expect(push).toHaveBeenCalledWith("/fr/app/coach");
    fireEvent.click(screen.getByTestId("profil-account-delete"));
    expect(push).toHaveBeenCalledWith("/fr/app/profil/delete-account");
  });

  // Extends the brief's navigation test — the remaining two rows
  // (change-exam-date, history) weren't asserted there. Each row must
  // route independently: a copy-paste `onClick` from a neighboring row
  // would pass every other test in this file while still sending the
  // user to the wrong screen.
  it("navigates: change-exam-date → /app/exam-date, history → /app/history", async () => {
    ui();
    await waitFor(() => expect(screen.getByTestId("profil-settings-list")).toBeInTheDocument());
    fireEvent.click(screen.getByTestId("profil-settings-change-exam-date"));
    expect(push).toHaveBeenCalledWith("/fr/app/exam-date");
    fireEvent.click(screen.getByTestId("profil-settings-history"));
    expect(push).toHaveBeenCalledWith("/fr/app/history");
  });

  it("settings-button in the navbar routes to /app/profil/settings, back button calls router.back()", async () => {
    ui();
    await waitFor(() => expect(screen.getByTestId("profil-navbar")).toBeInTheDocument());
    fireEvent.click(screen.getByTestId("profil-settings-button"));
    expect(push).toHaveBeenCalledWith("/fr/app/profil/settings");
    fireEvent.click(screen.getByTestId("profil-back-button"));
    expect(back).toHaveBeenCalledOnce();
  });

  it("sign-out asks for confirmation before signing out, then redirects to login", async () => {
    ui();
    await waitFor(() => expect(screen.getByTestId("profil-account-sign-out")).toBeInTheDocument());
    fireEvent.click(screen.getByTestId("profil-account-sign-out"));
    expect(signOut).not.toHaveBeenCalled(); // never a single-tap sign-out
    expect(screen.getByTestId("profil-signout-dialog")).toBeInTheDocument();
    fireEvent.click(screen.getByTestId("profil-signout-confirm"));
    await waitFor(() => expect(signOut).toHaveBeenCalledOnce());
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/fr/app/login"));
  });

  // Named invariant: cancelling the dialog must never sign out. Without
  // this, a future refactor that wires the confirm handler onto the
  // wrong button (or both buttons) would still pass the test above.
  it("sign-out dialog cancel closes without signing out", async () => {
    ui();
    await waitFor(() => expect(screen.getByTestId("profil-account-sign-out")).toBeInTheDocument());
    fireEvent.click(screen.getByTestId("profil-account-sign-out"));
    expect(screen.getByTestId("profil-signout-dialog")).toBeInTheDocument();
    fireEvent.click(screen.getByTestId("profil-signout-cancel"));
    expect(screen.queryByTestId("profil-signout-dialog")).toBeNull();
    expect(signOut).not.toHaveBeenCalled();
    expect(replace).not.toHaveBeenCalled();
  });

  it("privacy row is a new-tab link to the legal page", async () => {
    ui();
    await waitFor(() => expect(screen.getByTestId("profil-account-privacy")).toBeInTheDocument());
    const anchor = screen.getByTestId("profil-account-privacy");
    expect(anchor).toHaveAttribute("href", "/fr/legal/privacy");
    expect(anchor).toHaveAttribute("target", "_blank");
  });

  // Named invariant: before the exam-context store finishes hydrating,
  // the pill falls back to `useProfilStats().stats.examLabel` (never the
  // hardcoded DEFAULT_EXAM_LEVEL) so it doesn't flash "B1" for a user
  // whose real level is something else.
  it("exam pill falls back to stats.examLabel while the exam-context store is not yet loaded", async () => {
    fetchUserStats.mockResolvedValue({
      fullName: "Marie Dupont",
      location: "Douala",
      languages: ["Français"],
      examLabel: "C1",
      daysRemaining: 30,
      reminderTime: "",
      offlineLessonsCount: 0,
      offlineSizeMb: 0,
      dataSaverOn: false,
    });
    ui();
    await waitFor(() =>
      expect(screen.getByTestId("profil-identity-card-exam-pill")).toHaveTextContent("C1")
    );
    expect(screen.getByTestId("profil-settings-change-exam")).toHaveTextContent("C1");
  });

  // Named invariant: once the store is loaded, the pill follows
  // `formatExamTrackLabel(board, level)` from the store — not the stats
  // fallback, even though the mocked `hydrateExamContext()` never runs
  // the real hydration (StrictMode/mount-effect precedent:
  // learner-drill-session-screen.test.tsx drives the store directly via
  // `setState`).
  it("exam pill reflects the hydrated exam-context store once isLoaded flips true", async () => {
    useExamContextStore.setState({
      board: "telc",
      level: "b2",
      source: "settings",
      isLoaded: true,
    });
    ui();
    await waitFor(() =>
      expect(screen.getByTestId("profil-identity-card-exam-pill")).toHaveTextContent("B2")
    );
    // Distinguishes "reads the store" from "coincidentally rendered the
    // stats fixture's B1" — the fixture explicitly says B1, the store
    // says B2, and B2 must win.
    expect(screen.getByTestId("profil-identity-card-exam-pill")).not.toHaveTextContent("B1");
    expect(screen.getByTestId("profil-settings-change-exam")).toHaveTextContent("B2");
  });

  // Narrower guarantee than the test name might suggest: this reads the
  // same catalog object the screen renders from and compares against it,
  // so it does NOT prove the current values are wired through `t()`
  // rather than a hardcoded literal that happens to equal today's fr
  // copy (verified separately by mutation-testing — see task-4-report.md).
  // What it *does* pin: a later edit to the fr catalog (mobile hardcodes
  // the Suggestions row's label + a11y string directly in the screen;
  // S11-D6 promotes both to i18n here) must show up on this row, or this
  // assertion goes red.
  it("suggestions row copy tracks the profil i18n catalog", async () => {
    ui();
    await waitFor(() => expect(screen.getByTestId("profil-settings-suggestions")).toBeInTheDocument());
    const row = screen.getByTestId("profil-settings-suggestions");
    expect(row).toHaveTextContent(frProfil.settings.suggestions);
    expect(row).toHaveAttribute("aria-label", frProfil.settings.suggestionsA11y);
  });

  it("navbar title, settings button and sign-out confirm copy all come from the i18n catalog", async () => {
    ui();
    await waitFor(() => expect(screen.getByTestId("profil-navbar")).toBeInTheDocument());
    expect(screen.getByText(frProfil.title)).toBeInTheDocument();
    fireEvent.click(screen.getByTestId("profil-account-sign-out"));
    expect(screen.getByText(frProfil.account.signOutConfirmTitle)).toBeInTheDocument();
    expect(screen.getByText(frProfil.account.signOutConfirmMessage)).toBeInTheDocument();
  });
});
