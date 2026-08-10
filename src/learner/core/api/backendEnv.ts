/**
 * Backend environment indicator — web port of
 * `deutschfit-mobile/src/core/api/backendEnv.ts`. Same ref→env map;
 * reads `NEXT_PUBLIC_SUPABASE_URL` (literal dotted form — S11-D10)
 * instead of `expoConfig.extra`.
 */
export type BackendEnvName = "dev" | "preprod" | "prod" | "unknown";

export interface BackendInfo {
  readonly env: BackendEnvName;
  readonly projectRef: string | null;
}

const PROJECT_REF_ENV: Readonly<Record<string, BackendEnvName>> = {
  ocqoqnifzlkrgcyjljpl: "dev",
  auketecsgmdqlexosaay: "prod",
};

export function readProjectRef(url: string | undefined): string | null {
  if (!url) return null;
  const match = /^https:\/\/([a-z0-9]+)\.supabase\./i.exec(url);
  return match ? match[1]!.toLowerCase() : null;
}

export function getBackendInfo(url?: string): BackendInfo {
  const resolved = url ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const projectRef = readProjectRef(resolved);
  const env = projectRef ? (PROJECT_REF_ENV[projectRef] ?? "unknown") : "unknown";
  return { env, projectRef };
}
