"use client";

/**
 * `AudioReplayButton` — replay control for the Sprechen Feedback screen.
 *
 * Port of deutschfit-mobile's `AudioReplayButton`
 * (`deutschfit-mobile/src/features/sprechen/components/AudioReplayButton.tsx`).
 * Resolves a short-lived signed URL for the learner's own recording
 * (`getSprechenAudioUrl` → the `sprechen-audio-url` edge function, imported
 * from the `examApi` facade per Constraint 15), then drives the
 * `useAudioReplay` playback state machine. The first tap fetches the URL
 * and auto-plays; subsequent taps toggle play / pause; once the clip ends
 * a fresh tap re-fetches and replays from the start (the minimal native
 * adapter has no seek-to-zero).
 *
 * Brand voice: outline variant, no emoji except the whitelisted ⏱ glyph,
 * no exclamation marks.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import { getSprechenAudioUrl } from "@/learner/core/api/examApi";
import { AppButton, AppText } from "@/learner/ui/primitives";

import { useAudioReplay } from "../hooks/useAudioReplay";

interface AudioReplayButtonProps {
  readonly submissionId: string;
  readonly testID?: string;
}

function formatClock(totalSec: number): string {
  const safe = Number.isFinite(totalSec) && totalSec > 0 ? totalSec : 0;
  const minutes = Math.floor(safe / 60);
  const seconds = Math.floor(safe % 60);
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

export function AudioReplayButton({
  submissionId,
  testID = "sprechen-feedback-audio-replay",
}: AudioReplayButtonProps) {
  const { t } = useTranslation("sprechen");
  const { status, positionSec, durationSec, errorMessage, load, play, pause } = useAudioReplay();
  const [urlLoading, setUrlLoading] = useState(false);
  const [urlError, setUrlError] = useState(false);
  const wantPlayRef = useRef(false);

  // Auto-play once the freshly loaded clip reports ready.
  useEffect(() => {
    if (status === "ready" && wantPlayRef.current) {
      wantPlayRef.current = false;
      play();
    }
  }, [status, play]);

  const handleFetchAndPlay = useCallback(async (): Promise<void> => {
    setUrlError(false);
    setUrlLoading(true);
    try {
      const { url } = await getSprechenAudioUrl(submissionId);
      wantPlayRef.current = true;
      load(url);
    } catch {
      setUrlError(true);
    } finally {
      setUrlLoading(false);
    }
  }, [submissionId, load]);

  const handlePress = useCallback((): void => {
    if (status === "playing") {
      pause();
      return;
    }
    if (status === "paused") {
      play();
      return;
    }
    // idle | ready | ended | error — (re)resolve a signed URL and replay
    // from the start.
    void handleFetchAndPlay();
  }, [status, pause, play, handleFetchAndPlay]);

  const isBusy = urlLoading || status === "loading" || (status === "ready" && wantPlayRef.current);

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
  const hasError = urlError || status === "error";
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
