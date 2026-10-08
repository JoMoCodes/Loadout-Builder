import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import type { Tone } from '../../ui/chip';
import type { GridLayoutStore } from './layout';

export interface GridColumn<Row> {
  /** Stable id. Saved layouts are keyed on it, so never rename one lightly. */
  id: string;
  /** The heading, in the words people see in the app. */
  header: string;
  /** The cell's text. Sorting, searching and auto-width all read this. */
  value: (row: Row) => string;
  /** Draw the cell yourself (a chip, badges). Defaults to the text, or "-" when empty. */
  cell?: (row: Row) => ReactNode;
  align?: 'left' | 'center' | 'right';
  /** Extra width the custom cell needs beyond its text (a chip's icon and padding). */
  fitExtra?: number;
  /** Defaults to true. A column that should keep the page's own order can turn it off. */
  sortable?: boolean;
  /** Defaults to true. */
  hideable?: boolean;
  /** Start hidden until someone shows it from the Columns menu. */
  hiddenByDefault?: boolean;
  /** Use the monospace font (VINs, IDs). */
  mono?: boolean;
}

export interface RowAction<Row> {
  id: string;
  /** Menu words, for example "Reassign this van...". */
  label: string;
  icon?: LucideIcon;
  /**
   * Which cells offer it. The old app's menus only offered what made sense for the column
   * that was clicked; return false to leave the action out for this row and column.
   */
  appliesTo?: (row: Row, columnId: string) => boolean;
  disabled?: (row: Row, columnId: string) => boolean;
  /** Red text, for actions that take something away. */
  danger?: boolean;
  /** Draw a line above this item. */
  separatorBefore?: boolean;
  onSelect: (row: Row, columnId: string) => void;
}

export interface ColumnAction {
  id: string;
  label: string;
  icon?: LucideIcon;
  appliesTo?: (columnId: string) => boolean;
  onSelect: (columnId: string) => void;
}

/** A quick filter shown as a coloured chip with words and a count in the filter bar. */
export interface StatusChipFilter<Row> {
  id: string;
  label: string;
  tone: Tone;
  icon?: LucideIcon | null;
  match: (row: Row) => boolean;
}

export type RowTone = Tone | 'ghost';

export interface EmptyCopy {
  title: string;
  body?: string;
  action?: ReactNode;
}

export interface DataGridProps<Row> {
  /** Which table this is; its layout is saved under this name (the old app used "roster"). */
  view: string;
  /** Read by screen readers as the table's name. */
  label: string;
  columns: readonly GridColumn<Row>[];
  rows: readonly Row[];
  getRowId: (row: Row) => string;

  /** Where column order and widths are kept. Defaults to the window's storage. */
  layoutStore?: GridLayoutStore;

  /** Right-click menu items for cells; also what Enter, Space and double-click do. */
  rowActions?: readonly RowAction<Row>[];
  /** Shown in the menu when no action fits the cell clicked. */
  noActionText?: string;
  /** Overrides what Enter, Space and double-click do. Defaults to the first action that fits. */
  onRowActivate?: (row: Row, columnId: string) => void;
  /** Extra items for the right-click menu on a heading. */
  columnActions?: readonly ColumnAction[];

  /** Turns on the "Needs attention" switch; rows it returns true for are flagged. */
  needsAttention?: (row: Row) => boolean;
  /** Coloured quick-filter chips in the filter bar. */
  statusChips?: readonly StatusChipFilter<Row>[];
  /** The page's own filters (shift type, say), applied before the grid's. */
  filter?: (row: Row) => boolean;
  /** The page's own controls, drawn in the filter bar after the search box. */
  filterControls?: ReactNode;
  /** Called by the Reset button so the page can reset its own filters too. */
  onResetFilters?: () => void;
  searchPlaceholder?: string;

  /** A stripe and text tint for the whole row: problems, warnings, greyed-out rows. */
  rowTone?: (row: Row) => RowTone | undefined;

  /** Draws the panel on the right for the selected row. Leave out for no panel. */
  renderDetail?: (row: Row, close: () => void) => ReactNode;
  onSelectionChange?: (row: Row | null) => void;

  loading?: boolean;
  loadingText?: string;
  /** What an empty table says, before any filter. */
  empty?: EmptyCopy;

  /** Plain-words notes for the app's status line ("Moved Vehicle after Routes."). */
  onStatus?: (message: string) => void;
  className?: string;
}
