// Small text rules the importers share, spelled the way Python's string methods behave.

// Python's idea of whitespace (not JavaScript's: it counts \x1c-\x1f and \x85, and not the byte-order mark).
const WS =
  '\\t\\n\\v\\f\\r\\x1c-\\x20\\x85\\xa0\\u1680\\u2000-\\u200a\\u2028\\u2029\\u202f\\u205f\\u3000';
const WS_RUN = new RegExp(`[${WS}]+`, 'u');
const WS_EDGES = new RegExp(`^[${WS}]+|[${WS}]+$`, 'gu');

/** Python's `text.strip()`. */
export function pyStrip(text: string): string {
  return text.replace(WS_EDGES, '');
}

/** Python's `" ".join(text.split())`: trim and squeeze every run of spaces to one. */
export function squeeze(text: string): string {
  return text
    .split(WS_RUN)
    .filter((part) => part !== '')
    .join(' ');
}

/** Lowercased, with everything but letters and digits taken out: how headers are compared. */
export function alnumKey(text: string): string {
  return Array.from(text.toLowerCase())
    .filter((char) => /[\p{L}\p{N}]/u.test(char))
    .join('');
}

// The control characters are the point: they are line breaks to Python.
// eslint-disable-next-line no-control-regex
const LINE_BREAK = new RegExp('\\r\\n|[\\n\\r\\v\\f\\x1c\\x1d\\x1e\\x85\\u2028\\u2029]');

/** Python's `text.splitlines()` for text with only the usual line breaks. */
export function splitLines(text: string): string[] {
  const lines = text.split(LINE_BREAK);
  // A final line break does not start another line.
  if (lines.length > 0 && lines[lines.length - 1] === '') lines.pop();
  return lines;
}
