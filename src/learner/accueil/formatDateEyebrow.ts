/**
 * Date eyebrow formatter for the Accueil home screen.
 *
 * Ports `deutschfit-mobile/src/features/accueil/formatDateEyebrow.ts`
 * verbatim (S3 · Task 3.5).
 *
 * Produces the "WEEKDAY · DAY MONTH" string shown above the greeting on
 * mock #3 (e.g. "LUNDI · 15 AVRIL"). Uses `Intl.DateTimeFormat` for the
 * active locale and uppercases the result; an `en`-locale device produces
 * "MONDAY · 15 APRIL" without any copy changes.
 *
 * Pure — callers inject the date + locale so the formatter stays easy to
 * snapshot-test.
 */
export function formatDateEyebrow(date: Date, locale: string): string {
  const weekday = new Intl.DateTimeFormat(locale, { weekday: "long" }).format(date);
  const day = new Intl.DateTimeFormat(locale, { day: "numeric" }).format(date);
  const month = new Intl.DateTimeFormat(locale, { month: "long" }).format(date);
  return `${weekday} · ${day} ${month}`.toUpperCase();
}
