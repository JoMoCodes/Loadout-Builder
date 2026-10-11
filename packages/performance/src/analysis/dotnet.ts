// Small rules that copy how the old app's .NET code and its SQLite database behaved, so the
// numbers, texts and orders come out exactly the same: number formats ("0.0", "0.#", ...),
// text comparisons (ordinal, ignore-case, SQLite's NOCASE), averages (LINQ and SQL AVG), and
// SQLite's TRIM / LOWER.

// ---- number to text --------------------------------------------------------------------------

/**
 * The 15 significant digits .NET works from when it applies a custom format such as "0.0"
 * (it rounds the number to 15 digits first, then rounds that text to the places asked for).
 * Returns the digits with no trailing zeros and the position of the decimal point
 * (value = 0.DIGITS x 10^scale).
 */
function fifteenDigits(abs: number): { digits: string; scale: number } {
  if (abs === 0) return { digits: '', scale: 0 };
  const [mantissa, exponent] = abs.toExponential(14).split('e') as [string, string];
  const digits = mantissa.replace('.', '').replace(/0+$/, '');
  return { digits, scale: Number(exponent) + 1 };
}

/**
 * A number in a .NET custom format made of "0" and "#" placeholders: "0", "0.0", "0.#",
 * "0.##" and the like. Halves round away from zero, after .NET's own 15-digit rounding, so
 * 0.05 -> "0.1" and 2.675 -> "2.68" as in the old app. A negative number that rounds to zero
 * keeps its minus sign ("-0.0"), as .NET Core does.
 */
export function formatNet(value: number, format: string): string {
  const point = format.indexOf('.');
  const decimals = point < 0 ? '' : format.slice(point + 1);
  const minDecimals = (decimals.match(/0/g) ?? []).length;
  const maxDecimals = decimals.length;

  const negative = value < 0 || Object.is(value, -0);
  const { digits, scale } = fifteenDigits(Math.abs(value));

  // Digits as an array, with the decimal point after `intLen` of them.
  let intLen = scale;
  let all = digits.split('').map(Number);
  if (intLen < 0) {
    all = new Array<number>(-intLen).fill(0).concat(all);
    intLen = 0;
  }
  const keep = intLen + maxDecimals;
  if (all.length > keep) {
    const roundUp = (all[keep] as number) >= 5;
    all = all.slice(0, keep);
    if (roundUp) {
      let i = keep - 1;
      while (i >= 0) {
        const d = (all[i] as number) + 1;
        if (d < 10) {
          all[i] = d;
          break;
        }
        all[i] = 0;
        i--;
      }
      if (i < 0) {
        all.unshift(1);
        intLen++;
      }
    }
  }
  while (all.length < intLen + maxDecimals) all.push(0);

  let whole = all.slice(0, intLen).join('').replace(/^0+/, '');
  if (whole === '') whole = '0';
  let frac = all.slice(intLen, intLen + maxDecimals).join('');
  while (frac.length > minDecimals && frac.endsWith('0')) frac = frac.slice(0, -1);
  const text = frac === '' ? whole : `${whole}.${frac}`;
  return negative ? `-${text}` : text;
}

/**
 * A number the way .NET's `double.ToString(CultureInfo.InvariantCulture)` writes it: the
 * shortest digits that read back as the same number, in plain form, or "1E-05" / "1E+15"
 * style when the number is very small or very large.
 */
export function formatNetRoundTrip(value: number): string {
  if (Number.isNaN(value)) return 'NaN';
  if (value === Infinity) return 'Infinity';
  if (value === -Infinity) return '-Infinity';
  if (value === 0) return Object.is(value, -0) ? '-0' : '0';
  const negative = value < 0;
  const [mantissa, exponent] = Math.abs(value).toExponential().split('e') as [string, string];
  const digits = mantissa.replace('.', '');
  const scale = Number(exponent) + 1;
  let text: string;
  if (scale > 15 || scale < -3) {
    const exp = scale - 1;
    const rest = digits.slice(1);
    text = `${digits[0]}${rest === '' ? '' : `.${rest}`}E${exp < 0 ? '-' : '+'}${String(Math.abs(exp)).padStart(2, '0')}`;
  } else if (scale <= 0) {
    text = `0.${'0'.repeat(-scale)}${digits}`;
  } else if (scale >= digits.length) {
    text = digits + '0'.repeat(scale - digits.length);
  } else {
    text = `${digits.slice(0, scale)}.${digits.slice(scale)}`;
  }
  return negative ? `-${text}` : text;
}

// ---- text comparisons --------------------------------------------------------------------------

/** Plain code-unit order (.NET's StringComparer.Ordinal, SQLite's BINARY). */
export function compareOrdinal(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

function upperChars(text: string): string {
  let out = '';
  for (const ch of text) {
    const up = ch.toUpperCase();
    out += up.length === ch.length ? up : ch;
  }
  return out;
}

/** .NET's StringComparer.OrdinalIgnoreCase: both sides in upper case, then plain order. */
export function compareOrdinalIgnoreCase(a: string, b: string): number {
  return compareOrdinal(upperChars(a), upperChars(b));
}

/** SQLite's NOCASE: only A-Z fold to a-z, then plain order. */
export function compareNoCase(a: string, b: string): number {
  return compareOrdinal(sqliteLower(a), sqliteLower(b));
}

/** SQLite's LOWER() without the ICU extension: only A-Z change. */
export function sqliteLower(text: string): string {
  return text.replace(/[A-Z]/g, (c) => c.toLowerCase());
}

/** SQLite's one-argument TRIM(): spaces only, not tabs or line breaks. */
export function sqliteTrim(text: string): string {
  return text.replace(/^ +| +$/g, '');
}

// ---- averages -------------------------------------------------------------------------------

/** LINQ's Average() over doubles: added up one by one, in order, then divided. */
export function linqAverage(values: readonly number[]): number {
  let sum = 0;
  for (const v of values) sum += v;
  return sum / values.length;
}

/**
 * SQLite's AVG() over REAL values: added up in the order the query saw the rows, with the
 * Kahan-Babuska-Neumaier correction SQLite uses (3.43 and later). Null for no values.
 */
export function sqliteAverage(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  let sum = 0;
  let err = 0;
  for (const r of values) {
    const t = sum + r;
    if (Math.abs(sum) > Math.abs(r)) err += sum - t + r;
    else err += r - t + sum;
    sum = t;
  }
  return (sum + err) / values.length;
}

/** A stable sort (JavaScript's own sort is stable), on a copy. */
export function sortedBy<T>(items: readonly T[], compare: (a: T, b: T) => number): T[] {
  return [...items].sort(compare);
}

/** Whole days from one "YYYY-MM-DD" to another (positive when `to` is later). */
export function daysBetween(from: string, to: string): number {
  const day = (iso: string): number => {
    const [y, m, d] = iso.split('-').map(Number) as [number, number, number];
    const date = new Date(Date.UTC(2000, m - 1, d));
    date.setUTCFullYear(y);
    return Math.round(date.getTime() / 86_400_000);
  };
  return day(to) - day(from);
}
