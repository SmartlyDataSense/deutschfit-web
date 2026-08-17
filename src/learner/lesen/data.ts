/**
 * Lesen data helpers — stateless utilities used by `LesenIntroScreen` /
 * the future Lesen session screen. Web port of
 * `deutschfit-mobile/src/features/lesen/data.ts` (Task 4.8).
 *
 * Scope ported: `formatLesenModuleShape(level)` and
 * `indexReadingTextsFromModule(module)`. Mobile's `indexReadingTextsFromShape`
 * (legacy placeholder-manifest indexer) and everything under
 * `__fixtures__/legacyPlaceholder.ts` are NOT ported — the web app never had
 * a placeholder/fixture Lesen path to begin with (S4 goes straight to the
 * live `mock-exam-start` / `lesen-start` contract), so there is no
 * "legacy shape" input this indexer would ever receive here.
 */
import type { LesenModule } from "@/learner/core/api/examApi";
import type { ExamLevel } from "@/learner/core/exam/examTypes";

export interface ReadingTextRef {
  readonly slug: string;
  readonly label: string;
  readonly bodyMd: string | null;
}

/**
 * Static "N Teile · M Minuten" label for the Lesen intro preview card.
 *
 * The preview renders before we've fetched a real session, so we need a
 * deterministic label keyed only by the user's CEFR level. Values mirror
 * the Goethe Modelltest shape matrix (byte-identical to mobile's
 * `formatLesenModuleShape`):
 *
 *   - A1 / A2: 5 Teile · 25 Minuten
 *   - B1     : 5 Teile · 65 Minuten
 *   - B2     : 5 Teile · 65 Minuten
 *   - C1     : 3 Teile · 70 Minuten
 *   - C2     : 4 Teile · 80 Minuten
 */
export function formatLesenModuleShape(level: ExamLevel): string {
  switch (level) {
    case "a1":
    case "a2":
      return "5 Teile · 25 Minuten";
    case "b1":
    case "b2":
      return "5 Teile · 65 Minuten";
    case "c1":
      return "3 Teile · 70 Minuten";
    case "c2":
      return "4 Teile · 80 Minuten";
  }
}

/**
 * Build a reading-text index from a live-mode Lesen module payload. Keys
 * by stimulus slug so the session screen can look up markdown/label pairs
 * when rendering a question that references a reading text.
 */
export function indexReadingTextsFromModule(
  module: LesenModule
): Readonly<Record<string, ReadingTextRef>> {
  const out: Record<string, ReadingTextRef> = {};
  for (const p of module.parts) {
    for (const rt of p.reading_texts) {
      out[rt.slug] = {
        slug: rt.slug,
        label: rt.label,
        bodyMd: rt.transcript_md ?? null,
      };
    }
  }
  return out;
}
