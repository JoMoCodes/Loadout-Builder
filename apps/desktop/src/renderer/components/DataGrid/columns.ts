// The bridge between the grid's columns and TanStack Table.

import type { ColumnDef, SortingFn } from '@tanstack/react-table';
import { compareCellText } from './sort';
import type { GridColumn } from './types';

/** Every grid column sorts by the old app's rule (see sort.ts). */
export function gridSortingFn<Row>(): SortingFn<Row> {
  return (a, b, columnId) =>
    compareCellText(String(a.getValue(columnId) ?? ''), String(b.getValue(columnId) ?? ''));
}

export function toColumnDefs<Row>(columns: readonly GridColumn<Row>[]): ColumnDef<Row, string>[] {
  const sortingFn = gridSortingFn<Row>();
  return columns.map((column) => ({
    id: column.id,
    header: column.header,
    accessorFn: (row: Row) => column.value(row),
    enableSorting: column.sortable !== false,
    enableHiding: column.hideable !== false,
    sortingFn,
  }));
}

/**
 * Sorting as the old tables did it: a click sorts A to Z, the next click reverses it, and it
 * never quietly drops back to unsorted (the Reset button does that). One column at a time.
 */
export const GRID_TABLE_OPTIONS = {
  enableSortingRemoval: false,
  enableMultiSort: false,
  sortDescFirst: false,
} as const;
