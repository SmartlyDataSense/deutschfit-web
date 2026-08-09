/**
 * Accueil Hero — pure state machine (S2 ticket #4 / founding-doc §8).
 *
 * Ports `deutschfit-mobile/src/features/accueil/heroState.ts` verbatim —
 * pure TS, zero RN imports. The French `COPY` table below is a byte-for-byte
 * copy (S3 · Task 3.5 parity rule): it ships as a code literal, not through
 * i18n.
 *
 * The Hero card resolves on **two orthogonal axes**:
 *
 *   1. **Cycle of session** — when in the user's loop the screen lands.
 *      Captured by `HeroState`: `countdown` (default), `session-ready`
 *      (Betreuer queued a step), `post-session` (fresh submission /
 *      correction back), `idle` (long absence). Decision priority is
 *      post-session → session-ready → idle → countdown.
 *
 *   2. **Content readiness** — what data we actually have to show.
 *      Captured by `HeroContent`:
 *        - `cold`            — no exam date, no submissions ever. State A.
 *        - `readiness-only`  — submissions but no exam date. State B.
 *        - `countdown-only`  — exam date but no submissions yet. State C.
 *        - `full`            — exam date AND submissions. State D.
 *      The visual contract differs across A/B/C/D per founding-doc §8:
 *        - `PRÉPARATION X%` bar is meaningful only at N≥1 submissions
 *          (§8.2). State A and C hide it.
 *        - The readiness score "XX/100" surfaces on B and D only.
 *        - Tone escalates to attention when D-day is < 21 (§8.3 / §8.4).
 *
 * Brand-voice §12: every literal funnels through `COPY`. No `streak`, no
 * `coach`, no `entraîneur`, no `fit`, no exclamation. Idle copy is calm
 * ("On reprend quand tu veux") — never shaming.
 *
 * This module is pure: no React, no RN, no i18n, no `Date.now()`. Tests
 * pass `ageHours` / `daysUntilExam` / `submissionsCount` directly so the
 * function stays deterministic.
 */

/**
 * Default idle threshold in days. Motivated by the Plan hebdo / bilan
 * dominical weekly cycle (founding-doc §4.2). Override per call via
 * `inputs.idleThresholdDays`.
 */
export const IDLE_THRESHOLD_DAYS = 7;

const HOURS_PER_DAY = 24;
const POST_SESSION_FRESHNESS_HOURS = 24;

/**
 * Default readiness target — calibrated against an `OBJECTIF 80` score
 * (founding-doc §8). Pass threshold defaults to 60 (industry-standard
 * "réussir" mark across Goethe / telc / ÖSD).
 */
export const DEFAULT_READINESS_TARGET = 80;
export const DEFAULT_PASS_THRESHOLD = 60;

/**
 * Tone escalates from `calm` to `escalated` once the runway is < 3
 * weeks AND the user is below the pass threshold (§8.3 / §8.4). Calm
 * by default everywhere else — the renderer uses this for caption +
 * CTA emphasis, never for shouting copy.
 */
export const ESCALATION_DAYS_WINDOW = 21;

export type HeroState = "countdown" | "session-ready" | "post-session" | "idle";

/**
 * Content axis (founding-doc §8 — A/B/C/D). Independent from the cycle
 * state. The renderer combines `state` + `content` to decide whether to
 * surface the preparation bar, the readiness score, or neither.
 */
export type HeroContent = "cold" | "readiness-only" | "countdown-only" | "full";

/**
 * Tone — calm by default, escalated when D-day < 21 and the user is
 * still below the pass threshold (§8). Renderer turns this into a
 * caption tone shift; we never use scary copy.
 */
export type HeroTone = "calm" | "escalated";

/**
 * Submission status as surfaced by the grader pipeline. Mirrors the
 * `submissions.status` column on the backend. We treat `pending` /
 * `grading` as the "calm acknowledgement" branch and `graded` as the
 * "correction ready" branch.
 */
export type SubmissionStatus = "pending" | "grading" | "graded";

export interface HeroSubmissionInput {
  readonly status: SubmissionStatus;
  /**
   * Hours since the submission was created. Used to age out the
   * post-session card after 24 h so a 3-day-old submission does not
   * keep dominating the hero. Negative values are clamped to 0.
   */
  readonly ageHours: number;
  /**
   * Set to `true` when the correction has come back but the user hasn't
   * seen it yet. Surfaces a "readiness pulse" line in the post-session
   * card (nav-philosophy §5 — "pulse de readiness si correction"). Has
   * no effect outside the post-session state.
   */
  readonly correctionUnseen?: boolean;
}

export interface HeroPrescriptionInput {
  /**
   * Localized title of the queued session ("Drill — passé composé",
   * "Lecture courte — gare", etc.). The state machine doesn't care
   * about content — the renderer surfaces it as the body line.
   */
  readonly title: string;
  /**
   * Approximate duration of the queued session, surfaced in the body
   * line as a calm expectation ("~ 8 min"). Optional — we degrade
   * gracefully when the backend doesn't ship a duration.
   */
  readonly durationMinutes?: number;
}

export interface HeroStateInputs {
  /**
   * Days remaining until the user's exam. `null` when the user hasn't
   * set a date yet — the countdown branch surfaces a calm "fixe ta
   * date d'examen" line in that case. Negative values are clamped
   * to 0 (the user blew past the date — we still render countdown
   * with `safeDays = 0` and flag it as a milestone).
   */
  readonly daysUntilExam: number | null;
  /** Latest in-flight or recently-graded submission. */
  readonly submission?: HeroSubmissionInput;
  /** Queued Betreuer prescription (drill / short exercise). */
  readonly prescription?: HeroPrescriptionInput;
  /**
   * Hours since the last completed session. `null` when we don't know
   * (cold start, fresh signup) — treated as "not idle" so we don't
   * accidentally idle a brand-new account.
   */
  readonly hoursSinceLastSession?: number | null;
  /**
   * Override for the idle threshold (in days). Defaults to
   * `IDLE_THRESHOLD_DAYS` (7).
   */
  readonly idleThresholdDays?: number;
  /**
   * Total number of submissions the user has on file. Drives the
   * content axis (cold vs. readiness-only vs. countdown-only vs. full):
   * `0` keeps the screen in "no data" mode (no preparation bar, no
   * readiness score), `≥ 1` unlocks readiness rendering. `undefined`
   * is treated as `0` (cold-start safety net).
   */
  readonly submissionsCount?: number;
  /**
   * Latest readiness score on `[0, 100]`. Surfaced as "XX/100" on State
   * B and D. `undefined` means "no measurement yet" — we hide the
   * score line and fall back to copy-only.
   */
  readonly readinessScore?: number;
  /**
   * Override for the readiness target. Defaults to
   * `DEFAULT_READINESS_TARGET` (80, tuned to OBJECTIF 80).
   */
  readonly readinessTarget?: number;
  /**
   * Override for the pass threshold. Defaults to
   * `DEFAULT_PASS_THRESHOLD` (60). Used for tone escalation only.
   */
  readonly passThreshold?: number;
}

export interface HeroReadiness {
  readonly score: number;
  readonly target: number;
}

export interface HeroStatePayload {
  readonly state: HeroState;
  readonly content: HeroContent;
  readonly tone: HeroTone;
  readonly overline: string;
  readonly headline: string;
  readonly body: string;
  readonly ctaLabel: string;
  /**
   * `true` on the small set of "real" milestone moments per
   * nav-philosophy §4 (1ère soumission, seuil readiness franchi, jour
   * J). Renderer uses this to switch the caption tone to `gold` and
   * surface the warm Betreuer voice — never on every screen.
   */
  readonly milestone: boolean;
  /**
   * Optional readiness-pulse line surfaced under the body when a
   * correction has come back but the user hasn't seen it yet
   * (nav-philosophy §5). Empty string when not applicable.
   */
  readonly readinessPulse: string;
  /**
   * Days remaining clamped to a non-negative integer, surfaced for the
   * countdown branch. Mirrors the existing `CountdownHeroCard`
   * contract (renders day count or the no-date-set placeholder).
   * `null` when the user hasn't set a date yet.
   */
  readonly daysUntilExam: number | null;
  /**
   * Whether the renderer should show the `PRÉPARATION X%` progress
   * bar. False on State A (cold) and State C (countdown-only) — the
   * percentage is meaningless without N≥1 submissions (§8.2).
   */
  readonly showPreparationBar: boolean;
  /**
   * Readiness payload (`{ score, target }`) surfaced on State B and D.
   * `null` when the user has no submissions yet (State A / C) — the
   * renderer hides the score line in that case.
   */
  readonly readiness: HeroReadiness | null;
}

/**
 * French copy table — every literal funnels through this object so the
 * brand-voice §12 audit (forbidden vocab, ✅/❌ pairs) has a single
 * place to land. Keep keys stable; the renderer maps state →
 * `COPY[key]` directly.
 */
const COPY = {
  countdown: {
    overline: "COMPTE À REBOURS · EXAMEN",
    headline: "On reprend ta préparation.",
    body: "Continue ton plan du jour.",
    cta: "Voir le plan du jour",
  },
  countdownNoDate: {
    overline: "ON COMMENCE",
    headline: "On commence quand tu veux.",
    body: "Fixe ta date d'examen pour caler ton plan.",
    cta: "Choisir une date",
  },
  countdownExamDay: {
    overline: "JOUR J · EXAMEN",
    headline: "C'est le jour J.",
    body: "Tu as fait le travail. Vas-y calmement.",
    cta: "Voir le plan du jour",
  },
  readinessOnly: {
    overline: "PRÉPARATION · MESURE",
    headline: "Tu avances bien.",
    body: "Quand tu veux fixer ta date, on est prêts.",
    cta: "Fixer une date",
  },
  sessionReady: {
    overline: "AUJOURD'HUI · SÉANCE",
    headline: "Une séance t'attend.",
    body: "Le Betreuer a préparé une suite courte pour aujourd'hui.",
    cta: "Commencer la séance",
  },
  postSessionPending: {
    overline: "SOUMISSION · REÇUE",
    headline: "Soumission bien reçue.",
    body: "Tu peux respirer — la correction arrive sous peu.",
    cta: "Voir le détail",
  },
  postSessionGraded: {
    overline: "CORRECTION · PRÊTE",
    headline: "Ta correction est prête.",
    body: "On regarde ensemble ce que ça donne.",
    cta: "Voir la correction",
  },
  idle: {
    overline: "ON REPREND",
    headline: "On reprend quand tu veux.",
    body: "Pas de pression — une soumission courte suffit pour repartir.",
    cta: "Faire une soumission courte",
  },
} as const;

const READINESS_PULSE_LINE = "Une nouvelle correction t'attend.";

function clampDays(daysUntilExam: number | null): number | null {
  if (daysUntilExam === null) return null;
  if (!Number.isFinite(daysUntilExam)) return null;
  return Math.max(0, Math.floor(daysUntilExam));
}

/**
 * Resolve the body string for the session-ready state. We surface the
 * prescription title and (when available) a calm duration hint.
 */
function sessionReadyBody(prescription: HeroPrescriptionInput): string {
  const base = `${COPY.sessionReady.body} ${prescription.title}.`;
  if (typeof prescription.durationMinutes === "number") {
    return `${base} ~ ${prescription.durationMinutes} min.`;
  }
  return base;
}

/**
 * Resolve the content axis from data presence (founding-doc §8 A/B/C/D).
 * Independent of the cycle state — pure data-presence check.
 */
function resolveContent(hasDate: boolean, submissionsCount: number): HeroContent {
  const hasSubmissions = submissionsCount > 0;
  if (!hasDate && !hasSubmissions) return "cold";
  if (!hasDate && hasSubmissions) return "readiness-only";
  if (hasDate && !hasSubmissions) return "countdown-only";
  return "full";
}

/**
 * Resolve the readiness payload (if any). We only surface a score when
 * we actually have one — i.e. State B (`readiness-only`) and State D
 * (`full`). State A / C keep `readiness: null` so the renderer can
 * skip the score line entirely.
 */
function resolveReadiness(content: HeroContent, inputs: HeroStateInputs): HeroReadiness | null {
  if (content !== "readiness-only" && content !== "full") return null;
  if (typeof inputs.readinessScore !== "number") return null;
  if (!Number.isFinite(inputs.readinessScore)) return null;
  const score = Math.max(0, Math.min(100, Math.round(inputs.readinessScore)));
  const target = inputs.readinessTarget ?? DEFAULT_READINESS_TARGET;
  return { score, target };
}

/**
 * Tone escalates only when D-day is inside the escalation window AND
 * the user is below the pass threshold. Calm everywhere else — caption
 * tone shift only, never alarmist copy.
 */
function resolveTone(
  safeDays: number | null,
  readiness: HeroReadiness | null,
  passThreshold: number
): HeroTone {
  if (safeDays === null) return "calm";
  if (safeDays > ESCALATION_DAYS_WINDOW) return "calm";
  if (!readiness) return "calm";
  if (readiness.score >= passThreshold) return "calm";
  return "escalated";
}

/**
 * Pure state-machine entry point — takes the home payload + ambient
 * inputs and returns the full Hero payload (state + content + copy +
 * flags).
 *
 * Pure: no Date.now() / no React / no i18n. Tests pass `ageHours`
 * directly so the function stays deterministic.
 */
export function computeHeroState(inputs: HeroStateInputs): HeroStatePayload {
  const safeDays = clampDays(inputs.daysUntilExam);
  const idleThreshold = inputs.idleThresholdDays ?? IDLE_THRESHOLD_DAYS;
  const submissionsCount = Math.max(0, inputs.submissionsCount ?? 0);
  const passThreshold = inputs.passThreshold ?? DEFAULT_PASS_THRESHOLD;

  const content = resolveContent(safeDays !== null, submissionsCount);
  const readiness = resolveReadiness(content, inputs);
  const tone = resolveTone(safeDays, readiness, passThreshold);
  const showPreparationBar = content === "full";

  // The static slice of the payload that's identical across every
  // branch — keeps the per-branch returns short and lets us flip a
  // single field (e.g. `state`, `headline`) without dropping the rest.
  const meta = {
    content,
    tone,
    showPreparationBar,
    readiness,
  } as const;

  // 1) post-session — a fresh submission dominates the hero.
  if (inputs.submission) {
    const ageHours = Math.max(0, inputs.submission.ageHours);
    if (ageHours <= POST_SESSION_FRESHNESS_HOURS) {
      const isGraded = inputs.submission.status === "graded";
      const copy = isGraded ? COPY.postSessionGraded : COPY.postSessionPending;
      const correctionUnseen = inputs.submission.correctionUnseen === true;
      return {
        ...meta,
        state: "post-session",
        overline: copy.overline,
        headline: copy.headline,
        body: copy.body,
        ctaLabel: copy.cta,
        // Graded + unseen is the readiness-pulse milestone (nav-phil §4 +
        // §5) — calm caption tone otherwise.
        milestone: isGraded,
        readinessPulse: correctionUnseen ? READINESS_PULSE_LINE : "",
        daysUntilExam: safeDays,
      };
    }
  }

  // 2) session-ready — Betreuer queued a next short step.
  if (inputs.prescription) {
    return {
      ...meta,
      state: "session-ready",
      overline: COPY.sessionReady.overline,
      headline: COPY.sessionReady.headline,
      body: sessionReadyBody(inputs.prescription),
      ctaLabel: COPY.sessionReady.cta,
      milestone: false,
      readinessPulse: "",
      daysUntilExam: safeDays,
    };
  }

  // 3) idle — long absence, no pending session, no fresh submission.
  const hoursSince = inputs.hoursSinceLastSession;
  if (
    typeof hoursSince === "number" &&
    Number.isFinite(hoursSince) &&
    hoursSince >= idleThreshold * HOURS_PER_DAY
  ) {
    return {
      ...meta,
      state: "idle",
      overline: COPY.idle.overline,
      headline: COPY.idle.headline,
      body: COPY.idle.body,
      ctaLabel: COPY.idle.cta,
      milestone: false,
      readinessPulse: "",
      daysUntilExam: safeDays,
    };
  }

  // 4) countdown — fall-through. Branches by `content` (no-date with
  //    submissions → readinessOnly copy) and by `safeDays` (jour J,
  //    no-date cold, regular D-N).
  if (safeDays === null) {
    if (content === "readiness-only") {
      // State B — submissions but no exam date. Calm "fixer une date"
      // nudge; readiness score surfaces in the renderer.
      return {
        ...meta,
        state: "countdown",
        overline: COPY.readinessOnly.overline,
        headline: COPY.readinessOnly.headline,
        body: COPY.readinessOnly.body,
        ctaLabel: COPY.readinessOnly.cta,
        milestone: false,
        readinessPulse: "",
        daysUntilExam: null,
      };
    }
    return {
      ...meta,
      state: "countdown",
      overline: COPY.countdownNoDate.overline,
      headline: COPY.countdownNoDate.headline,
      body: COPY.countdownNoDate.body,
      ctaLabel: COPY.countdownNoDate.cta,
      milestone: false,
      readinessPulse: "",
      daysUntilExam: null,
    };
  }
  if (safeDays === 0) {
    return {
      ...meta,
      state: "countdown",
      overline: COPY.countdownExamDay.overline,
      headline: COPY.countdownExamDay.headline,
      body: COPY.countdownExamDay.body,
      ctaLabel: COPY.countdownExamDay.cta,
      milestone: true,
      readinessPulse: "",
      daysUntilExam: 0,
    };
  }
  return {
    ...meta,
    state: "countdown",
    overline: COPY.countdown.overline,
    headline: COPY.countdown.headline,
    body: COPY.countdown.body,
    ctaLabel: COPY.countdown.cta,
    milestone: false,
    readinessPulse: "",
    daysUntilExam: safeDays,
  };
}
