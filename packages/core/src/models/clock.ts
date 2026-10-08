// Clock times and the sort rule every table (and the printed sheet) shares.

export interface ClockTime {
  hour: number;
  minute: number;
}

const CLOCK_RE = /(\d{1,2}):(\d{2})\s*([ap])\.?m\.?/i;

/** '10:25am' -> 10:25. null if the text isn't a clock time. */
export function parseClock(text: string | null | undefined): ClockTime | null {
  const match = CLOCK_RE.exec(text ?? '');
  if (!match) return null;
  let hour = Number(match[1]);
  const minute = Number(match[2]);
  if (!(hour >= 1 && hour <= 12 && minute < 60)) return null;
  const meridiem = (match[3] ?? '').toLowerCase();
  if (meridiem === 'p' && hour !== 12) {
    hour += 12;
  } else if (meridiem === 'a' && hour === 12) {
    hour = 0;
  }
  return { hour, minute };
}

/** A sort key: numbers, text and nested lists of them, compared like Python tuples. */
export type SortKey = number | bigint | string | readonly SortKey[];

function compareText(a: string, b: string): number {
  // Python compares text by code point; JavaScript's own `<` compares UTF-16 units.
  const left = Array.from(a);
  const right = Array.from(b);
  const shared = Math.min(left.length, right.length);
  for (let index = 0; index < shared; index += 1) {
    const x = (left[index] as string).codePointAt(0) as number;
    const y = (right[index] as string).codePointAt(0) as number;
    if (x !== y) return x < y ? -1 : 1;
  }
  return Math.sign(left.length - right.length);
}

/** Order two sort keys the way Python orders tuples. */
export function compareKeys(a: SortKey, b: SortKey): number {
  if (Array.isArray(a) && Array.isArray(b)) {
    const shared = Math.min(a.length, b.length);
    for (let index = 0; index < shared; index += 1) {
      const result = compareKeys(a[index] as SortKey, b[index] as SortKey);
      if (result !== 0) return result;
    }
    return Math.sign(a.length - b.length);
  }
  if (typeof a === 'string' && typeof b === 'string') return compareText(a, b);
  if (
    (typeof a === 'number' || typeof a === 'bigint') &&
    (typeof b === 'number' || typeof b === 'bigint')
  ) {
    if (a === b) return 0;
    return a < b ? -1 : 1;
  }
  throw new Error('These sort keys cannot be compared.');
}

/** Python's `sorted(strings)`: plain code-point order. */
export function sortedText(values: Iterable<string>): string[] {
  return [...values].sort(compareText);
}

/** Sort key that puts real times in clock order and unknowns last. */
export function clockKey(text: string | null | undefined): [number, string] {
  const parsed = parseClock(text);
  if (parsed === null) return [1, (text ?? '').toLowerCase()];
  return [0, `${String(parsed.hour).padStart(2, '0')}${String(parsed.minute).padStart(2, '0')}`];
}

const DIGITS = /(\d+)/;

// What the tables write for "nothing here".
const BLANKS = new Set(['', '-']);

/**
 * Split digits from text so they compare as numbers: 51 sorts before 619454,
 * and 619454 before 655103. Numbers lead text.
 */
export function naturalKey(text: string): SortKey[] {
  const parts: SortKey[] = [];
  for (const part of text.toLowerCase().split(DIGITS)) {
    if (part === '') continue;
    parts.push(/^\d+$/.test(part) ? [0, BigInt(part)] : [1, part]);
  }
  return parts;
}

/**
 * Order a column the way its contents actually read: clock times in time order,
 * numbers as numbers, empty cells last. The printed sheet uses it too.
 */
export function sortKey(text: string | null | undefined): SortKey {
  const value = (text ?? '').trim();
  if (BLANKS.has(value)) return [2];
  const clock = parseClock(value);
  if (clock !== null) return [0, clock.hour * 60 + clock.minute];
  return [1, naturalKey(value)];
}

/** Compare two cells by `sortKey`. */
export function compareCells(a: string | null | undefined, b: string | null | undefined): number {
  return compareKeys(sortKey(a), sortKey(b));
}
