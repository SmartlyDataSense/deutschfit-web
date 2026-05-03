import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("server-only", () => ({}));

const sendMock = vi.fn().mockResolvedValue({ data: { id: "msg_test" }, error: null });

vi.mock("resend", () => ({
  // Use a real class so `new Resend(apiKey)` constructs correctly. A bare
  // `vi.fn().mockImplementation(...)` isn't a constructor under vitest 4.
  Resend: class {
    emails = { send: sendMock };
  },
}));

import {
  sendActivationEmail,
  EmailNotConfiguredError,
  __test,
} from "@/lib/email/send-activation-email";

const baseParams = {
  to: "user@example.com",
  planName: "Standard",
  validFrom: new Date("2026-04-25T00:00:00Z"),
  validUntil: new Date("2026-05-25T00:00:00Z"),
} as const;

describe("buildCopy", () => {
  it("renders English subject + body containing plan + validity", () => {
    const copy = __test.buildCopy({ ...baseParams, locale: "en" });
    expect(copy.subject).toContain("Standard");
    expect(copy.body).toContain("Standard");
    expect(copy.validity).toContain("2026-04-25");
    expect(copy.validity).toContain("2026-05-25");
  });

  it("renders German subject + body", () => {
    const copy = __test.buildCopy({ ...baseParams, locale: "de" });
    expect(copy.subject).toContain("Standard");
    expect(copy.subject).toMatch(/aktiv/i);
  });

  it("renders French subject + body", () => {
    const copy = __test.buildCopy({ ...baseParams, locale: "fr" });
    expect(copy.subject).toContain("Standard");
    expect(copy.subject).toMatch(/actif/i);
  });
});

describe("renderHtml / renderText", () => {
  it("HTML body includes the validity line and a support link", () => {
    const copy = __test.buildCopy({ ...baseParams, locale: "en" });
    const html = __test.renderHtml(copy);
    expect(html).toContain("2026-05-25");
    expect(html).toContain("support@deutschfit.app");
  });

  it("text body strips HTML tags", () => {
    const copy = __test.buildCopy({ ...baseParams, locale: "en" });
    const text = __test.renderText(copy);
    expect(text).not.toMatch(/<[^>]+>/);
    expect(text).toContain("2026-05-25");
  });
});

describe("sendActivationEmail", () => {
  beforeEach(() => {
    sendMock.mockClear();
  });

  afterEach(() => {
    delete process.env.RESEND_API_KEY;
  });

  it("throws EmailNotConfiguredError when RESEND_API_KEY is unset", async () => {
    delete process.env.RESEND_API_KEY;
    await expect(sendActivationEmail({ ...baseParams, locale: "en" })).rejects.toBeInstanceOf(
      EmailNotConfiguredError
    );
  });

  it("calls resend.emails.send with from/to/subject/html/text when configured", async () => {
    process.env.RESEND_API_KEY = "re_test_key";
    await sendActivationEmail({ ...baseParams, locale: "en" });
    expect(sendMock).toHaveBeenCalledTimes(1);
    const arg = sendMock.mock.calls[0]?.[0];
    expect(arg).toBeDefined();
    expect(arg.from).toMatch(/support@deutschfit\.app/);
    expect(arg.to).toBe("user@example.com");
    expect(arg.subject).toContain("Standard");
    expect(arg.html).toContain("Standard");
    expect(arg.text).toContain("Standard");
  });
});
