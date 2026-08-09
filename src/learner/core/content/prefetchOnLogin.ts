/**
 * Prefetch-on-login — warm the content cache as soon as a session lands.
 *
 * Port of `deutschfit-mobile/src/features/content/services/prefetchOnLogin.ts`
 * (S4 Task 4.10). Every login transition (see `usePrefetchOnLogin.ts`) fans
 * out parallel `prefetchContent` calls for the top-N payloads a
 * freshly-signed-in user will reach next:
 *
 *   - Writing prompts (`prompts-list`) for the user's exam track. This warms
 *     the cache key the S6 Schreiben slice reads
 *     (`prompts-list:writing:<board>:<level>`) — S6 lands after this task,
 *     so it consumes an already-warm cache rather than paying the first-load
 *     network round-trip.
 *
 * Lesen / Hören / Sprechen prefetch entries are deliberately omitted, same
 * rationale as mobile — those response shapes aren't cache-compatible with
 * the existing sync feature adapters yet.
 *
 * Failures here MUST NOT block auth or the app shell. All calls go through
 * `prefetchContent`, which swallows errors and logs at `warn` — this module
 * does not add its own try/catch around that (would double-handle).
 */
import { prefetchContent } from "@/learner/core/content/loadContent";
import { hydrateExamContext, useExamContextStore } from "@/learner/core/exam/examContext";
import { promptsCacheKey, type WritingPrompt } from "@/learner/core/api/writing";

// `WritingPrompt` used to be declared locally here (pre-S6, before the S6
// Schreiben slice — the actual consumer of this cache key — landed). Now
// that `core/api/writing.ts` owns the type, it's imported instead of
// duplicated (byte-compared identical member-for-member against the local
// shape this replaced, per S6 Task 6.2 brief P12).
export type { WritingPrompt };

export interface PrefetchOnLoginOverrides {
  /** Override the exam track. Defaults to the live `useExamContextStore` snapshot. */
  readonly examBoard?: string;
  readonly examLevel?: string;
}

export async function prefetchOnLogin(overrides: PrefetchOnLoginOverrides = {}): Promise<void> {
  // Web delta: mobile wraps the app in an `ExamContextProvider` that blocks
  // children until hydration completes, so by the time `useAuth` fires
  // SIGNED_IN the store is guaranteed warm (see examContext.ts docstring —
  // web has no such blocking provider; screens self-hydrate instead). This
  // hook can fire before any screen has called `hydrateExamContext()`, so
  // ensure it here before trusting board/level. `hydrate()` is idempotent
  // and never throws (see examContext.ts).
  if (!useExamContextStore.getState().isLoaded) {
    await hydrateExamContext();
  }

  const snapshot = useExamContextStore.getState();
  const examBoard = overrides.examBoard ?? snapshot.board;
  const examLevel = overrides.examLevel ?? snapshot.level;

  // Parallel fan-out — each call is best-effort, failures are swallowed by
  // `prefetchContent`. Array shape kept (even at one entry) so S5/S6 append
  // entries without restructuring. GET, no body — mirrors mobile's
  // `listPrompts` constraint and the backend ignoring these filters today.
  //
  // Web delta: the brief sketches `prefetchContent<{prompts: WritingPrompt[]}>
  // ({...})`, but the actual web `prefetchContent` export (loadContent.ts)
  // is non-generic — `(options: LoadContentOptions): Promise<void>` — unlike
  // `loadContent<TPayload>`. The `<{ prompts: WritingPrompt[] }>` payload
  // shape is a comment-only annotation here rather than a type argument.
  await Promise.all([
    // payload shape: { prompts: WritingPrompt[] }
    prefetchContent({
      fnName: "prompts-list",
      cacheKey: promptsCacheKey(examBoard, examLevel),
      method: "GET",
      mode: "prefetch",
    }),
  ]);
}
