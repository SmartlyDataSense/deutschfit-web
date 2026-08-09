/**
 * `src/learner/ui/chrome/*` — `OfflineBanner` (+ its `useOnlineStatus`
 * hook) and `LearnerErrorBoundary` (Task 1.4).
 *
 * Both components call `useTranslation()`, so tests render them inside a
 * real `I18nextProvider` backed by the actual learner i18next instance
 * (`initLearnerI18n("fr")`) rather than mocking `react-i18next` — this also
 * catches a missing/renamed i18n key, which a mocked `t()` wouldn't.
 */
import { act, cleanup, fireEvent, render, renderHook, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { I18nextProvider } from "react-i18next";
import type { ReactElement } from "react";

import { initLearnerI18n } from "@/learner/core/i18n";
import { LearnerErrorBoundary } from "@/learner/ui/chrome/LearnerErrorBoundary";
import { OfflineBanner, useOnlineStatus } from "@/learner/ui/chrome/OfflineBanner";

afterEach(cleanup);

function setOnline(value: boolean): void {
  Object.defineProperty(window.navigator, "onLine", {
    configurable: true,
    value,
  });
}

function renderWithI18n(ui: ReactElement) {
  const instance = initLearnerI18n("fr");
  return render(<I18nextProvider i18n={instance}>{ui}</I18nextProvider>);
}

describe("useOnlineStatus", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    setOnline(true);
  });

  it("initializes isOffline=false when navigator.onLine is true", () => {
    setOnline(true);
    const { result } = renderHook(() => useOnlineStatus());
    expect(result.current).toBe(false);
  });

  it("initializes isOffline=true when navigator.onLine is false", () => {
    setOnline(false);
    const { result } = renderHook(() => useOnlineStatus());
    expect(result.current).toBe(true);
  });

  it("flips to true on a window 'offline' event and back to false on 'online'", () => {
    setOnline(true);
    const { result } = renderHook(() => useOnlineStatus());
    expect(result.current).toBe(false);

    act(() => {
      setOnline(false);
      window.dispatchEvent(new Event("offline"));
    });
    expect(result.current).toBe(true);

    act(() => {
      setOnline(true);
      window.dispatchEvent(new Event("online"));
    });
    expect(result.current).toBe(false);
  });

  it("adds 'online'/'offline' listeners on mount and removes them on unmount", () => {
    const addSpy = vi.spyOn(window, "addEventListener");
    const removeSpy = vi.spyOn(window, "removeEventListener");

    const { unmount } = renderHook(() => useOnlineStatus());
    expect(addSpy).toHaveBeenCalledWith("online", expect.any(Function));
    expect(addSpy).toHaveBeenCalledWith("offline", expect.any(Function));

    unmount();
    expect(removeSpy).toHaveBeenCalledWith("online", expect.any(Function));
    expect(removeSpy).toHaveBeenCalledWith("offline", expect.any(Function));
  });
});

describe("OfflineBanner", () => {
  afterEach(() => setOnline(true));

  it("renders nothing while online", () => {
    setOnline(true);
    renderWithI18n(<OfflineBanner />);
    expect(screen.queryByTestId("learner-offline-banner")).toBeNull();
  });

  it("renders an alert banner with the FR offline copy while offline", () => {
    setOnline(false);
    renderWithI18n(<OfflineBanner />);
    const banner = screen.getByTestId("learner-offline-banner");
    expect(banner).toHaveAttribute("role", "alert");
    expect(banner).toHaveAttribute("aria-live", "polite");
    expect(banner).toHaveTextContent("Hors ligne — certaines fonctionnalités sont indisponibles");
  });

  it("server-renders nothing even when the client would be offline (hydration safety)", async () => {
    // Regression: the SSR HTML never contains the banner (the server can't
    // know the client's connectivity), so the first client render must match
    // it — even when `navigator.onLine` is already false at hydration time.
    // With the old lazy-`useState` read this mismatched and React logged a
    // recoverable hydration error on /fr/app/login.
    const { renderToString } = await import("react-dom/server");
    setOnline(false);
    const instance = initLearnerI18n("fr");
    const html = renderToString(
      <I18nextProvider i18n={instance}>
        <OfflineBanner />
      </I18nextProvider>
    );
    expect(html).not.toContain("learner-offline-banner");
  });
});

describe("LearnerErrorBoundary", () => {
  function ThrowingChild(): never {
    throw new Error("boom");
  }

  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    // React itself also logs the caught error to console.error inside an
    // error boundary — spy (don't fully silence) so assertions on our own
    // "[LearnerErrorBoundary] caught:" call still work, without spamming
    // the test runner's real stderr for the expected-boom case.
    consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
  });

  it("renders children when nothing throws", () => {
    renderWithI18n(
      <LearnerErrorBoundary>
        <div>contenu ok</div>
      </LearnerErrorBoundary>
    );
    expect(screen.getByText("contenu ok")).toBeInTheDocument();
  });

  it("renders the FR EmptyState fallback when a child throws", () => {
    renderWithI18n(
      <LearnerErrorBoundary>
        <ThrowingChild />
      </LearnerErrorBoundary>
    );

    expect(screen.getByTestId("learner-error-boundary")).toBeInTheDocument();
    expect(screen.getByText("Une erreur est survenue")).toBeInTheDocument();
    expect(screen.getByText("Vérifie ta connexion et réessaie.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Réessayer" })).toBeInTheDocument();
  });

  it("logs the caught error via console.error instead of swallowing it", () => {
    renderWithI18n(
      <LearnerErrorBoundary>
        <ThrowingChild />
      </LearnerErrorBoundary>
    );

    expect(consoleErrorSpy).toHaveBeenCalledWith(
      "[LearnerErrorBoundary] caught:",
      expect.any(Error),
      expect.anything()
    );
  });

  it("the retry action reloads the page", () => {
    // jsdom's `window.location.reload` isn't a configurable own property,
    // so `vi.spyOn` can't redefine it in place — replace the whole
    // `location` object with a stub instead (standard jsdom workaround).
    const originalLocation = window.location;
    const reloadSpy = vi.fn();
    Object.defineProperty(window, "location", {
      configurable: true,
      value: { ...originalLocation, reload: reloadSpy },
    });

    renderWithI18n(
      <LearnerErrorBoundary>
        <ThrowingChild />
      </LearnerErrorBoundary>
    );
    fireEvent.click(screen.getByRole("button", { name: "Réessayer" }));

    expect(reloadSpy).toHaveBeenCalledTimes(1);

    Object.defineProperty(window, "location", {
      configurable: true,
      value: originalLocation,
    });
  });
});
