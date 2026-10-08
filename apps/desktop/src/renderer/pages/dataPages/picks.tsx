// Picking several rows. The old tables let you select many with Ctrl and Shift; the new table
// follows one row at a time, so these pages add a "Pick" tick box as the first column. The buttons
// above the table act on the ticked rows, or on the row you are on when none are ticked.

import { useCallback, useMemo, useState } from 'react';
import type { GridColumn } from '../../components/DataGrid';

export interface Picks {
  /** Ids ticked. */
  ids: ReadonlySet<string>;
  toggle: (id: string) => void;
  clear: () => void;
  /** The "Pick" column for a table whose rows have this id. */
  column: <Row>(getId: (row: Row) => string) => GridColumn<Row>;
}

export function usePicks(): Picks {
  const [ids, setIds] = useState<ReadonlySet<string>>(new Set());

  const toggle = useCallback((id: string) => {
    setIds((now) => {
      const next = new Set(now);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);
  const clear = useCallback(() => setIds(new Set()), []);

  const column = useCallback(
    <Row,>(getId: (row: Row) => string): GridColumn<Row> => ({
      id: 'pick',
      header: 'Pick',
      value: () => '',
      cell: (row) => {
        const id = getId(row);
        return (
          // A double-click on the tick box should tick it, not run the row's own action.
          <span onDoubleClick={(event) => event.stopPropagation()} className="flex items-center">
            <input
              type="checkbox"
              checked={ids.has(id)}
              onChange={() => toggle(id)}
              aria-label="Pick this row"
              data-testid="pick-row"
              tabIndex={-1}
            />
          </span>
        );
      },
      align: 'center',
      sortable: false,
      hideable: false,
      fitExtra: 28,
    }),
    [ids, toggle],
  );

  return useMemo(() => ({ ids, toggle, clear, column }), [ids, toggle, clear, column]);
}

/**
 * The rows a button should act on: the ticked ones (in the table's own order), else the row the
 * person is on. An empty list means nothing is chosen.
 */
export function chosenRows<Row>(
  all: readonly Row[],
  getId: (row: Row) => string,
  picks: ReadonlySet<string>,
  current: Row | null,
): Row[] {
  const ticked = all.filter((row) => picks.has(getId(row)));
  if (ticked.length > 0) return ticked;
  return current ? [current] : [];
}

/** A right-click on a row acts on all ticked rows if that row is one of them, else on that row. */
export function rowsForMenu<Row>(
  all: readonly Row[],
  getId: (row: Row) => string,
  picks: ReadonlySet<string>,
  clicked: Row,
): Row[] {
  return picks.has(getId(clicked)) ? all.filter((row) => picks.has(getId(row))) : [clicked];
}
