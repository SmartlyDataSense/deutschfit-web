/**
 * HTML5 `<audio>` adapter satisfying the `HoerenNativePlayer` contract that
 * `useHoerenAudio` (`@/learner/hoeren/hooks/useHoerenAudio`) depends on.
 *
 * Web analog of deutschfit-mobile's `resolveHoerenNativePlayer` /
 * `adaptExpoAudio` (`src/features/hoeren/hooks/useHoerenAudio.ts:69-158`) —
 * same member shapes, same non-finite-duration guard — swapping the
 * expo-audio native module for a single reused `HTMLAudioElement`.
 */

/**
 * Minimal shape the hook needs from the underlying player. Mirrors mobile's
 * `HoerenNativePlayer` member-for-member; `play` additionally allows a
 * `Promise<void>` return (Web delta — see `play` below and the hook).
 */
export interface HoerenNativePlayer {
  load: (url: string) => void;
  // Web delta: HTMLAudioElement.play() returns a promise; mobile's is void.
  play: () => void | Promise<void>;
  pause: () => void;
  /** Move the playback head (seconds). Used by replay-from-start (seekTo 0). */
  seekTo: (positionSec: number) => void;
  pollStatus: () => {
    positionSec: number;
    durationSec: number;
    playing: boolean;
    isLoaded: boolean;
    didJustFinish: boolean;
  } | null;
  release: () => void;
}

/** Mobile's exact non-finite→0 guard (useHoerenAudio.ts:136-141). */
function toFiniteNonNegative(value: number): number {
  return Number.isFinite(value) ? Math.max(0, value) : 0;
}

/**
 * Build a `HoerenNativePlayer` backed by a single reused `HTMLAudioElement`.
 * Returns `null` when `window`/`Audio` aren't available (SSR) — the web
 * analog of mobile's "expo-audio failed to `require`" null path.
 *
 * `createElement` is injectable for tests (jsdom has no real media
 * playback); defaults to `() => new Audio()`.
 */
export function createHtmlAudioPlayer(
  createElement: () => HTMLAudioElement = () => new Audio()
): HoerenNativePlayer | null {
  if (typeof window === "undefined" || typeof window.Audio === "undefined") {
    return null;
  }

  let el: HTMLAudioElement | null = null;
  // Web delta: `ended` is an event, not a poll field like expo-audio's
  // `currentStatus.didJustFinish` — latch it here and clear on next read.
  let didJustFinish = false;

  const handleEnded = () => {
    didJustFinish = true;
  };

  const ensureElement = (): HTMLAudioElement => {
    if (!el) {
      el = createElement();
      el.addEventListener("ended", handleEnded);
    }
    return el;
  };

  return {
    load(url: string) {
      const element = ensureElement();
      element.preload = "auto";
      element.src = url;
      didJustFinish = false;
      element.load();
    },
    play() {
      return el?.play();
    },
    pause() {
      el?.pause();
    },
    seekTo(positionSec: number) {
      if (el) el.currentTime = Math.max(0, positionSec);
    },
    pollStatus() {
      if (!el) return null;
      const latch = didJustFinish;
      didJustFinish = false;
      return {
        positionSec: toFiniteNonNegative(el.currentTime),
        durationSec: toFiniteNonNegative(el.duration),
        playing: !el.paused && !el.ended,
        isLoaded: el.readyState >= 1,
        didJustFinish: latch,
      };
    },
    release() {
      try {
        el?.pause();
        if (el) {
          el.removeEventListener("ended", handleEnded);
          el.src = "";
        }
      } catch {
        // jsdom / detached element — release must never throw.
      } finally {
        el = null;
        didJustFinish = false;
      }
    },
  };
}
