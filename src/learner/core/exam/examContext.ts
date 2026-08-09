/**
 * Exam-context store — web port of `deutschfit-mobile/src/core/exam/
 * examContext.tsx`, minus the React provider (no splash-until-loaded
 * wrapper at this altitude — web screens call `hydrateExamContext()` from
 * an effect instead).
 *
 * Single source of truth for the user's current exam track ({board, level})
 * across the learner app. Downstream features read from `useExamContextStore`
 * and thread board+level into their data fetchers.
 *
 * Persistence is two-layered:
 *   1. **localStorage** under `@exam-context-v1` (same key + JSON shape as
 *      mobile's AsyncStorage) — fast, synchronous-feeling hydration on cold
 *      start so we never flash the default while the server round-trips.
 *   2. **`user_profiles` row** via Supabase — the canonical copy. Server wins
 *      on mismatch so if the user changed their selection on another device
 *      we don't silently clobber it with a stale local value.
 *
 * Web deviations from the mobile source (everything else ported verbatim):
 *   - `AsyncStorage` → `window.localStorage` behind an SSR-safe try/catch
 *     (same guard style as `src/learner/core/storage/flags.ts`; this store
 *     round-trips JSON rather than `"true"` literals, so it does not reuse
 *     the `getFlag`/`setFlag` helpers).
 *   - `supabase` singleton import → `getBrowserClient()` per call.
 *   - `useAuth.getState().session?.user.id` → `useLearnerSession.getState()
 *     .session?.user.id`.
 *   - `__DEV__` guards → `process.env.NODE_ENV !== "production"`.
 *
 * Bootstrap flow (`hydrate`):
 *   1. Read localStorage → seed the zustand store synchronously.
 *   2. If authenticated, fetch `user_profiles` → if {board, level} differ
 *      from the local cache, adopt the server value + rewrite localStorage.
 *   3. `isLoaded` flips to `true`.
 *
 * Writes (`setExamContext`, mobile order-of-operations preserved):
 *   1. Clamp the combo via `normaliseExamSelection`.
 *   2. Update the store optimistically.
 *   3. Persist to localStorage (best-effort; warns in dev console on failure).
 *   4. Upsert `user_profiles` (authenticated users only). A server failure is
 *      **thrown** so the caller can surface it (post-F-6) — the optimistic
 *      store + localStorage writes already happened, so the local UI stays
 *      consistent with the user's tap even if the throw propagates.
 *   5. Notify subscribers registered via `subscribeExamContext` only after
 *      the upsert succeeds (or immediately when signed out).
 */
import { create } from "zustand";

import { getBrowserClient } from "@/lib/supabase/browser";
import { useLearnerSession } from "@/learner/core/auth/useLearnerSession";

import {
  DEFAULT_EXAM_BOARD,
  DEFAULT_EXAM_LEVEL,
  DEFAULT_EXAM_SOURCE,
  isExamBoard,
  isExamContextSource,
  isExamLevel,
  normaliseExamSelection,
  type ExamBoard,
  type ExamContextSource,
  type ExamLevel,
} from "./examTypes";

/** localStorage key. Bump the `-v1` suffix if we ever need a migration. Shared key + shape with mobile's AsyncStorage. */
export const EXAM_CONTEXT_STORAGE_KEY = "@exam-context-v1";

/** Row shape we read from / write to `user_profiles`. */
type UserProfileRow = {
  user_id: string;
  exam_board: ExamBoard;
  exam_level: ExamLevel;
};

export type ExamContextSnapshot = {
  board: ExamBoard;
  level: ExamLevel;
  source: ExamContextSource;
};

export type ExamContextState = ExamContextSnapshot & {
  /** `true` after the first hydration pass (localStorage + server) completes. */
  isLoaded: boolean;
};

type ExamContextStore = ExamContextState & {
  /**
   * Hydrate from localStorage first (synchronous feel), then refresh from
   * `user_profiles` (server wins). Safe to call multiple times.
   */
  hydrate: () => Promise<void>;
  /** Force a refresh of the server row without re-reading localStorage. */
  refreshFromServer: () => Promise<void>;
  /**
   * Update the user's exam track. Persists to localStorage and `user_profiles`
   * (authenticated users only). Returns once both side-effects settle so the
   * caller can await before navigating away.
   */
  setExamContext: (next: {
    board: ExamBoard;
    level: ExamLevel;
    source?: ExamContextSource;
  }) => Promise<void>;
};

/* -------------------------------------------------------------------------- */
/* Serialisation                                                              */
/* -------------------------------------------------------------------------- */

type SerialisedExamContext = {
  board: ExamBoard;
  level: ExamLevel;
  source: ExamContextSource;
};

function parseStored(raw: string | null): SerialisedExamContext | null {
  if (raw === null) return null;
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const { board, level, source } = parsed;
    if (!isExamBoard(board) || !isExamLevel(level)) return null;
    const resolvedSource: ExamContextSource = isExamContextSource(source)
      ? source
      : DEFAULT_EXAM_SOURCE;
    return { board, level, source: resolvedSource };
  } catch {
    return null;
  }
}

function readStored(): SerialisedExamContext | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(EXAM_CONTEXT_STORAGE_KEY);
    return parseStored(raw);
  } catch {
    return null;
  }
}

function writeStored(value: SerialisedExamContext): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(EXAM_CONTEXT_STORAGE_KEY, JSON.stringify(value));
  } catch (err) {
    if (process.env.NODE_ENV !== "production") {
      console.warn("[examContext] localStorage write failed:", err);
    }
  }
}

/* -------------------------------------------------------------------------- */
/* Supabase access                                                            */
/* -------------------------------------------------------------------------- */

function currentUserId(): string | null {
  return useLearnerSession.getState().session?.user.id ?? null;
}

async function fetchServerProfile(
  userId: string
): Promise<Pick<UserProfileRow, "exam_board" | "exam_level"> | null> {
  try {
    const { data, error } = await getBrowserClient()
      .from("user_profiles")
      .select("exam_board, exam_level")
      .eq("user_id", userId)
      .maybeSingle();
    if (error) {
      if (process.env.NODE_ENV !== "production") {
        console.warn("[examContext] fetch profile failed:", error.message);
      }
      return null;
    }
    if (!data) return null;
    if (!isExamBoard(data.exam_board) || !isExamLevel(data.exam_level)) {
      return null;
    }
    return { exam_board: data.exam_board, exam_level: data.exam_level };
  } catch (err) {
    if (process.env.NODE_ENV !== "production") {
      console.warn("[examContext] fetch profile threw:", err);
    }
    return null;
  }
}

/**
 * Upsert the user's exam track into `user_profiles`.
 *
 * Throws on Supabase / network failure so the caller (typically
 * `setExamContext`, awaited from onboarding + Settings) can surface the
 * error to the user (post-F-6). The optimistic store update + localStorage
 * write happen *before* this throws, so the local UI stays consistent with
 * the user's tap. The caller decides how to surface the failure (toast,
 * banner, retry).
 */
async function upsertServerProfile(
  userId: string,
  board: ExamBoard,
  level: ExamLevel
): Promise<void> {
  const { error } = await getBrowserClient()
    .from("user_profiles")
    .upsert({ user_id: userId, exam_board: board, exam_level: level }, { onConflict: "user_id" });
  if (error) {
    if (process.env.NODE_ENV !== "production") {
      console.warn("[examContext] upsert profile failed:", error.message);
    }
    throw new Error(error.message || "upsert_user_profile_failed");
  }
}

/* -------------------------------------------------------------------------- */
/* Subscriber pattern                                                         */
/* -------------------------------------------------------------------------- */

type ExamContextSubscriber = (snapshot: ExamContextSnapshot) => void;

const subscribers = new Set<ExamContextSubscriber>();

/**
 * Register a listener for exam-context changes. Used by feature code that
 * caches data keyed on (board, level) and needs to invalidate when the user
 * rotates. Returns an unsubscribe function.
 */
export function subscribeExamContext(listener: ExamContextSubscriber): () => void {
  subscribers.add(listener);
  return () => {
    subscribers.delete(listener);
  };
}

function notifySubscribers(snapshot: ExamContextSnapshot): void {
  for (const sub of subscribers) {
    try {
      sub(snapshot);
    } catch (err) {
      if (process.env.NODE_ENV !== "production") {
        console.warn("[examContext] subscriber threw:", err);
      }
    }
  }
}

/* -------------------------------------------------------------------------- */
/* Store                                                                      */
/* -------------------------------------------------------------------------- */

export const useExamContextStore = create<ExamContextStore>((set, get) => ({
  board: DEFAULT_EXAM_BOARD,
  level: DEFAULT_EXAM_LEVEL,
  source: DEFAULT_EXAM_SOURCE,
  isLoaded: false,

  hydrate: async () => {
    // 1. localStorage — seed synchronously if present.
    const stored = readStored();
    if (stored) {
      set({
        board: stored.board,
        level: stored.level,
        source: stored.source,
      });
    }

    // 2. Server (authenticated users only). Server wins on mismatch.
    const userId = currentUserId();
    if (userId) {
      const server = await fetchServerProfile(userId);
      if (server) {
        const state = get();
        const drift = server.exam_board !== state.board || server.exam_level !== state.level;
        if (drift) {
          set({ board: server.exam_board, level: server.exam_level });
          writeStored({
            board: server.exam_board,
            level: server.exam_level,
            source: state.source,
          });
        }
      }
    }

    set({ isLoaded: true });
  },

  refreshFromServer: async () => {
    const userId = currentUserId();
    if (!userId) return;
    const server = await fetchServerProfile(userId);
    if (!server) return;
    const state = get();
    const drift = server.exam_board !== state.board || server.exam_level !== state.level;
    if (drift) {
      set({ board: server.exam_board, level: server.exam_level });
      writeStored({
        board: server.exam_board,
        level: server.exam_level,
        source: state.source,
      });
      notifySubscribers({
        board: server.exam_board,
        level: server.exam_level,
        source: state.source,
      });
    }
  },

  setExamContext: async ({ board, level, source }) => {
    // Clamp to a valid combo (e.g. goethe c2 → testdaf falls back to b2).
    const { board: normBoard, level: normLevel } = normaliseExamSelection(board, level);
    const nextSource: ExamContextSource = source ?? get().source;

    // 1. Optimistic store update.
    set({ board: normBoard, level: normLevel, source: nextSource });

    // 2. localStorage persistence.
    writeStored({
      board: normBoard,
      level: normLevel,
      source: nextSource,
    });

    // 3. Server upsert (authenticated only).
    const userId = currentUserId();
    if (userId) {
      await upsertServerProfile(userId, normBoard, normLevel);
    }

    // 4. Fan out to subscribers (cache invalidation, telemetry, etc.).
    notifySubscribers({
      board: normBoard,
      level: normLevel,
      source: nextSource,
    });
  },
}));

/** Convenience wrapper for calling hydration from a non-hook context (e.g. a mount effect). */
export const hydrateExamContext = (): Promise<void> => useExamContextStore.getState().hydrate();
