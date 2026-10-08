// The grid sorts the way the old app's tables did (models.sort_key and ColumnSorter).

import {
  createTable,
  getCoreRowModel,
  getSortedRowModel,
  type SortingState,
} from '@tanstack/react-table';
import { describe, expect, it } from 'vitest';
import { GRID_TABLE_OPTIONS, toColumnDefs } from './columns';
import { compareCellText, sortRows } from './sort';
import type { GridColumn } from './types';

interface Row {
  id: string;
  cell: string;
}

const rows = (cells: string[]): Row[] => cells.map((cell, at) => ({ id: `r${at}`, cell }));
const cells = (list: Row[]) => list.map((row) => row.cell);

/** Sort through TanStack Table, with the options and column definitions the grid uses. */
function tableSort(list: Row[], desc: boolean): Row[] {
  const columns: GridColumn<Row>[] = [{ id: 'cell', header: 'Cell', value: (row) => row.cell }];
  const sorting: SortingState = [{ id: 'cell', desc }];
  const table = createTable<Row>({
    data: list,
    columns: toColumnDefs(columns),
    getRowId: (row) => row.id,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    onStateChange: () => undefined,
    renderFallbackValue: null,
    state: {},
    ...GRID_TABLE_OPTIONS,
  });
  table.setOptions((prev) => ({ ...prev, state: { ...table.initialState, sorting } }));
  return table.getRowModel().rows.map((row) => row.original);
}

describe('grid sorting', () => {
  it('puts clock times in time order: 9:50am before 10:20am', () => {
    expect(cells(sortRows(rows(['10:20am', '1:05pm', '9:50am']), (r) => r.cell))).toEqual([
      '9:50am',
      '10:20am',
      '1:05pm',
    ]);
  });

  it('reads van numbers as numbers: 51, then 619454, then 655103 (LMR)', () => {
    expect(cells(sortRows(rows(['655103 (LMR)', '619454', '51']), (r) => r.cell))).toEqual([
      '51',
      '619454',
      '655103 (LMR)',
    ]);
  });

  it('sinks empty cells (and "-") to the bottom', () => {
    expect(cells(sortRows(rows(['', 'CX2', '-', 'CX10', 'AX1']), (r) => r.cell))).toEqual([
      'AX1',
      'CX2',
      'CX10',
      '',
      '-',
    ]);
  });

  it('reverses like the old tables did, keeping equal rows in the page order', () => {
    const list = rows(['b', 'a', 'b', 'c']);
    const reversed = sortRows(list, (r) => r.cell, true);
    expect(reversed.map((r) => r.id)).toEqual(['r3', 'r0', 'r2', 'r1']);
  });

  it('compares cells through the core sort key', () => {
    expect(compareCellText('9:50am', '10:20am')).toBeLessThan(0);
    expect(compareCellText('', 'zzz')).toBeGreaterThan(0);
    expect(compareCellText('X', 'X')).toBe(0);
  });

  it('TanStack Table, set up as the grid sets it up, gives the same order both ways', () => {
    const list = rows(['655103 (LMR)', '', '51', '10:20am', '9:50am', 'b', '619454', 'b', '-']);
    expect(tableSort(list, false).map((r) => r.id)).toEqual(
      sortRows(list, (r) => r.cell).map((r) => r.id),
    );
    expect(tableSort(list, true).map((r) => r.id)).toEqual(
      sortRows(list, (r) => r.cell, true).map((r) => r.id),
    );
  });
});
