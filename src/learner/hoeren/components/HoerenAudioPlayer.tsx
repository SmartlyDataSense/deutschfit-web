"use client";

/**
 * `HoerenAudioPlayer` — verbatim port of
 * `deutschfit-mobile/src/features/hoeren/components/HoerenAudioPlayer.tsx`.
 * Plays the Teil's signed clip with play / pause + replay-from-start, a
 * non-interactive progress bar and an elapsed/total readout. French chrome
 * (buttons, captions, a11y); the clip itself is German exam content.
 *
 *   - `missing` / null `url` → disabled control + "Audio indisponible".
 *   - Signed-URL expiry (long background) → play error → "Recharger" action
 *     calls `onReload`, which re-fetches the practice payload upstream so a
 *     fresh signed URL flows back down via the `url` prop.
 *
 * Controls are text-labelled (no icon glyphs) — mirrors the mobile
 * precedent. The only emoji is the whitelisted ⏱ glyph (brand voice §12).
 * Strings are hardcoded French, deliberately not routed through i18n
 * (content-adjacent chrome, byte-for-byte parity with mobile).
 */
import { useEffect } from "react";

import { AppButton, AppText, ProgressBar } from "@/learner/ui/primitives";

import { useHoerenAudio } from "../hooks/useHoerenAudio";

export interface HoerenAudioPlayerProps {
  /** Signed clip URL, or `null` when there is no playable track. */
  readonly url: string | null;
  /** `true` when the Teil has no audio track (or it failed to resolve). */
  readonly missing: boolean;
  /** Re-fetch the practice payload to recover an expired signed URL. */
  readonly onReload?: () => void;
  readonly testID?: string;
}

function formatClock(totalSec: number): string {
  const safe = Number.isFinite(totalSec) && totalSec > 0 ? totalSec : 0;
  const minutes = Math.floor(safe / 60);
  const seconds = Math.floor(safe % 60);
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

export function HoerenAudioPlayer({
  url,
  missing,
  onReload,
  testID = "hoeren-audio-player",
}: HoerenAudioPlayerProps) {
  const { status, positionSec, durationSec, errorMessage, load, play, pause, replay } =
    useHoerenAudio();

  useEffect(() => {
    if (missing || !url) return;
    load(url);
    // `load` is stable (useCallback); re-load only when the URL changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url, missing]);

  if (missing || !url) {
    return (
      <div data-testid={testID} className="flex flex-col gap-2">
        <AppText
          family="sans"
          size="body"
          tone="secondary"
          align="center"
          testID={`${testID}-missing`}
        >
          Audio indisponible
        </AppText>
      </div>
    );
  }

  const isPlaying = status === "playing";
  const isLoading = status === "loading";
  const isUnavailable = errorMessage === "player_unavailable";
  const hasError = status === "error";

  let playLabel: string;
  let playAccessibilityLabel: string;
  if (isPlaying) {
    playLabel = "Pause";
    playAccessibilityLabel = "Mettre en pause";
  } else if (status === "paused") {
    playLabel = "Reprendre";
    playAccessibilityLabel = "Reprendre la lecture";
  } else {
    playLabel = "Lire l'audio";
    playAccessibilityLabel = "Lire l'audio";
  }

  const progress = durationSec > 0 ? positionSec / durationSec : 0;

  return (
    <div data-testid={testID} className="flex flex-col gap-2">
      <div className="flex flex-row gap-3">
        <AppButton
          label={playLabel}
          aria-label={playAccessibilityLabel}
          onClick={() => {
            if (isPlaying) {
              pause();
              return;
            }
            if (status === "ended") {
              replay();
              return;
            }
            play();
          }}
          variant="outline"
          loading={isLoading}
          disabled={isUnavailable}
          className="flex-1"
          testID={`${testID}-play`}
        />
        <AppButton
          label="Réécouter"
          aria-label="Réécouter depuis le début"
          onClick={() => replay()}
          variant="ghost"
          disabled={isUnavailable || isLoading}
          className="flex-1"
          testID={`${testID}-replay`}
        />
      </div>

      <ProgressBar
        value={progress}
        aria-label="Progression de l'audio"
        testID={`${testID}-progress`}
      />
      <AppText
        family="sans"
        size="caption"
        tone="tertiary"
        numeric
        align="center"
        testID={`${testID}-clock`}
      >
        {`⏱ ${formatClock(positionSec)} / ${formatClock(durationSec)}`}
      </AppText>

      {hasError ? (
        <>
          <AppText
            family="sans"
            size="caption"
            tone="secondary"
            align="center"
            testID={`${testID}-error`}
          >
            {isUnavailable ? "Audio indisponible" : "La lecture a échoué"}
          </AppText>
          {isUnavailable ? null : (
            <AppButton
              label="Recharger"
              aria-label="Recharger l'audio"
              onClick={() => onReload?.()}
              variant="ghost"
              testID={`${testID}-reload`}
            />
          )}
        </>
      ) : null}
    </div>
  );
}
