// The list inside a picker window (link, roster pick, van pick) and the Assign Vans read-out.
// Like the old dialogs' tables: it keeps the order it was given until a heading is clicked, then
// sorts by that column the way every table does (click again to reverse). Click a row to pick
// it; double-click or Enter confirms.

import { useMemo, useState, type KeyboardEvent } from 'react';
import { sortRows } from '../../components/DataGrid';
import { cn } from '../../ui/cn';
import type { Severity } from './rules';

export interface PickColumn<Row> {
  id: string;
  header: string;
  value: (row: Row) => string;
  mono?: boolean;
}

interface PickTableProps<Row> {
  label: string;
  columns: readonly PickColumn<Row>[];
  rows: readonly Row[];
  getId: (row: Row) => string;
  /** Red or amber for a problem or a warning; 'ghost' greys a row out. */
  tone?: (row: Row) => Severity | 'ghost';
  selectedId?: string | null;
  onSelect?: (row: Row) => void;
  onConfirm?: (row: Row) => void;
  testId?: string;
}

const TONE_TEXT: Record<string, string> = {
  bad: 'text-bad',
  warn: 'text-warn',
  ghost: 'text-muted',
};

export function PickTable<Row>({
  label,
  columns,
  rows,
  getId,
  tone,
  selectedId = null,
  onSelect,
  onConfirm,
  testId,
}: PickTableProps<Row>) {
  const [sort, setSort] = useState<{ id: string; desc: boolean } | null>(null);
  const shown = useMemo(() => {
    if (!sort) return [...rows];
    const column = columns.find((c) => c.id === sort.id);
    return column ? sortRows(rows, column.value, sort.desc) : [...rows];
  }, [rows, columns, sort]);

  function onKey(event: KeyboardEvent<HTMLTableSectionElement>) {
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
    event.preventDefault();
    const at = shown.findIndex((row) => getId(row) === selectedId);
    const next =
      shown[Math.max(0, Math.min(shown.length - 1, at + (event.key === 'ArrowDown' ? 1 : -1)))];
    if (next !== undefined) {
      onSelect?.(next);
      const cell = (event.currentTarget as HTMLElement).querySelector<HTMLElement>(
        `[data-pick-id="${CSS.escape(getId(next))}"]`,
      );
      cell?.focus();
    }
  }

  return (
    <div
      className="min-h-0 flex-1 overflow-auto rounded-md border border-line"
      data-testid={testId}
    >
      <table className="w-full border-collapse text-sm" aria-label={label}>
        <thead className="sticky top-0 bg-surface">
          <tr>
            {columns.map((column) => {
              const sorted =
                sort?.id === column.id ? (sort.desc ? 'descending' : 'ascending') : 'none';
              return (
                <th
                  key={column.id}
                  scope="col"
                  aria-sort={sorted}
                  className="border-b border-line px-2 py-1.5 text-left font-semibold whitespace-nowrap"
                >
                  <button
                    type="button"
                    className="hover:underline"
                    onClick={() =>
                      setSort((current) => ({
                        id: column.id,
                        desc: current?.id === column.id ? !current.desc : false,
                      }))
                    }
                  >
                    {column.header}
                  </button>
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody onKeyDown={onKey}>
          {shown.map((row, index) => {
            const id = getId(row);
            const selected = id === selectedId;
            const rowTone = tone?.(row) ?? '';
            return (
              <tr
                key={id}
                data-pick-id={id}
                data-tone={rowTone || undefined}
                aria-selected={selected}
                tabIndex={selected ? 0 : -1}
                onClick={() => onSelect?.(row)}
                onDoubleClick={() => onConfirm?.(row)}
                className={cn(
                  'cursor-default',
                  index % 2 ? 'bg-row-stripe' : '',
                  selected && 'bg-row-selected',
                  TONE_TEXT[rowTone],
                )}
              >
                {columns.map((column) => {
                  const text = column.value(row);
                  return (
                    <td
                      key={column.id}
                      className={cn('px-2 py-1 whitespace-nowrap', column.mono && 'font-mono')}
                    >
                      {text || <span className="text-faint">-</span>}
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
      {shown.length === 0 ? <p className="p-3 text-sm text-muted">Nothing to show.</p> : null}
    </div>
  );
}
