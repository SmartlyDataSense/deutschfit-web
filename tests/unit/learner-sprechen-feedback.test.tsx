/**
 * `SprechenFeedbackScreen` — S7 Task 7.9. Web port coverage mirroring
 * `deutschfit-mobile/src/features/sprechen/__tests__/SprechenFeedbackScreen.test.tsx`
 * shape (mocked poller snapshots drive every branch deterministically,
 * same `vi.hoisted` mutable-object idiom `learner-schreiben-feedback.test.tsx`
 * uses for `useSubmissionPolling`).
 *
 * `AudioReplayButton` (already covered by its own Task 7.3 suite) is
 * mocked here to a plain stub — this file's job is the screen's branch
 * logic, not audio playback internals.
 */
import { cleanup, fireEvent, render as rtlRender, screen, within } from "@testing-library/react";
import { StrictMode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { pollingState, pushMock, replaceMock, backMock, acknowledgeReadinessMock } = vi.hoisted(
  () => ({
    pollingState: {
      status: "idle" as string,
      data: null as Record<string, unknown> | null,
      error: null as string | null,
    },
    pushMock: vi.fn(),
    replaceMock: vi.fn(),
    backMock: vi.fn(),
    acknowledgeReadinessMock: vi.fn(),
  })
);

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock, replace: replaceMock, back: backMock }),
}));
vi.mock("next-intl", () => ({ useLocale: () => "fr" }));

vi.mock("@/learner/core/readiness", () => ({
  acknowledgeReadiness: (...args: unknown[]) => acknowledgeReadinessMock(...args),
}));

// Snapshot-controllable poller — same idiom `learner-schreiben-feedback.test.tsx`
// uses for `useSubmissionPolling`.
vi.mock("@/learner/sprechen/hooks/useSprechenSubmissionPolling", () => ({
  useSprechenSubmissionPolling: () => pollingState,
}));

// Audio playback internals are covered by Task 7.3's own suite — stub the
// component here so this file stays focused on the screen's branch logic.
vi.mock("@/learner/sprechen/components/AudioReplayButton", () => ({
  AudioReplayButton: ({ testID = "sprechen-feedback-audio-replay" }: { testID?: string }) => (
    <div data-testid={testID}>audio-replay-stub</div>
  ),
}));

import { LearnerI18nProvider } from "@/learner/core/i18n/LearnerI18nProvider";
import { SprechenFeedbackScreen } from "@/learner/sprechen/screens/SprechenFeedbackScreen";
import { useTopicHandoff } from "@/learner/sprechen/topicHandoffStore";

function setPolling(
  status: string,
  data: Record<string, unknown> | null,
  error: string | null = null
): void {
  pollingState.status = status;
  pollingState.data = data;
  pollingState.error = error;
}

function render(submissionId = "sub-1") {
  return rtlRender(
    <LearnerI18nProvider lng="fr">
      <SprechenFeedbackScreen submissionId={submissionId} />
    </LearnerI18nProvider>
  );
}

function renderStrict(submissionId = "sub-1") {
  return rtlRender(
    <StrictMode>
      <LearnerI18nProvider lng="fr">
        <SprechenFeedbackScreen submissionId={submissionId} />
      </LearnerI18nProvider>
    </StrictMode>
  );
}

// Full FeedbackV2 fixture — offsets deliberately out of DIMENSION_ORDER
// sequence so the flattened + sorted evidence-span assertion actually
// exercises the sort (not just an already-sorted input by coincidence).
// DIMENSION_ORDER = [aufgabe, kohaerenz, wortschatz, grammatik, aussprache]
// offsets:            40         10          30         0          20
// sorted ascending:  grammatik(0) < kohaerenz(10) < aussprache(20) <
//                    wortschatz(30) < aufgabe(40)
function dimensionScore(offset: number, dimension: string, score: number) {
  return {
    score,
    cap_applied: null,
    cap_reason: null,
    justification_de: `DE-Begründung ${dimension}.`,
    justification_fr: `Justification FR ${dimension}.`,
    evidence_spans: [
      {
        transcript_offset_start: offset,
        transcript_offset_end: offset + 5,
        quote_de: `Zitat ${dimension}`,
        label: `label_${dimension}`,
      },
    ],
  };
}

const gradedV2Data = {
  id: "sub-g1",
  user_id: "u1",
  exam_slug: "telc-b2",
  teil: 1,
  status: "graded",
  audio_storage_path: "path/audio.webm",
  audio_duration_ms: 60000,
  transcript_de: "Das ist ein Testtranskript.",
  error_message: null,
  created_at: "2026-08-01T09:00:00Z",
  graded_at: "2026-08-01T09:05:00Z",
  uploaded_at: "2026-08-01T08:59:00Z",
  score: 78,
  schema_version: 2,
  feedback_json: {
    schema_version: 2,
    grader_version: "v2.1.0",
    graded_at: "2026-08-01T09:05:00Z",
    submission_id: "sub-g1",
    cert_code: "TELC",
    level_code: "B2",
    monologue_type: "presentation_with_outline",
    overall_score: 78,
    band: "solide",
    band_downgrade_reason: null,
    feedback_blocked_reason: null,
    dimension_scores: {
      aufgabe: dimensionScore(40, "aufgabe", 80),
      kohaerenz: dimensionScore(10, "kohaerenz", 75),
      wortschatz: dimensionScore(30, "wortschatz", 70),
      grammatik: dimensionScore(0, "grammatik", 72),
      aussprache: dimensionScore(20, "aussprache", 85),
    },
    asr_evidence: {
      transcript: "Das ist ein Testtranskript.",
      duration_seconds: 60,
      intelligibility_score: 0.9,
      intelligibility_basis: "logprob_normalized",
      low_confidence_spans: [],
      provider: "whisper-1",
    },
    summary: {
      headline_fr: "Belle présentation, bien structurée.",
      strengths_fr: ["Bonne structure.", "Vocabulaire varié."],
      growth_areas_fr: ["Travaille les articles."],
      headline_de: "Gute, gut strukturierte Präsentation.",
      strengths_de: ["Gute Struktur.", "Vielfältiger Wortschatz."],
      growth_areas_de: ["Arbeite an den Artikeln."],
    },
    next_steps: [
      {
        id: "ns1",
        label_fr: "Revois les articles définis.",
        label_de: "Übe die bestimmten Artikel.",
        linked_dimension: "grammatik",
        drill_hint: null,
      },
    ],
    metadata: {
      prompt_brief_keys_used: [],
      weights_applied: {
        aufgabe: 0.3,
        kohaerenz: 0.2,
        wortschatz: 0.2,
        grammatik: 0.2,
        aussprache: 0.1,
      },
      rubric_descriptor_set: "B2",
      grader_latency_ms: 4200,
      model: "test-model",
    },
  },
};

const legacyGradedData = {
  id: "sub-legacy-1",
  user_id: "u1",
  exam_slug: "goethe-b1",
  teil: 2,
  status: "graded",
  audio_storage_path: "path/legacy.webm",
  audio_duration_ms: 45000,
  transcript_de: "Alte Aufnahme.",
  error_message: null,
  created_at: "2026-06-01T09:00:00Z",
  graded_at: "2026-06-01T09:05:00Z",
  uploaded_at: "2026-06-01T08:59:00Z",
  score: 60,
  feedback_json: {
    feedback_de: "Gut gemacht.",
    feedback_fr: "Bien joué.",
    rubric_version: "v1",
  },
};

beforeEach(() => {
  pushMock.mockReset();
  replaceMock.mockReset();
  backMock.mockReset();
  acknowledgeReadinessMock.mockReset();
  useTopicHandoff.setState({ topic: null });
  setPolling("idle", null);
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("SprechenFeedbackScreen — in-flight statuses", () => {
  it.each(["idle", "awaiting_upload", "queued", "in_progress"])(
    "status=%s renders the in-flight fallback under the root testID",
    (status) => {
      setPolling(status, null);
      render();
      expect(screen.getByTestId("sprechen-feedback-screen")).toBeInTheDocument();
      expect(screen.getByTestId("sprechen-feedback-in-flight-fallback")).toBeInTheDocument();
      expect(screen.getByTestId("sprechen-feedback-close-skeleton")).toBeInTheDocument();
    }
  );

  it("close-skeleton routes back", () => {
    setPolling("queued", null);
    render();
    fireEvent.click(screen.getByTestId("sprechen-feedback-close-skeleton"));
    expect(backMock).toHaveBeenCalledTimes(1);
  });

  it("auto-closes exactly once, 1000ms after mount, while status stays in-flight", () => {
    vi.useFakeTimers();
    setPolling("queued", null);
    render();
    expect(backMock).not.toHaveBeenCalled();

    vi.advanceTimersByTime(999);
    expect(backMock).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1);
    expect(backMock).toHaveBeenCalledTimes(1);

    // Further elapsed time must not re-fire the one-shot redirect.
    vi.advanceTimersByTime(5000);
    expect(backMock).toHaveBeenCalledTimes(1);
  });

  // React 18 dev StrictMode double-invokes mount effects (mount → cleanup →
  // remount). The naive fix — gating `setTimeout` itself behind the ref —
  // breaks here: pass 1 schedules a timer and flips the ref; the synthetic
  // cleanup cancels that timer; pass 2 sees the ref already tripped and
  // schedules nothing, so the auto-back never fires at all. The correct
  // (StrictMode-safe) shape checks the ref INSIDE the timer callback: both
  // passes schedule their own timer, the synthetic cleanup cancels pass
  // 1's, and pass 2's timer survives to fire exactly once. This test
  // exercises exactly that: delete the inner ref check (or move it back to
  // gating `setTimeout`) and this fails (0 or 2 calls instead of 1).
  it("under React 18 StrictMode's dev double-invoke, the auto-back still fires exactly once", () => {
    vi.useFakeTimers();
    setPolling("queued", null);
    renderStrict();
    expect(backMock).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1000);
    expect(backMock).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(5000);
    expect(backMock).toHaveBeenCalledTimes(1);
  });
});

describe("SprechenFeedbackScreen — timeout", () => {
  it("renders the poll_exhausted EmptyState; its CTA routes back", () => {
    setPolling("timeout", null);
    render();
    expect(screen.getByTestId("sprechen-feedback-screen")).toBeInTheDocument();
    expect(screen.getByTestId("sprechen-feedback-timeout")).toBeInTheDocument();
    expect(screen.getByText("On vous prévient dès que c'est prêt")).toBeInTheDocument();
    fireEvent.click(screen.getByTestId("sprechen-feedback-timeout-cta"));
    expect(backMock).toHaveBeenCalledTimes(1);
  });
});

describe("SprechenFeedbackScreen — rejected (P9)", () => {
  it("error_message=language_not_german renders the language-specific branch", () => {
    setPolling("rejected", { error_message: "language_not_german" });
    render();
    expect(screen.getByTestId("sprechen-feedback-screen")).toBeInTheDocument();
    expect(
      screen.getByTestId("sprechen-feedback-rejected-language-not-german")
    ).toBeInTheDocument();
    expect(screen.getByTestId("sprechen-feedback-rejected")).toBeInTheDocument();
  });

  it.each(["duration_too_short", "transcript_too_short"])(
    "error_message=%s lands the shared too-short surface",
    (errorMessage) => {
      setPolling("rejected", { error_message: errorMessage });
      render();
      expect(screen.getByTestId("sprechen-feedback-rejected-too-short")).toBeInTheDocument();
    }
  );

  it("an unrecognized/null error_message falls back to the generic branch", () => {
    setPolling("rejected", { error_message: null });
    render();
    expect(screen.getByTestId("sprechen-feedback-rejected-generic")).toBeInTheDocument();
  });

  it("retake (primary CTA) clears the topic handoff and routes to the picker; secondary routes back", () => {
    useTopicHandoff.setState({
      topic: { id: "stale-topic", title_de: "Alt", subgenre: "praesentation" } as never,
    });
    setPolling("rejected", { error_message: "duration_too_short" });
    render();

    fireEvent.click(screen.getByTestId("sprechen-feedback-rejected-cta"));
    expect(useTopicHandoff.getState().topic).toBeNull();
    expect(pushMock).toHaveBeenCalledWith("/fr/app/sprechen");

    fireEvent.click(screen.getByTestId("sprechen-feedback-rejected-secondary"));
    expect(backMock).toHaveBeenCalledTimes(1);
  });
});

describe("SprechenFeedbackScreen — failed / error", () => {
  it.each(["failed", "error"])(
    "status=%s renders the failed EmptyState; CTA routes back",
    (status) => {
      setPolling(status, null);
      render();
      expect(screen.getByTestId("sprechen-feedback-screen")).toBeInTheDocument();
      expect(screen.getByTestId("sprechen-feedback-failed")).toBeInTheDocument();
      fireEvent.click(screen.getByTestId("sprechen-feedback-failed-cta"));
      expect(backMock).toHaveBeenCalledTimes(1);
    }
  );
});

describe("SprechenFeedbackScreen — graded, legacy (pre-v2) feedback_json", () => {
  beforeEach(() => setPolling("graded", legacyGradedData));

  it("renders the legacy banner and no bilan", () => {
    render();
    expect(screen.getByTestId("sprechen-feedback-screen")).toBeInTheDocument();
    expect(screen.getByTestId("sprechen-feedback-legacy-banner")).toBeInTheDocument();
    expect(screen.queryByTestId("sprechen-feedback-band")).not.toBeInTheDocument();
    expect(screen.queryByTestId("sprechen-feedback-examiner-card")).not.toBeInTheDocument();
    expect(screen.queryByTestId("sprechen-feedback-betreuer-card")).not.toBeInTheDocument();
  });

  it("retake-legacy clears the handoff and routes to the picker; close-legacy routes back", () => {
    useTopicHandoff.setState({
      topic: { id: "stale", title_de: "x", subgenre: "vortrag" } as never,
    });
    render();
    fireEvent.click(screen.getByTestId("sprechen-feedback-retake-legacy"));
    expect(useTopicHandoff.getState().topic).toBeNull();
    expect(pushMock).toHaveBeenCalledWith("/fr/app/sprechen");

    fireEvent.click(screen.getByTestId("sprechen-feedback-close-legacy"));
    expect(backMock).toHaveBeenCalledTimes(1);
  });
});

describe("SprechenFeedbackScreen — graded, v2 bilan", () => {
  beforeEach(() => setPolling("graded", gradedV2Data));

  it("renders the band pill and monologue-type chip", () => {
    render();
    expect(screen.getByTestId("sprechen-feedback-screen")).toBeInTheDocument();
    expect(screen.getByTestId("sprechen-feedback-band")).toHaveTextContent("Zone solide");
    expect(screen.getByTestId("sprechen-feedback-monologue-chip")).toHaveTextContent(
      "Präsentation"
    );
  });

  it("renders the weights recap in DIMENSION_ORDER", () => {
    render();
    expect(screen.getByTestId("sprechen-feedback-weights-recap")).toHaveTextContent(
      "aufgabe 30 % · kohaerenz 20 % · wortschatz 20 % · grammatik 20 % · aussprache 10 %"
    );
  });

  it("renders all five dimension rows as 'N / 100'", () => {
    render();
    expect(screen.getByTestId("sprechen-feedback-dimension-aufgabe")).toHaveTextContent("80 / 100");
    expect(screen.getByTestId("sprechen-feedback-dimension-kohaerenz")).toHaveTextContent(
      "75 / 100"
    );
    expect(screen.getByTestId("sprechen-feedback-dimension-wortschatz")).toHaveTextContent(
      "70 / 100"
    );
    expect(screen.getByTestId("sprechen-feedback-dimension-grammatik")).toHaveTextContent(
      "72 / 100"
    );
    expect(screen.getByTestId("sprechen-feedback-dimension-aussprache")).toHaveTextContent(
      "85 / 100"
    );
  });

  it("flattens evidence spans across all five dimensions sorted by transcript_offset_start", () => {
    render();
    const transcriptRoot = screen.getByTestId("sprechen-feedback-transcript");
    const items = within(transcriptRoot).getAllByTestId(
      /^sprechen-feedback-transcript-evidence-item-\d+$/
    );
    expect(items).toHaveLength(5);
    // Sorted ascending by offset: grammatik(0), kohaerenz(10), aussprache(20),
    // wortschatz(30), aufgabe(40) — see fixture comment above.
    const expectedOrder = [
      "grammatik",
      "kohaerenz",
      "aussprache",
      "wortschatz",
      "aufgabe",
    ] as const;
    items.forEach((item, index) => {
      const dimension = expectedOrder[index];
      if (dimension === undefined) throw new Error(`no expected dimension at index ${index}`);
      expect(item).toHaveTextContent(`Zitat ${dimension}`);
      expect(item).toHaveTextContent(dimension);
    });
  });

  it("renders the Betreuer headline and next steps", () => {
    render();
    expect(screen.getByTestId("sprechen-feedback-headline")).toHaveTextContent(
      "Belle présentation, bien structurée."
    );
    expect(screen.getByTestId("sprechen-feedback-strength-0")).toHaveTextContent(
      "Bonne structure."
    );
    expect(screen.getByTestId("sprechen-feedback-growth-0")).toHaveTextContent(
      "Travaille les articles."
    );
    expect(screen.getByTestId("sprechen-feedback-next-step-0")).toHaveTextContent(
      "Revois les articles définis."
    );
  });

  it("footer retake clears the handoff and routes to the picker; close routes home", () => {
    useTopicHandoff.setState({
      topic: { id: "stale", title_de: "x", subgenre: "vortrag" } as never,
    });
    render();
    fireEvent.click(screen.getByTestId("sprechen-feedback-retake"));
    expect(useTopicHandoff.getState().topic).toBeNull();
    expect(pushMock).toHaveBeenCalledWith("/fr/app/sprechen");

    fireEvent.click(screen.getByTestId("sprechen-feedback-close"));
    expect(pushMock).toHaveBeenCalledWith("/fr/app");
  });

  // Mirrors the schreiben suite's guard test: a plain render() + rerender()
  // does NOT exercise `clearedRef` (the `vi.hoisted` `pollingState` object
  // is not React state, so `[status, submissionId]` never changes across a
  // same-props rerender). StrictMode's dev-only mount → cleanup → remount
  // double-invocation of effects is what actually proves the guard —
  // deleting `clearedRef` would make this assert 2 calls instead of 1.
  it("acknowledgeReadiness fires exactly once under React 18 StrictMode's dev double-invoke of mount effects", () => {
    renderStrict("sub-g1");
    expect(acknowledgeReadinessMock).toHaveBeenCalledTimes(1);
    expect(acknowledgeReadinessMock).toHaveBeenCalledWith(
      expect.objectContaining({
        submissionId: "sub-g1",
        module: "sprechen",
        acknowledgedAt: expect.any(Number),
      })
    );
  });
});

// Constraint 9 — mobile's SprechenFeedbackScreen has no secondary
// `listPrompts`-style fetch behind a one-shot ref guard (confirmed against
// the full mobile source: the bilan reads entirely off the polled
// `feedback_json`, unlike Schreiben's screen, which separately resolves
// the prompt title/exam badge and is where the actual Constraint-9 guard
// class lives — see the carry-in fix + its regression test in
// `learner-schreiben-feedback.test.tsx`). There is therefore no analogous
// guard-reset bug to replicate or fix on this screen. What this screen DOES
// need to prove is that the already-built poller resilience (Task 7.4 —
// `createSprechenPoller`'s `tick()` never calls `stop()` on a transport
// error, so the loop keeps ticking) surfaces correctly here: a snapshot
// carrying a poll error alongside a still-non-terminal status must not
// wedge the screen, and a later snapshot reaching `graded` must still
// render the full bilan.
describe("SprechenFeedbackScreen — poller resilience (Constraint 9 non-replication)", () => {
  it("a transient poll error on a non-terminal status doesn't wedge the screen; a later graded snapshot still renders the bilan", () => {
    setPolling("queued", null, "poll_failed");
    const { rerender } = render("sub-g1");
    expect(screen.getByTestId("sprechen-feedback-in-flight-fallback")).toBeInTheDocument();

    setPolling("graded", gradedV2Data, null);
    rerender(
      <LearnerI18nProvider lng="fr">
        <SprechenFeedbackScreen submissionId="sub-g1" />
      </LearnerI18nProvider>
    );

    expect(screen.getByTestId("sprechen-feedback-band")).toBeInTheDocument();
    expect(screen.getByTestId("sprechen-feedback-examiner-card")).toBeInTheDocument();
  });
});
