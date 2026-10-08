// Bridge load-out driver names to associate records. Ported from the old app's matching.py.
//
// The load-out sheet writes a first and last name where the associate export may add a middle
// one, so the two can't be joined on the raw text. Matching walks from strictest to loosest:
//
//   manual  - the user linked this driver by hand (always wins)
//   exact   - identical once normalised
//   name    - same first + last name, middle names ignored
//   fuzzy   - close enough on the full normalised string (typos)
//   none    - no candidate
//
// Anything below `exact` is worth showing the user, and ambiguous cases are never guessed: they
// are reported with their candidates so the user decides.

import type { Associate } from '../models/associates';
import type { DriverRow } from '../models/roster';
import { sequenceRatio } from './sequenceMatcher';

/** Below this ratio two names are considered unrelated. */
export const FUZZY_CUTOFF = 0.88;

const SUFFIXES = new Set(['jr', 'sr', 'ii', 'iii', 'iv', 'v']);

// Python's idea of whitespace, which both its `\s` and `str.split()` use.
const WS =
  '\\t\\n\\v\\f\\r\\x1c-\\x20\\x85\\xa0\\u1680\\u2000-\\u200a\\u2028\\u2029\\u202f\\u205f\\u3000';
const NOT_NAME_CHAR = new RegExp(`[^a-zA-Z${WS}'-]`, 'gu');
const WS_RUN = new RegExp(`[${WS}]+`, 'u');
// unicodedata.combining(c) is non-zero for combining marks. Nonspacing and enclosing marks are
// the close equivalent here; any other character outside a-z is turned into a space next anyway.
const COMBINING = /[\p{Mn}\p{Me}]/gu;

/** Lowercase, strip accents/punctuation/suffixes, collapse whitespace. */
export function normalizeName(name: string | null | undefined): string {
  const decomposed = (name ?? '').normalize('NFKD');
  const stripped = decomposed.replace(COMBINING, '');
  const cleaned = stripped.replace(NOT_NAME_CHAR, ' ').toLowerCase();
  return cleaned
    .split(WS_RUN)
    .filter((token) => token !== '' && !SUFFIXES.has(token))
    .join(' ');
}

/** [first, last] - the part both exports agree on. */
export function nameKey(name: string | null | undefined): [string, string] {
  const tokens = normalizeName(name).split(' ').filter(Boolean);
  if (tokens.length === 0) return ['', ''];
  if (tokens.length === 1) return [tokens[0] as string, ''];
  return [tokens[0] as string, tokens[tokens.length - 1] as string];
}

/** Stable key for storing a manual link against a driver name. */
export function driverKey(name: string | null | undefined): string {
  return normalizeName(name);
}

/** A name key as one piece of text, for use as a Map key. */
function keyText(key: readonly [string, string]): string {
  return `${key[0]}\u0000${key[1]}`;
}

export type MatchMethod = 'manual' | 'exact' | 'name' | 'fuzzy' | 'cleared' | 'none';

/** The outcome of matching one load-out driver. */
export interface Match {
  driverName: string;
  associate: Associate | null;
  method: MatchMethod;
  candidates: readonly Associate[];
}

export function createMatch(
  driverName: string,
  associate: Associate | null = null,
  method: MatchMethod = 'none',
  candidates: readonly Associate[] = [],
): Match {
  return { driverName, associate, method, candidates };
}

export function isMatched(match: Pick<Match, 'associate'>): boolean {
  return match.associate !== null;
}

export function isAmbiguous(match: Pick<Match, 'associate' | 'candidates'>): boolean {
  return match.associate === null && match.candidates.length > 1;
}

/** True when the user should look at this link. */
export function needsReview(match: Pick<Match, 'method'>): boolean {
  return match.method === 'fuzzy' || match.method === 'none';
}

const MATCH_LABELS: Record<string, string> = {
  manual: 'Linked by hand',
  exact: 'Exact name',
  name: 'First + last name',
  fuzzy: 'Close match - check',
  cleared: 'Marked not an associate',
};

export function matchLabel(match: Match): string {
  if (match.method === 'none') {
    return isAmbiguous(match) ? 'Ambiguous - pick one' : 'No associate found';
  }
  return MATCH_LABELS[match.method] ?? match.method;
}

/** Lookup tables built once per associate import. */
export class AssociateIndex {
  readonly byId = new Map<string, Associate>();
  readonly byFull = new Map<string, Associate[]>();
  /** Keyed by first + last joined with a NUL; `keyOf` gives the [first, last] back. */
  readonly byKey = new Map<string, Associate[]>();
  readonly byLast = new Map<string, Associate[]>();
  private readonly keys = new Map<string, [string, string]>();

  static build(associates: readonly Associate[]): AssociateIndex {
    const index = new AssociateIndex();
    for (const associate of associates) {
      if (associate.transporterId) index.byId.set(associate.transporterId, associate);
      push(index.byFull, normalizeName(associate.name), associate);
      const key = nameKey(associate.name);
      index.keys.set(keyText(key), key);
      push(index.byKey, keyText(key), associate);
      if (key[1]) push(index.byLast, key[1], associate);
    }
    return index;
  }

  /** Associates sharing this [first, last], in book order. */
  byNameKey(key: readonly [string, string]): Associate[] {
    return this.byKey.get(keyText(key)) ?? [];
  }

  /** First+last keys shared by more than one associate, in the order they were first seen. */
  collisions(): Array<[[string, string], Associate[]]> {
    const out: Array<[[string, string], Associate[]]> = [];
    for (const [text, group] of this.byKey) {
      if (group.length > 1) out.push([this.keys.get(text) as [string, string], group]);
    }
    return out;
  }
}

function push<K>(map: Map<K, Associate[]>, key: K, associate: Associate): void {
  const group = map.get(key);
  if (group) group.push(associate);
  else map.set(key, [associate]);
}

/** Links: driver key -> Transporter ID, or null for "not an associate". */
export type Links = ReadonlyMap<string, string | null>;

/** Resolve one driver name against the associate index. */
export function matchDriver(
  driverName: string,
  index: AssociateIndex,
  overrides: Links | null = null,
): Match {
  const key = driverKey(driverName);

  if (overrides && overrides.has(key)) {
    const transporterId = overrides.get(key);
    if (!transporterId) return createMatch(driverName, null, 'cleared');
    const associate = index.byId.get(transporterId);
    if (associate !== undefined) return createMatch(driverName, associate, 'manual');
    // The linked associate is gone from the current export - fall through.
  }

  const full = normalizeName(driverName);
  const exact = index.byFull.get(full) ?? [];
  if (exact.length === 1) return createMatch(driverName, exact[0] as Associate, 'exact');
  if (exact.length > 1) return createMatch(driverName, null, 'none', [...exact]);

  const candidates = index.byNameKey(nameKey(driverName));
  if (candidates.length === 1) return createMatch(driverName, candidates[0] as Associate, 'name');
  if (candidates.length > 1) return createMatch(driverName, null, 'none', [...candidates]);

  // Typo tolerance, limited to people sharing a surname where possible.
  const sameLast = index.byLast.get(nameKey(driverName)[1]);
  const pool =
    sameLast && sameLast.length > 0 ? sameLast : [...index.byFull.values()].flatMap((g) => g);
  let best: Associate | null = null;
  let bestScore = 0;
  for (const associate of pool) {
    const score = sequenceRatio(full, normalizeName(associate.name));
    if (score > bestScore) {
      best = associate;
      bestScore = score;
    }
  }
  if (best !== null && bestScore >= FUZZY_CUTOFF) {
    return createMatch(driverName, best, 'fuzzy', [best]);
  }

  // Deliberate, as in the old app: with no surname match the pool is the whole book, so up to five
  // unrelated people come back as candidates and the name reads as ambiguous.
  return createMatch(driverName, null, 'none', pool.slice(0, 5));
}

/** Match every driver in the roster. Keyed by normalised driver name. */
export function matchRoster(
  rows: readonly Pick<DriverRow, 'driver'>[],
  associates: readonly Associate[],
  overrides: Links | null = null,
): Map<string, Match> {
  const matches = new Map<string, Match>();
  if (associates.length === 0) return matches;
  const index = AssociateIndex.build(associates);
  // Deliberate, as in the old app: a later row whose name normalises alike replaces the earlier
  // one's entry but keeps its place (a dict comprehension), so counts are per key, not per row.
  for (const row of rows)
    matches.set(driverKey(row.driver), matchDriver(row.driver, index, overrides));
  return matches;
}

/** Counts per match method, for the header metrics. One per distinct driver key, not per row. */
export function summarise(matches: ReadonlyMap<string, Match>): Map<string, number> {
  const counts = new Map<string, number>();
  for (const match of matches.values()) {
    counts.set(match.method, (counts.get(match.method) ?? 0) + 1);
  }
  return counts;
}
