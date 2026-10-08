// Where each table keeps its column order and hand-set widths (the saved data's own tables).
// Hidden columns are not here: see PAGE-PATTERN.md.

import { arrayOf, filled, number, recordOf, shape } from './check';
import { as, defineCommand, defineQuery } from './define';

export interface GridLayoutRecord {
  /** Column ids left to right. Empty means "as the page built it". */
  order: string[];
  /** Only the columns somebody resized by hand, in pixels at normal text size. */
  widths: Record<string, number>;
}

const view = filled(64);

export const layoutChannels = [
  defineQuery('layout:get', {
    input: shape({ view }),
    result: as<GridLayoutRecord>(),
  }),
  /** Replaces the table's layout. Quiet: moving a column is not a change to the day's data. */
  defineCommand('layout:set', {
    input: shape({
      view,
      order: arrayOf(filled(64), 200),
      widths: recordOf(number, 200),
    }),
    result: as<null>(),
    quiet: true,
  }),
] as const;
