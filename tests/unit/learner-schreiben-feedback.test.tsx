/**
 * `FeedbackScreen` — S6 Task 6.9. Web port coverage mirroring
 * `deutschfit-mobile/src/features/writing/__tests__/FeedbackScreen.test.tsx`.
 *
 * The polling hook is mocked via a `vi.hoisted` mutable snapshot so each
 * test can drive `pending` → `graded`/`timeout`/`failed` deterministically
 * without a real 2s poll loop. `listPrompts` (Constraint 15: mocked at the
 * `examApi` facade, not the lower-level `./writing` module) resolves the
 * prompt used for the exam badge / prompt card / retake route.
 */
import { cleanup, fireEvent, render as rtlRender, screen, waitFor } from "@testing-library/react";
import { StrictMode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const {
  pollingState,
  pushMock,
  replaceMock,
  backMock,
  listPromptsMock,
  hydrateMock,
  acknowledgeReadinessMock,
  trackEventMock,
} = vi.hoisted(() => ({
  pollingState: {
    status: "pending" as string,
    data: null as Record<string, unknown> | null,
    error: null as string | null,
  },
  pushMock: vi.fn(),
  replaceMock: vi.fn(),
  backMock: vi.fn(),
  listPromptsMock: vi.fn(),
  hydrateMock: vi.fn(),
  acknowledgeReadinessMock: vi.fn(),
  trackEventMock: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock, replace: replaceMock, back: backMock }),
}));
vi.mock("next-intl", () => ({ useLocale: () => "fr" }));

// Constraint 15: feature code imports wire fns ONLY from the `examApi`
// facade — mock that surface, not `./writing`.
vi.mock("@/learner/core/api/examApi", () => ({
  listPrompts: (...args: unknown[]) => listPromptsMock(...args),
}));
vi.mock("@/learner/core/exam/examContext", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/learner/core/exam/examContext")>();
  return { ...actual, hydrateExamContext: hydrateMock };
});
vi.mock("@/learner/core/readiness", () => ({
  acknowledgeReadiness: (...args: unknown[]) => acknowledgeReadinessMock(...args),
}));
vi.mock("@/learner/core/analytics/posthog", () => ({
  trackEvent: (...args: unknown[]) => trackEventMock(...args),
}));
// Snapshot-controllable poller — same `vi.hoisted` mutable-object idiom the
// task brief calls for ("mock the poller hook module for snapshot control").
vi.mock("@/learner/schreiben/hooks/useSubmissionPolling", () => ({
  useSubmissionPolling: () => pollingState,
}));

import { useExamContextStore } from "@/learner/core/exam/examContext";
import { LearnerI18nProvider } from "@/learner/core/i18n/LearnerI18nProvider";
import { FeedbackScreen } from "@/learner/schreiben/screens/FeedbackScreen";

function setPolling(status: string, data: Record<string, unknown> | null): void {
  pollingState.status = status;
  pollingState.data = data;
}

// `LearnerI18nProvider` (not the `renderWithI18n` helper) so every test in
// this file mounts through the same wrapper shape. The `acknowledgeReadiness`
// once-guard test below does NOT use this helper — it needs a `StrictMode`
// wrapper around the same tree to exercise React 18's dev-only mount →
// cleanup → remount double-invocation, so it calls `rtlRender` directly.
function render(submissionId = "sub-1") {
  return rtlRender(
    <LearnerI18nProvider lng="fr">
      <FeedbackScreen submissionId={submissionId} />
    </LearnerI18nProvider>
  );
}

const samplePrompt = {
  id: "prompt-1",
  exam_board: "telc-b2",
  teil: 1,
  slug: "prompt-1-slug",
  title_de: "Einladung zur Geburtstagsparty",
  situation_de: "Du lädst einen Freund ein.",
  bullet_points: [],
  min_words: 80,
  max_words: 150,
};

// telc-style points profile — the exact fixture values named in the task
// brief (score 31/45, floor 27).
const telcPointsData = {
  id: "sub-1",
  user_id: "u1",
  prompt_id: "prompt-1",
  body_de: "Liebe Anna, ich schreibe dir aus der Schule.",
  word_count: 90,
  status: "graded",
  score_inhalt: null,
  score_wortschatz_gram: null,
  score_kommunikation: null,
  feedback_json: null,
  grader_version: "v2",
  model_name: "test-model",
  graded_at: "2026-08-01T10:00:00Z",
  error_message: null,
  created_at: "2026-08-01T09:00:00Z",
  pruefer_text: "Korrigierter Brief mit drei Verbesserungen.",
  betreuer_text: "Tu progresses bien — encore un peu de soin sur les cas.",
  dimension_scores_json: {
    inhalt: { score: 10, max: 15, pct: 67 },
    kommunikative_gestaltung: { score: 11, max: 15, pct: 73 },
    formale_richtigkeit: { score: 10, max: 15, pct: 67 },
  },
  normalized_total_pct: 69,
  score: 31,
  score_max: 45,
  pass_floor_points: 27,
};

// Legacy pre-v2 row: `pruefer_text: null`, 3/4/4 sub-scores → legacyScore
// = (3+4+4) * 4 = 44 (brief-mandated math check).
const legacyData = {
  id: "sub-2",
  user_id: "u1",
  prompt_id: "prompt-1",
  body_de: "Alter Brief vom alten Format.",
  word_count: 60,
  status: "graded",
  score_inhalt: 3,
  score_wortschatz_gram: 4,
  score_kommunikation: 4,
  feedback_json: null,
  grader_version: "v1",
  model_name: null,
  graded_at: "2026-07-01T10:00:00Z",
  error_message: null,
  created_at: "2026-07-01T09:00:00Z",
  pruefer_text: null,
  betreuer_text: null,
  dimension_scores_json: null,
  normalized_total_pct: null,
  score: null,
  score_max: null,
  pass_floor_points: null,
};

beforeEach(() => {
  pushMock.mockReset();
  replaceMock.mockReset();
  backMock.mockReset();
  listPromptsMock.mockReset();
  hydrateMock.mockReset();
  acknowledgeReadinessMock.mockReset();
  trackEventMock.mockReset();
  listPromptsMock.mockResolvedValue([samplePrompt]);
  useExamContextStore.setState({ board: "telc", level: "b2", isLoaded: true } as never);
  setPolling("pending", null);
});
afterEach(cleanup);

describe("FeedbackScreen — polling states", () => {
  it("pending renders the pending copy under the root testID", () => {
    setPolling("pending", null);
    render();
    expect(screen.getByTestId("schreiben-feedback-screen")).toBeInTheDocument();
    expect(screen.getByText("Notre grader analyse ta copie…")).toBeInTheDocument();
  });

  it("grading also renders the pending copy (idle/pending/grading share the calm state)", () => {
    setPolling("grading", null);
    render();
    expect(screen.getByText("Notre grader analyse ta copie…")).toBeInTheDocument();
  });

  it("timeout renders the poll_exhausted block; its CTA routes home", () => {
    setPolling("timeout", null);
    render();
    expect(screen.getByTestId("schreiben-feedback-screen")).toBeInTheDocument();
    expect(screen.getByText("On vous prévient dès que c'est prêt")).toBeInTheDocument();
    const cta = screen.getByTestId("schreiben-feedback-timeout-cta");
    fireEvent.click(cta);
    expect(pushMock).toHaveBeenCalledWith("/fr/app");
  });

  it("failed renders the retry block under the root testID (F10 web delta — mobile omits the root testID on this branch)", () => {
    setPolling("failed", null);
    render();
    expect(screen.getByTestId("schreiben-feedback-screen")).toBeInTheDocument();
    expect(screen.getByText("La correction a échoué")).toBeInTheDocument();
    fireEvent.click(screen.getByTestId("schreiben-feedback-failed-cta"));
    expect(backMock).toHaveBeenCalledTimes(1);
  });
});

describe("FeedbackScreen — graded, new format (telc points profile)", () => {
  beforeEach(() => setPolling("graded", telcPointsData));

  it("renders the locked section order: module-result → prompt → text → Prüfer → Betreuer", async () => {
    render();
    await waitFor(() =>
      expect(screen.getByTestId("schreiben-feedback-prompt-card")).toBeInTheDocument()
    );

    const moduleResult = screen.getByTestId("schreiben-feedback-module-result");
    const promptCard = screen.getByTestId("schreiben-feedback-prompt-card");
    const textCard = screen.getByTestId("schreiben-feedback-text-card");
    const prueferCard = screen.getByTestId("schreiben-feedback-pruefer-card");
    const betreuerCard = screen.getByTestId("schreiben-feedback-betreuer-card");

    // `compareDocumentPosition` bit 4 (DOCUMENT_POSITION_FOLLOWING) is set
    // on `b` when `b` comes after `a` in the document — i.e. `a` precedes
    // `b`. Asserts the LOCKED top-to-bottom order end to end.
    for (const [a, b] of [
      [moduleResult, promptCard],
      [promptCard, textCard],
      [textCard, prueferCard],
      [prueferCard, betreuerCard],
    ] as const) {
      expect(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    }
  });

  it("renders the board-native scorecard (not the donut) with the exam badge and eyebrow", async () => {
    render();
    await waitFor(() =>
      expect(screen.getByTestId("schreiben-feedback-exam-badge")).toBeInTheDocument()
    );
    expect(screen.getByTestId("schreiben-feedback-exam-badge")).toHaveTextContent(
      /telc · B2 · Schreiben Teil 1/
    );
    expect(screen.getByTestId("schreiben-feedback-module-result-scorecard")).toBeInTheDocument();
    expect(
      screen.queryByTestId("schreiben-feedback-module-result-donut-block")
    ).not.toBeInTheDocument();
    expect(screen.getByTestId("score-header-eyebrow")).toHaveTextContent(
      "Total · telc · B2 · Schreiben"
    );
  });

  it("renders the Prüfer and Betreuer cards with their body text; no legacy note", () => {
    render();
    expect(screen.getByTestId("schreiben-feedback-pruefer-card")).toHaveTextContent(
      "Korrigierter Brief mit drei Verbesserungen."
    );
    expect(screen.getByTestId("schreiben-feedback-betreuer-card")).toHaveTextContent(
      "Tu progresses bien"
    );
    expect(screen.queryByTestId("schreiben-feedback-legacy-note")).not.toBeInTheDocument();
    expect(screen.queryByTestId("schreiben-feedback-score-card")).not.toBeInTheDocument();
  });

  it("never renders the anti-requirement surfaces: no PostGradeDrillCard, no missing_structures link (5-6)", () => {
    render();
    expect(screen.queryByTestId("schreiben-feedback-drill")).not.toBeInTheDocument();
    expect(screen.queryByTestId("schreiben-feedback-drill-link")).not.toBeInTheDocument();
  });

  it("retake CTA path contains /schreiben/compose/ and emits the catalogued analytics event", async () => {
    render();
    await waitFor(() =>
      expect(screen.getByTestId("schreiben-feedback-prompt-card")).toBeInTheDocument()
    );
    fireEvent.click(screen.getByTestId("schreiben-feedback-retake-cta"));
    expect(replaceMock).toHaveBeenCalledWith(expect.stringContaining("/schreiben/compose/"));
    expect(replaceMock).toHaveBeenCalledWith("/fr/app/schreiben/compose/prompt-1");
    expect(trackEventMock).toHaveBeenCalledWith("schreiben_result_retake_tapped", {
      prompt_id: "prompt-1",
    });
  });

  it("home CTA routes to the Accueil root and emits the catalogued analytics event", () => {
    render();
    fireEvent.click(screen.getByTestId("schreiben-feedback-home-cta"));
    expect(pushMock).toHaveBeenCalledWith("/fr/app");
    expect(trackEventMock).toHaveBeenCalledWith("schreiben_result_home_tapped", {
      prompt_id: "prompt-1",
    });
  });

  // A plain `render()` + same-props `rerender()` does NOT exercise the
  // `clearedRef` guard: `pollingState` is a `vi.hoisted` mutable object, not
  // React state, so `status`/`submissionId` are byte-identical across
  // passes and the effect's `[status, submissionId]` deps never change —
  // React would not re-invoke the effect body a second time even with the
  // guard deleted. The guard's real protective value is against React 18
  // StrictMode's dev-only mount → cleanup → remount double-invocation of
  // effects on initial mount (`reactStrictMode: true` in `next.config.ts`):
  // the first pass sets `acknowledgeReadiness` and flips `clearedRef.current`
  // to `true`; the synthetic cleanup is a no-op (no cleanup fn returned);
  // the second pass sees the guard already tripped and skips the call.
  // Without the guard, both passes would fire, so this genuinely proves the
  // guard — verified by temporarily deleting it and confirming this test
  // fails with 2 calls (see task-6.9-report.md).
  it("acknowledgeReadiness fires exactly once under React 18 StrictMode's dev double-invoke of mount effects", () => {
    rtlRender(
      <StrictMode>
        <LearnerI18nProvider lng="fr">
          <FeedbackScreen submissionId="sub-1" />
        </LearnerI18nProvider>
      </StrictMode>
    );
    expect(acknowledgeReadinessMock).toHaveBeenCalledTimes(1);
    expect(acknowledgeReadinessMock).toHaveBeenCalledWith(
      expect.objectContaining({
        submissionId: "sub-1",
        module: "schreiben",
        acknowledgedAt: expect.any(Number),
      })
    );
  });
});

describe("FeedbackScreen — graded, legacy format (pruefer_text = null)", () => {
  beforeEach(() => setPolling("graded", legacyData));

  it("renders the legacyScore (3+4+4)*4 = 44 and the legacy note; no scorecard/module-result", () => {
    render();
    expect(screen.getByTestId("schreiben-feedback-score-card")).toHaveTextContent("44 / 100");
    expect(screen.getByTestId("schreiben-feedback-legacy-note")).toBeInTheDocument();
    expect(screen.queryByTestId("schreiben-feedback-module-result")).not.toBeInTheDocument();
    expect(screen.queryByTestId("schreiben-feedback-pruefer-card")).not.toBeInTheDocument();
    expect(screen.queryByTestId("schreiben-feedback-betreuer-card")).not.toBeInTheDocument();
  });

  it("still renders the text card with body_de", () => {
    render();
    expect(screen.getByTestId("schreiben-feedback-text-card")).toHaveTextContent(
      "Alter Brief vom alten Format."
    );
  });

  it("hides the score card when all three legacy score columns are null", () => {
    setPolling("graded", {
      ...legacyData,
      score_inhalt: null,
      score_wortschatz_gram: null,
      score_kommunikation: null,
    });
    render();
    expect(screen.queryByTestId("schreiben-feedback-score-card")).not.toBeInTheDocument();
  });
});
