// How a grid column sorts: the old app's rule, shared with the printed sheet through
// `sortKey` in @loadout/core. Clock times in time order, numbers as numbers (van 51 before
// 619454 before "655103 (LMR)"), empty cells last.
//
// Reversing works like Python's `sorted(..., reverse=True)` did in the old tables: the
// comparison is flipped, and rows that compare equal keep the page's own order.

import { compareKeys, sortKey, type SortKey } from '@loadout/core';

// Sorting compares each cell many times; the key for a given text never changes.
const cache = new Map<string, SortKey>();
const CACHE_LIMIT = 20_000;

export function cachedSortKey(text: string): SortKey {
  let key = cache.get(text);
  if (key === undefined) {
    if (cache.size >= CACHE_LIMIT) cache.clear();
    key = sortKey(text);
    cache.set(text, key);
  }
  return key;
}

/** Compare two cells the way the old app's tables did, ascending. */
export function compareCellText(a: string, b: string): number {
  return compareKeys(cachedSortKey(a), cachedSortKey(b));
}

/**
 * Sort rows by one column's text. `reverse` flips the order but keeps equal rows in the
 * order they came in, as the old app did. Returns a new array.
 */
export function sortRows<Row>(
  rows: readonly Row[],
  text: (row: Row) => string,
  reverse = false,
): Row[] {
  const direction = reverse ? -1 : 1;
  return rows
    .map((row, index) => ({ row, index, text: text(row) }))
    .sort((a, b) => compareCellText(a.text, b.text) * direction || a.index - b.index)
    .map((item) => item.row);
}
