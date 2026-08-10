/**
 * Drill-chain domain types (S9 · Task 9.5).
 *
 * Ports `deutschfit-mobile/src/features/coach/drills/types.ts`'s domain
 * concept (a short personalised connector-cloze drill chain triggered
 * from a Coach observation) with a web-specific shape declared verbatim
 * by the task-9.5 brief's "Produces" contract:
 *
 *   - No `kind` discriminant on `ConnectorDrill` — mobile's `Drill` union
 *     is `"connector"`-only in v0 on both platforms; the web slice skips
 *     the discriminated-union scaffolding since there is only one drill
 *     kind and no near-term plan to add a second on this surface.
 *   - `DrillAttempt.isCorrect` (not mobile's `correct`) and
 *     `DrillChainState` carries no embedded `chain` field (mobile's
 *     `UseDrillChainResult` spreads `chain` + convenience fields like
 *     `current`/`total`/`correctCount` into the hook's return value; the
 *     web hook returns a bare `state` object per the brief and the
 *     caller derives `current`/`total`/`correctCount` from the `chain`
 *     it already holds — see `useDrillChain.ts`).
 *
 * These are the literal field names `CoachDrillChainScreen`'s
 * `handleContinue` (task-9.5-brief.md) reads off `state.attempts` /
 * `state.pendingAttempt` — `isCorrect` is load-bearing, not a stylistic
 * choice.
 */

/**
 * A single connector-cloze drill. Renders as a sentence with a blank
 * plus a small multiple-choice row of candidate connectors.
 *
 * Example:
 *   before: "Ich war müde, "
 *   after:  " bin ich ins Bett gegangen."
 *   options: ["deshalb", "und", "obwohl"]
 *   answer: "deshalb"
 *   explanation: "'deshalb' marks the consequence of being tired."
 */
export interface ConnectorDrill {
  readonly id: string;
  /** Prompt prefix before the blank. */
  readonly before: string;
  /** Prompt suffix after the blank. */
  readonly after: string;
  /** Shuffled connector options — the learner picks one. */
  readonly options: readonly string[];
  /** The expected connector (must appear in `options`). */
  readonly answer: string;
  /** One-line rationale shown after the learner answers. */
  readonly explanation: string;
}

/**
 * A drill chain — an ordered queue of drills generated from a Coach
 * observation. `observationId` is kept so analytics can tie completion
 * back to the triggering event.
 */
export interface DrillChain {
  readonly id: string;
  readonly observationId: string;
  readonly drills: readonly ConnectorDrill[];
}

/** Per-drill evaluation emitted by the runner hook. */
export interface DrillAttempt {
  readonly drillId: string;
  readonly selected: string;
  readonly isCorrect: boolean;
}

/**
 * State of an in-progress chain, owned by `useDrillChain`.
 *
 * `status`:
 *   - `"in_progress"` — more drills to go.
 *   - `"complete"`    — every drill has a committed attempt; `attempts`
 *     has one entry per drill in the chain.
 *
 * `pendingAttempt` holds the in-flight evaluation for the current drill
 * — set by `answer()`, cleared (and folded into `attempts`) by `next()`
 * — so the screen can render an explanation pane between answer + next.
 */
export interface DrillChainState {
  readonly status: "in_progress" | "complete";
  readonly currentIndex: number;
  readonly attempts: readonly DrillAttempt[];
  readonly pendingAttempt: DrillAttempt | null;
}
