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
export function importedLabel(when: Date | null | undefined): string {
  if (!when) return '';
  const hour = when.getHours() % 12 || 12;
  const half = when.getHours() < 12 ? 'AM' : 'PM';
  return (
    `imported ${MONTHS[when.getMonth()]} ${two(when.getDate())}, ${when.getFullYear()} ` +
    `at ${two(hour)}:${two(when.getMinutes())} ${half}`
  );
}

/** "Some file.xlsx  -  imported Sep 11, 2026 at 05:37 PM". */
export function sourceLine(sourceFile: string, importedAt: Date | null | undefined): string {
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
