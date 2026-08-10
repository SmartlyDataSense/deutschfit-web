/**
 * Coach weekly-plan edge-function client (S9 · Task 9.1).
 *
 * Ports `deutschfit-mobile/src/core/api/coach.ts` (mobile HEAD `3cced7a`),
 * swapping `supabase.functions.invoke` (which returns `{data, error}`)
 * for this app's `invokeFn` (which throws `ApiError`).
 *
 * Wraps the `coach-weekly-plan` edge function — the only coach surface
 * that returns a structured envelope built around a markdown plan:
 *
 *   {
 *     plan_markdown: string,
 *     grammar_concept_deep_links: unknown[],
 *     model_version: string | null,
 *     prompt_version: string,
 *     generated_at: string,
 *     replay: boolean,
 *     cache_warning?: string,
 *     drills?: DrillTemplate[],
 *   }
 *
 * The Coach chat screen does not need the full markdown — it hydrates a
 * single observation bubble + derives the weakness tag list that feeds the
 * drill-chain template picker. `getCoachPlan` returns the typed envelope;
 * `deriveObservation` maps it into a `CoachObservationPayload` the screen
 * can render directly.
 *
 * Fallback strategy:
 *   - Auth missing / network / 5xx / 502 → throw with the server code; the
 *     screen shows a "Connecte-toi pour l'analyse" banner and falls back
 *     to the scripted i18n observation.
 *   - Empty plan (no graded submissions yet) → success with an empty body
 *     so the screen can decide to keep the scripted opener.
 *
 * Deviation from mobile (noted per task-9.1-brief.md verbatim-port rule):
 * `firstSentence` here additionally tracks fenced-code-block state so
 * lines *inside* a ``` fence are skipped, not just the fence delimiter
 * lines themselves. Mobile's version only skips lines that literally
 * start with "```" and does NOT skip the fenced content between them —
 * verified against mobile HEAD 3cced7a, which returns the code-block
 * body for `firstSentence("# H\n\`\`\`\ncode\n\`\`\`\n- Point un. Suite")`
 * instead of the first prose sentence after the fence. That mismatches
 * the "skips headings and fences" contract this client is required to
 * satisfy, so the fence-tracking guard was added here. Coach plan
 * markdown has never been observed to contain fenced code in practice,
 * so this is expected to be a no-op delta.
 */
import { ApiError, invokeFn } from "@/learner/core/api";

export type GrammarConceptDeepLink = {
  readonly concept_slug?: string;
  readonly label?: string;
  readonly url?: string;
};

/**
 * Wire-format drill template — matches the shape emitted by
 * `coach-weekly-plan` (`supabase/functions/coach-weekly-plan/drill_templates.ts`).
 *
 * Kept permissive on `distractors` (`readonly string[]`) so forward-
 * compatible variants with 1 or 3+ distractors don't break the parser;
 * the v0 backend always ships exactly 2.
 */
export interface DrillTemplate {
  readonly id: string;
  readonly kind: "connector";
  readonly before: string;
  readonly after: string;
  readonly answer: string;
  readonly distractors: readonly string[];
  readonly explanation: string;
}

export type CoachPlanResponse = {
  readonly planMarkdown: string;
  readonly grammarDeepLinks: readonly GrammarConceptDeepLink[];
  readonly modelVersion: string | null;
  readonly promptVersion: string;
  readonly generatedAt: string;
  readonly replay: boolean;
  readonly cacheWarning?: string;
  /**
   * Connector-cloze drill templates returned by the edge function. Empty
   * when the backend's cache row predates drills or the plan is a
   * no-data fallback; the drill screen falls back to the local template
   * set in that case.
   */
  readonly drills: readonly DrillTemplate[];
};

export type CoachObservationPayload = {
  /** Single-sentence summary surfaced in the observation bubble. */
  readonly body: string;
  /** Weakness connectors (or concept slugs) derived from the plan. */
  readonly connectors: readonly string[];
  /** When `true`, the plan was non-empty — caller should show the payload. */
  readonly hasSignal: boolean;
};

/**
 * Known B2 connectors we try to surface when the plan's deep links don't
 * name them explicitly. These match the template set the drill picker
 * uses so it can always intersect.
 */
export const DEFAULT_CONNECTORS: readonly string[] = ["außerdem", "trotzdem", "deshalb", "obwohl"];

type RawPlanEnvelope = {
  plan_markdown?: unknown;
  grammar_concept_deep_links?: unknown;
  model_version?: unknown;
  prompt_version?: unknown;
  generated_at?: unknown;
  replay?: unknown;
  cache_warning?: unknown;
  drills?: unknown;
  error?: unknown;
};

function asString(v: unknown): string {
  return typeof v === "string" ? v : "";
}

function asStringOrNull(v: unknown): string | null {
  return typeof v === "string" ? v : null;
}

function asStringArray(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  const out: string[] = [];
  for (const raw of v) {
    if (typeof raw === "string") out.push(raw);
  }
  return out;
}

function asDrillTemplates(v: unknown): readonly DrillTemplate[] {
  if (!Array.isArray(v)) return [];
  const out: DrillTemplate[] = [];
  for (const raw of v) {
    if (typeof raw !== "object" || raw === null) continue;
    const row = raw as Record<string, unknown>;
    if (row.kind !== "connector") continue;
    const id = typeof row.id === "string" ? row.id : "";
    const before = typeof row.before === "string" ? row.before : "";
    const after = typeof row.after === "string" ? row.after : "";
    const answer = typeof row.answer === "string" ? row.answer : "";
    const explanation = typeof row.explanation === "string" ? row.explanation : "";
    const distractors = asStringArray(row.distractors);
    if (!id || !answer || distractors.length === 0) continue;
    out.push({ id, kind: "connector", before, after, answer, distractors, explanation });
  }
  return out;
}

function asDeepLinks(v: unknown): readonly GrammarConceptDeepLink[] {
  if (!Array.isArray(v)) return [];
  const out: GrammarConceptDeepLink[] = [];
  for (const raw of v) {
    if (typeof raw !== "object" || raw === null) continue;
    const link = raw as Record<string, unknown>;
    const entry: GrammarConceptDeepLink = {};
    if (typeof link.concept_slug === "string") {
      (entry as { concept_slug?: string }).concept_slug = link.concept_slug;
    }
    if (typeof link.label === "string") {
      (entry as { label?: string }).label = link.label;
    }
    if (typeof link.url === "string") {
      (entry as { url?: string }).url = link.url;
    }
    out.push(entry);
  }
  return out;
}

export async function getCoachPlan(): Promise<CoachPlanResponse> {
  let data: RawPlanEnvelope | null = null;
  try {
    data = await invokeFn<RawPlanEnvelope>("coach-weekly-plan", { method: "POST", body: {} });
  } catch (err) {
    if (err instanceof ApiError) {
      throw new Error(err.code || "coach_plan_failed");
    }
    throw err instanceof Error ? err : new Error("coach_plan_failed");
  }
  if (!data || typeof data !== "object") {
    throw new Error("coach_plan_empty_response");
  }
  if (typeof data.error === "string") {
    throw new Error(data.error);
  }

  const out: CoachPlanResponse = {
    planMarkdown: asString(data.plan_markdown),
    grammarDeepLinks: asDeepLinks(data.grammar_concept_deep_links),
    modelVersion: asStringOrNull(data.model_version),
    promptVersion: asString(data.prompt_version),
    generatedAt: asString(data.generated_at),
    replay: data.replay === true,
    drills: asDrillTemplates(data.drills),
  };
  if (typeof data.cache_warning === "string") {
    (out as { cacheWarning?: string }).cacheWarning = data.cache_warning;
  }
  return out;
}

/**
 * Extract the first prose sentence from a markdown body — skips headings,
 * list markers, and fenced code blocks (delimiters AND content — see the
 * file-level deviation note above). Used to populate the observation
 * bubble when the plan is non-empty.
 */
export function firstSentence(markdown: string): string {
  if (!markdown) return "";
  const lines = markdown.split(/\r?\n/);
  let inFence = false;
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith("```")) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;
    if (!trimmed) continue;
    if (trimmed.startsWith("#")) continue;
    const stripped = trimmed.replace(/^[-*+]\s+/, "").replace(/^\d+\.\s+/, "");
    if (!stripped) continue;
    const sentenceMatch = stripped.match(/^[^.!?]+[.!?]/u);
    if (sentenceMatch) return sentenceMatch[0].trim();
    return stripped;
  }
  return "";
}

/**
 * Infer weakness connectors from the deep-link list. The backend labels
 * links as `concept_slug` (e.g. `"connector-trotzdem"`) or
 * `label: "trotzdem"`; we extract any DEFAULT_CONNECTORS hit. Falls back
 * to the full default set when nothing matches, so the drill picker still
 * has a usable hint list.
 */
export function deriveConnectors(deepLinks: readonly GrammarConceptDeepLink[]): readonly string[] {
  const hits: string[] = [];
  for (const link of deepLinks) {
    const haystack = [link.concept_slug, link.label, link.url]
      .filter((s): s is string => typeof s === "string")
      .join(" ")
      .toLowerCase();
    for (const c of DEFAULT_CONNECTORS) {
      if (haystack.includes(c) && !hits.includes(c)) {
        hits.push(c);
      }
    }
  }
  return hits.length > 0 ? hits : DEFAULT_CONNECTORS;
}

export function deriveObservation(plan: CoachPlanResponse): CoachObservationPayload {
  const body = firstSentence(plan.planMarkdown);
  const connectors = deriveConnectors(plan.grammarDeepLinks);
  return {
    body,
    connectors,
    hasSignal: body.length > 0,
  };
}
