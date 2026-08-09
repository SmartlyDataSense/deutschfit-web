import { beforeEach, describe, expect, it, vi } from "vitest";

const acknowledgeOnServer = vi.fn();
vi.mock("@/learner/core/submissions/acknowledgeOnServer", () => ({
  acknowledgeOnServer: (...a: unknown[]) => acknowledgeOnServer(...a),
}));
vi.mock("@/learner/core/auth/useLearnerSession", () => ({
  useLearnerSession: { getState: () => ({ session: { user: { id: "u1" } } }) },
}));

import { SERVER_ACK_QUEUE_KEY } from "@/learner/core/storage/flags";
import {
  __resetReadinessForTest,
  __setUserIdResolverForTest,
  acknowledgeReadiness,
  markCorrectionReady,
  markSubmissionInFlight,
} from "@/learner/core/readiness";
import { installAcknowledgeAdapter } from "@/learner/core/submissions/installAcknowledgeAdapter";

function installMemoryStorage(): Record<string, string> {
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
  return data;
}
const flush = () => new Promise((r) => setTimeout(r, 0));

describe("installAcknowledgeAdapter", () => {
  let data: Record<string, string>;
  let uninstall: () => void;
  beforeEach(() => {
    vi.clearAllMocks();
    data = installMemoryStorage();
    __resetReadinessForTest();
    __setUserIdResolverForTest(() => null);
    uninstall = installAcknowledgeAdapter();
  });

  it("acks fire-and-forget on acknowledgeReadiness; success leaves the queue empty", async () => {
    acknowledgeOnServer.mockResolvedValue(undefined);
    markSubmissionInFlight("s1", "sprechen");
    markCorrectionReady("s1");
    acknowledgeReadiness({ submissionId: "s1", module: "sprechen", acknowledgedAt: 1 });
    await flush();
    expect(acknowledgeOnServer).toHaveBeenCalledWith({ submissionId: "s1", module: "sprechen" });
    expect(data[SERVER_ACK_QUEUE_KEY]).toBeUndefined();
    uninstall();
  });

  it("failed acks enqueue and drain on the online event", async () => {
    acknowledgeOnServer.mockRejectedValueOnce(new Error("offline"));
    markSubmissionInFlight("s2", "schreiben");
    markCorrectionReady("s2");
    acknowledgeReadiness({ submissionId: "s2", module: "schreiben", acknowledgedAt: 2 });
    await flush();
    expect(JSON.parse(data[SERVER_ACK_QUEUE_KEY]!)).toEqual([{ submissionId: "s2", module: "schreiben" }]);

    acknowledgeOnServer.mockResolvedValue(undefined);
    window.dispatchEvent(new Event("online"));
    await flush();
    expect(data[SERVER_ACK_QUEUE_KEY]).toBe("[]");
    uninstall();
  });
});
