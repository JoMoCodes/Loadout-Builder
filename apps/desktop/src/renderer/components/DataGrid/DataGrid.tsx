// The app's table. Every page with rows uses it: dense rows with a sticky heading, only the
// rows on screen drawn (so a 500-row roster scrolls smoothly), columns you can drag, resize,
// sort and hide, a filter bar on top, right-click menus, an optional detail panel, and full
// keyboard use. Sorting, column order and widths follow the old app's rules.

import {
  getCoreRowModel,
  getSortedRowModel,
  useReactTable,
  type SortingState,
} from '@tanstack/react-table';
import { useVirtualizer } from '@tanstack/react-virtual';
import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  EyeOff,
  Inbox,
  LoaderCircle,
  MoveHorizontal,
  RotateCcw,
  SearchX,
  X,
} from 'lucide-react';
import {
  memo,
  useCallback,
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from 'react';
import { useRootFontSize } from '../../lib/useRootFontSize';
import { Button } from '../../ui/button';
import { cn } from '../../ui/cn';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuLabel,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from '../../ui/context-menu';
import { fitWidths } from './autofit';
import { GRID_TABLE_OPTIONS, toColumnDefs } from './columns';
import { FilterBar } from './FilterBar';
import { filterRows } from './filter';
import { localStorageLayoutStore, MIN_COLUMN_WIDTH, moveColumn, reconcileLayout } from './layout';
import { gridFonts, textMeasurer } from './measure';
import type { DataGridProps, GridColumn, RowAction, RowTone } from './types';
import { useGridLayout } from './useGridLayout';

const defaultLayoutStore = localStorageLayoutStore();

/**
 * What a list prop falls back to when the page leaves it out. One shared array, not a fresh `[]`
 * on every render: a new array each time makes the rows recompute and the table redraw forever.
 */
const NONE: readonly never[] = [];

/** Pixels a heading has to travel before a press counts as a drag (the old app's slop). */
const DRAG_SLOP = 4;
const HEADER = -1;

interface ActiveCell {
  /** Row id, or null for the heading row. */
  rowId: string | null;
  col: number;
}

type MenuTarget =
  { kind: 'header'; columnId: string } | { kind: 'cell'; rowId: string; columnId: string };

interface DragState {
  source: string;
  target: string | null;
  after: boolean;
  cancel: boolean;
}

const TONE_STRIPE: Record<RowTone, string> = {
  bad: 'shadow-[inset_3px_0_0_var(--bad)]',
  warn: 'shadow-[inset_3px_0_0_var(--warn)]',
  ok: 'shadow-[inset_3px_0_0_var(--ok)]',
  info: 'shadow-[inset_3px_0_0_var(--info)]',
  neutral: '',
  ghost: 'text-faint',
};

function alignClass(align: GridColumn<unknown>['align']): string {
  return align === 'center'
    ? 'justify-center text-center'
    : align === 'right'
      ? 'justify-end text-right'
      : '';
}

interface RowProps<Row> {
  row: Row;
  rowId: string;
  index: number;
  columns: readonly GridColumn<Row>[];
  widths: readonly number[];
  totalWidth: number;
  start: number;
  height: number;
  selected: boolean;
  /** The column index holding focus in this row, or -1. */
  activeCol: number;
  tone: RowTone | undefined;
}

function GridRowInner<Row>({
  row,
  rowId,
  index,
  columns,
  widths,
  totalWidth,
  start,
  height,
  selected,
  activeCol,
  tone,
}: RowProps<Row>) {
  return (
    <div
      role="row"
      aria-rowindex={index + 2}
      aria-selected={selected}
      data-row-id={rowId}
      data-row-index={index}
      data-tone={tone}
      className={cn(
        'absolute top-0 left-0 flex border-b border-line/60',
        index % 2 === 1 ? 'bg-row-stripe' : 'bg-surface',
        'hover:bg-row-hover',
        selected && 'bg-row-selected hover:bg-row-selected',
        tone ? TONE_STRIPE[tone] : '',
      )}
      style={{ height, width: totalWidth, minWidth: '100%', transform: `translateY(${start}px)` }}
    >
      {columns.map((column, col) => {
        const text = column.value(row);
        return (
          <div
            key={column.id}
            role="gridcell"
            aria-colindex={col + 1}
            data-cell={`${index}:${col}`}
            data-col-id={column.id}
            tabIndex={activeCol === col ? 0 : -1}
            className={cn(
              'flex shrink-0 items-center overflow-hidden px-2.5 whitespace-nowrap outline-none',
              'focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-focus',
              column.mono && 'font-mono text-[0.93em]',
              alignClass(column.align),
            )}
            style={{ width: widths[col] }}
          >
            {column.cell ? (
              column.cell(row)
            ) : text ? (
              <span className="truncate">{text}</span>
            ) : (
              <span className="text-faint" aria-label="empty">
                -
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}

const GridRow = memo(GridRowInner) as typeof GridRowInner;

export function DataGrid<Row>(props: DataGridProps<Row>) {
  const {
    view,
    label,
    columns,
    rows,
    getRowId,
    layoutStore = defaultLayoutStore,
    rowActions = NONE,
    columnActions = NONE,
    needsAttention,
    statusChips = NONE,
    rowTone,
    renderDetail,
    onSelectionChange,
    onStatus,
  } = props;

  const fontPx = useRootFontSize();
  const scale = fontPx / 14;
  const rowHeight = Math.round(fontPx * 2);
  const headerHeight = Math.round(fontPx * 2.25);

  // ------------------------------------------------------------------ layout
  const columnIds = useMemo(() => columns.map((column) => column.id), [columns]);
  const hiddenByDefault = useMemo(
    () => columns.filter((c) => c.hiddenByDefault).map((c) => c.id),
    [columns],
  );
  const { layout, update: updateLayout } = useGridLayout(
    view,
    columnIds,
    layoutStore,
    hiddenByDefault,
  );
  const byId = useMemo(() => new Map(columns.map((column) => [column.id, column])), [columns]);
  const visibleColumns = useMemo(
    () =>
      layout.order
        .filter((id) => !layout.hidden.includes(id))
        .map((id) => byId.get(id))
        .filter((column): column is GridColumn<Row> => column !== undefined),
    [layout, byId],
  );

  // --------------------------------------------------------------- messages
  const [message, setMessage] = useState('');
  const announce = useCallback(
    (text: string) => {
      setMessage(text);
      onStatus?.(text);
    },
    [onStatus],
  );

  // ----------------------------------------------------------------- filters
  const searchRef = useRef<HTMLInputElement>(null);
  const [search, setSearch] = useState('');
  const query = useDeferredValue(search);
  const [attentionOnly, setAttentionOnly] = useState(false);
  const [chipsOn, setChipsOn] = useState<string[]>([]);

  const pageRows = useMemo(
    () => (props.filter ? rows.filter(props.filter) : [...rows]),
    [rows, props.filter],
  );
  const filtered = useMemo(
    () =>
      filterRows(pageRows, {
        needsAttention,
        attentionOnly,
        chips: statusChips.filter((chip) => chipsOn.includes(chip.id)).map((chip) => chip.match),
        query,
        texts: visibleColumns.map((column) => column.value),
      }),
    [pageRows, needsAttention, attentionOnly, statusChips, chipsOn, query, visibleColumns],
  );
  const attentionCount = useMemo(
    () => (needsAttention ? pageRows.reduce((n, row) => n + (needsAttention(row) ? 1 : 0), 0) : 0),
    [pageRows, needsAttention],
  );
  const chipStates = useMemo(
    () =>
      statusChips.map((chip) => ({
        chip,
        on: chipsOn.includes(chip.id),
        count: pageRows.reduce((n, row) => n + (chip.match(row) ? 1 : 0), 0),
      })),
    [statusChips, chipsOn, pageRows],
  );

  // ----------------------------------------------------------------- sorting
  const [sorting, setSorting] = useState<SortingState>([]);
  const columnDefs = useMemo(() => toColumnDefs(columns), [columns]);
  const columnVisibility = useMemo(
    () => Object.fromEntries(layout.hidden.map((id) => [id, false])),
    [layout.hidden],
  );
  // eslint-disable-next-line react-hooks/incompatible-library -- TanStack Table hands back fresh functions each render; nothing here memoises them
  const table = useReactTable({
    data: filtered,
    columns: columnDefs,
    getRowId: (row) => getRowId(row),
    state: { sorting, columnOrder: layout.order, columnVisibility },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    ...GRID_TABLE_OPTIONS,
  });
  const tableRows = table.getRowModel().rows;
  const indexById = useMemo(
    () => new Map(tableRows.map((row, index) => [row.id, index])),
    [tableRows],
  );

  const sortBy = useCallback(
    (columnId: string, desc?: boolean) => {
      const column = byId.get(columnId);
      if (!column || column.sortable === false) return;
      const current = sorting[0];
      const nextDesc = desc ?? (current?.id === columnId ? !current.desc : false);
      setSorting([{ id: columnId, desc: nextDesc }]);
      // A new order starts from the top, so what you see is the start of it.
      if (scrollRef.current) scrollRef.current.scrollTop = 0;
      announce(`Sorted by ${column.header}${nextDesc ? ', reversed' : ''}.`);
    },
    [byId, sorting, announce],
  );

  // ------------------------------------------------------------------ widths
  const [liveWidth, setLiveWidth] = useState<{ id: string; width: number } | null>(null);
  const autoWidths = useMemo(() => {
    const fonts = gridFonts();
    const cell = textMeasurer(`${fontPx}px ${fonts.ui}`, fontPx);
    const mono = textMeasurer(`${fontPx * 0.93}px ${fonts.mono}`, fontPx);
    const heading = textMeasurer(`600 ${fontPx}px ${fonts.ui}`, fontPx);
    // Measured against every row, filtered or not, so columns hold still while you search.
    const plain = fitWidths(
      columns
        .filter((c) => !c.mono)
        .map((c) => ({ id: c.id, header: c.header, text: c.value, extra: c.fitExtra })),
      rows,
      cell,
      heading,
      scale,
    );
    const monos = fitWidths(
      columns
        .filter((c) => c.mono)
        .map((c) => ({ id: c.id, header: c.header, text: c.value, extra: c.fitExtra })),
      rows,
      mono,
      heading,
      scale,
    );
    return { ...plain, ...monos };
  }, [columns, rows, fontPx, scale]);

  const widthOf = useCallback(
    (id: string) => {
      if (liveWidth?.id === id) return liveWidth.width;
      const hand = layout.widths[id];
      return hand !== undefined ? Math.round(hand * scale) : (autoWidths[id] ?? 120);
    },
    [liveWidth, layout.widths, autoWidths, scale],
  );
  const widths = useMemo(() => visibleColumns.map((c) => widthOf(c.id)), [visibleColumns, widthOf]);
  const totalWidth = useMemo(() => widths.reduce((sum, w) => sum + w, 0), [widths]);

  // ----------------------------------------------------------- virtual rows
  const scrollRef = useRef<HTMLDivElement>(null);
  const headerRowRef = useRef<HTMLDivElement>(null);
  const virtualizer = useVirtualizer({
    count: tableRows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => rowHeight,
    overscan: 12,
    scrollMargin: headerHeight,
    scrollPaddingStart: headerHeight,
    getItemKey: (index) => tableRows[index]?.id ?? index,
    // Draw scrolled-in rows on React's normal schedule rather than forcing it per scroll event.
    useFlushSync: false,
  });
  useEffect(() => {
    virtualizer.measure();
  }, [virtualizer, rowHeight, headerHeight]);
  const virtualRows = virtualizer.getVirtualItems();

  // ----------------------------------------------------- focus and selection
  const [active, setActive] = useState<ActiveCell>({ rowId: null, col: 0 });
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [focusTick, setFocusTick] = useState(0);
  const [detailOpen, setDetailOpen] = useState(true);
  const pendingFocus = useRef(false);

  const activeIndex = active.rowId === null ? HEADER : (indexById.get(active.rowId) ?? HEADER);
  const activeCol = Math.min(active.col, Math.max(visibleColumns.length - 1, 0));
  const selectedRow =
    selectedId === null ? null : (tableRows[indexById.get(selectedId) ?? -1]?.original ?? null);

  const select = useCallback(
    (rowId: string | null) => {
      setSelectedId(rowId);
      const index = rowId === null ? undefined : indexById.get(rowId);
      onSelectionChange?.(index === undefined ? null : (tableRows[index]?.original ?? null));
    },
    [indexById, tableRows, onSelectionChange],
  );

  const moveTo = useCallback(
    (index: number, col: number) => {
      const rowId = index === HEADER ? null : (tableRows[index]?.id ?? null);
      setActive({ rowId, col });
      if (rowId !== null) select(rowId);
      // Rows are all one height, so where a row sits is known without drawing it: scroll there
      // now, and the focus follows once the row is drawn.
      const scroller = scrollRef.current;
      if (scroller && index >= 0) {
        const top = index * rowHeight;
        const view = scroller.clientHeight - headerHeight;
        if (top < scroller.scrollTop) scroller.scrollTop = top;
        else if (top + rowHeight > scroller.scrollTop + view) {
          scroller.scrollTop = top + rowHeight - view;
        }
      }
      pendingFocus.current = true;
      setFocusTick((tick) => tick + 1);
    },
    [tableRows, select, rowHeight, headerHeight],
  );

  // Put the keyboard focus on the active cell once it is drawn.
  useEffect(() => {
    if (!pendingFocus.current) return;
    const scroller = scrollRef.current;
    if (!scroller) return;
    const cell = scroller.querySelector<HTMLElement>(`[data-cell="${activeIndex}:${activeCol}"]`);
    if (!cell) return; // the effect runs again once the row is drawn
    pendingFocus.current = false;
    cell.focus({ preventScroll: true });
    // Sideways: keep the focused cell in view.
    const left = widths.slice(0, activeCol).reduce((sum, w) => sum + w, 0);
    const right = left + (widths[activeCol] ?? 0);
    if (left < scroller.scrollLeft) scroller.scrollLeft = left;
    else if (right > scroller.scrollLeft + scroller.clientWidth)
      scroller.scrollLeft = right - scroller.clientWidth;
  }, [focusTick, activeIndex, activeCol, virtualRows, widths]);

  // ----------------------------------------------------------------- actions
  const actionsFor = useCallback(
    (row: Row, columnId: string): RowAction<Row>[] =>
      rowActions.filter((action) => (action.appliesTo ? action.appliesTo(row, columnId) : true)),
    [rowActions],
  );

  const activate = useCallback(
    (index: number, col: number) => {
      const row = tableRows[index]?.original;
      const column = visibleColumns[col];
      if (row === undefined || !column) return;
      if (props.onRowActivate) {
        props.onRowActivate(row, column.id);
        return;
      }
      const action = actionsFor(row, column.id).find((a) => !a.disabled?.(row, column.id));
      if (action) action.onSelect(row, column.id);
      else announce(props.noActionText ?? 'Nothing to do on this column.');
    },
    [tableRows, visibleColumns, props, actionsFor, announce],
  );

  // ------------------------------------------------------------ the layout
  const resetLayout = useCallback(() => {
    updateLayout(() => reconcileLayout(columnIds, { hidden: hiddenByDefault }));
    announce('Columns back to their original order and widths.');
  }, [updateLayout, columnIds, hiddenByDefault, announce]);

  const placeColumn = useCallback(
    (order: string[], moved: string) => {
      updateLayout((current) => ({ ...current, order }));
      const shown = order.filter((id) => !layout.hidden.includes(id));
      const place = shown.indexOf(moved);
      const header = byId.get(moved)?.header ?? moved;
      const before = place > 0 ? byId.get(shown[place - 1] as string)?.header : undefined;
      announce(before ? `Moved ${header} after ${before}.` : `Moved ${header} first.`);
    },
    [updateLayout, layout.hidden, byId, announce],
  );

  const nudgeColumn = useCallback(
    (id: string, step: -1 | 1) => {
      const at = visibleColumns.findIndex((c) => c.id === id);
      const neighbour = visibleColumns[at + step];
      if (!neighbour) return;
      placeColumn(moveColumn(layout.order, id, neighbour.id), id);
    },
    [visibleColumns, layout.order, placeColumn],
  );

  const toggleColumn = useCallback(
    (id: string) => {
      const header = byId.get(id)?.header ?? id;
      const hiding = !layout.hidden.includes(id);
      if (hiding && visibleColumns.length <= 1) return; // always leave one column showing
      updateLayout((current) => ({
        ...current,
        hidden: hiding ? [...current.hidden, id] : current.hidden.filter((h) => h !== id),
      }));
      announce(hiding ? `${header} hidden. Show it again from Columns.` : `${header} shown.`);
    },
    [byId, layout.hidden, visibleColumns.length, updateLayout, announce],
  );

  const fitColumn = useCallback(
    (id: string) => {
      updateLayout((current) => {
        const widths = { ...current.widths };
        delete widths[id];
        return { ...current, widths };
      });
      announce(`${byId.get(id)?.header ?? id} fits its contents again.`);
    },
    [updateLayout, byId, announce],
  );

  // ----------------------------------------------------- heading: drag/sort
  const press = useRef<{ id: string; x: number; moved: boolean; pointerId: number } | null>(null);
  const [drag, setDrag] = useState<DragState | null>(null);

  const headerTarget = (
    clientX: number,
    clientY: number,
  ): { id: string | null; cancel: boolean } => {
    const rowEl = headerRowRef.current;
    if (!rowEl) return { id: null, cancel: true };
    const rowRect = rowEl.getBoundingClientRect();
    // Only along the heading row: drag down into the rows and let go to change your mind.
    const cancel = clientY < rowRect.top - 8 || clientY > rowRect.bottom + 8;
    const cells = [...rowEl.querySelectorAll<HTMLElement>('[data-col-id]')];
    let id: string | null = null;
    for (const cell of cells) {
      const rect = cell.getBoundingClientRect();
      if (clientX >= rect.left && clientX < rect.right) id = cell.dataset.colId ?? null;
    }
    if (id === null && cells.length > 0) {
      const first = cells[0] as HTMLElement;
      const last = cells[cells.length - 1] as HTMLElement;
      id = (clientX < first.getBoundingClientRect().left ? first : last).dataset.colId ?? null;
    }
    return { id, cancel };
  };

  const onHeaderPointerDown = (event: ReactPointerEvent<HTMLDivElement>, id: string) => {
    if (event.button !== 0) return;
    press.current = { id, x: event.clientX, moved: false, pointerId: event.pointerId };
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const onHeaderPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const current = press.current;
    if (!current || current.pointerId !== event.pointerId) return;
    if (!current.moved && Math.abs(event.clientX - current.x) < DRAG_SLOP) return;
    current.moved = true;
    const { id, cancel } = headerTarget(event.clientX, event.clientY);
    const from = layout.order.indexOf(current.id);
    const to = id ? layout.order.indexOf(id) : from;
    setDrag({ source: current.id, target: id, after: to > from, cancel });
  };

  const onHeaderPointerUp = (event: ReactPointerEvent<HTMLDivElement>, id: string) => {
    const current = press.current;
    press.current = null;
    setDrag(null);
    if (!current || current.pointerId !== event.pointerId) return;
    if (!current.moved) {
      // A click only sorts if you let go on the heading you pressed.
      const rect = event.currentTarget.getBoundingClientRect();
      const inside =
        event.clientX >= rect.left &&
        event.clientX <= rect.right &&
        event.clientY >= rect.top &&
        event.clientY <= rect.bottom;
      if (inside) {
        setActive({ rowId: null, col: visibleColumns.findIndex((c) => c.id === id) });
        sortBy(id);
      }
      return;
    }
    const target = headerTarget(event.clientX, event.clientY);
    if (target.cancel || !target.id || target.id === current.id) return;
    placeColumn(moveColumn(layout.order, current.id, target.id), current.id);
  };

  const onHeaderPointerCancel = () => {
    press.current = null;
    setDrag(null);
  };

  // ------------------------------------------------------ heading: resizing
  const sizing = useRef<{ id: string; x: number; start: number; pointerId: number } | null>(null);

  const onResizePointerDown = (event: ReactPointerEvent<HTMLDivElement>, id: string) => {
    if (event.button !== 0) return;
    event.stopPropagation();
    sizing.current = { id, x: event.clientX, start: widthOf(id), pointerId: event.pointerId };
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const onResizePointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const current = sizing.current;
    if (!current || current.pointerId !== event.pointerId) return;
    const width = Math.max(
      Math.round(MIN_COLUMN_WIDTH * scale),
      Math.round(current.start + event.clientX - current.x),
    );
    setLiveWidth({ id: current.id, width });
  };

  const onResizePointerUp = (event: ReactPointerEvent<HTMLDivElement>) => {
    const current = sizing.current;
    sizing.current = null;
    event.stopPropagation();
    const width = liveWidth?.id === current?.id ? liveWidth?.width : undefined;
    setLiveWidth(null);
    if (!current || width === undefined || width === current.start) return; // pressed the edge without moving it
    updateLayout((layoutNow) => ({
      ...layoutNow,
      widths: {
        ...layoutNow.widths,
        [current.id]: Math.max(MIN_COLUMN_WIDTH, Math.round(width / scale)),
      },
    }));
    announce(`${byId.get(current.id)?.header ?? current.id} resized. It'll stay that width now.`);
  };

  // ---------------------------------------------------------- right-click
  const [menu, setMenu] = useState<MenuTarget | null>(null);

  const onContextMenu = (event: ReactMouseEvent<HTMLDivElement>) => {
    const target = event.target as HTMLElement;
    const header = target.closest<HTMLElement>('[role="columnheader"]');
    if (header?.dataset.colId) {
      setMenu({ kind: 'header', columnId: header.dataset.colId });
      return;
    }
    const cell = target.closest<HTMLElement>('[role="gridcell"]');
    const rowEl = cell?.closest<HTMLElement>('[role="row"]');
    if (!cell || !rowEl?.dataset.rowId || !cell.dataset.colId) {
      event.preventDefault(); // empty space: no menu
      setMenu(null);
      return;
    }
    const index = Number(rowEl.dataset.rowIndex);
    const col = visibleColumns.findIndex((c) => c.id === cell.dataset.colId);
    setActive({ rowId: rowEl.dataset.rowId, col });
    select(rowEl.dataset.rowId);
    if (index >= 0)
      setMenu({ kind: 'cell', rowId: rowEl.dataset.rowId, columnId: cell.dataset.colId });
  };

  // ------------------------------------------------------------- mouse
  const cellFrom = (target: EventTarget): { index: number; col: number } | null => {
    const cell = (target as HTMLElement).closest<HTMLElement>('[role="gridcell"]');
    const key = cell?.dataset.cell;
    if (!key) return null;
    const [index, col] = key.split(':').map(Number) as [number, number];
    return { index, col };
  };

  const onBodyMouseDown = (event: ReactMouseEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    const hit = cellFrom(event.target);
    if (!hit) return;
    const rowId = tableRows[hit.index]?.id ?? null;
    setActive({ rowId, col: hit.col });
    select(rowId);
    setDetailOpen(true);
  };

  const onBodyDoubleClick = (event: ReactMouseEvent<HTMLDivElement>) => {
    const hit = cellFrom(event.target);
    if (hit) activate(hit.index, hit.col);
  };

  // ------------------------------------------------------------ keyboard

  const onKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (
      (event.target as HTMLElement).closest('input, button, [role="menu"]') &&
      !(event.target as HTMLElement).closest('[role="gridcell"], [role="columnheader"]')
    )
      return;
    const last = tableRows.length - 1;
    const lastCol = visibleColumns.length - 1;
    const page = Math.max(
      1,
      Math.floor(((scrollRef.current?.clientHeight ?? 400) - headerHeight) / rowHeight) - 1,
    );
    let index = activeIndex;
    let col = activeCol;
    switch (event.key) {
      case 'ArrowDown':
        index = Math.min(index + 1, last);
        break;
      case 'ArrowUp':
        index = Math.max(index - 1, HEADER);
        break;
      case 'ArrowLeft':
        col = Math.max(col - 1, 0);
        break;
      case 'ArrowRight':
        col = Math.min(col + 1, lastCol);
        break;
      case 'Home':
        col = 0;
        if (event.ctrlKey) index = last >= 0 ? 0 : HEADER;
        break;
      case 'End':
        col = lastCol;
        if (event.ctrlKey) index = last;
        break;
      case 'PageDown':
        index = Math.min(index + page, last);
        break;
      case 'PageUp':
        index = index === HEADER ? HEADER : Math.max(index - page, 0);
        break;
      case 'Enter':
      case ' ': {
        event.preventDefault();
        if (activeIndex === HEADER) {
          const column = visibleColumns[activeCol];
          if (column) sortBy(column.id);
        } else {
          activate(activeIndex, activeCol);
        }
        return;
      }
      case 'Escape':
        if (selectedId !== null && renderDetail && detailOpen) {
          event.preventDefault();
          setDetailOpen(false);
        }
        return;
      case 'f':
        if (event.ctrlKey) {
          event.preventDefault();
          searchRef.current?.focus();
        }
        return;
      default:
        return;
    }
    event.preventDefault();
    moveTo(index, col);
  };

  const { onResetFilters } = props;
  const onReset = useCallback(() => {
    setSearch('');
    setAttentionOnly(false);
    setChipsOn([]);
    setSorting([]);
    onResetFilters?.();
    announce('Search, filters and sort cleared. The table is back in its own order.');
  }, [onResetFilters, announce]);

  const toggleAttention = useCallback(() => setAttentionOnly((on) => !on), []);
  const attention = useMemo(
    () =>
      needsAttention
        ? { on: attentionOnly, count: attentionCount, toggle: toggleAttention }
        : undefined,
    [needsAttention, attentionOnly, attentionCount, toggleAttention],
  );
  const toggleChip = useCallback(
    (id: string) =>
      setChipsOn((on) => (on.includes(id) ? on.filter((c) => c !== id) : [...on, id])),
    [],
  );
  const columnMenu = useMemo(
    () =>
      layout.order.map((id) => ({
        id,
        header: byId.get(id)?.header ?? id,
        visible: !layout.hidden.includes(id),
        hideable: byId.get(id)?.hideable !== false,
      })),
    [layout, byId],
  );

  // ------------------------------------------------------------- drawing
  const sort = sorting[0];
  const headerTabbable =
    activeIndex === HEADER || !virtualRows.some((item) => item.index === activeIndex);
  const showDetail = Boolean(renderDetail && selectedRow !== null && detailOpen);
  const closeDetail = useCallback(() => setDetailOpen(false), []);

  let body: ReactNode = null;
  if (props.loading) {
    body = (
      <div
        className="flex flex-col items-center justify-center gap-2 py-16 text-muted"
        role="status"
      >
        <LoaderCircle
          aria-hidden="true"
          className="size-6 animate-spin motion-reduce:animate-none"
        />
        <p className="text-sm">{props.loadingText ?? 'Loading the table…'}</p>
      </div>
    );
  } else if (rows.length === 0) {
    const empty = props.empty ?? { title: 'Nothing here yet.' };
    body = (
      <div
        className="flex flex-col items-center justify-center gap-2 px-6 py-16 text-center"
        role="status"
      >
        <Inbox aria-hidden="true" className="size-8 text-faint" />
        <p className="text-base font-semibold text-fg">{empty.title}</p>
        {empty.body ? <p className="max-w-md text-sm text-muted">{empty.body}</p> : null}
        {empty.action}
      </div>
    );
  } else if (tableRows.length === 0) {
    body = (
      <div
        className="flex flex-col items-center justify-center gap-2 px-6 py-16 text-center"
        role="status"
      >
        <SearchX aria-hidden="true" className="size-8 text-faint" />
        <p className="text-base font-semibold text-fg">No rows match.</p>
        <p className="text-sm text-muted">Try fewer words in the search, or switch a filter off.</p>
        <Button size="sm" onClick={onReset}>
          <RotateCcw aria-hidden="true" />
          Clear search and filters
        </Button>
      </div>
    );
  }

  const menuColumn = menu ? byId.get(menu.columnId) : undefined;
  const menuRow =
    menu?.kind === 'cell' ? tableRows[indexById.get(menu.rowId) ?? -1]?.original : undefined;
  const menuActions =
    menu?.kind === 'cell' && menuRow !== undefined ? actionsFor(menuRow, menu.columnId) : [];
  const menuVisibleAt =
    menu?.kind === 'header' ? visibleColumns.findIndex((c) => c.id === menu.columnId) : -1;

  return (
    <div
      className={cn('flex h-full min-h-0 flex-col bg-surface text-fg', props.className)}
      data-grid-view={view}
    >
      <FilterBar
        searchRef={searchRef}
        search={search}
        onSearch={setSearch}
        searchPlaceholder={props.searchPlaceholder ?? 'Search this table'}
        pageControls={props.filterControls}
        attention={attention}
        chips={chipStates}
        onToggleChip={toggleChip}
        showing={tableRows.length}
        total={rows.length}
        columns={columnMenu}
        onToggleColumn={toggleColumn}
        onResetLayout={resetLayout}
        onReset={onReset}
      />

      <div className="flex min-h-0 flex-1">
        <ContextMenu onOpenChange={(open) => (open ? undefined : setMenu(null))}>
          <ContextMenuTrigger asChild>
            <div
              ref={scrollRef}
              role="grid"
              aria-label={label}
              aria-rowcount={tableRows.length + 1}
              aria-colcount={visibleColumns.length}
              aria-busy={props.loading || undefined}
              data-testid="data-grid"
              className="relative min-w-0 flex-1 overflow-auto text-sm tabular-nums [contain:strict] [overflow-anchor:none]"
              onKeyDown={onKeyDown}
              onContextMenu={onContextMenu}
            >
              <div
                ref={headerRowRef}
                role="row"
                aria-rowindex={1}
                className="sticky top-0 z-10 flex border-b border-line-strong bg-raised font-semibold"
                style={{ height: headerHeight, width: Math.max(totalWidth, 0), minWidth: '100%' }}
              >
                {visibleColumns.map((column, col) => {
                  const sorted =
                    sort?.id === column.id ? (sort.desc ? 'descending' : 'ascending') : 'none';
                  const isSource = drag?.source === column.id;
                  const isTarget =
                    drag &&
                    !drag.cancel &&
                    drag.target === column.id &&
                    drag.target !== drag.source;
                  return (
                    <div
                      key={column.id}
                      role="columnheader"
                      aria-colindex={col + 1}
                      aria-sort={column.sortable === false ? undefined : sorted}
                      data-col-id={column.id}
                      data-cell={`${HEADER}:${col}`}
                      tabIndex={headerTabbable && activeCol === col ? 0 : -1}
                      title={
                        column.sortable === false
                          ? column.header
                          : `${column.header}: click to sort, drag to move`
                      }
                      onPointerDown={(event) => onHeaderPointerDown(event, column.id)}
                      onPointerMove={onHeaderPointerMove}
                      onPointerUp={(event) => onHeaderPointerUp(event, column.id)}
                      onPointerCancel={onHeaderPointerCancel}
                      className={cn(
                        'relative flex shrink-0 cursor-default items-center gap-1 px-2.5 whitespace-nowrap select-none outline-none',
                        'text-[0.929rem] text-muted hover:bg-row-hover hover:text-fg',
                        'focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-focus',
                        sorted !== 'none' && 'text-fg',
                        isSource && drag?.cancel && 'opacity-60',
                        isSource && !drag?.cancel && 'bg-accent-soft text-fg',
                        isTarget &&
                          (drag?.after
                            ? 'shadow-[inset_-3px_0_0_var(--accent)]'
                            : 'shadow-[inset_3px_0_0_var(--accent)]'),
                        alignClass(column.align),
                      )}
                      style={{ width: widths[col] }}
                    >
                      <span className="truncate">{column.header}</span>
                      {sorted === 'ascending' ? (
                        <ArrowUp aria-hidden="true" className="size-[1em] shrink-0 text-accent" />
                      ) : null}
                      {sorted === 'descending' ? (
                        <ArrowDown aria-hidden="true" className="size-[1em] shrink-0 text-accent" />
                      ) : null}
                      <div
                        role="separator"
                        aria-orientation="vertical"
                        aria-label={`Resize ${column.header}`}
                        data-resize-handle={column.id}
                        title="Drag to resize. Double-click to fit the contents."
                        onPointerDown={(event) => onResizePointerDown(event, column.id)}
                        onPointerMove={onResizePointerMove}
                        onPointerUp={onResizePointerUp}
                        onDoubleClick={(event) => {
                          event.stopPropagation();
                          fitColumn(column.id);
                        }}
                        className="absolute top-0 -right-1 z-10 h-full w-2 cursor-col-resize touch-none after:absolute after:top-1/4 after:left-1/2 after:h-1/2 after:w-px after:bg-line-strong hover:after:w-0.5 hover:after:bg-accent"
                      />
                    </div>
                  );
                })}
              </div>

              {body ?? (
                <div
                  role="rowgroup"
                  className="relative"
                  style={{
                    height: virtualizer.getTotalSize(),
                    width: totalWidth,
                    minWidth: '100%',
                  }}
                  onMouseDown={onBodyMouseDown}
                  onDoubleClick={onBodyDoubleClick}
                >
                  {virtualRows.map((item) => {
                    const tableRow = tableRows[item.index];
                    if (!tableRow) return null;
                    const row = tableRow.original;
                    return (
                      <GridRow
                        key={tableRow.id}
                        row={row}
                        rowId={tableRow.id}
                        index={item.index}
                        columns={visibleColumns}
                        widths={widths}
                        totalWidth={totalWidth}
                        start={item.start - headerHeight}
                        height={rowHeight}
                        selected={selectedId === tableRow.id}
                        activeCol={activeIndex === item.index ? activeCol : -1}
                        tone={rowTone?.(row)}
                      />
                    );
                  })}
                </div>
              )}
            </div>
          </ContextMenuTrigger>
          <ContextMenuContent data-testid="grid-context-menu" aria-label="Actions">
            {menu?.kind === 'header' && menuColumn ? (
              <>
                <ContextMenuLabel>{menuColumn.header}</ContextMenuLabel>
                {menuColumn.sortable !== false ? (
                  <>
                    <ContextMenuItem onSelect={() => sortBy(menuColumn.id, false)}>
                      <ArrowUp aria-hidden="true" />
                      Sort A to Z, 1 to 9, early to late
                    </ContextMenuItem>
                    <ContextMenuItem onSelect={() => sortBy(menuColumn.id, true)}>
                      <ArrowDown aria-hidden="true" />
                      Sort the other way
                    </ContextMenuItem>
                  </>
                ) : null}
                <ContextMenuItem
                  disabled={menuVisibleAt <= 0}
                  onSelect={() => nudgeColumn(menuColumn.id, -1)}
                >
                  <ArrowLeft aria-hidden="true" />
                  Move column left
                </ContextMenuItem>
                <ContextMenuItem
                  disabled={menuVisibleAt < 0 || menuVisibleAt >= visibleColumns.length - 1}
                  onSelect={() => nudgeColumn(menuColumn.id, 1)}
                >
                  <ArrowRight aria-hidden="true" />
                  Move column right
                </ContextMenuItem>
                {layout.widths[menuColumn.id] !== undefined ? (
                  <ContextMenuItem onSelect={() => fitColumn(menuColumn.id)}>
                    <MoveHorizontal aria-hidden="true" />
                    Fit width to contents
                  </ContextMenuItem>
                ) : null}
                {menuColumn.hideable !== false ? (
                  <ContextMenuItem
                    disabled={visibleColumns.length <= 1}
                    onSelect={() => toggleColumn(menuColumn.id)}
                  >
                    <EyeOff aria-hidden="true" />
                    Hide this column
                  </ContextMenuItem>
                ) : null}
                {columnActions
                  .filter((action) => (action.appliesTo ? action.appliesTo(menuColumn.id) : true))
                  .map((action, at) => (
                    <div key={action.id}>
                      {at === 0 ? <ContextMenuSeparator /> : null}
                      <ContextMenuItem onSelect={() => action.onSelect(menuColumn.id)}>
                        {action.icon ? <action.icon aria-hidden="true" /> : null}
                        {action.label}
                      </ContextMenuItem>
                    </div>
                  ))}
                <ContextMenuSeparator />
                <ContextMenuItem onSelect={resetLayout}>
                  <RotateCcw aria-hidden="true" />
                  Reset column order and widths
                </ContextMenuItem>
              </>
            ) : null}
            {menu?.kind === 'cell' && menuColumn && menuRow !== undefined ? (
              <>
                <ContextMenuLabel>{menuColumn.header}</ContextMenuLabel>
                {menuActions.length === 0 ? (
                  <ContextMenuItem disabled>
                    {props.noActionText ?? 'Nothing to do on this column.'}
                  </ContextMenuItem>
                ) : (
                  menuActions.map((action) => (
                    <div key={action.id}>
                      {action.separatorBefore ? <ContextMenuSeparator /> : null}
                      <ContextMenuItem
                        variant={action.danger ? 'danger' : 'default'}
                        disabled={action.disabled?.(menuRow, menuColumn.id) ?? false}
                        onSelect={() => action.onSelect(menuRow, menuColumn.id)}
                      >
                        {action.icon ? <action.icon aria-hidden="true" /> : null}
                        {action.label}
                      </ContextMenuItem>
                    </div>
                  ))
                )}
              </>
            ) : null}
          </ContextMenuContent>
        </ContextMenu>

        {showDetail && selectedRow !== null && renderDetail ? (
          <aside
            aria-label="Details"
            data-testid="grid-detail"
            className="flex w-[22rem] max-w-[45%] shrink-0 flex-col overflow-y-auto border-l border-line bg-raised"
          >
            <div className="flex justify-end p-1">
              <Button
                size="icon"
                variant="ghost"
                aria-label="Close the details"
                onClick={closeDetail}
              >
                <X aria-hidden="true" />
              </Button>
            </div>
            <div className="px-4 pb-4">{renderDetail(selectedRow, closeDetail)}</div>
          </aside>
        ) : null}
      </div>

      <div aria-live="polite" className="sr-only" data-testid="grid-status">
        {message}
      </div>
    </div>
  );
}
