import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { create } from "zustand";

const readOnboardedAt = vi.fn();
const hasDiagnosticOnServer = vi.fn();
vi.mock("@/learner/core/onboarding/onboardingStatus", () => ({
  readOnboardedAt: (...a: unknown[]) => readOnboardedAt(...a),
  hasDiagnosticOnServer: (...a: unknown[]) => hasDiagnosticOnServer(...a),
}));

// Real zustand session-store stub the hook can subscribe to. Built inside
// the mock factory (not as a separate top-level `const`) so it isn't
// subject to Vitest's `vi.mock` hoisting TDZ — only `vi.fn()` / imported
// bindings are safe to reference from a hoisted factory, plain `const`
// declarations are not. The store handle is recovered below via the
// mocked import itself, which resolves to the same object reference.
vi.mock("@/learner/core/auth/useLearnerSession", () => ({
  useLearnerSession: create<{ session: { user: { id: string } } | null; status: string }>(() => ({
    session: { user: { id: "u1" } },
    status: "authenticated",
  })),
}));

import { useLearnerSession as sessionStoreRaw } from "@/learner/core/auth/useLearnerSession";
import { useOnboardingFlagStore } from "@/learner/core/onboarding/useOnboardingFlag";
import { useOnboardingGateCheck } from "@/learner/core/onboarding/useOnboardingGate";

// The mocked module's real (non-test) type declares `session: Session | null`
// (the full Supabase `Session` shape), but the mock factory above only ever
// constructs the minimal `{ user: { id } }` stub — cast to that narrower,
// test-only shape so `setState` calls below don't need a full fake `Session`.
interface FakeSessionState {
  session: { user: { id: string } } | null;
  status: string;
}
const sessionStore = sessionStoreRaw as unknown as {
  setState: (partial: Partial<FakeSessionState>) => void;
  getState: () => FakeSessionState;
};

function installMemoryStorage(): void {
  const data: Record<string, string> = {};
  Object.defineProperty(window, "localStorage", {
    configurable: true,
    value: {
      getItem: (k: string) => (k in data ? data[k] : null),
      setItem: (k: string, v: string) => {
        data[k] = v;
      },
      removeItem: (k: string) => {
        delete data[k];
      },
    } as unknown as Storage,
  });
}

describe("useOnboardingGateCheck decision matrix", () => {
  beforeEach(() => {
    installMemoryStorage();
    vi.clearAllMocks();
    sessionStore.setState({ session: { user: { id: "u1" } }, status: "authenticated" });
    useOnboardingFlagStore.setState({ userId: null, done: false, hydrated: false });
  });

  it("local flag true → done without any network call", async () => {
    window.localStorage.setItem("@deutschfit/onboarding-done/u1", "true");
    const { result } = renderHook(() => useOnboardingGateCheck());
    await waitFor(() => expect(result.current).toEqual({ checked: true, done: true }));
    expect(readOnboardedAt).not.toHaveBeenCalled();
    expect(hasDiagnosticOnServer).not.toHaveBeenCalled();
  });

  it("onboarded_at present → done, local flag back-filled", async () => {
    readOnboardedAt.mockResolvedValue("2026-05-22T10:00:00Z");
    const { result } = renderHook(() => useOnboardingGateCheck());
    await waitFor(() => expect(result.current).toEqual({ checked: true, done: true }));
    expect(window.localStorage.getItem("@deutschfit/onboarding-done/u1")).toBe("true");
    expect(hasDiagnosticOnServer).not.toHaveBeenCalled(); // short-circuits
  });

  it("no stamp but diagnostic row present (legacy account) → done", async () => {
    readOnboardedAt.mockResolvedValue(null);
    hasDiagnosticOnServer.mockResolvedValue(true);
    const { result } = renderHook(() => useOnboardingGateCheck());
    await waitFor(() => expect(result.current).toEqual({ checked: true, done: true }));
  });

  it("neither signal → not done (wizard)", async () => {
    readOnboardedAt.mockResolvedValue(null);
    hasDiagnosticOnServer.mockResolvedValue(false);
    const { result } = renderHook(() => useOnboardingGateCheck());
    await waitFor(() => expect(result.current).toEqual({ checked: true, done: false }));
  });

  it("lookup error → fail-open into onboarding (checked, not done)", async () => {
    readOnboardedAt.mockRejectedValue(new Error("network"));
    const { result } = renderHook(() => useOnboardingGateCheck());
    await waitFor(() => expect(result.current).toEqual({ checked: true, done: false }));
  });

  it("flips to done when markDone() fires mid-session (finish flow)", async () => {
    readOnboardedAt.mockResolvedValue(null);
    hasDiagnosticOnServer.mockResolvedValue(false);
    const { result } = renderHook(() => useOnboardingGateCheck());
    await waitFor(() => expect(result.current.checked).toBe(true));
    useOnboardingFlagStore.getState().hydrateFor("u1");
    useOnboardingFlagStore.getState().markDone();
    await waitFor(() => expect(result.current.done).toBe(true));
  });

  it("no user → unchecked", () => {
    sessionStore.setState({ session: null, status: "unauthenticated" });
    const { result } = renderHook(() => useOnboardingGateCheck());
    expect(result.current).toEqual({ checked: false, done: false });
  });
});
