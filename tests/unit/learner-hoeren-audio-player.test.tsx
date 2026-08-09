import { render, cleanup, fireEvent, screen } from "@testing-library/react";
import { I18nextProvider } from "react-i18next";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// `vi.hoisted` — same TDZ rationale as `learner-lesen-intro.test.tsx`:
// `vi.mock` factories are hoisted above the rest of the module, so any mock
// fn they reference must be built via `vi.hoisted`, not a plain top-level
// `const`.
const { loadMock, playMock, pauseMock, replayMock, resetMock, useHoerenAudioMock } = vi.hoisted(
  () => ({
    loadMock: vi.fn(),
    playMock: vi.fn(),
    pauseMock: vi.fn(),
    replayMock: vi.fn(),
    resetMock: vi.fn(),
    useHoerenAudioMock: vi.fn(),
  })
);

vi.mock("@/learner/hoeren/hooks/useHoerenAudio", () => ({
  useHoerenAudio: () => useHoerenAudioMock(),
}));

import { initLearnerI18n } from "@/learner/core/i18n";
import { HoerenAudioPlayer } from "@/learner/hoeren/components/HoerenAudioPlayer";
import { renderWithI18n } from "./helpers/renderWithI18n";

type MockSnapshot = {
  status: "idle" | "loading" | "ready" | "playing" | "paused" | "ended" | "error";
  positionSec: number;
  durationSec: number;
  errorMessage: string | null;
};

function snapshot(overrides: Partial<MockSnapshot> = {}) {
  return {
    status: "ready" as const,
    positionSec: 0,
    durationSec: 0,
    errorMessage: null,
    ...overrides,
    load: loadMock,
    play: playMock,
    pause: pauseMock,
    replay: replayMock,
    reset: resetMock,
  };
}

describe("HoerenAudioPlayer — text-labelled controls, no seeking (Task 5.3)", () => {
  beforeEach(() => {
    loadMock.mockReset();
    playMock.mockReset();
    pauseMock.mockReset();
    replayMock.mockReset();
    resetMock.mockReset();
    useHoerenAudioMock.mockReset();
    useHoerenAudioMock.mockReturnValue(snapshot());
  });
  afterEach(cleanup);

  it("(a) ready + zeroed snapshot — primary 'Lire l'audio', secondary 'Réécouter', clock '⏱ 0:00 / 0:00'", () => {
    renderWithI18n(<HoerenAudioPlayer url="https://cdn.example/a.mp3" missing={false} />);

    expect(screen.getByTestId("hoeren-audio-player-play").textContent).toBe("Lire l'audio");
    expect(screen.getByTestId("hoeren-audio-player-play").getAttribute("aria-label")).toBe(
      "Lire l'audio"
    );
    expect(screen.getByTestId("hoeren-audio-player-replay").textContent).toBe("Réécouter");
    expect(screen.getByTestId("hoeren-audio-player-replay").getAttribute("aria-label")).toBe(
      "Réécouter depuis le début"
    );
    expect(screen.getByTestId("hoeren-audio-player-clock").textContent).toBe("⏱ 0:00 / 0:00");
    expect(screen.queryByTestId("hoeren-audio-player-missing")).not.toBeInTheDocument();
    expect(screen.queryByTestId("hoeren-audio-player-error")).not.toBeInTheDocument();
  });

  it("(b) playing — visible 'Pause', aria 'Mettre en pause', click calls pause", () => {
    useHoerenAudioMock.mockReturnValue(
      snapshot({ status: "playing", positionSec: 12, durationSec: 60 })
    );
    renderWithI18n(<HoerenAudioPlayer url="https://cdn.example/a.mp3" missing={false} />);

    const playButton = screen.getByTestId("hoeren-audio-player-play");
    expect(playButton.textContent).toBe("Pause");
    expect(playButton.getAttribute("aria-label")).toBe("Mettre en pause");

    fireEvent.click(playButton);
    expect(pauseMock).toHaveBeenCalledTimes(1);
    expect(playMock).not.toHaveBeenCalled();
    expect(replayMock).not.toHaveBeenCalled();
  });

  it("(c) paused — visible 'Reprendre', aria 'Reprendre la lecture', click calls play", () => {
    useHoerenAudioMock.mockReturnValue(
      snapshot({ status: "paused", positionSec: 12, durationSec: 60 })
    );
    renderWithI18n(<HoerenAudioPlayer url="https://cdn.example/a.mp3" missing={false} />);

    const playButton = screen.getByTestId("hoeren-audio-player-play");
    expect(playButton.textContent).toBe("Reprendre");
    expect(playButton.getAttribute("aria-label")).toBe("Reprendre la lecture");

    fireEvent.click(playButton);
    expect(playMock).toHaveBeenCalledTimes(1);
    expect(pauseMock).not.toHaveBeenCalled();
    expect(replayMock).not.toHaveBeenCalled();
  });

  it("(d) ended — primary back to 'Lire l'audio' (no ended-only CTA), click calls replay", () => {
    useHoerenAudioMock.mockReturnValue(
      snapshot({ status: "ended", positionSec: 60, durationSec: 60 })
    );
    renderWithI18n(<HoerenAudioPlayer url="https://cdn.example/a.mp3" missing={false} />);

    const playButton = screen.getByTestId("hoeren-audio-player-play");
    expect(playButton.textContent).toBe("Lire l'audio");
    expect(playButton.getAttribute("aria-label")).toBe("Lire l'audio");

    fireEvent.click(playButton);
    expect(replayMock).toHaveBeenCalledTimes(1);
    expect(playMock).not.toHaveBeenCalled();
    expect(pauseMock).not.toHaveBeenCalled();
  });

  it("(e) missing: true — only the -missing text renders, zero buttons", () => {
    renderWithI18n(<HoerenAudioPlayer url={null} missing={true} />);

    expect(screen.getByTestId("hoeren-audio-player-missing").textContent).toBe(
      "Audio indisponible"
    );
    expect(screen.queryByTestId("hoeren-audio-player-play")).not.toBeInTheDocument();
    expect(screen.queryByTestId("hoeren-audio-player-replay")).not.toBeInTheDocument();
    expect(screen.queryByTestId("hoeren-audio-player-progress")).not.toBeInTheDocument();
    expect(screen.queryByTestId("hoeren-audio-player-clock")).not.toBeInTheDocument();
    expect(screen.queryAllByRole("button")).toHaveLength(0);
    expect(loadMock).not.toHaveBeenCalled();
  });

  it("(e2) missing: false but url null — same as missing (guard is `missing || !url`)", () => {
    renderWithI18n(<HoerenAudioPlayer url={null} missing={false} />);

    expect(screen.getByTestId("hoeren-audio-player-missing").textContent).toBe(
      "Audio indisponible"
    );
    expect(screen.queryByTestId("hoeren-audio-player-play")).not.toBeInTheDocument();
    expect(loadMock).not.toHaveBeenCalled();
  });

  it("(f) error load_failed — 'La lecture a échoué' + 'Recharger' fires onReload", () => {
    useHoerenAudioMock.mockReturnValue(snapshot({ status: "error", errorMessage: "load_failed" }));
    const onReload = vi.fn();
    renderWithI18n(
      <HoerenAudioPlayer url="https://cdn.example/a.mp3" missing={false} onReload={onReload} />
    );

    expect(screen.getByTestId("hoeren-audio-player-error").textContent).toBe("La lecture a échoué");
    const reloadButton = screen.getByTestId("hoeren-audio-player-reload");
    expect(reloadButton.textContent).toBe("Recharger");
    expect(reloadButton.getAttribute("aria-label")).toBe("Recharger l'audio");

    fireEvent.click(reloadButton);
    expect(onReload).toHaveBeenCalledTimes(1);
  });

  it("(f2) error player_unavailable — 'Audio indisponible' text, no -reload button, primary disabled", () => {
    useHoerenAudioMock.mockReturnValue(
      snapshot({ status: "error", errorMessage: "player_unavailable" })
    );
    renderWithI18n(<HoerenAudioPlayer url="https://cdn.example/a.mp3" missing={false} />);

    expect(screen.getByTestId("hoeren-audio-player-error").textContent).toBe("Audio indisponible");
    expect(screen.queryByTestId("hoeren-audio-player-reload")).not.toBeInTheDocument();
    expect(screen.getByTestId("hoeren-audio-player-play")).toBeDisabled();
    expect(screen.getByTestId("hoeren-audio-player-replay")).toBeDisabled();
  });

  it("(g) progress element is a non-interactive progressbar — no click/keyboard handler (seeking forbidden)", () => {
    useHoerenAudioMock.mockReturnValue(
      snapshot({ status: "playing", positionSec: 30, durationSec: 60 })
    );
    renderWithI18n(<HoerenAudioPlayer url="https://cdn.example/a.mp3" missing={false} />);

    const progress = screen.getByTestId("hoeren-audio-player-progress");
    expect(progress.getAttribute("role")).toBe("progressbar");
    expect(progress.getAttribute("aria-label")).toBe("Progression de l'audio");
    expect(progress.tagName).toBe("DIV");
    expect(progress.getAttribute("tabindex")).toBeNull();

    // Clicking the bar must not trigger any transport action — it is
    // display-only, unlike a scrubber.
    fireEvent.click(progress);
    fireEvent.keyDown(progress, { key: "ArrowRight" });
    expect(playMock).not.toHaveBeenCalled();
    expect(pauseMock).not.toHaveBeenCalled();
    expect(replayMock).not.toHaveBeenCalled();
    expect(loadMock).toHaveBeenCalledTimes(1); // only the mount-effect load
  });

  it("(h) effect calls load(url) once on mount, again only when `url` changes (not on unrelated re-renders)", () => {
    const i18n = initLearnerI18n("fr");
    const tree = (url: string | null, missing: boolean) => (
      <I18nextProvider i18n={i18n}>
        <HoerenAudioPlayer url={url} missing={missing} testID="player" />
      </I18nextProvider>
    );

    const { rerender } = render(tree("https://cdn.example/a.mp3", false));
    expect(loadMock).toHaveBeenCalledTimes(1);
    expect(loadMock).toHaveBeenLastCalledWith("https://cdn.example/a.mp3");

    // Same url, same missing — re-render must not call `load` again.
    rerender(tree("https://cdn.example/a.mp3", false));
    expect(loadMock).toHaveBeenCalledTimes(1);

    // `url` changes (e.g. a P3 reload delivering a fresh signed URL) —
    // `load` fires again with the new url.
    rerender(tree("https://cdn.example/b.mp3", false));
    expect(loadMock).toHaveBeenCalledTimes(2);
    expect(loadMock).toHaveBeenLastCalledWith("https://cdn.example/b.mp3");
  });
});
