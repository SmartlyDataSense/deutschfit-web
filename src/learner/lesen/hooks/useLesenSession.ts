"use client";

/**
 * `useLesenSession` — live-mode Lesen session hydration (Task 4.9). Web
 * port of `deutschfit-mobile/src/features/lesen/hooks/useLesenSession.ts`,
 * live-mode branch only — mobile also supports a `sessionSlug` fixture
 * mode (in-repo placeholder Modelltest); the web app never had a fixture
 * path (S4 goes straight to the live `lesen-start`/`lesen-session-get`
 * contract), so that branch is not ported.
 *
 * Hydration source, by precedence (mirrors the screen's route-param
 * precedence from `task-4.9-brief.md`): an `attemptId` resumes an
 * in-progress attempt via `lesen-session-get`; otherwise `examSlug`
 * bootstraps a fresh read via `lesen-start`. Neither present → `idle`,
 * no fetch (matches mobile: fixture-less idle is a legitimate initial
 * render before route params are available).
 *
 * While the fetch is in flight (or before either param exists) the
 * player is built from `createEmptyExamSession("LESEN")` — a stable
 * zero-item session — so `useExamPlayer`'s hook order never changes
 * between the loading and ready states.
 */
import { useEffect, useMemo, useState } from "react";

import { fetchLesenSession, type LesenSessionPayload } from "@/learner/core/api/examApi";
import { buildSession, createEmptyExamSession } from "@/learner/core/exam/engine/loadModel";
import type { ExamSession } from "@/learner/core/exam/engine/types";
import { useExamPlayer, type ExamPlayerState } from "@/learner/core/exam/engine/useExamPlayer";

import { indexReadingTextsFromModule, type ReadingTextRef } from "../data";

/** Alias kept so this hook's public surface matches the brief's named type verbatim. */
export type ReadingTextInfo = ReadingTextRef;

export type UseLesenSessionStatus = "idle" | "loading" | "ready" | "error";

export interface UseLesenSessionArgs {
  readonly attemptId?: string;
  readonly examSlug?: string;
}

export interface UseLesenSessionResult {
  readonly player: ExamPlayerState;
  readonly readingTexts: Readonly<Record<string, ReadingTextInfo>>;
  readonly status: UseLesenSessionStatus;
  readonly error: string | null;
  readonly attemptId: string | null;
}

export function useLesenSession(args: UseLesenSessionArgs): UseLesenSessionResult {
  const hasArgs = Boolean(args.attemptId || args.examSlug);
  const [payload, setPayload] = useState<LesenSessionPayload | null>(null);
  const [status, setStatus] = useState<UseLesenSessionStatus>(hasArgs ? "loading" : "idle");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!hasArgs) {
      setPayload(null);
      setStatus("idle");
      setError(null);
      return;
    }

    let cancelled = false;
    setStatus("loading");
    setError(null);

    void (async () => {
      try {
        const result = args.attemptId
          ? await fetchLesenSession({ attemptId: args.attemptId })
          : await fetchLesenSession(args.examSlug as string);
        if (cancelled) return;
        setPayload(result);
        setStatus("ready");
      } catch (err) {
        if (cancelled) return;
        setPayload(null);
        setStatus("error");
        setError(err instanceof Error ? err.message : String(err));
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [hasArgs, args.attemptId, args.examSlug]);

  const session: ExamSession = useMemo(
    () =>
      payload
        ? buildSession({ manifest: payload.manifest, module: payload.module })
        : createEmptyExamSession("LESEN"),
    [payload]
  );

  const readingTexts = useMemo(
    () => (payload ? indexReadingTextsFromModule(payload.module) : {}),
    [payload]
  );

  const player = useExamPlayer(session);

  return {
    player,
    readingTexts,
    status,
    error,
    attemptId: payload?.attemptId ?? args.attemptId ?? null,
  };
}
