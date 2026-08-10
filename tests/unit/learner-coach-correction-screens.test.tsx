/**
 * Correction picker + walkthrough screens — S9 · Task 9.9.
 *
 * Covers `CorrectionPickerScreen` (paginated graded-submission list) and
 * `CorrectionWalkthroughScreen` (read-only modality-branching correction
 * explainer), plus a focused `AnnotatedTranscriptView` render test for the
 * span reference-identity invariant inherited from Task 9.8's
 * `sprechenSpans.ts`.
 *
 * Mocks the transport boundary only (`fetchHistory`, `fetchCorrection`),
 * per this repo's test idiom — `resolveSpans` and `buildDiff` run for
 * real (imported via `importOriginal` + `vi.fn(actual.fn)` so the spy
 * still executes the real algorithm, letting a single test both assert
 * real merge behaviour AND capture the exact array reference passed in).
 */
import { cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { renderWithI18n } from "./helpers/renderWithI18n";
import type { HistoryFeedRow } from "@/learner/core/api/history";
import type { EvidenceSpan } from "@/learner/core/feedback/feedbackV2";
import feedbackV2Fixture from "@/learner/coach/correction/__fixtures__/feedbackV2.sample.json";
import type { FeedbackV2 } from "@/learner/core/feedback/feedbackV2";
import type { SchreibenCorrection } from "@/learner/coach/correction/correctionApi";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const { fetchHistoryMock, fetchCorrectionMock, pushMock, backMock, resolveSpansSpy } = vi.hoisted(
  () => ({
    fetchHistoryMock: vi.fn(),
    fetchCorrectionMock: vi.fn(),
    pushMock: vi.fn(),
    backMock: vi.fn(),
    resolveSpansSpy: vi.fn(),
  })
);

vi.mock("@/learner/core/api/history", () => ({
  fetchHistory: fetchHistoryMock,
}));

vi.mock("@/learner/coach/correction/correctionApi", () => ({
  fetchCorrection: fetchCorrectionMock,
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock, back: backMock }),
}));

vi.mock("next-intl", () => ({ useLocale: () => "fr" }));

// Wraps the REAL `resolveSpans` in a spy — the spy still runs the actual
// algorithm (so merge-behaviour assertions stay meaningful), but every
// call's arguments are recorded, which is what the reference-identity
// mutation guard below asserts on with `.toBe`.
vi.mock("@/learner/coach/correction/sprechenSpans", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/learner/coach/correction/sprechenSpans")>();
  resolveSpansSpy.mockImplementation(actual.resolveSpans);
  return { ...actual, resolveSpans: resolveSpansSpy };
});

import { CorrectionPickerScreen } from "@/learner/coach/correction/screens/CorrectionPickerScreen";
import {
  CorrectionWalkthroughScreen,
  isModality,
} from "@/learner/coach/correction/screens/CorrectionWalkthroughScreen";
import { AnnotatedTranscriptView } from "@/learner/coach/correction/components/AnnotatedTranscriptView";

afterEach(() => {
  cleanup();
});

beforeEach(() => {
  // Block bodies deliberately — an expression-bodied `() => mock.mockReset()`
  // returns the mock, which Vitest would invoke as its own cleanup and
  // produce spurious unhandled-rejection failures (see
  // learner-coach-api.test.ts / learner-coach-correction-logic.test.ts).
  fetchHistoryMock.mockReset();
  fetchCorrectionMock.mockReset();
  pushMock.mockReset();
  backMock.mockReset();
  resolveSpansSpy.mockClear();
});

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeRow(overrides: Partial<HistoryFeedRow> = {}): HistoryFeedRow {
  return {
    id: "sub-1",
    kind: "schreiben",
    createdAt: "2026-05-05T14:32:11Z",
    score: 67,
    scoreMax: 100,
    level: "B1",
    board: "goethe",
    title: "Ein Brief an einen Freund",
    deepLinkRoute: { screen: "x", params: { runId: "sub-1" } },
    status: "graded",
    errorMessage: null,
    ...overrides,
  };
}

const SPRECHEN_FIXTURE = feedbackV2Fixture as unknown as FeedbackV2;

function schreibenCorrection(overrides: Partial<SchreibenCorrection> = {}): SchreibenCorrection {
  return {
    modality: "schreiben",
    bodyDe: "Ich habe gegangen ins Kino.",
    prueferText: "Ich bin ins Kino gegangen.",
    betreuerText: "Attention à l'auxiliaire avec les verbes de mouvement.",
    overallScore: 58,
    summaryFr: "",
    dimensionScores: {
      erfuellung: 60,
      kohaerenz: 55,
      wortschatz: 58,
      strukturen: 50,
    },
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// CorrectionPickerScreen
// ---------------------------------------------------------------------------

describe("CorrectionPickerScreen", () => {
  it("renders graded rows and filters out rejected rows (mutation guard a)", async () => {
    fetchHistoryMock.mockResolvedValueOnce({
      pinnedDiagnostic: null,
      feed: [
        makeRow({ id: "graded-1", status: "graded" }),
        makeRow({ id: "rejected-1", status: "rejected" }),
      ],
      nextCursor: null,
    });

    renderWithI18n(<CorrectionPickerScreen />);

    await waitFor(() => expect(screen.getByTestId("correction-row-graded-1")).toBeInTheDocument());
    expect(screen.queryByTestId("correction-row-rejected-1")).not.toBeInTheDocument();
  });

  it("formats the row date with fr-FR / day-numeric month-short year-numeric", async () => {
    fetchHistoryMock.mockResolvedValueOnce({
      pinnedDiagnostic: null,
      feed: [makeRow({ id: "graded-1", createdAt: "2026-05-05T14:32:11Z" })],
      nextCursor: null,
    });

    renderWithI18n(<CorrectionPickerScreen />);

    const row = await screen.findByTestId("correction-row-graded-1");
    expect(row).toHaveTextContent("5 mai 2026");
  });

  it("clicking a row pushes /{locale}/app/coach/correction/{kind}/{id}", async () => {
    fetchHistoryMock.mockResolvedValueOnce({
      pinnedDiagnostic: null,
      feed: [makeRow({ id: "sub-42", kind: "sprechen" })],
      nextCursor: null,
    });

    renderWithI18n(<CorrectionPickerScreen />);

    const row = await screen.findByTestId("correction-row-sub-42");
    fireEvent.click(row);

    expect(pushMock).toHaveBeenCalledWith("/fr/app/coach/correction/sprechen/sub-42");
  });

  it("nextCursor present -> Voir plus loads and appends the next page", async () => {
    fetchHistoryMock.mockResolvedValueOnce({
      pinnedDiagnostic: null,
      feed: [makeRow({ id: "page-1" })],
      nextCursor: "cursor-2",
    });

    renderWithI18n(<CorrectionPickerScreen />);

    await screen.findByTestId("correction-row-page-1");
    const loadMore = screen.getByTestId("correction-load-more");
    expect(loadMore).toBeInTheDocument();

    fetchHistoryMock.mockResolvedValueOnce({
      pinnedDiagnostic: null,
      feed: [makeRow({ id: "page-2" })],
      nextCursor: null,
    });

    fireEvent.click(loadMore);

    await waitFor(() => expect(screen.getByTestId("correction-row-page-2")).toBeInTheDocument());
    expect(screen.getByTestId("correction-row-page-1")).toBeInTheDocument();
    expect(fetchHistoryMock).toHaveBeenCalledWith({ cursor: "cursor-2" });
    expect(screen.queryByTestId("correction-load-more")).not.toBeInTheDocument();
  });

  it("empty feed renders coach:correction.picker.empty copy", async () => {
    fetchHistoryMock.mockResolvedValueOnce({ pinnedDiagnostic: null, feed: [], nextCursor: null });

    renderWithI18n(<CorrectionPickerScreen />);

    await waitFor(() =>
      expect(screen.getByText("Aucune copie corrigée")).toBeInTheDocument()
    );
    expect(
      screen.getByText("Termine une expression écrite ou orale — sa correction apparaîtra ici.")
    ).toBeInTheDocument();
  });

  it("error renders coach:correction.picker.error copy + retry, retry re-fetches", async () => {
    fetchHistoryMock.mockRejectedValueOnce(new Error("boom"));

    renderWithI18n(<CorrectionPickerScreen />);

    await waitFor(() => expect(screen.getByText("Chargement impossible")).toBeInTheDocument());
    expect(screen.getByText("Vérifie ta connexion, puis réessaie.")).toBeInTheDocument();

    fetchHistoryMock.mockResolvedValueOnce({
      pinnedDiagnostic: null,
      feed: [makeRow({ id: "recovered-1" })],
      nextCursor: null,
    });

    fireEvent.click(screen.getByTestId("correction-picker-retry"));

    await waitFor(() =>
      expect(screen.getByTestId("correction-row-recovered-1")).toBeInTheDocument()
    );
  });

  // NOTE (fix round — cancelled guard on the mount effect): a dedicated
  // regression test for the StrictMode double-invoke race was attempted
  // and deliberately NOT kept — see task-9.9-report.md's fix-round section
  // for the full investigation. Summary: (1) a bare-hooks probe confirms
  // React *does* double-invoke `useEffect` under `<StrictMode>` in this
  // harness; (2) adding `useTranslation` (react-i18next) to the hook tree
  // suppresses that double-invoke down to a single call, so it cannot be
  // reproduced against the real screen; (3) a `key`-forced remount was
  // tried as a StrictMode-independent stand-in, but mutation-checking it
  // (temporarily deleting the `isCancelled()` guard) proved it NOT
  // load-bearing — a `key` change fully unmounts the old fiber, which
  // React already no-ops `setState` against on its own, independent of any
  // guard, so the test passed with or without the fix. Kept the code fix
  // (matches Constraint 12 and `CorrectionWalkthroughScreen`'s identical,
  // already-reviewed pattern) without a synthetic test that would offer
  // false confidence — consistent with the reviewer's own observation that
  // "unit tests don't reproduce this class of bug."
});

// ---------------------------------------------------------------------------
// CorrectionWalkthroughScreen — sprechen
// ---------------------------------------------------------------------------

describe("CorrectionWalkthroughScreen — sprechen", () => {
  it("renders GlobalScoreBlock from overall_score + summary.headline_fr", async () => {
    fetchCorrectionMock.mockResolvedValueOnce({ modality: "sprechen", feedback: SPRECHEN_FIXTURE });

    renderWithI18n(
      <CorrectionWalkthroughScreen submissionId="sub-sprechen-1" modality="sprechen" />
    );

    await waitFor(() =>
      expect(screen.getByTestId("correction-walkthrough")).toHaveTextContent("67")
    );
    expect(
      screen.getByText("Tu couvres 4 folies sur 5 — reprends la troisième, le reste tient.")
    ).toBeInTheDocument();
  });

  it("renders a DimensionCard for each of the 5 sprechen dims, in order (mutation guard b)", async () => {
    fetchCorrectionMock.mockResolvedValueOnce({ modality: "sprechen", feedback: SPRECHEN_FIXTURE });

    const { container } = renderWithI18n(
      <CorrectionWalkthroughScreen submissionId="sub-sprechen-1" modality="sprechen" />
    );

    for (const key of ["aufgabe", "kohaerenz", "wortschatz", "grammatik", "aussprache"]) {
      await waitFor(() =>
        expect(screen.getByTestId(`correction-dimension-${key}`)).toBeInTheDocument()
      );
    }

    const cards = Array.from(
      container.querySelectorAll('[data-testid^="correction-dimension-"]')
    ).map((el) => el.getAttribute("data-testid"));
    expect(cards).toEqual([
      "correction-dimension-aufgabe",
      "correction-dimension-kohaerenz",
      "correction-dimension-wortschatz",
      "correction-dimension-grammatik",
      "correction-dimension-aussprache",
    ]);
  });

  it("AnnotatedTranscriptView renders only for dims with evidence_spans.length > 0 (mutation guard c)", async () => {
    fetchCorrectionMock.mockResolvedValueOnce({ modality: "sprechen", feedback: SPRECHEN_FIXTURE });

    renderWithI18n(
      <CorrectionWalkthroughScreen submissionId="sub-sprechen-1" modality="sprechen" />
    );

    // aufgabe + grammatik carry evidence_spans in the fixture; the rest don't.
    await waitFor(() =>
      expect(screen.getByTestId("correction-transcript-aufgabe")).toBeInTheDocument()
    );
    expect(screen.getByTestId("correction-transcript-grammatik")).toBeInTheDocument();
    expect(screen.queryByTestId("correction-transcript-kohaerenz")).not.toBeInTheDocument();
    expect(screen.queryByTestId("correction-transcript-wortschatz")).not.toBeInTheDocument();
    expect(screen.queryByTestId("correction-transcript-aussprache")).not.toBeInTheDocument();
  });

  it("clicking a highlighted span reveals the FR (and DE) justification", async () => {
    // NOTE: SPRECHEN_FIXTURE's own `aufgabe.evidence_spans[0]` offsets
    // (142-198) exceed its `asr_evidence.transcript` length (174 chars) —
    // a latent inconsistency in the shared 9.8 fixture, never exercised
    // by 9.8's own tests (which fed synthetic strings straight into
    // `resolveSpans`, not this JSON's transcript+span pairing). Left
    // as-is per the immutable-fixture constraint; this test uses a
    // local override with an in-range offset (verified against the real
    // transcript: `transcript.indexOf(quote_de) === 0`) so the
    // click-to-reveal interaction is exercised against valid data.
    const fixtureWithValidSpan: FeedbackV2 = {
      ...SPRECHEN_FIXTURE,
      dimension_scores: {
        ...SPRECHEN_FIXTURE.dimension_scores,
        aufgabe: {
          ...SPRECHEN_FIXTURE.dimension_scores.aufgabe,
          evidence_spans: [
            {
              transcript_offset_start: 0,
              transcript_offset_end: 35,
              quote_de: "Heute möchte ich über die Vorteile",
              label: "intro_frame",
            },
          ],
        },
      },
    };
    fetchCorrectionMock.mockResolvedValueOnce({
      modality: "sprechen",
      feedback: fixtureWithValidSpan,
    });

    renderWithI18n(
      <CorrectionWalkthroughScreen submissionId="sub-sprechen-1" modality="sprechen" />
    );

    const transcript = await screen.findByTestId("correction-transcript-aufgabe");
    expect(within(transcript).queryByText(/Tu couvres 4 folies/)).not.toBeInTheDocument();

    fireEvent.click(within(transcript).getByTestId("correction-transcript-aufgabe-highlight-0"));

    expect(
      within(transcript).getByText(
        "Tu couvres 4 folies sur 5. Reprends la troisième — la situation au pays — la prochaine fois."
      )
    ).toBeInTheDocument();
  });

  it("passes the SAME evidence_spans array reference into resolveSpans — un-cloned (mutation guard d)", async () => {
    fetchCorrectionMock.mockResolvedValueOnce({ modality: "sprechen", feedback: SPRECHEN_FIXTURE });

    renderWithI18n(
      <CorrectionWalkthroughScreen submissionId="sub-sprechen-1" modality="sprechen" />
    );

    await screen.findByTestId("correction-transcript-aufgabe");

    const expectedSpans = SPRECHEN_FIXTURE.dimension_scores.aufgabe.evidence_spans;
    const call = resolveSpansSpy.mock.calls.find(([, spans]) => spans === expectedSpans);
    expect(call).toBeDefined();
  });

  it("fetchCorrection rejecting renders coach:correction.walkthrough.error copy", async () => {
    fetchCorrectionMock.mockRejectedValueOnce(new Error("correction_unavailable"));

    renderWithI18n(
      <CorrectionWalkthroughScreen submissionId="sub-sprechen-1" modality="sprechen" />
    );

    await waitFor(() =>
      expect(screen.getByText("Correction indisponible")).toBeInTheDocument()
    );
    expect(
      screen.getByText("Cette copie n'a pas pu être chargée. Réessaie plus tard.")
    ).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// CorrectionWalkthroughScreen — schreiben
// ---------------------------------------------------------------------------

describe("CorrectionWalkthroughScreen — schreiben", () => {
  it("renders SchreibenDiffView + the 4 schreiben dims with the right diff segment classes", async () => {
    fetchCorrectionMock.mockResolvedValueOnce(schreibenCorrection());

    renderWithI18n(
      <CorrectionWalkthroughScreen submissionId="sub-schreiben-1" modality="schreiben" />
    );

    const diff = await screen.findByTestId("correction-diff");
    expect(diff).toBeInTheDocument();

    for (const key of ["erfuellung", "kohaerenz", "wortschatz", "strukturen"]) {
      expect(screen.getByTestId(`correction-dimension-${key}`)).toBeInTheDocument();
    }
    // sprechen-only dims must never appear on the schreiben branch.
    expect(screen.queryByTestId("correction-dimension-aufgabe")).not.toBeInTheDocument();
    expect(screen.queryByTestId("correction-dimension-grammatik")).not.toBeInTheDocument();
    expect(screen.queryByTestId("correction-dimension-aussprache")).not.toBeInTheDocument();

    // "Ich habe gegangen ins Kino." vs "Ich bin ins Kino gegangen." ->
    // removed "habe"/"gegangen" (moved), added "bin"; segment 1 ("Ich") is
    // equal so it carries no removed/added styling.
    const removedHabe = within(diff).getByText("habe");
    expect(removedHabe.className).toContain("line-through");
    const addedBin = within(diff).getByText("bin");
    expect(addedBin.className).toContain("text-success-text");
  });

  it("shows the Betreuer prose card only when betreuerText is non-empty", async () => {
    fetchCorrectionMock.mockResolvedValueOnce(schreibenCorrection({ betreuerText: "" }));

    renderWithI18n(
      <CorrectionWalkthroughScreen submissionId="sub-schreiben-2" modality="schreiben" />
    );

    await screen.findByTestId("correction-diff");
    expect(screen.queryByTestId("correction-diff-betreuer")).not.toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// isModality — screen-level route-param guard
// ---------------------------------------------------------------------------

describe("isModality", () => {
  it("accepts the two valid modalities", () => {
    expect(isModality("schreiben")).toBe(true);
    expect(isModality("sprechen")).toBe(true);
  });

  it("rejects anything else", () => {
    expect(isModality("lesen")).toBe(false);
    expect(isModality("")).toBe(false);
    expect(isModality("Schreiben")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// AnnotatedTranscriptView — straddling-span merge (direct render)
// ---------------------------------------------------------------------------

describe("AnnotatedTranscriptView", () => {
  it("a span straddling another span's cut point merges into ONE highlight, not two", () => {
    const transcript = "0123456789012345678901234567890"; // 32 chars
    const spanA: EvidenceSpan = {
      transcript_offset_start: 0,
      transcript_offset_end: 15,
      quote_de: "a",
      label: "span-a",
    };
    const spanB: EvidenceSpan = {
      transcript_offset_start: 10,
      transcript_offset_end: 20,
      quote_de: "b",
      label: "span-b",
    };

    renderWithI18n(
      <AnnotatedTranscriptView
        transcript={transcript}
        spans={[spanA, spanB]}
        justificationDe="DE justification"
        justificationFr="FR justification"
        testID="test-transcript"
      />
    );

    // One merged highlight (spans[0] === spanA -> key "span-a"), not two.
    expect(screen.getByTestId("test-transcript-highlight-0")).toBeInTheDocument();
    expect(screen.queryByTestId("test-transcript-highlight-1")).not.toBeInTheDocument();
  });
});
