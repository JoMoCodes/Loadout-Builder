import { Columns3, Flag, RotateCcw, Search, X } from 'lucide-react';
import { memo, type ReactNode, type RefObject } from 'react';
import { Button } from '../../ui/button';
import { TONE_ICONS, chipVariants } from '../../ui/chip';
import { cn } from '../../ui/cn';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '../../ui/dropdown-menu';
import type { StatusChipFilter } from './types';

interface ChipState<Row> {
  chip: StatusChipFilter<Row>;
  count: number;
  on: boolean;
}

export interface FilterBarProps<Row> {
  searchRef: RefObject<HTMLInputElement | null>;
  search: string;
  onSearch: (text: string) => void;
  searchPlaceholder: string;
  pageControls?: ReactNode;
  attention?: { on: boolean; count: number; toggle: () => void } | undefined;
  chips: ChipState<Row>[];
  onToggleChip: (id: string) => void;
  showing: number;
  total: number;
  columns: Array<{ id: string; header: string; visible: boolean; hideable: boolean }>;
  onToggleColumn: (id: string) => void;
  onResetLayout: () => void;
  onReset: () => void;
}

function FilterBarInner<Row>({ searchRef, ...props }: FilterBarProps<Row>) {
  const { attention, chips } = props;
  return (
    <div
      role="toolbar"
      aria-label="Search and filters"
      className="flex flex-wrap items-center gap-2 border-b border-line bg-surface px-3 py-2"
    >
      <div className="relative w-64 max-w-full">
        <Search
          aria-hidden="true"
          className="pointer-events-none absolute top-1/2 left-2.5 size-[1.05em] -translate-y-1/2 text-faint"
        />
        <input
          ref={searchRef}
          type="search"
          value={props.search}
          onChange={(event) => props.onSearch(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Escape' && props.search) {
              event.stopPropagation();
              props.onSearch('');
            }
          }}
          placeholder={props.searchPlaceholder}
          aria-label="Search this table"
          className={cn(
            'h-8 w-full rounded-md border border-line-strong bg-sunken pr-8 pl-8 text-sm text-fg',
            'placeholder:text-faint focus-visible:border-focus [&::-webkit-search-cancel-button]:hidden',
          )}
        />
        {props.search ? (
          <button
            type="button"
            aria-label="Clear the search"
            onClick={() => props.onSearch('')}
            className="absolute top-1/2 right-1.5 flex size-6 -translate-y-1/2 items-center justify-center rounded-sm text-muted hover:text-fg"
          >
            <X aria-hidden="true" className="size-[1em]" />
          </button>
        ) : null}
      </div>

      {props.pageControls}

      {attention ? (
        <Button
          size="sm"
          variant={attention.on ? 'primary' : 'default'}
          aria-pressed={attention.on}
          onClick={attention.toggle}
          title="Show only the rows that have a problem or a warning"
        >
          <Flag aria-hidden="true" />
          Needs attention
          <span
            className={cn(
              'rounded-full px-1.5 text-[0.857rem] tabular-nums',
              attention.on ? 'bg-accent-fg/15' : 'bg-neutral-soft text-neutral',
            )}
          >
            {attention.count}
          </span>
        </Button>
      ) : null}

      {chips.length > 0 ? (
        <div role="group" aria-label="Show only" className="flex flex-wrap items-center gap-1.5">
          {chips.map(({ chip, count, on }) => {
            const Icon = chip.icon === undefined ? TONE_ICONS[chip.tone] : chip.icon;
            return (
              <button
                key={chip.id}
                type="button"
                aria-pressed={on}
                onClick={() => props.onToggleChip(chip.id)}
                className={cn(
                  chipVariants({ tone: chip.tone }),
                  'h-7 cursor-pointer px-2.5 hover:brightness-110',
                  on ? 'border-current ring-1 ring-current' : 'opacity-90',
                )}
              >
                {Icon ? <Icon aria-hidden="true" /> : null}
                {chip.label}
                <span className="tabular-nums opacity-90">{count}</span>
              </button>
            );
          })}
        </div>
      ) : null}

      <div className="ml-auto flex items-center gap-2">
        <span aria-live="polite" className="text-[0.929rem] text-muted tabular-nums">
          Showing {props.showing} of {props.total}
        </span>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button size="sm" variant="ghost">
              <Columns3 aria-hidden="true" />
              Columns
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuLabel>Show these columns</DropdownMenuLabel>
            {props.columns.map((column) => (
              <DropdownMenuCheckboxItem
                key={column.id}
                checked={column.visible}
                disabled={!column.hideable}
                onSelect={(event) => event.preventDefault()}
                onCheckedChange={() => props.onToggleColumn(column.id)}
              >
                {column.header}
              </DropdownMenuCheckboxItem>
            ))}
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={props.onResetLayout}>
              <RotateCcw aria-hidden="true" />
              Reset column order and widths
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        <Button
          size="sm"
          variant="ghost"
          onClick={props.onReset}
          title="Clear the search, the filters and the sort"
        >
          <RotateCcw aria-hidden="true" />
          Reset
        </Button>
      </div>
    </div>
  );
}

/** Drawn again only when its own inputs change, not on every scroll of the table. */
export const FilterBar = memo(FilterBarInner) as typeof FilterBarInner;
