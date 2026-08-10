/**
 * Word-level diff between the learner's `body_de` and the examiner
 * rewrite `pruefer_text`. Used by the Schreiben walkthrough layout:
 * `removed` → red strikethrough, `added` → green, `equal` → plain.
 *
 * Classic LCS over whitespace-delimited tokens. Schreiben feedback
 * carries no `evidence_spans`, so the diff is built entirely client-side.
 *
 * Verbatim port of `deutschfit-mobile/src/features/coach/correction/schreibenDiff.ts`
 * (S9 · Task 9.8) — algorithm, constants, and the `down >= right` tie-break
 * are unchanged; only this header changed to note the port.
 */
export type DiffSegmentType = "equal" | "removed" | "added";

export interface DiffSegment {
  readonly type: DiffSegmentType;
  readonly text: string;
}

function tokenize(text: string): string[] {
  return text.split(/\s+/).filter((t) => t.length > 0);
}

export function buildDiff(bodyDe: string, prueferText: string): DiffSegment[] {
  const a = tokenize(bodyDe);
  const b = tokenize(prueferText);
  const n = a.length;
  const m = b.length;

  // LCS length table.
  const lcs: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i -= 1) {
    for (let j = m - 1; j >= 0; j -= 1) {
      const row = lcs[i];
      const next = lcs[i + 1];
      if (row === undefined || next === undefined) continue;
      row[j] = a[i] === b[j] ? (next[j + 1] ?? 0) + 1 : Math.max(next[j] ?? 0, row[j + 1] ?? 0);
    }
  }

  // Walk the table, emitting segments.
  const segments: DiffSegment[] = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      segments.push({ type: "equal", text: a[i] as string });
      i += 1;
      j += 1;
      continue;
    }
    const down = lcs[i + 1]?.[j] ?? 0;
    const right = lcs[i]?.[j + 1] ?? 0;
    if (down >= right) {
      segments.push({ type: "removed", text: a[i] as string });
      i += 1;
    } else {
      segments.push({ type: "added", text: b[j] as string });
      j += 1;
    }
  }
  while (i < n) {
    segments.push({ type: "removed", text: a[i] as string });
    i += 1;
  }
  while (j < m) {
    segments.push({ type: "added", text: b[j] as string });
    j += 1;
  }
  return segments;
}
