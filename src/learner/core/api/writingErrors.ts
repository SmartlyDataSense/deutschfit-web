/**
 * Discriminated error model for the Schreiben submit path (S6 · Task 6.2).
 *
 * Port of `deutschfit-mobile/src/features/writing/submitErrors.ts`. The
 * model (`SubmitError`, the 400-code table, the mapping rules) is ported
 * verbatim; only the transport-reading half is adapted — mobile duck-types
 * a supabase-js `FunctionsHttpError` off `error.context`, web reads the
 * fields `@/learner/core/api/client`'s `ApiError` already parsed off the
 * `fetch` response (`status`, `bodyJson`).
 *
 * Web delta (P4): `ApiError` carries no response headers, so the
 * `Retry-After` value mobile reads off `context.headers` is never
 * available here — `retry_after_seconds` on `rate_limit_exceeded` is
 * always `undefined` on web. The screen's copy for that kind already
 * treats the bound as optional (mobile falls back to generic "try again
 * later" copy when the header is absent), so this is a silent, safe
 * narrowing rather than a behavior change.
 *
 * Background (e2e-schreiben-arc-2026-05-12 · Scenario 4, Findings #10 + #11):
 * the compose screen used to flatten every non-2xx response from
 * `submissions-create` to a single generic banner. The backend speaks a
 * discriminated 400 vocabulary (`body_language_not_german`, `too_short`,
 * `too_long`, `rate_limited`, idempotency replay, …) so the UI needs the
 * signal to route Marie correctly. The classic offender is the
 * English-text guard: HTTP 400 + `error: "body_language_not_german"`,
 * which is NOT a network failure, retry will fail forever, and the real
 * fix is "write the draft in German".
 *
 * Brand-voice locks (founding-document §12 + brand-voice.md):
 *   - `tu` address, never `vous`.
 *   - No "Coach", no "Marie" salutation.
 *   - Calm, no exclamation marks, no urgency cues.
 *
 * Every new `kind` MUST come with an i18n string under
 * `writing:composer.errors.<kind>` in both `fr/writing.json` + `en/writing.json`.
 */
import { ApiError } from "./client";

/**
 * Closed set of conditions the compose screen knows how to render.
 *
 * Mapping rules (see `mapSubmissionError`):
 *   - `network`                   — no `ApiError` landed (a thrown
 *                                   non-`ApiError`, or the explicit
 *                                   `wasNetworkFailure` flag).
 *   - `body_language_not_german`  — 400 with `error: "body_language_not_german"`.
 *   - `too_short` / `too_long`    — 400 with the matching `error` code +
 *                                   server-provided bound. The screen already
 *                                   rejects out-of-range drafts pre-flight,
 *                                   so these are belt-and-braces server gates.
 *   - `rate_limit_exceeded`       — 429. `retry_after_seconds` is always
 *                                   `undefined` on web (see file doc — no
 *                                   response headers on `ApiError`).
 *   - `idempotency_replay`        — 409 (idempotency-key collision).
 *   - `validation_failed`         — any other 400 (unknown `error` code).
 *                                   Keeps the screen sane when the backend
 *                                   adds a new gate before this ships the
 *                                   corresponding `kind` case.
 *   - `server`                    — 5xx.
 *   - `unknown`                   — anything else; carries the raw status
 *                                   + body excerpt for telemetry.
 */
export type SubmitError =
  | { kind: "network" }
  | { kind: "body_language_not_german" }
  | { kind: "too_short"; min?: number }
  | { kind: "too_long"; max?: number }
  | { kind: "rate_limit_exceeded"; retry_after_seconds?: number }
  | { kind: "idempotency_replay" }
  | { kind: "validation_failed"; field?: string }
  | { kind: "server"; status: number }
  | { kind: "unknown"; status: number; raw?: string };

export type SubmitErrorKind = SubmitError["kind"];

/**
 * Stable error codes the backend returns on HTTP 400. Kept here so the
 * mapping function has a single source of truth and the test suite can
 * pattern-match on the same constants.
 */
const BACKEND_400_CODE_TO_KIND: Record<
  string,
  Extract<SubmitErrorKind, "body_language_not_german" | "too_short" | "too_long">
> = {
  body_language_not_german: "body_language_not_german",
  too_short: "too_short",
  too_long: "too_long",
};

/**
 * Stringify a small slice of the response body for `unknown`-kind telemetry.
 * We never log full bodies (backend §5 forbids submission text in logs).
 */
function bodyExcerpt(body: unknown): string | undefined {
  if (!body) return undefined;
  try {
    const s = typeof body === "string" ? body : JSON.stringify(body);
    return s.length > 200 ? `${s.slice(0, 200)}…` : s;
  } catch {
    return undefined;
  }
}

/**
 * Map a thrown submission error to a typed `SubmitError`. The screen
 * consumes the returned value directly — it never reads `ApiError.bodyJson`
 * itself.
 *
 * `wasNetworkFailure` lets the caller flag the case where `fetch` threw
 * before any HTTP response landed (no `ApiError` was constructed) — mirrors
 * mobile's signal for its hand-rolled `fetch` wrapper.
 */
export async function mapSubmissionError(
  error: unknown,
  opts: { wasNetworkFailure?: boolean } = {}
): Promise<SubmitError> {
  if (opts.wasNetworkFailure) return { kind: "network" };

  if (!(error instanceof ApiError) || !error.status) {
    // No HTTP response landed — a thrown non-`ApiError` (transport failure,
    // e.g. `fetch` rejecting with a `TypeError`) or a status of `0`.
    return { kind: "network" };
  }

  const { status, bodyJson } = error;

  if (status >= 500) {
    return { kind: "server", status };
  }

  const code =
    bodyJson !== null && typeof bodyJson === "object" && "error" in bodyJson
      ? ((bodyJson as { error?: unknown }).error as string | undefined)
      : undefined;

  if (status === 429) {
    return { kind: "rate_limit_exceeded", retry_after_seconds: undefined };
  }

  if (status === 409) {
    return { kind: "idempotency_replay" };
  }

  if (status === 400) {
    const mapped = typeof code === "string" ? BACKEND_400_CODE_TO_KIND[code] : undefined;
    if (mapped) {
      if (mapped === "too_short") {
        const minRaw = (bodyJson as { min?: unknown } | undefined)?.min;
        return { kind: "too_short", min: typeof minRaw === "number" ? minRaw : undefined };
      }
      if (mapped === "too_long") {
        const maxRaw = (bodyJson as { max?: unknown } | undefined)?.max;
        return { kind: "too_long", max: typeof maxRaw === "number" ? maxRaw : undefined };
      }
      return { kind: mapped };
    }
    // Unknown 400 → keep the screen calm with a generic validation copy
    // but let telemetry see the actual code so we can wire a richer kind
    // before the next release.
    return { kind: "validation_failed", field: code };
  }

  return {
    kind: "unknown",
    status,
    raw: bodyExcerpt(bodyJson),
  };
}

/**
 * Telemetry breadcrumb. We deliberately do NOT introduce a new
 * Sentry / PostHog dep — ad-hoc breadcrumbs are best-effort.
 *
 * Backend §5 lock: never log submission text or audio. The submit-error
 * surface intentionally carries no body content (only status + error code
 * + bound integers), so this is safe to emit unguarded.
 */
export function logSubmitError(err: SubmitError): void {
  if (typeof console !== "undefined" && typeof console.warn === "function") {
    const summary: Record<string, unknown> = { kind: err.kind };
    if (err.kind === "rate_limit_exceeded" && err.retry_after_seconds) {
      summary.retry_after_seconds = err.retry_after_seconds;
    }
    if (err.kind === "server" || err.kind === "unknown") {
      summary.status = err.status;
    }
    if (err.kind === "unknown" && err.raw) {
      summary.raw = err.raw;
    }
    if (err.kind === "validation_failed" && err.field) {
      summary.field = err.field;
    }
    if (err.kind === "too_short" && err.min !== undefined) {
      summary.min = err.min;
    }
    if (err.kind === "too_long" && err.max !== undefined) {
      summary.max = err.max;
    }
    // Prefix `[writing-submit]` so a grep on dev console picks these up
    // without colliding with other features. No PII, only error metadata.
    console.warn("[writing-submit]", summary);
  }
}
