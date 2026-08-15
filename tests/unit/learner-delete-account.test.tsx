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
import { act, StrictMode } from "react";
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
import { FOCUS_RING_CLASSES } from "@/learner/ui/primitives/AppButton";
import { DeleteAccountScreen } from "@/learner/account-deletion/screens/DeleteAccountScreen";

afterEach(cleanup);
beforeAll(() => initLearnerI18n("fr"));
beforeEach(() => {
  // `vi.clearAllMocks()` alone only clears call history — it does NOT
  // reset a mock's IMPLEMENTATION, so a non-`Once` override set by one
  // test (e.g. `invokeFn.mockRejectedValue(...)` in the failure test)
  // silently becomes the fallback for every later test unless that test
  // explicitly re-sets it. Every test in this file happens to do that
  // today, but it's a footgun under reordering — `mockReset()` each mock
  // and re-seed the sane defaults here so no test can inherit another
  // test's implementation by accident.
  invokeFn.mockReset();
  wipeLocalState.mockReset().mockResolvedValue(undefined);
  trackEvent.mockReset();
  resetAnalyticsUser.mockReset();
  signOut.mockReset().mockResolvedValue(undefined);
  replace.mockReset();
  back.mockReset();
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

  // S13 Task 5 · Step 4 (S11-T8): this is the app's danger zone — its
  // three raw `<button>`s (the destructive confirm CTA, the cancel
  // escape hatch, and the error-retry) must each carry the shared
  // focus-visible ring convention, same as every `AppButton`-backed
  // control. Swapping to `AppButton` here would impose its own
  // `inline-flex min-h-11 px-6` layout and change these rows — the ring
  // is applied to the raw buttons directly instead. There is no
  // danger-tone ring in the token system, so all three (including the
  // literally-destructive confirm CTA) take the same CTA-coloured ring
  // by convention.
  it("the three danger-zone buttons (confirm, cancel, retry) all carry the shared focus ring classes", async () => {
    invokeFn.mockRejectedValue(new Error("edge 500"));
    ui();
    for (const cls of FOCUS_RING_CLASSES.split(" ")) {
      expect(screen.getByTestId("delete-account-confirm-cta")).toHaveClass(cls);
      expect(screen.getByTestId("delete-account-cancel")).toHaveClass(cls);
    }
    fireEvent.change(confirmInput(), { target: { value: "DELETE" } });
    fireEvent.click(screen.getByTestId("delete-account-confirm-cta"));
    await waitFor(() =>
      expect(screen.getByTestId("delete-account-error-retry")).toBeInTheDocument()
    );
    for (const cls of FOCUS_RING_CLASSES.split(" ")) {
      expect(screen.getByTestId("delete-account-error-retry")).toHaveClass(cls);
    }
  });

  it("cancel navigates back without any side effect", () => {
    ui();
    fireEvent.click(screen.getByTestId("delete-account-cancel"));
    expect(back).toHaveBeenCalled();
    expect(invokeFn).not.toHaveBeenCalled();
    expect(signOut).not.toHaveBeenCalled();
  });

  // Review I1: the cancel/close test above never types the token, so it
  // cannot catch `cancel`/`close` being mis-wired to `handleConfirm` —
  // `tokenMatches` would still be false and mask it. The unmasked case —
  // token typed, user clicks "Annuler"/close anyway — is the actual
  // worst-case regression for this screen.
  it("cancel with the token already typed still only navigates back — never deletes", () => {
    ui();
    fireEvent.change(confirmInput(), { target: { value: "DELETE" } });
    fireEvent.click(screen.getByTestId("delete-account-cancel"));
    expect(back).toHaveBeenCalledTimes(1);
    expect(invokeFn).not.toHaveBeenCalled();
    expect(trackEvent).not.toHaveBeenCalledWith("account_delete_confirmed", { source: "web" });
  });

  it("close with the token already typed still only navigates back — never deletes", () => {
    ui();
    fireEvent.change(confirmInput(), { target: { value: "DELETE" } });
    fireEvent.click(screen.getByTestId("delete-account-close"));
    expect(back).toHaveBeenCalledTimes(1);
    expect(invokeFn).not.toHaveBeenCalled();
    expect(trackEvent).not.toHaveBeenCalledWith("account_delete_confirmed", { source: "web" });
  });

  // Review I2: a failed attempt must leave the destructive path usable
  // again — both the `deleting` state (DOM disabled) and the
  // `inFlightRef` re-entrancy guard have to reset on failure, or retry
  // silently becomes a dead button that dismisses the card but never
  // fires `handleConfirm` (or fires it but the synchronous guard is
  // still latched from the first attempt) again.
  it("after a failed attempt, dismissing the error and confirming again actually retries and can still succeed", async () => {
    invokeFn.mockRejectedValueOnce(new Error("edge 500")).mockResolvedValueOnce({ ok: true });
    ui();
    fireEvent.change(confirmInput(), { target: { value: "DELETE" } });
    const cta = screen.getByTestId("delete-account-confirm-cta");
    fireEvent.click(cta);
    await waitFor(() => expect(screen.getByTestId("delete-account-error")).toBeInTheDocument());
    expect(cta).not.toBeDisabled(); // deleting reset to false on failure

    fireEvent.click(screen.getByTestId("delete-account-error-retry"));
    expect(cta).not.toBeDisabled();
    fireEvent.click(cta); // inFlightRef must have been released on failure too

    await waitFor(() => expect(invokeFn).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(signOut).toHaveBeenCalled());
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/fr/app/login"));
  });

  // Review I3: leg 1 (server delete) succeeding must be the only thing
  // that decides success/failure UI. A cleanup-step rejection (wipe,
  // reset, sign-out) happening AFTER a successful server delete must
  // never surface as "Suppression impossible" — the account is already
  // gone, so that would wrongly invite a retry against a deleted
  // account. It should instead still sign out, still redirect, and log
  // a distinct `account_delete_cleanup_failed`.
  it("a wipeLocalState failure AFTER a successful server delete still signs out and redirects — no failure card", async () => {
    invokeFn.mockResolvedValue({ ok: true });
    wipeLocalState.mockRejectedValueOnce(new Error("indexeddb blocked"));
    ui();
    fireEvent.change(confirmInput(), { target: { value: "DELETE" } });
    fireEvent.click(screen.getByTestId("delete-account-confirm-cta"));

    await waitFor(() =>
      expect(trackEvent).toHaveBeenCalledWith("account_delete_cleanup_failed", {
        source: "web",
        reason: "indexeddb blocked",
      })
    );
    // Review round-2 finding #1: wipeLocalState and resetAnalyticsUser each
    // get their OWN try/catch now — a wipeLocalState rejection must not
    // skip resetAnalyticsUser (that would leave PostHog identified to the
    // deleted user's distinct_id for whoever signs in next on this browser).
    expect(resetAnalyticsUser).toHaveBeenCalled();
    await waitFor(() => expect(signOut).toHaveBeenCalled());
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/fr/app/login"));

    expect(screen.queryByTestId("delete-account-error")).toBeNull();
    expect(trackEvent).not.toHaveBeenCalledWith(
      "account_delete_failed",
      expect.objectContaining({ source: "web" })
    );
  });

  // Review round-2 finding #1 (other direction): a resetAnalyticsUser
  // failure must not prevent wipeLocalState from having already run, and
  // must still fall through to sign-out + redirect. Pins the second
  // independent try/catch symmetrically to the test above.
  it("a resetAnalyticsUser failure AFTER a successful server delete still wiped local state, signs out, and redirects — no failure card", async () => {
    invokeFn.mockResolvedValue({ ok: true });
    resetAnalyticsUser.mockImplementationOnce(() => {
      throw new Error("posthog not initialized");
    });
    ui();
    fireEvent.change(confirmInput(), { target: { value: "DELETE" } });
    fireEvent.click(screen.getByTestId("delete-account-confirm-cta"));

    await waitFor(() =>
      expect(trackEvent).toHaveBeenCalledWith("account_delete_cleanup_failed", {
        source: "web",
        reason: "posthog not initialized",
      })
    );
    expect(wipeLocalState).toHaveBeenCalledWith("u1");
    await waitFor(() => expect(signOut).toHaveBeenCalled());
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/fr/app/login"));

    expect(screen.queryByTestId("delete-account-error")).toBeNull();
    expect(trackEvent).not.toHaveBeenCalledWith(
      "account_delete_failed",
      expect.objectContaining({ source: "web" })
    );
  });

  it("a signOut rejection AFTER a successful server delete still redirects — no failure card", async () => {
    invokeFn.mockResolvedValue({ ok: true });
    signOut.mockRejectedValueOnce(new Error("network drop"));
    ui();
    fireEvent.change(confirmInput(), { target: { value: "DELETE" } });
    fireEvent.click(screen.getByTestId("delete-account-confirm-cta"));

    await waitFor(() => expect(replace).toHaveBeenCalledWith("/fr/app/login"));
    expect(screen.queryByTestId("delete-account-error")).toBeNull();
    expect(trackEvent).not.toHaveBeenCalledWith(
      "account_delete_failed",
      expect.objectContaining({ source: "web" })
    );
  });

  // Review I4: no test previously rendered under StrictMode, so removing
  // the `requestedRef` one-shot guard survived — `toHaveBeenCalledTimes(1)`
  // in the plain-render test only pins single-render behaviour.
  it("fires account_delete_requested exactly once even under StrictMode's mount double-invoke", () => {
    render(
      <StrictMode>
        <LearnerI18nProvider lng="fr">
          <DeleteAccountScreen />
        </LearnerI18nProvider>
      </StrictMode>
    );
    const requestedCalls = trackEvent.mock.calls.filter(
      ([name]) => name === "account_delete_requested"
    );
    expect(requestedCalls).toHaveLength(1);
  });

  // Review M1: the confirm input must be locked while a delete is
  // in-flight, same as the CTA/cancel/close — otherwise the "intent gate
  // preserved" guarantee is only true for the CTA, not the input itself.
  it("the confirm input is disabled while a delete is in-flight", async () => {
    let resolveInvoke!: (v: unknown) => void;
    invokeFn.mockReturnValue(
      new Promise((resolve) => {
        resolveInvoke = resolve;
      })
    );
    ui();
    fireEvent.change(confirmInput(), { target: { value: "DELETE" } });
    fireEvent.click(screen.getByTestId("delete-account-confirm-cta"));
    await waitFor(() => expect(confirmInput()).toBeDisabled());
    resolveInvoke({ ok: true });
    await waitFor(() => expect(signOut).toHaveBeenCalled());
  });

  // Review round-2 finding #4: close/cancel must be genuinely inert while a
  // delete is in-flight, not just visually dimmed — a click landing on
  // either mid-flight must not navigate back out from under the pending
  // request (which would strand the user on the previous screen while a
  // delete they can no longer see is still resolving).
  it("cancel is inert while a delete is in-flight — clicking it mid-flight does not navigate back", async () => {
    let resolveInvoke!: (v: unknown) => void;
    invokeFn.mockReturnValue(
      new Promise((resolve) => {
        resolveInvoke = resolve;
      })
    );
    ui();
    fireEvent.change(confirmInput(), { target: { value: "DELETE" } });
    fireEvent.click(screen.getByTestId("delete-account-confirm-cta"));
    await waitFor(() => expect(screen.getByTestId("delete-account-cancel")).toBeDisabled());
    fireEvent.click(screen.getByTestId("delete-account-cancel"));
    expect(back).not.toHaveBeenCalled();
    resolveInvoke({ ok: true });
    await waitFor(() => expect(signOut).toHaveBeenCalled());
  });

  it("close is inert while a delete is in-flight — clicking it mid-flight does not navigate back", async () => {
    let resolveInvoke!: (v: unknown) => void;
    invokeFn.mockReturnValue(
      new Promise((resolve) => {
        resolveInvoke = resolve;
      })
    );
    ui();
    fireEvent.change(confirmInput(), { target: { value: "DELETE" } });
    fireEvent.click(screen.getByTestId("delete-account-confirm-cta"));
    await waitFor(() => expect(screen.getByTestId("delete-account-close")).toBeDisabled());
    fireEvent.click(screen.getByTestId("delete-account-close"));
    expect(back).not.toHaveBeenCalled();
    resolveInvoke({ ok: true });
    await waitFor(() => expect(signOut).toHaveBeenCalled());
  });

  // Review round-2 finding #5: `invocationCallOrder`-based ordering tests
  // only prove signOut was CALLED before replace, not that its promise was
  // AWAITED before replace fires — `void signOut().catch(...)` (no await)
  // would call signOut first and then synchronously call replace() without
  // waiting, and invocationCallOrder alone cannot tell the two apart. This
  // pins the actual settlement-timing dependency: replace must not fire
  // until the signOut promise has resolved.
  it("redirect waits for signOut to actually settle — replace does not fire while signOut is still pending", async () => {
    invokeFn.mockResolvedValue({ ok: true });
    let resolveSignOut!: () => void;
    signOut.mockReturnValue(
      new Promise<void>((resolve) => {
        resolveSignOut = resolve;
      })
    );
    ui();
    fireEvent.change(confirmInput(), { target: { value: "DELETE" } });
    fireEvent.click(screen.getByTestId("delete-account-confirm-cta"));

    await waitFor(() => expect(signOut).toHaveBeenCalled());
    // Give any pending microtasks a chance to flush — if `signOut()` were
    // fired without `await`, `replace` would already have been called here.
    await Promise.resolve();
    await Promise.resolve();
    expect(replace).not.toHaveBeenCalled();

    resolveSignOut();
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/fr/app/login"));
  });
});
