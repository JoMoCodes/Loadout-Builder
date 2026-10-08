// Columns nobody has resized size themselves to their contents, as in the old app: the widest
// cell or the heading, whichever is wider, measured against the whole table (not just the rows
// a search left showing), so columns hold still while you type.

import { MIN_COLUMN_WIDTH } from './layout';

// The old app's padding either side of the text, and its cap on any one column, at normal
// text size. The heading allowance covers the sort arrow.
export const CELL_PADDING = 20;
export const HEADING_PADDING = 32;
export const MAX_COLUMN_WIDTH = 420;

export interface FitColumn<Row> {
  id: string;
  header: string;
  /** The text the cell shows (or its widest likely rendering). */
  text: (row: Row) => string;
  /** Extra room the cell needs beyond its text, such as a chip's icon and padding. */
  extra?: number;
}

/**
 * Width per column, in CSS pixels at the current text size. `scale` is the A+/A- factor;
 * `measureCell` and `measureHeading` return text widths in pixels at that size.
 */
export function fitWidths<Row>(
  columns: readonly FitColumn<Row>[],
  rows: readonly Row[],
  measureCell: (text: string) => number,
  measureHeading: (text: string) => number,
  scale = 1,
): Record<string, number> {
  const widths: Record<string, number> = {};
  for (const column of columns) {
    // Measure each distinct text once: a 500-row roster repeats a lot of values.
    let widest = 0;
    const seen = new Set<string>();
    for (const row of rows) {
      const text = column.text(row);
      if (seen.has(text)) continue;
      seen.add(text);
      widest = Math.max(widest, measureCell(text));
    }
    const cell = widest + (CELL_PADDING + (column.extra ?? 0)) * scale;
    const heading = measureHeading(column.header) + HEADING_PADDING * scale;
    const width = Math.max(cell, heading);
    widths[column.id] = Math.round(
      Math.max(MIN_COLUMN_WIDTH * scale, Math.min(width, MAX_COLUMN_WIDTH * scale)),
    );
  }
  return widths;
}
