// Calendar-day helpers. The old app used Python dates; here a day is the text
// "YYYY-MM-DD" so it survives being saved, sent between windows and compared.

export type IsoDate = string;

const MONTH_NAMES = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
] as const;

const WEEKDAY_NAMES = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
] as const;

const MONTH_ABBREVIATIONS = MONTH_NAMES.map((name) => name.slice(0, 3).toLowerCase());

function pad(value: number, width: number): string {
  return String(value).padStart(width, '0');
}

function utcDate(year: number, month: number, day: number): Date {
  const value = new Date(0);
  value.setUTCFullYear(year, month - 1, day);
  return value;
}

function daysInMonth(year: number, month: number): number {
  return utcDate(year, month + 1, 0).getUTCDate();
}

/** A real calendar day, or null where the numbers are not one (Python's `date(...)` raising). */
export function makeDate(year: number, month: number, day: number): IsoDate | null {
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) return null;
  if (year < 1 || year > 9999 || month < 1 || month > 12) return null;
  if (day < 1 || day > daysInMonth(year, month)) return null;
  return `${pad(year, 4)}-${pad(month, 2)}-${pad(day, 2)}`;
}

export function dateParts(date: IsoDate): { year: number; month: number; day: number } {
  const [year = 0, month = 0, day = 0] = date.split('-').map(Number);
  return { year, month, day };
}

function dayNumber(date: IsoDate): number {
  const { year, month, day } = dateParts(date);
  return Math.round(utcDate(year, month, day).getTime() / 86_400_000);
}

/** `later - earlier`, in whole days (negative when `later` comes first). */
export function daysBetween(later: IsoDate, earlier: IsoDate): number {
  return dayNumber(later) - dayNumber(earlier);
}

/** The computer's own idea of today, as a day. */
export function todayDate(now: Date = new Date()): IsoDate {
  return makeDate(now.getFullYear(), now.getMonth() + 1, now.getDate()) as IsoDate;
}

/** "Tuesday, September 01 2026" - Python's `strftime("%A, %B %d %Y")`. */
export function longDateLabel(date: IsoDate): string {
  const { year, month, day } = dateParts(date);
  const weekday = WEEKDAY_NAMES[utcDate(year, month, day).getUTCDay()] ?? '';
  return `${weekday}, ${MONTH_NAMES[month - 1] ?? ''} ${pad(day, 2)} ${pad(year, 4)}`;
}

// The patterns Python's strptime builds for each directive.
const DIRECTIVES: Record<string, string> = {
  Y: '(?<Y>\\d\\d\\d\\d)',
  y: '(?<y>\\d\\d)',
  m: '(?<m>1[0-2]|0[1-9]|[1-9])',
  d: '(?<d>3[01]|[12]\\d|0[1-9]|[1-9]| [1-9])',
  b: `(?<b>${MONTH_ABBREVIATIONS.join('|')})`,
};

/**
 * Read a day out of text the way Python's `datetime.strptime(text, fmt).date()` does:
 * the whole text has to fit the format, and the numbers have to make a real day.
 * Supports %Y %y %m %d %b, which is every directive the importers use.
 */
export function strptimeDate(text: string, format: string): IsoDate | null {
  let pattern = '';
  for (let index = 0; index < format.length; index += 1) {
    const char = format.charAt(index);
    if (char === '%') {
      index += 1;
      const directive = DIRECTIVES[format.charAt(index)];
      if (directive === undefined) throw new Error(`Unsupported date format: ${format}`);
      pattern += directive;
    } else if (/\s/.test(char)) {
      pattern += '\\s+';
    } else {
      pattern += char.replace(/[.*+?^${}()|[\]\\/-]/g, '\\$&');
    }
  }
  const match = new RegExp(`^${pattern}`, 'i').exec(text);
  // Python matches from the start without backtracking over leftovers: anything
  // not consumed is an error.
  if (!match || match[0].length !== text.length) return null;
  const groups = match.groups ?? {};
  let year: number;
  if (groups.Y !== undefined) {
    year = Number(groups.Y);
  } else if (groups.y !== undefined) {
    const short = Number(groups.y);
    year = short <= 68 ? 2000 + short : 1900 + short;
  } else {
    year = 1900;
  }
  const month =
    groups.b !== undefined
      ? MONTH_ABBREVIATIONS.indexOf(groups.b.toLowerCase()) + 1
      : Number(groups.m ?? 1);
  const day = Number((groups.d ?? '1').trim());
  return makeDate(year, month, day);
}

/** Try each format in turn; the first that reads wins. */
export function parseDateFormats(text: string, formats: readonly string[]): IsoDate | null {
  for (const format of formats) {
    const parsed = strptimeDate(text, format);
    if (parsed !== null) return parsed;
  }
  return null;
}
