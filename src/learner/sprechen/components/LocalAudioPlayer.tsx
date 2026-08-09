"use client";

/**
 * `LocalAudioPlayer` — replay control for an on-device recording.
 *
 * Port of deutschfit-mobile's `LocalAudioPlayer`
 * (`deutschfit-mobile/src/features/sprechen/components/LocalAudioPlayer.tsx`).
 * Unlike `AudioReplayButton` (which resolves a short-lived signed URL for
 * an already-submitted recording), this player takes a local recorder
 * `uri` (a web object URL, from `useRecorder`/`webRecorder.ts`) directly
 * and drives the `useAudioReplay` playback state machine. It backs the
 * Sprechen `review` phase: the learner replays the monologue they just
 * captured before deciding to re-record or submit. Nothing has left the
 * device yet.
 *
 * The first tap loads the clip and auto-plays; subsequent taps toggle
 * play / pause; once the clip ends a fresh tap re-loads and replays from
 * the start (the minimal native adapter has no seek-to-zero).
 *
 * Brand voice: outline variant, no emoji except the whitelisted ⏱ glyph,
 * no exclamation marks.
 */
import { useCallback, useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";

import { AppButton, AppText } from "@/learner/ui/primitives";

import { useAudioReplay } from "../hooks/useAudioReplay";

interface LocalAudioPlayerProps {
  readonly uri: string;
  readonly testID?: string;
}

function formatClock(totalSec: number): string {
  const safe = Number.isFinite(totalSec) && totalSec > 0 ? totalSec : 0;
  const minutes = Math.floor(safe / 60);
  const seconds = Math.floor(safe % 60);
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

export function LocalAudioPlayer({
  uri,
  testID = "sprechen-session-review-player",
}: LocalAudioPlayerProps) {
  const { t } = useTranslation("sprechen");
  const { status, positionSec, durationSec, errorMessage, load, play, pause } = useAudioReplay();
  const wantPlayRef = useRef(false);

  // Auto-play once the freshly loaded clip reports ready.
  useEffect(() => {
    if (status === "ready" && wantPlayRef.current) {
      wantPlayRef.current = false;
      play();
    }
  }, [status, play]);

  const handlePress = useCallback((): void => {
    if (status === "playing") {
      pause();
      return;
    }
    if (status === "paused") {
      play();
      return;
    }
    // idle | ready | ended | error — (re)load the local clip and replay
    // from the start.
    wantPlayRef.current = true;
    load(uri);
  }, [status, uri, load, play, pause]);

  const isBusy = status === "loading" || (status === "ready" && wantPlayRef.current);

  let label: string;
  if (status === "playing") {
    label = t("feedbackScreen.audioReplay.pause");
  } else if (status === "paused") {
    label = t("feedbackScreen.audioReplay.resume");
  } else if (status === "ended") {
    label = t("feedbackScreen.audioReplay.replay");
  } else if (isBusy) {
    label = t("feedbackScreen.audioReplay.loading");
  } else {
    label = t("feedbackScreen.audioReplay.play");
  }

  const isUnavailable = errorMessage === "player_unavailable";
  const hasError = status === "error";
  const errorCopy = isUnavailable
    ? t("feedbackScreen.audioReplay.unavailable")
    : t("feedbackScreen.audioReplay.error");

  const showClock = status === "playing" || status === "paused" || status === "ended";

  return (
    <div className="flex flex-col gap-2" data-testid={testID}>
      <AppButton
        label={label}
        onClick={handlePress}
        variant="outline"
        loading={isBusy}
        disabled={isUnavailable}
        testID={`${testID}-button`}
      />
      {showClock ? (
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
      ) : null}
      {hasError ? (
        <AppText
          family="sans"
          size="caption"
          tone="secondary"
          align="center"
          testID={`${testID}-error`}
        >
          {errorCopy}
        </AppText>
      ) : null}
    </div>
  );
}
