/**
 * Resolves `evidence_spans` against the raw transcript into an ordered
 * list of segments the Sprechen walkthrough renders inline. Overlapping
 * spans merge into a single highlight that carries every contributing
 * span (so tapping it can reveal all notes); adjacent spans stay split.
 *
 * Verbatim port of `deutschfit-mobile/src/features/coach/correction/sprechenSpans.ts`
 * (S9 · Task 9.8) — algorithm, cut-point logic, and the reference-identity
 * merge are unchanged.
 *
 * CRITICAL INVARIANT: the coalescing merge below relies on REFERENCE
 * IDENTITY of `EvidenceSpan` objects (`ps === ss`) to detect that a span
 * straddling a cut point is the *same* span on both sides, so the two
 * raw segments it produced get merged into one highlight instead of two.
 * This only works if `spans` flows into `resolveSpans` UN-CLONED all the
 * way from `fetchCorrection` (no `.map(s => ({...s}))`, no
 * `structuredClone`, no JSON round-trip anywhere on that path) — cloning
 * anywhere upstream silently breaks the merge and the walkthrough would
 * render a straddling span as two adjacent highlights instead of one.
 */
import type { EvidenceSpan } from "@/learner/core/feedback/feedbackV2";

export type TranscriptSegmentType = "plain" | "highlight";

export interface TranscriptSegment {
  readonly type: TranscriptSegmentType;
  readonly text: string;
  /** Spans covering this segment; empty for plain text. */
  readonly spans: readonly EvidenceSpan[];
}

export function resolveSpans(
  transcript: string,
  spans: readonly EvidenceSpan[]
): TranscriptSegment[] {
  const len = transcript.length;
  // Keep only in-range, non-empty spans.
  const valid = spans.filter(
    (s) =>
      s.transcript_offset_start >= 0 &&
      s.transcript_offset_end <= len &&
      s.transcript_offset_start < s.transcript_offset_end
  );
  if (valid.length === 0) {
    return len > 0 ? [{ type: "plain", text: transcript, spans: [] }] : [];
  }

  // Collect every span edge as a cut point.
  const cuts = new Set<number>([0, len]);
  for (const s of valid) {
    cuts.add(s.transcript_offset_start);
    cuts.add(s.transcript_offset_end);
  }
  const ordered = [...cuts].sort((a, b) => a - b);

  const segments: TranscriptSegment[] = [];
  for (let k = 0; k < ordered.length - 1; k += 1) {
    const start = ordered[k] as number;
    const end = ordered[k + 1] as number;
    if (start >= end) continue;
    const covering = valid.filter(
      (s) => s.transcript_offset_start <= start && s.transcript_offset_end >= end
    );
    const text = transcript.slice(start, end);
    if (covering.length > 0) {
      segments.push({ type: "highlight", text, spans: covering });
    } else {
      segments.push({ type: "plain", text, spans: [] });
    }
  }

  // Coalesce consecutive segments where:
  // - Both are highlights and their span sets overlap/share any span, OR
  // - Both are plain text.
  //
  // Overlap detection relies on reference identity (`ps === ss`): each
  // `covering` slice above is filtered from the same `valid` array, so a
  // span straddling a cut point appears as the *same object* on both
  // sides. Do not clone/map spans before this point or the merge breaks.
  const merged: TranscriptSegment[] = [];
  for (const seg of segments) {
    const prev = merged[merged.length - 1];
    if (prev === undefined) {
      merged.push(seg);
      continue;
    }

    const shouldMerge =
      (prev.type === "plain" && seg.type === "plain") ||
      (prev.type === "highlight" &&
        seg.type === "highlight" &&
        prev.spans.some((ps) => seg.spans.some((ss) => ps === ss)));

    if (shouldMerge) {
      // Merge: combine text and union of spans for highlights
      if (prev.type === "highlight" && seg.type === "highlight") {
        const mergedSpans = Array.from(new Set([...prev.spans, ...seg.spans]));
        merged[merged.length - 1] = {
          type: "highlight",
          text: prev.text + seg.text,
          spans: mergedSpans,
        };
      } else {
        merged[merged.length - 1] = {
          type: "plain",
          text: prev.text + seg.text,
          spans: [],
        };
      }
    } else {
      merged.push(seg);
    }
  }

  return merged;
}
