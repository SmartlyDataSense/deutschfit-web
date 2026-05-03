import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Mock `server-only` so importing the route handler doesn't blow up under vitest.
vi.mock("server-only", () => ({}));

// `verifyOtp` is the only Supabase entry point the route touches; we expose
// a hoisted reference so each test can reshape its return value.
const verifyOtpMock = vi.fn();

vi.mock("@supabase/supabase-js", () => ({
  createClient: () => ({
    auth: { verifyOtp: verifyOtpMock },
  }),
}));

import { GET } from "@/app/auth/confirm/route";

const APP_SCHEME = "deutschfit://auth/callback";

function makeRequest(url: string, ua: string) {
  return new Request(url, {
    method: "GET",
    headers: { "user-agent": ua },
  }) as unknown as import("next/server").NextRequest;
}

describe("GET /auth/confirm", () => {
  beforeEach(() => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-test-key";
    verifyOtpMock.mockReset();
  });

  afterEach(() => {
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  });

  it("redirects to /auth/error?reason=missing_params when token_hash is missing", async () => {
    const req = makeRequest("https://web.example/auth/confirm?type=email", "Mozilla/5.0");
    const res = await GET(req);
    expect(res.status).toBe(307); // NextResponse.redirect default
    const loc = res.headers.get("location") ?? "";
    expect(loc).toContain("/auth/error");
    expect(loc).toContain("reason=missing_params");
    expect(verifyOtpMock).not.toHaveBeenCalled();
  });

  it("redirects to /auth/error when type is missing", async () => {
    const req = makeRequest("https://web.example/auth/confirm?token_hash=abc", "Mozilla/5.0");
    const res = await GET(req);
    const loc = res.headers.get("location") ?? "";
    expect(loc).toContain("/auth/error");
    expect(loc).toContain("reason=missing_params");
  });

  it("redirects to /auth/error when type is unknown", async () => {
    const req = makeRequest(
      "https://web.example/auth/confirm?token_hash=abc&type=garbage",
      "Mozilla/5.0"
    );
    const res = await GET(req);
    const loc = res.headers.get("location") ?? "";
    expect(loc).toContain("/auth/error");
    expect(loc).toContain("reason=missing_params");
  });

  it("forwards verifyOtp errors to /auth/error with the error message", async () => {
    verifyOtpMock.mockResolvedValueOnce({ error: { message: "token expired" } });
    const req = makeRequest(
      "https://web.example/auth/confirm?token_hash=abc&type=email",
      "Mozilla/5.0"
    );
    const res = await GET(req);
    const loc = res.headers.get("location") ?? "";
    expect(loc).toContain("/auth/error");
    expect(loc).toContain("reason=token%20expired");
  });

  it("redirects to deutschfit:// with session tokens on iPhone UA after successful verify", async () => {
    verifyOtpMock.mockResolvedValueOnce({
      data: { session: { access_token: "at_test", refresh_token: "rt_test" } },
      error: null,
    });
    const iosUa =
      "Mozilla/5.0 (iPhone; CPU iPhone OS 17_2 like Mac OS X) AppleWebKit/605.1.15";
    const req = makeRequest(
      "https://web.example/auth/confirm?token_hash=abc&type=email",
      iosUa
    );
    const res = await GET(req);
    expect(res.status).toBe(302);
    const loc = res.headers.get("location") ?? "";
    expect(loc).toContain(`${APP_SCHEME}`);
    expect(loc).toContain("type=email");
    expect(loc).toContain("access_token=at_test");
    expect(loc).toContain("refresh_token=rt_test");
  });

  it("redirects recovery to deutschfit://reset?token_hash on Android UA without verifying server-side", async () => {
    const androidUa = "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36";
    const req = makeRequest(
      "https://web.example/auth/confirm?token_hash=abc&type=recovery",
      androidUa
    );
    const res = await GET(req);
    expect(res.status).toBe(302);
    const loc = res.headers.get("location") ?? "";
    expect(loc).toBe("deutschfit://reset?token_hash=abc");
    expect(verifyOtpMock).not.toHaveBeenCalled();
  });

  it("redirects to /auth/confirmed for desktop UA after successful verify", async () => {
    verifyOtpMock.mockResolvedValueOnce({ error: null });
    const desktopUa =
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121";
    const req = makeRequest(
      "https://web.example/auth/confirm?token_hash=abc&type=email",
      desktopUa
    );
    const res = await GET(req);
    const loc = res.headers.get("location") ?? "";
    expect(loc).toContain("/auth/confirmed");
    expect(loc).toContain("type=email");
    // Must not redirect into the deep-link scheme on desktop — that breaks
    // browsers without a registered app handler.
    expect(loc).not.toContain("deutschfit://");
  });

  it("redirects to /auth/error?reason=server_misconfigured when env vars are missing", async () => {
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    const req = makeRequest(
      "https://web.example/auth/confirm?token_hash=abc&type=email",
      "Mozilla/5.0"
    );
    const res = await GET(req);
    const loc = res.headers.get("location") ?? "";
    expect(loc).toContain("/auth/error");
    expect(loc).toContain("reason=server_misconfigured");
    expect(verifyOtpMock).not.toHaveBeenCalled();
  });
});
