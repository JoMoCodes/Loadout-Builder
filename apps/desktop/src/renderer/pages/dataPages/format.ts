// Small word-making helpers the Route Data, Vehicle Data and Associates pages share. They are
// plain functions so they can be tested on their own. The wording is the old app's.

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "1 driver", "2 drivers". */
export function plural(count: number, word: string, many = `${word}s`): string {
  return `${count} ${count === 1 ? word : many}`;
}

/** The last part of a file path, whichever way the slashes lean. */
export function baseName(path: string): string {
  const parts = path.split(/[\\/]/);
  return parts[parts.length - 1] ?? '';
}

const two = (value: number) => String(value).padStart(2, '0');

/** "imported Sep 11, 2026 at 05:37 PM", like the old page's header, or '' when never. */
export function importedLabel(given: Date | string | null | undefined): string {
  // A time that travelled as text (the browser tests' stand-in) is read as a date too.
  const when = given instanceof Date ? given : given ? new Date(given) : null;
  if (!when || Number.isNaN(when.getTime())) return '';
  const hour = when.getHours() % 12 || 12;
  const half = when.getHours() < 12 ? 'AM' : 'PM';
  return (
    `imported ${MONTHS[when.getMonth()]} ${two(when.getDate())}, ${when.getFullYear()} ` +
    `at ${two(hour)}:${two(when.getMinutes())} ${half}`
  );
}

/**
 * One calendar month after a time, the day of the month kept where the next month has it (Jan 31
 * -> Feb 28). The rule the route sheets use for "the driver list is over a month old".
 */
export function monthAfter(when: Date): Date {
  const due = new Date(when.getTime());
  const day = due.getDate();
  due.setDate(1);
  due.setMonth(due.getMonth() + 1);
  due.setDate(Math.min(day, new Date(due.getFullYear(), due.getMonth() + 1, 0).getDate()));
  return due;
}

/** A time as a Date, whether it came as one or as text; null when it is neither. */
function asDate(when: Date | string | null | undefined): Date | null {
  if (!when) return null;
  const date = when instanceof Date ? when : new Date(when);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** True once a list brought in at `importedAt` is due for a newer copy (a month on). */
export function isOverAMonthOld(
  importedAt: Date | string | null | undefined,
  now = new Date(),
): boolean {
  const at = asDate(importedAt);
  return at !== null && now.getTime() >= monthAfter(at).getTime();
}

/** Whole days since a time, never below 0. */
export function daysSince(when: Date | string | null | undefined, now = new Date()): number {
  const at = asDate(when);
  if (at === null) return 0;
  return Math.max(0, Math.floor((now.getTime() - at.getTime()) / 86_400_000));
}

/** "Some file.xlsx  -  imported Sep 11, 2026 at 05:37 PM". */
export function sourceLine(
  sourceFile: string,
  importedAt: Date | string | null | undefined,
): string {
  const bits: string[] = [];
  if (sourceFile) bits.push(baseName(sourceFile));
  const when = importedLabel(importedAt);
  if (when) bits.push(when);
  return bits.join('  -  ');
}

/** "A, B, C, D and 2 more": the first few names, then how many are left. */
export function nameList(names: readonly string[], shown = 4): string {
  const head = names.slice(0, shown).join(', ');
  return names.length > shown ? `${head} and ${names.length - shown} more` : head;
}

/** Python's `str.title()` for the ownership words: "AMAZON_RENTAL" reads "Amazon Rental". */
export function ownershipLabel(ownership: string): string {
  if (!ownership) return '';
  return ownership
    .replace(/_/g, ' ')
    .toLowerCase()
    .replace(
      /(^|[^a-z])([a-z])/g,
      (_all, before: string, letter: string) => before + letter.toUpperCase(),
    );
}

/** The words for "N more", "+N more" at the end of a list of route codes. */
export function codeList(codes: readonly string[], shown = 3): string {
  const head = codes.slice(0, shown).join(', ');
  return codes.length > shown ? `${head} +${codes.length - shown} more` : head;
}
