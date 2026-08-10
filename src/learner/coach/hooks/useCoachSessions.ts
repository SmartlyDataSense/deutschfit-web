/**
 * Coach side-menu session list (S9 · Task 9.2).
 *
 * Ports `deutschfit-mobile/src/features/coach/hooks/useCoachSessions.ts`
 * verbatim. `CoachSideMenuSession` is mobile's `../components/CoachSideMenu`
 * shape ({id, dateLabel, preview, count}) — that component isn't part of
 * this task, so the type is declared here instead of imported.
 *
 * `formatDateLabel` is exported (mobile keeps it module-private) so the
 * unit test can exercise the "Aujourd'hui" / "Hier" branches directly —
 * per the task-9.2 brief. Body ported verbatim, French date labels are
 * hardcoded exactly as mobile hardcodes them.
 */
import { useCallback, useEffect, useState } from "react";

import { listCoachThreads } from "../api";

export type CoachSideMenuSession = {
  readonly id: string;
  readonly dateLabel: string;
  readonly preview: string;
  readonly count: number;
};

export function formatDateLabel(isoString: string): string {
  const date = new Date(isoString);
  const now = new Date();

  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfYesterday = new Date(startOfToday);
  startOfYesterday.setDate(startOfYesterday.getDate() - 1);

  if (date >= startOfToday) return "Aujourd'hui";
  if (date >= startOfYesterday) return "Hier";

  const day = date.getDate();
  const month = date.toLocaleDateString("fr-FR", { month: "short" });
  return `${day} ${month}`;
}

export type UseCoachSessionsResult = {
  readonly sessions: readonly CoachSideMenuSession[];
  readonly loading: boolean;
  readonly error: string | null;
  readonly refresh: () => void;
};

export type UseCoachSessionsArgs = {
  /** Test injection seam — defaults to the real `listCoachThreads`. */
  readonly deps?: {
    readonly listCoachThreads?: typeof listCoachThreads;
  };
};

export function useCoachSessions(args: UseCoachSessionsArgs = {}): UseCoachSessionsResult {
  const fetcher = args.deps?.listCoachThreads ?? listCoachThreads;
  const [sessions, setSessions] = useState<CoachSideMenuSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    fetcher()
      .then((threads) => {
        if (cancelled) return;
        setSessions(
          threads.map((t) => ({
            id: t.threadId,
            dateLabel: formatDateLabel(t.startedAt),
            preview: t.preview.slice(0, 60),
            count: t.messageCount,
          }))
        );
        setLoading(false);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "coach_threads_fetch_failed");
        setSessions([]);
        setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [tick, fetcher]);

  const refresh = useCallback(() => {
    setTick((n) => n + 1);
  }, []);

  return { sessions, loading, error, refresh };
}
