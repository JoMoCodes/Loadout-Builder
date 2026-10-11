// Weeks are written "YYYY-Www", zero padded ("2026-W07"). Week ranges are compared and sorted
// as plain text, so the padding matters: without it "2026-W7" would sort after "2026-W10".

/** "2026", 7 -> "2026-W07". */
export function formatWeek(year: string | number, week: number): string {
  return `${year}-W${String(week).padStart(2, '0')}`;
}

// "2026-W14" anywhere in the name (the CDF, DSB and PSB readers).
const WEEK_WITH_HYPHEN = /(\d{4})-W(\d{1,2})/;
// "2026-W14" or "2026W14" (the DCR, DCR totals and Safety readers: newer exports drop the hyphen).
const WEEK_HYPHEN_OPTIONAL = /(\d{4})-?W(\d{1,2})/;

/**
 * The week in a file name, as "YYYY-Www", or null when the name has none.
 * `hyphenOptional` also accepts "2026W14", as the DCR, DCR totals and Safety readers do.
 */
export function weekFromFileName(fileName: string, hyphenOptional = false): string | null {
  const match = (hyphenOptional ? WEEK_HYPHEN_OPTIONAL : WEEK_WITH_HYPHEN).exec(fileName);
  if (!match) return null;
  return formatWeek(match[1] as string, Number.parseInt(match[2] as string, 10));
}

/** Plain text comparison of two weeks (the order the old app used everywhere). */
export function compareWeeks(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}
