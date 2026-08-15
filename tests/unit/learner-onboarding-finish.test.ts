import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const upsert = vi.fn();
const profileMaybeSingle = vi.fn();
const profileUpdateIs = vi.fn();
const from = vi.fn((table: string) => {
  if (table === "user_objectives") return { upsert };
  return {
    select: () => ({ eq: () => ({ maybeSingle: profileMaybeSingle }) }),
    update: () => ({ eq: () => ({ is: profileUpdateIs }) }),
  };
});
vi.mock("@/lib/supabase/browser", () => ({ getBrowserClient: () => ({ from }) }));

const trackEvent = vi.fn();
vi.mock("@/learner/core/analytics/posthog", async (o) => ({
  ...(await o<object>()),
  trackEvent: (...a: unknown[]) => trackEvent(...a),
}));
const markDone = vi.fn();
vi.mock("@/learner/core/onboarding/useOnboardingFlag", async (o) => {
  const actual = await o<typeof import("@/learner/core/onboarding/useOnboardingFlag")>();
  return { ...actual }; // spy installed per-test via setState below
});

import { useLearnerSession } from "@/learner/core/auth/useLearnerSession";
import { useOnboardingFlagStore } from "@/learner/core/onboarding/useOnboardingFlag";
import { useOnboardingAnswers } from "@/learner/onboarding/state/useOnboardingAnswers";
import { persistOnboardingAnswers } from "@/learner/onboarding/services/persistOnboardingAnswers";
import { useFinishOnboarding } from "@/learner/onboarding/useFinishOnboarding";

beforeEach(() => {
  vi.clearAllMocks();
  useLearnerSession.setState({
    session: { user: { id: "user-1" } } as never,
    status: "authenticated",
  });
  useOnboardingAnswers.getState().reset();
  markDone.mockResolvedValue(undefined);
  useOnboardingFlagStore.setState({
    userId: "user-1",
    done: false,
    hydrated: true,
    markDone,
  } as never);
  upsert.mockResolvedValue({ error: null });
  profileMaybeSingle.mockResolvedValue({ data: { onboarded_at: null }, error: null });
  profileUpdateIs.mockResolvedValue({ error: null });
});

describe("persistOnboardingAnswers", () => {
  it("upserts objectives (numeric minutes) then stamps onboarded_at when null", async () => {
    const res = await persistOnboardingAnswers({ motivation: "work", schedule: "20" });
    expect(res).toEqual({ ok: true, stampedOnboardedAt: true });
    expect(upsert).toHaveBeenCalledWith(
      { user_id: "user-1", motivation: "work", daily_minutes: 20 },
      { onConflict: "user_id" }
    );
  });

  it("does not re-stamp when onboarded_at is already set (multi-device replay)", async () => {
    profileMaybeSingle.mockResolvedValue({
      data: { onboarded_at: "2026-01-01T00:00:00Z" },
      error: null,
    });
    const res = await persistOnboardingAnswers({ motivation: null, schedule: null });
    expect(res).toEqual({ ok: true, stampedOnboardedAt: false });
    expect(profileUpdateIs).not.toHaveBeenCalled();
  });

  it("returns ok:false unauthenticated when no session, and ok:false on upsert error", async () => {
    useLearnerSession.setState({ session: null, status: "unauthenticated" });
    expect(await persistOnboardingAnswers({ motivation: null, schedule: null })).toEqual({
      ok: false,
      reason: "unauthenticated",
    });

    useLearnerSession.setState({
      session: { user: { id: "user-1" } } as never,
      status: "authenticated",
    });
    upsert.mockResolvedValue({ error: { message: "boom" } });
    expect(await persistOnboardingAnswers({ motivation: "work", schedule: "5" })).toEqual({
      ok: false,
      reason: "boom",
    });
  });
});

describe("useFinishOnboarding", () => {
  it("persists, marks done, tracks onboarding_finished with took_ms, resets answers", async () => {
    useOnboardingAnswers.getState().setMotivation("studies");
    useOnboardingAnswers.getState().setSchedule("30");
    const { result } = renderHook(() => useFinishOnboarding());
    await act(async () => {
      await result.current.finish();
    });

    expect(upsert).toHaveBeenCalled();
    expect(markDone).toHaveBeenCalled();
    expect(trackEvent).toHaveBeenCalledWith(
      "onboarding_finished",
      expect.objectContaining({ took_ms: expect.any(Number) })
    );
    expect(useOnboardingAnswers.getState().motivation).toBeNull();
  });

  it("persist failure warns but still marks done (server gate re-prompts later)", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    upsert.mockResolvedValue({ error: { message: "network down" } });
    const { result } = renderHook(() => useFinishOnboarding());
    await act(async () => {
      await result.current.finish();
    });
    expect(warn).toHaveBeenCalledWith("[onboarding] persist failed:", "network down");
    expect(markDone).toHaveBeenCalled();
  });

  it("concurrent finish calls are deduped by the busy guard", async () => {
    // Make persist slow so the second call lands while busy.
    let release!: () => void;
    upsert.mockReturnValue(
      new Promise((r) => {
        release = () => r({ error: null });
      })
    );
    const { result } = renderHook(() => useFinishOnboarding());
    let p1: Promise<void>;
    act(() => {
      p1 = result.current.finish();
    });
    await act(async () => {
      await result.current.finish();
    }); // no-op: busy
    release();
    await act(async () => {
      await p1;
    });
    expect(upsert).toHaveBeenCalledTimes(1);
    expect(markDone).toHaveBeenCalledTimes(1);
  });
});
