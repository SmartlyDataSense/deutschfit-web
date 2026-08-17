/**
 * Connector drill chain (System B) + launch store — S9 · Task 9.5.
 *
 * Covers:
 *   - `buildConnectorDrillChain` determinism / distractor shape / empty
 *     input / nonce-driven variation (ports mobile's `data.test.ts`
 *     coverage against the web `ConnectorDrill` shape).
 *   - `useDrillChain`'s answer/next/reset state machine (ports mobile's
 *     `useDrillChain.test.tsx` coverage, `isCorrect` field per the
 *     task-9.5-brief's `Produces` contract).
 *   - `useDrillChainStore`'s `setLaunch`/`consumePendingSummary`
 *     read-then-clear semantics.
 *   - `CoachDrillChainScreen` end-to-end: header/pips/first card render,
 *     correct/wrong feedback copy, last-drill completion (trackEvent +
 *     pendingSummary handoff + navigation), and the `launch === null`
 *     redirect.
 *
 * The screen mints its nonce from `Date.now()`/`Math.random()` inside a
 * `useRef` initializer (not injectable as a prop) — the screen tests
 * spy both to a fixed value so the drill chain's deterministic-shuffle
 * seed is reproducible, then pre-compute the SAME chain here via
 * `buildConnectorDrillChain` (a pure function) to know exactly which
 * `drill-option-<answer>` testID is correct at each step.
 */
import { act, cleanup, fireEvent, renderHook, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { pushMock, replaceMock, backMock, trackEventMock } = vi.hoisted(() => ({
  pushMock: vi.fn(),
  replaceMock: vi.fn(),
  backMock: vi.fn(),
  trackEventMock: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock, replace: replaceMock, back: backMock }),
}));
vi.mock("next-intl", () => ({ useLocale: () => "fr" }));

vi.mock("@/learner/core/analytics/posthog", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/learner/core/analytics/posthog")>();
  return { ...actual, trackEvent: trackEventMock };
});

import { buildConnectorDrillChain, type DrillTemplate } from "@/learner/coach/drills/data";
import { useDrillChain } from "@/learner/coach/drills/useDrillChain";
import type { DrillChain } from "@/learner/coach/drills/types";
import {
  __resetDrillChainStoreForTests,
  useDrillChainStore,
  type DrillChainLaunch,
} from "@/learner/coach/drillChainStore";
import { CoachDrillChainScreen } from "@/learner/coach/screens/CoachDrillChainScreen";
import { renderWithI18n } from "./helpers/renderWithI18n";

afterEach(() => {
  cleanup();
});

// ---------------------------------------------------------------------------
// buildConnectorDrillChain
// ---------------------------------------------------------------------------
const STUB_TEMPLATES: readonly DrillTemplate[] = [
  {
    id: "stub-deshalb-tired",
    kind: "connector",
    before: "Ich war sehr müde, ",
    after: " bin ich früh ins Bett gegangen.",
    answer: "deshalb",
    distractors: ["und", "obwohl"],
    explanation: "'deshalb' marks the consequence of being tired.",
  },
  {
    id: "stub-trotzdem-rain",
    kind: "connector",
    before: "Es hat geregnet, ",
    after: " sind wir spazieren gegangen.",
    answer: "trotzdem",
    distractors: ["deshalb", "außerdem"],
    explanation: "'trotzdem' signals the contrast with the rain.",
  },
  {
    id: "stub-außerdem-price",
    kind: "connector",
    before: "Das Hotel ist sehr schön, ",
    after: " ist es nicht teuer.",
    answer: "außerdem",
    distractors: ["obwohl", "deshalb"],
    explanation: "'außerdem' adds a second positive argument.",
  },
  {
    id: "stub-obwohl-exam",
    kind: "connector",
    before: "Er hat die Prüfung bestanden, ",
    after: " er wenig gelernt hatte.",
    answer: "obwohl",
    distractors: ["deshalb", "trotzdem"],
    explanation: "'obwohl' introduces the unexpected precondition.",
  },
  {
    id: "stub-deshalb-late",
    kind: "connector",
    before: "Der Zug hatte Verspätung, ",
    after: " kam ich zu spät ins Büro.",
    answer: "deshalb",
    distractors: ["trotzdem", "außerdem"],
    explanation: "'deshalb' marks the consequence of the late train.",
  },
  {
    id: "stub-trotzdem-cold",
    kind: "connector",
    before: "Es war sehr kalt, ",
    after: " habe ich draußen gegessen.",
    answer: "trotzdem",
    distractors: ["deshalb", "obwohl"],
    explanation: "'trotzdem' expresses the contrast with the cold.",
  },
];

describe("buildConnectorDrillChain", () => {
  it("is deterministic: same inputs -> identical drill id order twice", () => {
    const a = buildConnectorDrillChain({
      observationId: "obs-det",
      templates: STUB_TEMPLATES,
      flaggedConnectors: ["deshalb", "trotzdem"],
      nonce: "test-nonce-1",
    });
    const b = buildConnectorDrillChain({
      observationId: "obs-det",
      templates: STUB_TEMPLATES,
      flaggedConnectors: ["deshalb", "trotzdem"],
      nonce: "test-nonce-1",
    });
    expect(a.drills.map((d) => d.id)).toEqual(b.drills.map((d) => d.id));
    expect(a.drills.map((d) => d.options)).toEqual(b.drills.map((d) => d.options));
  });

  it("different nonce -> different order for >=6 templates", () => {
    const a = buildConnectorDrillChain({
      observationId: "obs-vary",
      templates: STUB_TEMPLATES,
      flaggedConnectors: ["deshalb", "trotzdem", "außerdem", "obwohl"],
      size: 6,
      nonce: "attempt-1",
    });
    const b = buildConnectorDrillChain({
      observationId: "obs-vary",
      templates: STUB_TEMPLATES,
      flaggedConnectors: ["deshalb", "trotzdem", "außerdem", "obwohl"],
      size: 6,
      nonce: "attempt-2",
    });
    const aIds = a.drills.map((d) => d.id).join(",");
    const bIds = b.drills.map((d) => d.id).join(",");
    const aOpts = JSON.stringify(a.drills.map((d) => d.options));
    const bOpts = JSON.stringify(b.drills.map((d) => d.options));
    expect(aIds !== bIds || aOpts !== bOpts).toBe(true);
  });

  it("empty templates -> empty chain", () => {
    const chain = buildConnectorDrillChain({
      observationId: "obs-empty",
      templates: [],
      flaggedConnectors: ["deshalb"],
      nonce: "test-nonce-1",
    });
    expect(chain.drills).toHaveLength(0);
    expect(chain.observationId).toBe("obs-empty");
  });

  it("each drill's options contain the answer + 2 distractors, deterministic order", () => {
    const chain = buildConnectorDrillChain({
      observationId: "obs-opts",
      templates: STUB_TEMPLATES,
      flaggedConnectors: ["deshalb", "trotzdem", "außerdem", "obwohl"],
      nonce: "test-nonce-1",
    });
    for (const drill of chain.drills) {
      expect(drill.options).toHaveLength(3);
      expect(drill.options).toContain(drill.answer);
    }
    const again = buildConnectorDrillChain({
      observationId: "obs-opts",
      templates: STUB_TEMPLATES,
      flaggedConnectors: ["deshalb", "trotzdem", "außerdem", "obwohl"],
      nonce: "test-nonce-1",
    });
    expect(chain.drills.map((d) => d.options)).toEqual(again.drills.map((d) => d.options));
  });

  it("defaults to size 4", () => {
    const chain = buildConnectorDrillChain({
      observationId: "obs-default-size",
      templates: STUB_TEMPLATES,
      flaggedConnectors: ["deshalb", "trotzdem", "außerdem", "obwohl"],
      nonce: "test-nonce-1",
    });
    expect(chain.drills).toHaveLength(4);
  });

  it("falls back to the full pool when no template matches the flagged set", () => {
    const chain = buildConnectorDrillChain({
      observationId: "obs-miss",
      templates: STUB_TEMPLATES,
      flaggedConnectors: ["xyzabc"],
      size: 3,
      nonce: "test-nonce-1",
    });
    expect(chain.drills).toHaveLength(3);
  });

  it("golden value: exact drill ids + option order for a fixed observation/nonce seed (review fix round 1 — pins the ported hash/LCG/rotatePool constants)", () => {
    // Self-consistency checks above (determinism, nonce-variation) only
    // assert the port is internally consistent with itself — they pass
    // even if the LCG multiplier/increment or the `hash*31+code` mixer
    // is transcribed wrong, as long as it's wrong *consistently*. This
    // test pins the actual concrete output mobile's `data.ts` produces
    // for this seed, so a silent constant drift (which would silently
    // change which drills a learner sees for a given observation) fails
    // loudly here instead. Values captured by running the real
    // `buildConnectorDrillChain` against `STUB_TEMPLATES` with this
    // exact seed — verified to fail when the LCG multiplier is mutated
    // (`1103515245` -> `1103515246`); see task-9.5-report.md's "Fix
    // round 1" section for the mutation-testing evidence.
    const chain = buildConnectorDrillChain({
      observationId: "obs-golden",
      templates: STUB_TEMPLATES,
      flaggedConnectors: ["deshalb", "trotzdem", "außerdem", "obwohl"],
      size: 6,
      nonce: "golden-nonce-1",
    });

    expect(chain.id).toBe("chain-obs-golden");
    expect(chain.drills.map((d) => d.id)).toEqual([
      "stub-außerdem-price",
      "stub-obwohl-exam",
      "stub-deshalb-late",
      "stub-trotzdem-cold",
      "stub-deshalb-tired",
      "stub-trotzdem-rain",
    ]);
    expect(chain.drills.map((d) => d.answer)).toEqual([
      "außerdem",
      "obwohl",
      "deshalb",
      "trotzdem",
      "deshalb",
      "trotzdem",
    ]);
    expect(chain.drills.map((d) => d.options)).toEqual([
      ["deshalb", "außerdem", "obwohl"],
      ["deshalb", "trotzdem", "obwohl"],
      ["trotzdem", "außerdem", "deshalb"],
      ["obwohl", "trotzdem", "deshalb"],
      ["und", "deshalb", "obwohl"],
      ["deshalb", "außerdem", "trotzdem"],
    ]);
  });
});

// ---------------------------------------------------------------------------
// useDrillChain
// ---------------------------------------------------------------------------
function makeChain(): DrillChain {
  return {
    id: "chain-test",
    observationId: "obs-test",
    drills: [
      {
        id: "d-1",
        before: "A ",
        after: " B",
        options: ["x", "y"],
        answer: "x",
        explanation: "because x",
      },
      {
        id: "d-2",
        before: "C ",
        after: " D",
        options: ["p", "q"],
        answer: "p",
        explanation: "because p",
      },
      {
        id: "d-3",
        before: "E ",
        after: " F",
        options: ["m", "n"],
        answer: "m",
        explanation: "because m",
      },
      {
        id: "d-4",
        before: "G ",
        after: " H",
        options: ["s", "t"],
        answer: "s",
        explanation: "because s",
      },
    ],
  };
}

describe("useDrillChain", () => {
  it("starts at index 0, in_progress, empty attempts", () => {
    const { result } = renderHook(() => useDrillChain(makeChain()));
    expect(result.current.state).toEqual({
      status: "in_progress",
      currentIndex: 0,
      attempts: [],
      pendingAttempt: null,
    });
  });

  it("answer(selected) returns the attempt and sets pendingAttempt", () => {
    const { result } = renderHook(() => useDrillChain(makeChain()));
    let attempt;
    act(() => {
      attempt = result.current.answer("x");
    });
    expect(attempt).toEqual({ drillId: "d-1", selected: "x", isCorrect: true });
    expect(result.current.state.pendingAttempt).toEqual({
      drillId: "d-1",
      selected: "x",
      isCorrect: true,
    });
    expect(result.current.state.currentIndex).toBe(0);
  });

  it("second answer() while pending is idempotent — returns the SAME attempt", () => {
    const { result } = renderHook(() => useDrillChain(makeChain()));
    act(() => {
      result.current.answer("x");
    });
    let second;
    act(() => {
      second = result.current.answer("y");
    });
    expect(second).toEqual({ drillId: "d-1", selected: "x", isCorrect: true });
    expect(result.current.state.pendingAttempt?.selected).toBe("x");
  });

  it("next() commits the pending attempt and advances the cursor", () => {
    const { result } = renderHook(() => useDrillChain(makeChain()));
    act(() => {
      result.current.answer("x");
    });
    act(() => {
      result.current.next();
    });
    expect(result.current.state.currentIndex).toBe(1);
    expect(result.current.state.attempts).toEqual([
      { drillId: "d-1", selected: "x", isCorrect: true },
    ]);
    expect(result.current.state.pendingAttempt).toBeNull();
    expect(result.current.state.status).toBe("in_progress");
  });

  it("status flips to complete after all 4 drills are committed", () => {
    const { result } = renderHook(() => useDrillChain(makeChain()));
    const picks = ["x", "wrong", "m", "wrong"];
    for (const pick of picks) {
      act(() => {
        result.current.answer(pick);
      });
      act(() => {
        result.current.next();
      });
    }
    expect(result.current.state.status).toBe("complete");
    expect(result.current.state.attempts).toHaveLength(4);
    expect(result.current.state.attempts.filter((a) => a.isCorrect)).toHaveLength(2);
  });

  it("reset() restores initial state", () => {
    const { result } = renderHook(() => useDrillChain(makeChain()));
    act(() => {
      result.current.answer("x");
    });
    act(() => {
      result.current.next();
    });
    act(() => {
      result.current.reset();
    });
    expect(result.current.state).toEqual({
      status: "in_progress",
      currentIndex: 0,
      attempts: [],
      pendingAttempt: null,
    });
  });
});

// ---------------------------------------------------------------------------
// useDrillChainStore
// ---------------------------------------------------------------------------
describe("useDrillChainStore", () => {
  beforeEach(() => {
    __resetDrillChainStoreForTests();
  });

  it("setLaunch writes the launch payload", () => {
    const launch: DrillChainLaunch = {
      threadId: "t1",
      observationId: "obs-1",
      connectors: ["deshalb"],
      drills: [],
    };
    useDrillChainStore.getState().setLaunch(launch);
    expect(useDrillChainStore.getState().launch).toEqual(launch);
  });

  it("clearLaunch nulls the launch payload", () => {
    useDrillChainStore.getState().setLaunch({
      threadId: "t1",
      observationId: "obs-1",
      connectors: [],
      drills: [],
    });
    useDrillChainStore.getState().clearLaunch();
    expect(useDrillChainStore.getState().launch).toBeNull();
  });

  it("consumePendingSummary returns the summary then clears it (read-then-clear, atomic)", () => {
    useDrillChainStore.getState().setPendingSummary({ id: "s1", correct: 3, total: 4 });
    const first = useDrillChainStore.getState().consumePendingSummary();
    expect(first).toEqual({ id: "s1", correct: 3, total: 4 });
    expect(useDrillChainStore.getState().pendingSummary).toBeNull();
    const second = useDrillChainStore.getState().consumePendingSummary();
    expect(second).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// CoachDrillChainScreen
// ---------------------------------------------------------------------------
const FIXED_NOW = 1_700_000_000_000;
const FIXED_RANDOM = 0.123456789;

function computeExpectedChain(launch: DrillChainLaunch): DrillChain {
  const nonce = `${FIXED_NOW}-${FIXED_RANDOM.toString(36).slice(2, 8)}`;
  return buildConnectorDrillChain({
    observationId: launch.observationId,
    templates: launch.drills,
    flaggedConnectors: launch.connectors,
    nonce,
  });
}

function sampleLaunch(overrides: Partial<DrillChainLaunch> = {}): DrillChainLaunch {
  return {
    threadId: "thread-1",
    observationId: "obs-1",
    connectors: [],
    drills: STUB_TEMPLATES,
    ...overrides,
  };
}

describe("CoachDrillChainScreen (S9 Task 9.5)", () => {
  let dateSpy: ReturnType<typeof vi.spyOn>;
  let randomSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    __resetDrillChainStoreForTests();
    pushMock.mockReset();
    replaceMock.mockReset();
    backMock.mockReset();
    trackEventMock.mockReset();
    dateSpy = vi.spyOn(Date, "now").mockReturnValue(FIXED_NOW);
    randomSpy = vi.spyOn(Math, "random").mockReturnValue(FIXED_RANDOM);
  });

  afterEach(() => {
    dateSpy.mockRestore();
    randomSpy.mockRestore();
    cleanup();
  });

  it("with launch set, renders the header subtitle, pips, and the first DrillCard", () => {
    const launch = sampleLaunch();
    useDrillChainStore.getState().setLaunch(launch);
    const expectedChain = computeExpectedChain(launch);
    const firstDrill = expectedChain.drills[0];
    if (!firstDrill) throw new Error("expected at least one drill in the test chain");

    renderWithI18n(<CoachDrillChainScreen />);

    expect(screen.getByTestId("coach-drill-chain-header")).toHaveTextContent(
      "Drill ciblé · connecteurs"
    );
    expect(screen.getByTestId("drill-chain-progress")).toBeInTheDocument();
    expect(screen.getByTestId(`coach-drill-card-${firstDrill.id}`)).toBeInTheDocument();

    expect(trackEventMock).toHaveBeenCalledWith("coach_drill_chain_started", {
      observation_id: "obs-1",
      chain_length: expectedChain.drills.length,
    });
  });

  it("selecting the correct option shows the correct feedback copy", () => {
    const launch = sampleLaunch();
    useDrillChainStore.getState().setLaunch(launch);
    const expectedChain = computeExpectedChain(launch);
    const firstDrill = expectedChain.drills[0];
    if (!firstDrill) throw new Error("expected at least one drill in the test chain");

    renderWithI18n(<CoachDrillChainScreen />);

    fireEvent.click(screen.getByTestId(`drill-option-${firstDrill.answer}`));

    expect(screen.getByTestId("coach-drill-feedback")).toHaveTextContent(
      "Richtig. Bon connecteur."
    );
  });

  it("selecting a wrong option shows the wrong feedback copy interpolated with the answer", () => {
    const launch = sampleLaunch();
    useDrillChainStore.getState().setLaunch(launch);
    const expectedChain = computeExpectedChain(launch);
    const firstDrill = expectedChain.drills[0];
    if (!firstDrill) throw new Error("expected at least one drill in the test chain");
    const wrongOption = firstDrill.options.find((o) => o !== firstDrill.answer);
    if (!wrongOption) throw new Error("expected at least one distractor");

    renderWithI18n(<CoachDrillChainScreen />);

    fireEvent.click(screen.getByTestId(`drill-option-${wrongOption}`));

    expect(screen.getByTestId("coach-drill-feedback")).toHaveTextContent(
      `la bonne réponse est ${firstDrill.answer}`
    );
  });

  it("completing the last drill fires coach_drill_chain_completed, sets pendingSummary, and navigates to the thread", async () => {
    const launch = sampleLaunch({ connectors: ["deshalb"] });
    useDrillChainStore.getState().setLaunch(launch);
    const expectedChain = computeExpectedChain(launch);
    expect(expectedChain.drills.length).toBeGreaterThan(0);

    renderWithI18n(<CoachDrillChainScreen />);

    for (let i = 0; i < expectedChain.drills.length; i++) {
      const drill = expectedChain.drills[i];
      if (!drill) throw new Error(`expected drill at index ${i}`);
      fireEvent.click(screen.getByTestId(`drill-option-${drill.answer}`));
      fireEvent.click(screen.getByTestId("coach-drill-continue"));
    }

    expect(trackEventMock).toHaveBeenCalledWith("coach_drill_chain_completed", {
      observation_id: "obs-1",
      chain_length: expectedChain.drills.length,
      completed_count: expectedChain.drills.length,
    });

    await waitFor(() =>
      expect(pushMock).toHaveBeenCalledWith(`/fr/app/coach/chat/${launch.threadId}`)
    );

    // The store clears `launch` and stashes a one-shot summary the chat
    // screen consumes — every drill was answered with its correct
    // answer, so the tally is a perfect score.
    expect(useDrillChainStore.getState().launch).toBeNull();
    const summary = useDrillChainStore.getState().pendingSummary;
    expect(summary).toMatchObject({
      correct: expectedChain.drills.length,
      total: expectedChain.drills.length,
    });
  });

  it("mixed correct/incorrect run — final tally reflects the exact count, not just a perfect-score boundary (review fix round 1)", async () => {
    // No connector filter -> the full 6-template pool is in play, so the
    // default `size: 4` chain has room for a genuine correct/incorrect
    // mix (the completion test above deliberately narrows to a single
    // flagged connector, which yields only 2 drills here).
    const launch = sampleLaunch();
    useDrillChainStore.getState().setLaunch(launch);
    const expectedChain = computeExpectedChain(launch);
    expect(expectedChain.drills.length).toBeGreaterThanOrEqual(3);

    renderWithI18n(<CoachDrillChainScreen />);

    // Alternate correct/wrong picks (even index -> correct, odd -> a
    // distractor) so the final tally is neither 0 nor a perfect score —
    // this exercises the `finalCorrect` arithmetic in `handleContinue`
    // at a non-boundary value, including its `pendingAttempt?.isCorrect`
    // fold-in on the very last drill.
    let expectedCorrect = 0;
    for (let i = 0; i < expectedChain.drills.length; i++) {
      const drill = expectedChain.drills[i];
      if (!drill) throw new Error(`expected drill at index ${i}`);
      const pickCorrect = i % 2 === 0;
      if (pickCorrect) {
        expectedCorrect += 1;
        fireEvent.click(screen.getByTestId(`drill-option-${drill.answer}`));
      } else {
        const wrongOption = drill.options.find((o) => o !== drill.answer);
        if (!wrongOption) throw new Error(`expected a distractor at index ${i}`);
        fireEvent.click(screen.getByTestId(`drill-option-${wrongOption}`));
      }
      fireEvent.click(screen.getByTestId("coach-drill-continue"));
    }

    expect(expectedCorrect).toBeGreaterThan(0);
    expect(expectedCorrect).toBeLessThan(expectedChain.drills.length);

    await waitFor(() =>
      expect(pushMock).toHaveBeenCalledWith(`/fr/app/coach/chat/${launch.threadId}`)
    );

    const summary = useDrillChainStore.getState().pendingSummary;
    expect(summary).toMatchObject({ correct: expectedCorrect, total: expectedChain.drills.length });
  });

  it("with launch === null, redirects back to the chat root", () => {
    renderWithI18n(<CoachDrillChainScreen />);
    expect(replaceMock).toHaveBeenCalledWith("/fr/app/coach/chat");
  });
});
