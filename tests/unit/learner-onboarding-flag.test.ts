import { beforeEach, describe, expect, it } from "vitest";

import {
  markOnboardingDoneFor,
  readOnboardingDoneFor,
  resetOnboardingFor,
  useOnboardingFlagStore,
} from "@/learner/core/onboarding/useOnboardingFlag";

// In-memory Storage — same helper shape as learner-exam-context.test.ts.
function installMemoryStorage(): Record<string, string> {
  const data: Record<string, string> = {};
  Object.defineProperty(window, "localStorage", {
    configurable: true,
    value: {
      getItem: (k: string) => (k in data ? data[k] : null),
      setItem: (k: string, v: string) => { data[k] = v; },
      removeItem: (k: string) => { delete data[k]; },
    } as unknown as Storage,
  });
  return data;
}

describe("per-user onboarding flag", () => {
  let data: Record<string, string>;
  beforeEach(() => {
    data = installMemoryStorage();
    useOnboardingFlagStore.setState({ userId: null, done: false, hydrated: false });
  });

  it("is fail-closed: unset, wrong-user, and null userId all read false", () => {
    expect(readOnboardingDoneFor("user-a")).toBe(false);
    markOnboardingDoneFor("user-a");
    expect(readOnboardingDoneFor("user-a")).toBe(true);
    expect(readOnboardingDoneFor("user-b")).toBe(false); // per-user namespacing (F-1)
    expect(readOnboardingDoneFor(null)).toBe(false);
    expect(readOnboardingDoneFor("")).toBe(false);
    expect(data["@deutschfit/onboarding-done/user-a"]).toBe("true"); // exact mobile key string
  });

  it("store hydrateFor / markDone / reset round-trip and rebind across users", () => {
    const s = () => useOnboardingFlagStore.getState();
    s().hydrateFor("user-a");
    expect(s().hydrated).toBe(true);
    expect(s().done).toBe(false);
    s().markDone();
    expect(s().done).toBe(true);
    expect(readOnboardingDoneFor("user-a")).toBe(true);
    s().hydrateFor("user-b"); // new sign-in on same device must not inherit A's flag
    expect(s().done).toBe(false);
    s().hydrateFor(null); // sign-out
    expect(s().done).toBe(false);
    expect(s().userId).toBe(null);
    resetOnboardingFor("user-a");
    expect(readOnboardingDoneFor("user-a")).toBe(false);
  });

  it("markDone is a no-op when no user is bound", () => {
    useOnboardingFlagStore.getState().markDone();
    expect(Object.keys(data)).toHaveLength(0);
  });
});
