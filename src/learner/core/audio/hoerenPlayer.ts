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
  // Web delta: mobile's resolveHoerenNativePlayer returns null when
  // `require("expo-audio")` throws (module unavailable). The web analog of
  // "unavailable" is SSR / no global `Audio` — same null contract, a
  // different unavailability signal.
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

  // Web delta: mobile's adaptExpoAudio tears down and recreates a native
  // player instance on every load() (instance.pause(); instance.remove();
  // instance = createPlayer(...)) — that's how expo-audio's per-source
  // player model works. HTMLAudioElement doesn't need that: one element is
  // lazily created once and reused across load() calls (load() just
  // reassigns src/preload and calls el.load()).
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
    // Web delta: clamps to >= 0 (brief-mandated); mobile's seekTo passes
    // positionSec straight through to expo-audio without clamping.
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
    // Web delta: wrapped in try/catch/finally so release() never throws —
    // jsdom's HTMLMediaElement methods are unimplemented, and a real
    // <audio> element can also throw mid-teardown; mobile's release() has
    // no such guard since expo-audio's instance.remove() doesn't need one.
    release() {
      try {
        el?.pause();
        if (el) {
          el.removeEventListener("ended", handleEnded);
          // Web delta: removeAttribute("src"), not `el.src = ""` — setting
          // src to the empty string re-triggers the resource-selection
          // algorithm against the page URL (spurious fetch/error event in
          // real browsers); removeAttribute detaches cleanly.
          el.removeAttribute("src");
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
