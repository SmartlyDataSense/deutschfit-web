/**
 * Minimal RFC-4180 CSV serializer.
 *
 * Wraps a value in double-quotes when it contains a comma, double-quote,
 * carriage-return, or newline; embedded double-quotes are doubled. `null`
 * and `undefined` serialize as the empty string. Numbers and booleans
 * round-trip via `String()`.
 *
 * Usage:
 *   toCsv([{ a: "x,y", b: 'he said "hi"' }], ["a", "b"]);
 *   // => 'a,b\n"x,y","he said ""hi"""'
 */
export function toCsv<T extends Record<string, unknown>>(
  rows: readonly T[],
  columns: readonly (keyof T & string)[]
): string {
  const header = columns.map(escapeCell).join(",");
  const lines = rows.map((row) => columns.map((col) => escapeCell(row[col])).join(","));
  return [header, ...lines].join("\n");
}

function escapeCell(value: unknown): string {
  if (value === null || value === undefined) return "";
  const str = typeof value === "string" ? value : String(value);
  const needsQuoting = /[",\r\n]/.test(str);
  if (!needsQuoting) return str;
  return `"${str.replace(/"/g, '""')}"`;
}

/** YYYY-MM-DD slug for filenames. */
export function todayIsoDate(): string {
  return new Date().toISOString().slice(0, 10);
}
