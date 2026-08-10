/**
 * Profil API — web port of `mobile/src/features/profil/api.ts`.
 * Talks to the `user-stats` edge function (GET) via `invokeFn`.
 * Error codes are mobile's exact strings: user_stats_transport_error /
 * user_stats_empty_response / user_stats_malformed_response.
 */
import { invokeFn } from "../core/api/client";
import type { ProfilStats } from "./data/fixtures";

/**
 * Subset of `ProfilStats` the edge function populates. `legacyLevel` +
 * `lessonsCompleted` are kept client-side for back-compat with earlier
 * callers and are not part of the edge-function contract.
 */
export type ProfilStatsPayload = Omit<ProfilStats, "legacyLevel" | "lessonsCompleted">;

const EDGE_FUNCTION_NAME = "user-stats";

function str(value: unknown): string {
  return typeof value === "string" ? value : "";
}
function num(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

export async function fetchUserStats(): Promise<ProfilStatsPayload> {
  let raw: unknown;
  try {
    raw = await invokeFn<unknown>(EDGE_FUNCTION_NAME, { method: "GET" });
  } catch (cause) {
    throw new Error("user_stats_transport_error", { cause });
  }
  // Mobile parity (profil/api.ts `isPayload`): reject ANY non-object,
  // including falsy primitives (`0` / `false` / `""`) and truthy ones
  // (a bare number/string/boolean response) — not just null/undefined.
  if (raw === null || typeof raw !== "object") {
    throw new Error("user_stats_empty_response");
  }
  const body = raw as Record<string, unknown>;
  if (typeof body.error === "string") {
    throw new Error(body.error);
  }

  // Minimal shape validation — the edge fn is authoritative, but we
  // don't want a malformed row to silently render NaN values.
  if (
    typeof body.fullName !== "string" ||
    !Array.isArray(body.languages) ||
    typeof body.daysRemaining !== "number"
  ) {
    throw new Error("user_stats_malformed_response");
  }
  return {
    fullName: body.fullName,
    location: str(body.location),
    languages: (body.languages as unknown[]).filter((l): l is string => typeof l === "string"),
    examLabel: str(body.examLabel),
    daysRemaining: body.daysRemaining,
    reminderTime: str(body.reminderTime),
    offlineLessonsCount: num(body.offlineLessonsCount),
    offlineSizeMb: num(body.offlineSizeMb),
    dataSaverOn: body.dataSaverOn === true,
  };
}
