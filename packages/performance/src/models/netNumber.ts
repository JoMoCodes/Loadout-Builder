// Reading a number from text the way the old app's .NET code did. Used by the file readers and
// by the averages (which read the stored metric text back as numbers).

const PLAIN_NUMBER = /^(\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?$/;

/**
 * A number the way .NET's `double.TryParse(text, NumberStyles.Any, InvariantCulture)` reads it:
 * spaces around it, a sign in front or behind, brackets for a negative, thousands commas before
 * the decimal point, an exponent, and the invariant currency sign are all allowed. Null otherwise.
 */
export function parseNetNumber(raw: string): number | null {
  let text = raw.trim().replace(/¤/g, '').trim();
  let negative = false;
  if (text.startsWith('(') && text.endsWith(')')) {
    negative = true;
    text = text.slice(1, -1).trim();
  }
  if (/^[+-]/.test(text)) {
    if (text[0] === '-') negative = !negative;
    text = text.slice(1);
  } else if (/[+-]$/.test(text)) {
    if (text.endsWith('-')) negative = !negative;
    text = text.slice(0, -1);
  }
  const point = text.indexOf('.');
  const whole = point < 0 ? text : text.slice(0, point);
  const rest = point < 0 ? '' : text.slice(point);
  if (rest.includes(',') || whole.startsWith(',')) return null;
  text = whole.replace(/,/g, '') + rest;
  if (!PLAIN_NUMBER.test(text)) return null;
  const value = Number(text);
  if (!Number.isFinite(value)) return null;
  return negative ? -value : value;
}
