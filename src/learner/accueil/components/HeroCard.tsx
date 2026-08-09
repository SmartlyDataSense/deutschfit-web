"use client";

import clsx from "clsx";

import { AppButton, AppText } from "@/learner/ui/primitives";

import type { HeroStatePayload } from "../heroState";
import { CountdownHeroCard, type CountdownHeroCardProps } from "./CountdownHeroCard";

/**
 * Accueil `HeroCard` — web port of
 * `deutschfit-mobile/src/features/accueil/components/HeroCard.tsx`.
 * State-aware Hero per founding-doc §8 (S2 ticket #4).
 *
 * Wraps `CountdownHeroCard` for the `countdown` branch and renders a calm,
 * brand-voice-compliant dark card for the three other states:
 * `session-ready`, `post-session`, `idle`.
 *
 * Why a wrapper instead of a refactor:
 *
 *   - `CountdownHeroCard` is the source of truth for the dark
 *     exam-countdown layout (date pill, mini-calendar, progress bar). All
 *     of its testIDs, the Wave-C1 mini-calendar, and the Wave-B2 onPress
 *     contract must stay green. Delegating the countdown branch to it
 *     verbatim keeps that contract intact.
 *
 *   - The three new states share the same dark-card skeleton but with
 *     different copy + a single dominant CTA (nav-philosophy §5 — one
 *     dominant action per state). They don't need the progress bar /
 *     target score / mini-calendar plumbing.
 *
 * Brand-voice §12: every literal lives in `heroState.ts`'s `COPY` table —
 * never inline strings here. `milestoneCaption` below is the one
 * exception, ported verbatim from mobile (it isn't part of the `COPY`
 * table there either). The optional `readinessPulse` line surfaces only
 * when a graded correction has come back unseen (nav-philosophy §5).
 */
export interface HeroCardProps {
  readonly payload: HeroStatePayload;
  /**
   * Props forwarded to `CountdownHeroCard` when the resolved state is
   * `countdown`. The screen builds these from the `accueil-home` payload
   * exactly like before — threaded through this wrapper so the new
   * non-countdown branches don't need to know about exam-date / mini
   * calendar plumbing.
   */
  readonly countdownProps: Omit<CountdownHeroCardProps, "testID">;
  /**
   * Click handler for the dominant CTA on the three new states. The
   * screen routes per-state (e.g. open the session, open the correction,
   * navigate to a short submission) — keeping the routing out of this
   * dumb component. Optional so showcase / stories can render the card
   * without a router.
   */
  readonly onCtaPress?: () => void;
  readonly testID?: string;
}

export function HeroCard({ payload, countdownProps, onCtaPress, testID }: HeroCardProps) {
  if (payload.state === "countdown") {
    // Delegate to the existing dark countdown surface — preserves every
    // Wave-B/C testID and behaviour. S2 #4b — thread the content-axis
    // flags (`showPreparationBar`, `readiness`) so the countdown card
    // hides the preparation bar on State A / C and surfaces the
    // readiness "XX/100" on State B / D.
    return (
      <CountdownHeroCard
        {...countdownProps}
        showPreparationBar={payload.showPreparationBar}
        readiness={payload.readiness ?? undefined}
        testID={testID}
      />
    );
  }

  const a11y = `${payload.headline} ${payload.body}`;
  const captionTone = payload.milestone ? "gold" : "inverse";

  return (
    // A plain `<div>` with no ARIA role isn't a recognized accessibility
    // host — `aria-label` on it is silently dropped by assistive tech.
    // `role="group"` exposes it (this card is never clickable itself —
    // only its inner CTA button is).
    <div
      className="rounded-3xl bg-bg-premium p-6 text-on-premium"
      data-testid={testID}
      aria-label={a11y}
      role="group"
    >
      <div className="mb-4 flex items-center justify-between">
        <AppText
          tone="inverse"
          size="caption"
          weight="medium"
          className="tracking-wide"
          testID={testID ? `${testID}-overline` : undefined}
        >
          {payload.overline}
        </AppText>
      </div>
      <AppText
        tone="inverse"
        family="serif"
        size="h2"
        weight="bold"
        className="mb-2"
        testID={testID ? `${testID}-headline` : undefined}
      >
        {payload.headline}
      </AppText>
      <AppText
        tone="inverse"
        size="body"
        className="mb-4"
        testID={testID ? `${testID}-body` : undefined}
      >
        {payload.body}
      </AppText>
      {payload.readinessPulse ? (
        <div className="mb-4 border-t border-on-premium/20 pt-2">
          <AppText
            tone="gold"
            size="caption"
            weight="semi"
            className="tracking-wide"
            testID={testID ? `${testID}-readiness-pulse` : undefined}
          >
            {payload.readinessPulse}
          </AppText>
        </div>
      ) : null}
      <div className="mt-1">
        <AppButton
          variant="premium"
          label={payload.ctaLabel}
          onClick={onCtaPress ?? noop}
          testID={testID ? `${testID}-cta` : undefined}
        />
      </div>
      {payload.milestone ? (
        <div className="mt-2 flex justify-end">
          <AppText
            tone={captionTone}
            size="caption"
            weight="medium"
            className={clsx("tracking-wide")}
            testID={testID ? `${testID}-milestone-caption` : undefined}
          >
            {milestoneCaption(payload.state)}
          </AppText>
        </div>
      ) : null}
    </div>
  );
}

/**
 * Warm Betreuer voice surfaces only on real milestones (nav-philosophy §4
 * — three approved moments). Calm + short — never on every screen. Ported
 * verbatim from mobile's `HeroCard.tsx`.
 */
function milestoneCaption(state: HeroStatePayload["state"]): string {
  if (state === "post-session") {
    return "On regarde ça ensemble.";
  }
  return "On y va calmement.";
}

const noop = (): void => {};
