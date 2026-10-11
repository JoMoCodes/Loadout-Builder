// Reading the roster's free-text "ID expiration" value. Ported from IdExpirationParser.cs.
//
// The old code tried .NET's invariant-culture date reader, then a short list of formats, and
// never failed loudly: a blank or unreadable value is "unknown" (never an alert). This port
// accepts the same shapes:
//
//   2031-03-24, 2031/03/24, 2031.03.24 (with or without a time after it)
//   3/24/2031, 03/24/2031, 3/24/31, 3-24-2031 (month first, as the invariant culture reads it)
//   24-Mar-2031, 24 Mar 2031, 24 March 2031, Mar 24, 2031, March 24 2031
//
// Two-digit years follow .NET's rule: 00-49 are 2000-2049, 50-99 are 1950-1999.

/** A calendar date as "YYYY-MM-DD". */
export type IsoDay = string;

const MONTHS: ReadonlyMap<string, number> = new Map([
  ['jan', 1],
  ['january', 1],
  ['feb', 2],
  ['february', 2],
  ['mar', 3],
  ['march', 3],
  ['apr', 4],
  ['april', 4],
  ['may', 5],
  ['jun', 6],
  ['june', 6],
  ['jul', 7],
  ['july', 7],
  ['aug', 8],
  ['august', 8],
  ['sep', 9],
  ['sept', 9],
  ['september', 9],
  ['oct', 10],
  ['october', 10],
  ['nov', 11],
  ['november', 11],
  ['dec', 12],
  ['december', 12],
]);

// An optional time after the date: "10:30", "10:30:00", "10:30 PM", "T10:30:00Z", ...
const TIME = String.raw`(?:(?:\s+|T)\d{1,2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:\s*[AaPp][Mm])?(?:Z|[+-]\d{2}:?\d{2})?)?`;

const YEAR_FIRST = new RegExp(String.raw`^(\d{4})([-/.])(\d{1,2})\2(\d{1,2})${TIME}$`);
const MONTH_FIRST = new RegExp(String.raw`^(\d{1,2})([-/.])(\d{1,2})\2(\d{4}|\d{2})${TIME}$`);
const DAY_MONTH_NAME = new RegExp(
  String.raw`^(\d{1,2})[-\s]+([A-Za-z]+)\.?,?[-\s]+(\d{4}|\d{2})${TIME}$`,
);
const MONTH_NAME_DAY = new RegExp(
  String.raw`^([A-Za-z]+)\.?\s+(\d{1,2}),?\s+(\d{4}|\d{2})${TIME}$`,
);

function fullYear(text: string): number {
  const year = Number.parseInt(text, 10);
  if (text.length > 2) return year;
  return year <= 49 ? 2000 + year : 1900 + year;
}

function isoDay(year: number, month: number, day: number): IsoDay | null {
  if (year < 1 || year > 9999 || month < 1 || month > 12 || day < 1) return null;
  const date = new Date(Date.UTC(2000, month - 1, day));
  date.setUTCFullYear(year);
  if (date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function monthNumber(name: string): number | null {
  return MONTHS.get(name.toLowerCase()) ?? null;
}

/**
 * The roster's "ID expiration" text as a date ("YYYY-MM-DD"), or null when it is blank or not a
 * date this can read. Never throws.
 */
export function parseIdExpiration(raw: string | null | undefined): IsoDay | null {
  if (raw === null || raw === undefined) return null;
  const text = raw.trim();
  if (text === '') return null;

  let match = YEAR_FIRST.exec(text);
  if (match) {
    return isoDay(Number(match[1]), Number(match[3]), Number(match[4]));
  }
  match = MONTH_FIRST.exec(text);
  if (match) {
    return isoDay(fullYear(match[4] as string), Number(match[1]), Number(match[3]));
  }
  match = DAY_MONTH_NAME.exec(text);
  if (match) {
    const month = monthNumber(match[2] as string);
    return month === null ? null : isoDay(fullYear(match[3] as string), month, Number(match[1]));
  }
  match = MONTH_NAME_DAY.exec(text);
  if (match) {
    const month = monthNumber(match[1] as string);
    return month === null ? null : isoDay(fullYear(match[3] as string), month, Number(match[2]));
  }
  return null;
}

/** The old `IdExpirationParser`. */
export const IdExpirationParser = Object.freeze({ parse: parseIdExpiration });
