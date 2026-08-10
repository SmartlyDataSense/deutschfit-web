/**
 * Skill-profile API client for the "Mes points" surface (S9 · Task 9.7).
 * Web port of `deutschfit-mobile/src/features/drill/api/skillProfileClient.ts`
 * onto `getBrowserClient` (`@/lib/supabase/browser`) instead of the mobile
 * `supabase` singleton — same transport swap every other PostgREST-backed
 * learner client in this repo makes (see `onboardingStatus.ts`,
 * `accueil/api.ts`).
 *
 * Reads the learner's per-skill BKT mastery directly from the
 * `user_concept_mastery` table (SP-3 engine's source of truth). The
 * table's RLS own-read policy scopes the result to the authenticated
 * user, so no explicit user filter is needed. The French concept label
 * is embedded from the `drill_skill` foreign-key relation.
 *
 * This is the one drill client on web that throws on error (task-9.7
 * brief, mobile parity) — `drillClient.ts` (Task 9.6) instead collapses
 * failures to an empty-envelope return so `useDrillSession` can route to
 * a single empty-state branch. This screen has no such envelope: an
 * error here is a distinct branch (`drill:skillProfile.error`), so the
 * caller's own try/catch is the right place to draw that line.
 *
 * Types are declared locally and narrowly, same as mobile: this repo
 * does not re-declare the full Supabase schema by hand here — the
 * generated `Database` type doesn't type embedded-relation `.select()`
 * strings, so the raw row shape is cast through a local, narrow
 * `MasteryQueryRow` interface (mirrors mobile's approach 1:1).
 */
import { getBrowserClient } from "@/lib/supabase/browser";

/** One per-skill row as consumed by the skill-profile screen. */
export interface SkillProfileRow {
  readonly concept_code: string;
  readonly label: string;
  readonly attempts: number;
  readonly mastery: number;
}

/** Shape of one raw row returned by the mastery query (local, narrow). */
interface MasteryQueryRow {
  readonly concept_code: string;
  readonly p_mastery: number | null;
  readonly attempts: number | null;
  readonly drill_skill:
    | { readonly name_fr: string | null }
    | readonly { readonly name_fr: string | null }[]
    | null;
}

export async function fetchSkillProfile(): Promise<readonly SkillProfileRow[]> {
  const supabase = getBrowserClient();
  const { data, error } = await supabase
    .from("user_concept_mastery")
    .select("concept_code, p_mastery, attempts, drill_skill(name_fr)")
    .order("p_mastery", { ascending: true });

  if (error) throw new Error(`skill_profile_fetch_failed: ${error.message}`);

  const rows = (data ?? []) as unknown as readonly MasteryQueryRow[];
  return rows.map((row) => {
    const rel = row.drill_skill;
    const relRow = Array.isArray(rel) ? rel[0] : rel;
    const nameFr = relRow?.name_fr;
    return {
      concept_code: row.concept_code,
      label: typeof nameFr === "string" && nameFr.length > 0 ? nameFr : row.concept_code,
      attempts: row.attempts ?? 0,
      mastery: row.p_mastery ?? 0,
    };
  });
}
