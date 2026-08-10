"use client";

/**
 * `CoachChatScreen` — the Betreuer chat transcript (S9 · Task 9.4). Ports
 * `deutschfit-mobile/src/features/coach/screens/CoachChatScreen.tsx`'s
 * two-shell structure:
 *
 *   - Outer shell (`CoachChatScreen`): resolves `activeThreadId` (route
 *     param → that thread's history; no param → resume the most recent
 *     thread or mint a fresh id; transport failure → fresh local thread,
 *     no error UI — mobile parity). Owns `useCoachPlan`, `useCoachSessions`,
 *     `useCoachOpenerFlag` (single-bound-consumer — mounted here and ONLY
 *     here, passed down as props; see that hook's docstring) and the
 *     persistent/drawer `CoachThreadPanel` split.
 *   - Inner shell (`ChatContent`), re-keyed on `activeThreadId` so a
 *     thread switch fully remounts (no stale draft, no stale rate-limit
 *     countdown, no leaked history — same rationale as mobile's `key`
 *     prop): owns `useCoachChat`, the composer, the 429 lockout
 *     countdown, the offline/error/fallback banners, and the transcript.
 *
 * Web deltas from mobile (documented per-line below where they occur):
 *   - `CoachThreadPanel` replaces mobile's modal-only `CoachSideMenu`
 *     with a two-variant component (persistent rail on `lg+`, drawer
 *     below it) — desktop chat doesn't need a hamburger to see recent
 *     threads.
 *   - The one-shot "drill chain finished" bubble is handed back via
 *     `useDrillChainStore` (a zustand store) instead of a React
 *     Navigation route param — see `drillChainStore.ts`'s docstring.
 *     Because `ChatContent` already remounts per thread (the `key`
 *     prop), the store is consumed exactly once on mount and there is
 *     no separate "clear on thread switch" effect to write — the
 *     remount itself is the clear.
 *   - `DrillChainStartCTA` is not a separate file this task (not listed
 *     in the task-9.4 brief's Files section) — it's a small local
 *     component below, same visual contract as mobile's.
 *   - The mobile transcript also computes a scripted-fallback
 *     observation body/connectors pair, but mobile's `buildEmptyTranscript`
 *     only ever pushes the observation item when `hasObservationSignal`
 *     is already true — at which point the "live" branch of that ternary
 *     is the only one ever read. The fallback branch is therefore dead
 *     code on mobile; this port omits it (net-identical behaviour:
 *     observation + drill CTA render only when the live plan has
 *     signal).
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useLocale } from "next-intl";
import { useTranslation } from "react-i18next";

import { useLearnerSession } from "@/learner/core/auth/useLearnerSession";
import { trackEvent } from "@/learner/core/analytics/posthog";
import { useOnlineStatus } from "@/learner/ui/chrome/OfflineBanner";
import { AppButton, AppText } from "@/learner/ui/primitives";

import { listCoachThreads, loadCoachThreadHistory } from "../api";
import { CoachBubble } from "../components/CoachBubble";
import { CoachChatComposer } from "../components/CoachChatComposer";
import { CoachThreadHeader } from "../components/CoachThreadHeader";
import { CoachThreadPanel } from "../components/CoachThreadPanel";
import { CoachTypingIndicator } from "../components/CoachTypingIndicator";
import { ObservationCard } from "../components/ObservationCard";
import { useDrillChainStore, type PendingDrillSummary } from "../drillChainStore";
import { generateThreadId, useCoachChat, type CoachSendOutcome } from "../hooks/useCoachChat";
import { useCoachOpenerFlag } from "../hooks/useCoachOpenerFlag";
import { useCoachPlan, type UseCoachPlanResult } from "../hooks/useCoachPlan";
import { useCoachSessions } from "../hooks/useCoachSessions";
import type { CoachMessage } from "../types";

/**
 * How long the composer stays disabled after a `coach_rate_limited`
 * outcome. Matches the backend's rate-limit cadence (mirrors mobile's
 * constant of the same name).
 */
const RATE_LIMIT_LOCKOUT_MS = 30_000;

/** Translation key prefix for the error banner (mirrors mobile's constant). */
const ERROR_I18N_PREFIX = "coach:chat.errors.";

type TranscriptItem =
  | {
      readonly kind: "bubble";
      readonly id: string;
      readonly author: "coach" | "user";
      readonly text: string;
      readonly timestampLabel?: string;
    }
  | {
      readonly kind: "observation";
      readonly id: string;
      readonly body: string;
      readonly connectors: readonly string[];
      readonly overlineLabel: string;
    }
  | {
      readonly kind: "drill-cta";
      readonly id: string;
      readonly observationId: string;
      readonly connectors: readonly string[];
      readonly title: string;
      readonly subtitle: string;
      readonly ctaLabel: string;
    }
  | {
      readonly kind: "drill-summary";
      readonly id: string;
      readonly tallyLabel: string;
      readonly signoff: string;
    };

function formatClockTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const hh = date.getHours().toString().padStart(2, "0");
  const mm = date.getMinutes().toString().padStart(2, "0");
  return `${hh}:${mm}`;
}

function messageToItem(m: CoachMessage): TranscriptItem {
  const timestamp = formatClockTime(m.createdAt);
  return {
    kind: "bubble",
    id: m.id,
    author: m.role === "assistant" ? "coach" : "user",
    text: m.text,
    timestampLabel: timestamp === "" ? undefined : timestamp,
  };
}

export interface CoachChatScreenProps {
  readonly routeThreadId?: string;
}

export function CoachChatScreen({ routeThreadId }: CoachChatScreenProps) {
  const userId = useLearnerSession((s) => s.session?.user?.id ?? "");
  const { t } = useTranslation(["coach"]);
  const locale = useLocale();
  const base = `/${locale}/app`;
  const isOffline = useOnlineStatus();

  const [resolvePhase, setResolvePhase] = useState<"loading" | "ready" | "error">("loading");
  const [activeThreadId, setActiveThreadId] = useState<string | null>(null);
  const [initialMessages, setInitialMessages] = useState<readonly CoachMessage[]>([]);
  const [drawerOpen, setDrawerOpen] = useState(false);

  const sessionsState = useCoachSessions();
  const coachPlan = useCoachPlan();
  // Single-bound-consumer: mounted from exactly this one component (see
  // the hook's own docstring). Its `seen`/`hydrated`/`markSeen` are
  // threaded down into `ChatContent` as props rather than re-mounting
  // the hook there.
  const openerFlag = useCoachOpenerFlag(userId);

  useEffect(() => {
    let cancelled = false; // re-armed on every setup (Constraint 12)
    setResolvePhase("loading");
    void (async () => {
      try {
        if (routeThreadId) {
          const history = await loadCoachThreadHistory(routeThreadId);
          if (cancelled) return;
          setActiveThreadId(routeThreadId);
          setInitialMessages(history);
          setResolvePhase("ready");
          return;
        }
        const threads = await listCoachThreads();
        if (cancelled) return;
        const latest = threads[0];
        if (latest) {
          const history = await loadCoachThreadHistory(latest.threadId);
          if (cancelled) return;
          setActiveThreadId(latest.threadId);
          setInitialMessages(history);
        } else {
          setActiveThreadId(generateThreadId());
          setInitialMessages([]);
        }
        setResolvePhase("ready");
      } catch {
        if (cancelled) return;
        setActiveThreadId((prev) => prev ?? routeThreadId ?? generateThreadId());
        setInitialMessages([]);
        setResolvePhase("error"); // renders normally, mobile parity — no error UI
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [routeThreadId]);

  const isLoading = resolvePhase === "loading" || activeThreadId === null;

  return (
    <div className="flex h-full" data-testid="coach-chat-screen">
      <CoachThreadPanel variant="persistent" base={base} sessions={sessionsState.sessions} />
      <div className="flex min-w-0 flex-1 flex-col">
        <CoachThreadHeader
          onMenu={() => setDrawerOpen(true)}
          status={isOffline ? "offline" : "online"}
          title={t("coach:chat.header.title")}
          menuAccessibilityLabel={t("coach:threadHeader.menuA11y")}
          onlineAccessibilityLabel={t("coach:threadHeader.online")}
          offlineAccessibilityLabel={t("coach:threadHeader.offline")}
        />
        {isLoading ? (
          <div className="flex flex-1 items-center justify-center">
            <CoachTypingIndicator visible testID="coach-chat-loading-indicator" />
          </div>
        ) : (
          <ChatContent
            key={activeThreadId}
            threadId={activeThreadId}
            userId={userId}
            initialMessages={initialMessages}
            base={base}
            coachPlan={coachPlan}
            isOffline={isOffline}
            openerSeen={openerFlag.seen}
            openerHydrated={openerFlag.hydrated}
            markOpenerSeen={openerFlag.markSeen}
          />
        )}
      </div>
      {drawerOpen ? (
        <CoachThreadPanel
          variant="drawer"
          base={base}
          sessions={sessionsState.sessions}
          onClose={() => setDrawerOpen(false)}
        />
      ) : null}
    </div>
  );
}

interface ChatContentProps {
  readonly threadId: string;
  readonly userId: string;
  readonly initialMessages: readonly CoachMessage[];
  readonly base: string;
  readonly coachPlan: UseCoachPlanResult;
  readonly isOffline: boolean;
  /** True once the learner has seen the cold-start opener at least once. */
  readonly openerSeen: boolean;
  /** Guards against a stale `seen:false` flashing the opener twice. */
  readonly openerHydrated: boolean;
  readonly markOpenerSeen: () => Promise<void>;
}

function ChatContent({
  threadId,
  userId,
  initialMessages,
  base,
  coachPlan,
  isOffline,
  openerSeen,
  openerHydrated,
  markOpenerSeen,
}: ChatContentProps) {
  const { t } = useTranslation(["coach"]);
  const router = useRouter();

  const [draft, setDraft] = useState("");
  // Seconds remaining on a 429 lockout. 0 = composer is free.
  const [rateLimitRemainingSec, setRateLimitRemainingSec] = useState(0);
  const [bannerCode, setBannerCode] = useState<string | null>(null);
  const sendStartedAtRef = useRef<number | null>(null);

  // Whether to show the scripted opener bubble, decided ONCE per mount
  // (latched into state, not re-derived live from `openerSeen`) — the
  // very act of showing it flips `openerSeen` to `true` via
  // `markOpenerSeen()` below, and a memo that read `openerSeen` directly
  // would then immediately recompute the transcript and yank the bubble
  // back out from under the learner mid-session. Decided the instant
  // hydration settles; stays pinned for the rest of this mount.
  const [openerDecided, setOpenerDecided] = useState(false);
  const [showOpener, setShowOpener] = useState(false);
  useEffect(() => {
    if (openerDecided || !openerHydrated) return;
    setOpenerDecided(true);
    setShowOpener(!openerSeen);
  }, [openerDecided, openerHydrated, openerSeen]);

  const handleSendOutcome = useCallback(
    (outcome: CoachSendOutcome) => {
      const startedAt = sendStartedAtRef.current ?? Date.now();
      const duration = outcome.durationMs || Date.now() - startedAt;
      sendStartedAtRef.current = null;

      if (outcome.kind === "success") {
        setBannerCode(null);
        trackEvent("coach_message_received", {
          thread_id: threadId,
          duration_ms: duration,
          outcome: "success",
        });
        return;
      }

      setBannerCode(outcome.code);
      if (outcome.code === "coach_rate_limited") {
        setRateLimitRemainingSec(Math.ceil(RATE_LIMIT_LOCKOUT_MS / 1000));
        trackEvent("coach_message_received", {
          thread_id: threadId,
          duration_ms: duration,
          outcome: "rate_limited",
        });
        return;
      }
      trackEvent("coach_message_received", {
        thread_id: threadId,
        duration_ms: duration,
        outcome: "error",
      });
    },
    [threadId]
  );

  const { messages, phase, send } = useCoachChat({
    threadId,
    userId,
    initialMessages,
    onSendOutcome: handleSendOutcome,
  });

  // Decrement the 429 countdown once per second until it clears. Plain
  // declarative effect (not a one-shot boot ref) — the interval it
  // schedules is re-armed every time this effect re-runs, and its
  // cleanup always clears the one it scheduled, so this survives
  // StrictMode's setup→cleanup→setup cycle cleanly (Constraint 12).
  useEffect(() => {
    if (rateLimitRemainingSec <= 0) return;
    const handle = setInterval(() => {
      setRateLimitRemainingSec((prev) => {
        if (prev <= 1) {
          setBannerCode((code) => (code === "coach_rate_limited" ? null : code));
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(handle);
  }, [rateLimitRemainingSec]);

  const handleSubmit = useCallback(() => {
    const text = draft.trim();
    if (!text) return;
    if (phase === "sending" || phase === "streaming") return;
    // Offline guard — avoid the round trip, surface the banner, and log a
    // `_received` "offline" outcome. No `_sent` event: the message never
    // left the device.
    if (isOffline) {
      setBannerCode("coach_offline");
      trackEvent("coach_message_received", {
        thread_id: threadId,
        duration_ms: 0,
        outcome: "offline",
      });
      return;
    }
    // Rate-limit lockout — the server would 429 again anyway.
    if (rateLimitRemainingSec > 0) {
      setBannerCode("coach_rate_limited");
      return;
    }

    sendStartedAtRef.current = Date.now();
    trackEvent("coach_message_sent", { thread_id: threadId, message_length: text.length });
    setBannerCode(null);
    void send(text);
    setDraft("");
  }, [draft, phase, send, threadId, isOffline, rateLimitRemainingSec]);

  const isSending = phase === "sending" || phase === "streaming";
  // Deliberately NOT gated on `isOffline` — the composer stays tappable
  // while offline so a submit attempt reaches `handleSubmit`'s own
  // offline guard (banner + `coach_message_received{outcome:"offline"}`)
  // instead of being silently swallowed by a native `disabled` button,
  // which never dispatches a click at all.
  const composerDisabled = isSending || rateLimitRemainingSec > 0;

  const visibleMessages = useMemo(() => messages.filter((m) => m.role !== "system"), [messages]);

  // One-shot drill-summary bubble handed back from the drill-chain
  // screen via `useDrillChainStore`. Consumed exactly once per mount —
  // since `ChatContent` remounts per thread (the `key` prop on the
  // outer screen), this doubles as "cleared on thread switch": a fresh
  // mount starts with an empty local list and a fresh consume. The
  // `.some` dedupe guard is defensive against StrictMode's dev
  // double-invoke of this effect; it's a no-op in practice because the
  // store itself already clears on first consume (`consumePendingSummary`
  // returns `null` on the second call).
  const [drillSummaries, setDrillSummaries] = useState<readonly PendingDrillSummary[]>([]);
  useEffect(() => {
    const summary = useDrillChainStore.getState().consumePendingSummary();
    if (!summary) return;
    setDrillSummaries((prev) =>
      prev.some((s) => s.id === summary.id) ? prev : [...prev, summary]
    );
  }, []);

  const transcript = useMemo<readonly TranscriptItem[]>(() => {
    const summaryBubbles: TranscriptItem[] = drillSummaries.map((s) => {
      const safeTotal = Math.max(1, s.total);
      const safeCorrect = Math.max(0, Math.min(s.correct, safeTotal));
      const perfect = safeCorrect === safeTotal;
      const signoffKey = perfect
        ? "coach:drills.summary.signoffPerfect"
        : safeCorrect >= Math.ceil(safeTotal * 0.5)
          ? "coach:drills.summary.signoffGood"
          : "coach:drills.summary.signoffPractice";
      return {
        kind: "drill-summary",
        id: s.id,
        tallyLabel: t("coach:drills.summary.tally", { correct: safeCorrect, total: safeTotal }),
        signoff: t(signoffKey),
      };
    });

    if (visibleMessages.length === 0) {
      const liveObservation = coachPlan.observation;
      const hasObservationSignal = !!(
        liveObservation?.hasSignal &&
        liveObservation.body.length > 0 &&
        liveObservation.connectors.length > 0
      );

      const items: TranscriptItem[] = [];
      if (showOpener) {
        items.push({
          kind: "bubble",
          id: "scripted-coach-opener",
          author: "coach",
          text: t("coach:chat.scripted.coachOpener"),
        });
      }
      if (hasObservationSignal && liveObservation) {
        items.push({
          kind: "observation",
          id: "scripted-observation",
          body: liveObservation.body,
          connectors: liveObservation.connectors,
          overlineLabel: t("coach:chat.scripted.observation.overline"),
        });
        items.push({
          kind: "drill-cta",
          id: "scripted-drill-cta",
          observationId: "scripted-observation",
          connectors: liveObservation.connectors,
          title: t("coach:drills.startCta.title"),
          subtitle: t("coach:drills.startCta.subtitle"),
          ctaLabel: t("coach:drills.startCta.buttonLabel"),
        });
      }
      return [...items, ...summaryBubbles];
    }
    return [...visibleMessages.map(messageToItem), ...summaryBubbles];
  }, [visibleMessages, t, coachPlan.observation, showOpener, drillSummaries]);

  // Persist the per-user "seen" flag the moment this mount decides to
  // show the opener — future mounts (new thread, next sign-in) then skip
  // it. Fires at most once per mount.
  const openerMarkedRef = useRef(false);
  useEffect(() => {
    if (!showOpener || openerMarkedRef.current) return;
    openerMarkedRef.current = true;
    void markOpenerSeen();
  }, [showOpener, markOpenerSeen]);

  // Fire `coach_observation_viewed` exactly once per observation id
  // surfaced in the transcript.
  const seenObservationsRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    for (const item of transcript) {
      if (item.kind === "observation" && !seenObservationsRef.current.has(item.id)) {
        seenObservationsRef.current.add(item.id);
        trackEvent("coach_observation_viewed", { observation_id: item.id });
      }
    }
  }, [transcript]);

  const handleStartDrill = useCallback(
    (observationId: string, connectors: readonly string[]) => {
      useDrillChainStore.getState().setLaunch({
        threadId,
        observationId,
        connectors,
        drills: coachPlan.plan?.drills ?? [],
      });
      router.push(`${base}/coach/drill-chain`);
    },
    [threadId, coachPlan.plan?.drills, router, base]
  );

  const bannerKey = bannerCode === null ? null : `${ERROR_I18N_PREFIX}${bannerCode}`;
  const bannerText =
    bannerKey === null
      ? null
      : t(bannerKey, {
          seconds: rateLimitRemainingSec,
          defaultValue: t("coach:chat.errors.coach_send_failed"),
        });

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex-1 overflow-y-auto" data-testid="coach-chat-list">
        <div className="flex flex-col gap-2 py-3">
          {coachPlan.fallback ? (
            <div
              data-testid="coach-chat-fallback-banner"
              className="mx-4 rounded-[var(--radius-md)] border border-line-soft bg-bg-card px-4 py-2"
            >
              <AppText tone="secondary" size="caption">
                {t("coach:chat.fallbackBanner")}
              </AppText>
            </div>
          ) : null}
          {bannerText ? (
            <div
              data-testid="coach-chat-error-banner"
              role="alert"
              className="mx-4 rounded-[var(--radius-md)] border border-warning-red bg-bg-card px-4 py-2"
            >
              <AppText tone="warning" size="caption">
                {bannerText}
              </AppText>
            </div>
          ) : null}
          {transcript.map((item) => (
            <TranscriptItemView key={item.id} item={item} onStartDrill={handleStartDrill} />
          ))}
          <CoachTypingIndicator visible={isSending} testID="coach-chat-send-typing-indicator" />
        </div>
      </div>
      <CoachChatComposer
        draft={draft}
        onDraftChange={setDraft}
        onSubmit={handleSubmit}
        placeholder={t("coach:chat.composer.placeholder")}
        inputAccessibilityLabel={t("coach:chat.composer.inputA11y")}
        sendAccessibilityLabel={t("coach:chat.composer.sendA11y")}
        disabled={composerDisabled}
      />
    </div>
  );
}

function TranscriptItemView({
  item,
  onStartDrill,
}: {
  readonly item: TranscriptItem;
  readonly onStartDrill: (observationId: string, connectors: readonly string[]) => void;
}) {
  if (item.kind === "observation") {
    return (
      <ObservationCard
        body={item.body}
        connectors={item.connectors}
        overlineLabel={item.overlineLabel}
        testID={`coach-chat-observation-${item.id}`}
      />
    );
  }
  if (item.kind === "drill-cta") {
    return (
      <DrillChainStartCTA
        title={item.title}
        subtitle={item.subtitle}
        ctaLabel={item.ctaLabel}
        onStart={() => onStartDrill(item.observationId, item.connectors)}
        testID={`coach-chat-drill-cta-${item.id}`}
      />
    );
  }
  if (item.kind === "drill-summary") {
    return (
      <CoachBubble
        author="coach"
        text={`${item.tallyLabel}\n${item.signoff}`}
        testID={`coach-drill-summary-bubble-${item.id}`}
      />
    );
  }
  return (
    <CoachBubble
      author={item.author}
      text={item.text}
      timestampLabel={item.timestampLabel}
      testID={`coach-message-${item.id}`}
    />
  );
}

/**
 * `DrillChainStartCTA` — the "Démarrer le drill" card rendered between
 * the observation event and the composer. Not a separate file this
 * task (not listed in the task-9.4 brief's Files section) — colocated
 * here, same visual contract as
 * `deutschfit-mobile/src/features/coach/components/DrillChainStartCTA.tsx`
 * (cream card, teal rail, title + subtitle + CTA button).
 */
function DrillChainStartCTA({
  title,
  subtitle,
  ctaLabel,
  onStart,
  testID,
}: {
  readonly title: string;
  readonly subtitle: string;
  readonly ctaLabel: string;
  readonly onStart: () => void;
  readonly testID?: string;
}) {
  return (
    <div
      data-testid={testID}
      className="mx-4 mb-2 flex gap-3 rounded-[var(--radius-md)] bg-bg-card p-4"
    >
      <span aria-hidden="true" className="w-0.5 shrink-0 self-stretch rounded-full bg-coach" />
      <div className="flex flex-1 flex-col gap-2">
        <AppText family="serif" size="h3" weight="bold" className="truncate">
          {title}
        </AppText>
        <AppText tone="secondary" size="body">
          {subtitle}
        </AppText>
        <AppButton
          label={ctaLabel}
          onClick={onStart}
          variant="solid"
          testID="drill-chain-start-cta"
          className="mt-1 self-start"
        />
      </div>
    </div>
  );
}
