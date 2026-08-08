/**
 * Unit coverage for `LoginForm`'s extracted pure logic: mode selection
 * (`getAuthMode`), field validation (`isValidEmail`, `sanitizeOtpInput`),
 * submit-gating (`canSubmitPassword` / `canRequestOtp` / `canVerifyOtp`),
 * and error-key mapping (`isNetworkError` / `mapAuthErrorKey`).
 *
 * `getAuthMode()` reads `process.env.NEXT_PUBLIC_AUTH_MODE` at call time
 * (not statically inlined under vitest, unlike a real Next.js build), so
 * each mode test sets/restores the var directly.
 */
import { afterEach, describe, expect, it } from "vitest";
import {
  canRequestOtp,
  canSubmitPassword,
  canVerifyOtp,
  getAuthMode,
  isNetworkError,
  isValidEmail,
  mapAuthErrorKey,
  sanitizeOtpInput,
} from "../../src/learner/core/auth/loginForm.logic";

describe("getAuthMode", () => {
  const original = process.env.NEXT_PUBLIC_AUTH_MODE;

  afterEach(() => {
    if (original === undefined) {
      delete process.env.NEXT_PUBLIC_AUTH_MODE;
    } else {
      process.env.NEXT_PUBLIC_AUTH_MODE = original;
    }
  });

  it('resolves to "password" when the env var is unset', () => {
    delete process.env.NEXT_PUBLIC_AUTH_MODE;
    expect(getAuthMode()).toBe("password");
  });

  it('resolves to "password" for any value other than the literal "otp"', () => {
    process.env.NEXT_PUBLIC_AUTH_MODE = "bogus";
    expect(getAuthMode()).toBe("password");
  });

  it('resolves to "otp" when the env var is exactly "otp"', () => {
    process.env.NEXT_PUBLIC_AUTH_MODE = "otp";
    expect(getAuthMode()).toBe("otp");
  });
});

describe("isValidEmail", () => {
  it("rejects an empty string", () => {
    expect(isValidEmail("")).toBe(false);
  });

  it("rejects whitespace-only input", () => {
    expect(isValidEmail("   ")).toBe(false);
  });

  it("rejects a string with no @", () => {
    expect(isValidEmail("not-an-email")).toBe(false);
  });

  it("accepts a plausible email", () => {
    expect(isValidEmail("qa1@df.dev")).toBe(true);
  });

  it("accepts an email with surrounding whitespace", () => {
    expect(isValidEmail("  qa1@df.dev  ")).toBe(true);
  });
});

describe("sanitizeOtpInput", () => {
  it("strips non-digit characters", () => {
    expect(sanitizeOtpInput("12a3-45")).toBe("12345");
  });

  it("caps the result at 6 digits", () => {
    expect(sanitizeOtpInput("1234567890")).toBe("123456");
  });

  it("returns an empty string for non-digit-only input", () => {
    expect(sanitizeOtpInput("abcdef")).toBe("");
  });
});

describe("canSubmitPassword", () => {
  it("is true with a valid email, non-empty password, and not loading", () => {
    expect(canSubmitPassword("qa1@df.dev", "test1234567890", false)).toBe(true);
  });

  it("is false with an invalid email", () => {
    expect(canSubmitPassword("not-an-email", "test1234567890", false)).toBe(false);
  });

  it("is false with an empty password", () => {
    expect(canSubmitPassword("qa1@df.dev", "", false)).toBe(false);
  });

  it("is false while loading", () => {
    expect(canSubmitPassword("qa1@df.dev", "test1234567890", true)).toBe(false);
  });
});

describe("canRequestOtp", () => {
  it("is true with a valid email and not loading", () => {
    expect(canRequestOtp("qa1@df.dev", false)).toBe(true);
  });

  it("is false with an invalid email", () => {
    expect(canRequestOtp("not-an-email", false)).toBe(false);
  });

  it("is false while loading", () => {
    expect(canRequestOtp("qa1@df.dev", true)).toBe(false);
  });
});

describe("canVerifyOtp", () => {
  it("is true with a valid email, 6-digit code, and not loading", () => {
    expect(canVerifyOtp("qa1@df.dev", "123456", false)).toBe(true);
  });

  it("is false with fewer than 6 digits", () => {
    expect(canVerifyOtp("qa1@df.dev", "12345", false)).toBe(false);
  });

  it("is false with an invalid email", () => {
    expect(canVerifyOtp("not-an-email", "123456", false)).toBe(false);
  });

  it("is false while loading", () => {
    expect(canVerifyOtp("qa1@df.dev", "123456", true)).toBe(false);
  });
});

describe("isNetworkError", () => {
  it("is true for a TypeError (fetch failed before reaching the server)", () => {
    expect(isNetworkError(new TypeError("Failed to fetch"))).toBe(true);
  });

  it('is true for an error named "AuthRetryableFetchError"', () => {
    expect(isNetworkError({ name: "AuthRetryableFetchError", message: "fetch failed" })).toBe(
      true
    );
  });

  it("is false for a plain auth rejection (e.g. AuthApiError-shaped)", () => {
    expect(
      isNetworkError({ name: "AuthApiError", status: 400, message: "Invalid login credentials" })
    ).toBe(false);
  });

  it("is false for null", () => {
    expect(isNetworkError(null)).toBe(false);
  });

  it("is false for a non-object value", () => {
    expect(isNetworkError("some string")).toBe(false);
  });
});

describe("mapAuthErrorKey", () => {
  it("maps a password rejection to the invalid-credentials key", () => {
    expect(
      mapAuthErrorKey({ name: "AuthApiError", status: 400, message: "Invalid login credentials" }, "password")
    ).toBe("login.error.invalidCredentials");
  });

  it("maps an otpVerify rejection to the invalid-otp key", () => {
    expect(
      mapAuthErrorKey({ name: "AuthApiError", status: 403, message: "Token has expired or is invalid" }, "otpVerify")
    ).toBe("login.error.invalidOtp");
  });

  it("maps an otpRequest rejection to the network key (no dedicated copy)", () => {
    expect(
      mapAuthErrorKey({ name: "AuthApiError", status: 500, message: "unexpected" }, "otpRequest")
    ).toBe("login.error.network");
  });

  it("maps a network failure to the network key regardless of kind (password)", () => {
    expect(mapAuthErrorKey(new TypeError("Failed to fetch"), "password")).toBe(
      "login.error.network"
    );
  });

  it("maps a network failure to the network key regardless of kind (otpVerify)", () => {
    expect(
      mapAuthErrorKey({ name: "AuthRetryableFetchError", message: "fetch failed" }, "otpVerify")
    ).toBe("login.error.network");
  });

  it("never leaks the raw Supabase error message into the mapped key", () => {
    const key = mapAuthErrorKey(
      { name: "AuthApiError", status: 400, message: "Invalid login credentials" },
      "password"
    );
    expect(key).not.toContain("Invalid login credentials");
  });
});
