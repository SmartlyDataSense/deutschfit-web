/**
 * HTML5 `<audio>` adapter satisfying the `NativePlayer` contract that
 * `useAudioReplay` (`@/learner/sprechen/hooks/useAudioReplay`) depends on.
 *
 * Web analog of deutschfit-mobile's `resolveNativePlayer` / `adaptExpoAudio`
 * (`deutschfit-mobile/src/features/sprechen/hooks/useAudioReplay.ts:79-169`)
 * — same `NativePlayer` member shapes (`load`/`play`/`pause`/`pollStatus`/
 * `release`), swapping the expo-audio native module for a single reused
 * `HTMLAudioElement`.
 *
 * NOTE: `@/learner/core/audio/hoerenPlayer` is a DIFFERENT adapter for a
 * DIFFERENT interface — `HoerenNativePlayer` has `seekTo` (Hören's replay
 * control rewinds to 0), this `NativePlayer` does not (Sprechen's replay
 * affordance always reloads from the start instead, mobile parity). This
 * file does not import or reuse that adapter, even though the two share
 * most of their shape.
 *
 * Unlike `hoerenPlayer.ts`'s `createHtmlAudioPlayer` (which returns `null`
 * on an SSR/no-`Audio` environment), this factory never returns `null`
 * itself — mirrors `webRecorder.ts`'s `createWebRecorder`: constructing
 * the adapter object touches no browser API (the `<audio>` element is
 * created lazily, inside `load()`). The `player_unavailable` error path is
 * therefore only reachable via a test-injected `nativeFactory` returning
 * `null` in `useAudioReplay` (F-028-style precedent, mirrors
 * `useRecorder`'s `recorder_unavailable`); a real SSR call to `load()`
 * instead throws synchronously when `createElement()` (`new Audio()`)
 * fails, and the hook's `load()` catches that as `load_failed`.
 */
import type { NativePlayer } from "../hooks/useAudioReplay";

/** Non-finite → 0 guard, matching mobile's `pollStatus` normalization. */
function toFiniteNonNegative(value: number): number {
  return Number.isFinite(value) ? Math.max(0, value) : 0;
}

/**
 * Build a `NativePlayer` backed by a single reused `HTMLAudioElement`.
 *
 * `createElement` is injectable for tests (jsdom has no real media
 * playback); defaults to `() => new Audio()`.
 */
export function createWebPlayer(
  createElement: () => HTMLAudioElement = () => new Audio()
): NativePlayer {
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
