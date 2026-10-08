// The filter bar's rules, kept apart from the screen so they can be tested on their own.

export interface FilterInput<Row> {
  /** The page's own filter, applied first. */
  pageFilter?: ((row: Row) => boolean) | undefined;
  needsAttention?: ((row: Row) => boolean) | undefined;
  attentionOnly: boolean;
  /** The chips switched on; a row shows if it matches any of them. */
  chips: ReadonlyArray<(row: Row) => boolean>;
  /** Free text, matched against the text of every visible column. */
  query: string;
  texts: ReadonlyArray<(row: Row) => string>;
}

/** Rows that pass every filter, in their original order. */
export function filterRows<Row>(rows: readonly Row[], input: FilterInput<Row>): Row[] {
  const query = input.query.trim().toLowerCase();
  return rows.filter((row) => {
    if (input.pageFilter && !input.pageFilter(row)) return false;
    if (input.attentionOnly && input.needsAttention && !input.needsAttention(row)) return false;
    if (input.chips.length > 0 && !input.chips.some((match) => match(row))) return false;
    if (query && !input.texts.some((text) => text(row).toLowerCase().includes(query))) return false;
    return true;
  });
}
