// Name helpers, ported from the old tableParsers.js. Matching is always by Transporter ID; the
// name check only warns when the name on the Routes file does not fit the driver list.

/** Squeezes runs of spaces to one and trims the ends. */
export const norm = (s: unknown): string =>
  String(s ?? '')
    .replace(/\s+/g, ' ')
    .trim();

/** Splits a person name into lowercase word tokens for comparison. */
export function nameTokens(name: unknown): string[] {
  return norm(name)
    .toLowerCase()
    .replace(/[^a-z\s'-]/g, ' ')
    .split(/\s+/)
    .filter(Boolean);
}

/**
 * Checks that the name printed next to a Transporter ID on the routes file plausibly belongs to the
 * roster entry (every word of the short name appears in the roster name). Matching is always by ID;
 * this only exists to catch a wrong ID typed against the wrong person.
 */
export function namesAgree(routesName: unknown, rosterName: unknown): boolean {
  const a = nameTokens(routesName);
  const b = new Set(nameTokens(rosterName));
  if (!a.length || !b.size) return true;
  return a.every((t) => b.has(t));
}
