/**
 * `DeleteAccountScreen` — S11 · Task 8.
 *
 * This is the most destructive screen in the app, so beyond the brief's
 * happy-path script this suite pins the invariants that actually keep an
 * accidental deletion from happening:
 *   - the confirm token must match EXACTLY (trim + uppercase only) — a
 *     substring or a superstring of "DELETE" must NOT satisfy the gate;
 *   - the destructive CTA is genuinely unreachable (not just visually
 *     dimmed) while the gate is unsatisfied — clicking it is a no-op;
 *   - a second click landing before the in-flight request settles does
 *     NOT fire a second `account-delete` call (synchronous re-entrancy
 *     guard, not just the `disabled` attribute which only takes effect
 *     on the next render);
 *   - the full side-effect ORDER is invoke → wipe → analytics-reset →
 *     sign-out → redirect, not just that each happened;
 *   - the failure path only ever dismisses the error and never fires any
 *     of the success side effects.
 */
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { act } from "react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const replace = vi.fn();
const back = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace, back }),
}));
vi.mock("next-intl", () => ({ useLocale: () => "fr" }));

const invokeFn = vi.fn();
vi.mock("@/learner/core/api/client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/learner/core/api/client")>();
  return { ...actual, invokeFn: (...a: unknown[]) => invokeFn(...a) };
});

const wipeLocalState = vi.fn().mockResolvedValue(undefined);
vi.mock("@/learner/core/storage/wipe", () => ({
  wipeLocalState: (...a: unknown[]) => wipeLocalState(...a),
}));

const trackEvent = vi.fn();
const resetAnalyticsUser = vi.fn();
vi.mock("@/learner/core/analytics/posthog", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/learner/core/analytics/posthog")>();
  return {
    ...actual,
    trackEvent: (...a: unknown[]) => trackEvent(...a),
    resetAnalyticsUser: (...a: unknown[]) => resetAnalyticsUser(...a),
  };
});

const signOut = vi.fn().mockResolvedValue(undefined);
vi.mock("@/learner/core/auth/useLearnerSession", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/learner/core/auth/useLearnerSession")>();
  return {
    ...actual,
    useLearnerSession: (selector?: (s: unknown) => unknown) => {
      const state = {
        session: { user: { id: "u1", email: "qa1@df.dev" } },
        status: "authenticated",
        signOut,
        setSession: vi.fn(),
        setStatus: vi.fn(),
      };
      return selector ? selector(state) : state;
    },
  };
});

import { initLearnerI18n } from "@/learner/core/i18n";
import { LearnerI18nProvider } from "@/learner/core/i18n/LearnerI18nProvider";
import { DeleteAccountScreen } from "@/learner/account-deletion/screens/DeleteAccountScreen";

afterEach(cleanup);
beforeAll(() => initLearnerI18n("fr"));
beforeEach(() => {
  vi.clearAllMocks();
});

const ui = () =>
  render(
    <LearnerI18nProvider lng="fr">
      <DeleteAccountScreen />
    </LearnerI18nProvider>
  );

// `Input` renders `data-testid` on its WRAPPER div, not the <input> —
// firing change events on the testID node would hit a div and silently
// do nothing. Target the real input by id (precedent: `#login-email`).
const confirmInput = () =>
  document.getElementById("delete-account-confirm-input") as HTMLInputElement;

describe("DeleteAccountScreen (S11.8)", () => {
  it("tracks account_delete_requested once on mount and never renders the subs hint", () => {
    ui();
    // trackEvent is POSITIONAL: (name, properties) — posthog.ts:576.
    expect(trackEvent).toHaveBeenCalledWith("account_delete_requested", { source: "web" });
    expect(trackEvent).toHaveBeenCalledTimes(1);
    // Product lock: app-store subscription copy never renders on web.
    expect(screen.queryByText(/abonnement/i)).toBeNull();
    expect(screen.queryByText(/magasin d'applications/i)).toBeNull();
  });

  it("CTA stays disabled until the exact token is typed (case/space tolerant)", () => {
    ui();
    const cta = screen.getByTestId("delete-account-confirm-cta");
    expect(cta).toBeDisabled();
    fireEvent.change(confirmInput(), { target: { value: "delete me" } });
    expect(cta).toBeDisabled();
    fireEvent.change(confirmInput(), { target: { value: "  delete " } });
    expect(cta).not.toBeDisabled();
  });

  it("CTA stays disabled for a substring or a superstring of the token — exact match only", () => {
    ui();
    const cta = screen.getByTestId("delete-account-confirm-cta");
    // Substring: "DEL" is a prefix of DELETE but not equal to it.
    fireEvent.change(confirmInput(), { target: { value: "DEL" } });
    expect(cta).toBeDisabled();
    // Superstring: "DELETEX" contains DELETE but is not equal to it —
    // a `.includes("DELETE")` gate (instead of exact equality) would
    // wrongly enable the CTA here.
    fireEvent.change(confirmInput(), { target: { value: "DELETEX" } });
    expect(cta).toBeDisabled();
    fireEvent.change(confirmInput(), { target: { value: "XDELETE" } });
    expect(cta).toBeDisabled();
  });

  it("the disabled CTA is genuinely unreachable — clicking it while the gate is unsatisfied is a no-op", () => {
    ui();
    fireEvent.change(confirmInput(), { target: { value: "not delete" } });
    const cta = screen.getByTestId("delete-account-confirm-cta");
    fireEvent.click(cta);
    expect(invokeFn).not.toHaveBeenCalled();
    expect(trackEvent).not.toHaveBeenCalledWith("account_delete_confirmed", { source: "web" });
  });

  it("confirm: tracks confirmed BEFORE the call, invokes account-delete with source web, wipes, resets analytics, signs out, redirects — in that exact order", async () => {
    invokeFn.mockResolvedValue({ ok: true });
    ui();
    fireEvent.change(confirmInput(), { target: { value: "DELETE" } });
    fireEvent.click(screen.getByTestId("delete-account-confirm-cta"));
    await waitFor(() =>
      expect(invokeFn).toHaveBeenCalledWith("account-delete", {
        method: "POST",
        body: { source: "web" },
      })
    );
    expect(trackEvent).toHaveBeenCalledWith("account_delete_confirmed", { source: "web" });
    // confirmed fired before the network call:
    const confirmedIdx = trackEvent.mock.calls.findIndex(
      ([name]) => name === "account_delete_confirmed"
    );
    expect(confirmedIdx).toBeGreaterThanOrEqual(0);
    expect(invokeFn.mock.invocationCallOrder[0]!).toBeGreaterThan(
      trackEvent.mock.invocationCallOrder[confirmedIdx]!
    );
    await waitFor(() => expect(wipeLocalState).toHaveBeenCalledWith("u1"));
    await waitFor(() => expect(resetAnalyticsUser).toHaveBeenCalled());
    await waitFor(() => expect(signOut).toHaveBeenCalled());
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/fr/app/login"));

    // Full ordering, not just presence: invoke -> wipe -> reset -> signOut -> redirect.
    const invokeOrder = invokeFn.mock.invocationCallOrder[0]!;
    const wipeOrder = wipeLocalState.mock.invocationCallOrder[0]!;
    const resetOrder = resetAnalyticsUser.mock.invocationCallOrder[0]!;
    const signOutOrder = signOut.mock.invocationCallOrder[0]!;
    const replaceOrder = replace.mock.invocationCallOrder[0]!;
    expect(wipeOrder).toBeGreaterThan(invokeOrder);
    expect(resetOrder).toBeGreaterThan(wipeOrder);
    expect(signOutOrder).toBeGreaterThan(resetOrder);
    expect(replaceOrder).toBeGreaterThan(signOutOrder);

    expect(invokeFn).toHaveBeenCalledTimes(1);
    expect(wipeLocalState).toHaveBeenCalledTimes(1);
  });

  it("a same-tick double click does not fire a second account-delete call", async () => {
    // `fireEvent.click` twice as two SEPARATE calls does not exercise the
    // race: each call is individually wrapped in its own `act()`, so
    // React flushes `setDeleting(true)` — and thus the DOM `disabled`
    // attribute — before the second `fireEvent.click` is dispatched,
    // meaning the state-only `disabled` guard alone would already look
    // sufficient there (`fireEvent.doubleClick` doesn't help either — it
    // only dispatches a single native `dblclick` event, not two `click`
    // events, so React's onClick handler only ever fires once from it).
    // A real double click (or two clicks landing in the same task) fires
    // TWO `click` events before React gets a chance to re-render — that
    // is the actual race `inFlightRef` (a synchronous ref, not state)
    // exists to close. Dispatching both native click events inside one
    // shared `act()` callback reproduces that: React batches the
    // resulting state updates and does not re-render (so `disabled`
    // stays stale) until the callback returns.
    let resolveInvoke!: (v: unknown) => void;
    invokeFn.mockReturnValue(
      new Promise((resolve) => {
        resolveInvoke = resolve;
      })
    );
    ui();
    fireEvent.change(confirmInput(), { target: { value: "DELETE" } });
    const cta = screen.getByTestId("delete-account-confirm-cta");
    act(() => {
      cta.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
      cta.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
    });
    expect(invokeFn).toHaveBeenCalledTimes(1);
    resolveInvoke({ ok: true });
    await waitFor(() => expect(signOut).toHaveBeenCalled());
    expect(invokeFn).toHaveBeenCalledTimes(1);
  });

  it("failure: tracks account_delete_failed, shows the error card, retry only dismisses (token kept), no success side effect fires", async () => {
    invokeFn.mockRejectedValue(new Error("edge 500"));
    ui();
    fireEvent.change(confirmInput(), { target: { value: "DELETE" } });
    fireEvent.click(screen.getByTestId("delete-account-confirm-cta"));
    await waitFor(() => expect(screen.getByTestId("delete-account-error")).toBeInTheDocument());
    expect(trackEvent).toHaveBeenCalledWith("account_delete_failed", {
      source: "web",
      reason: "edge 500",
    });
    expect(signOut).not.toHaveBeenCalled();
    expect(wipeLocalState).not.toHaveBeenCalled();
    expect(resetAnalyticsUser).not.toHaveBeenCalled();
    expect(replace).not.toHaveBeenCalled();
    fireEvent.click(screen.getByTestId("delete-account-error-retry"));
    expect(screen.queryByTestId("delete-account-error")).toBeNull();
    expect(confirmInput().value).toBe("DELETE"); // intent gate preserved
    // Retry only dismisses the error card — it must not itself re-fire the call.
    expect(invokeFn).toHaveBeenCalledTimes(1);
  });

  it("cancel navigates back without any side effect", () => {
    ui();
    fireEvent.click(screen.getByTestId("delete-account-cancel"));
    expect(back).toHaveBeenCalled();
    expect(invokeFn).not.toHaveBeenCalled();
    expect(signOut).not.toHaveBeenCalled();
  });
});
