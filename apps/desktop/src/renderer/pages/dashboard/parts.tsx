// The Dashboard's building blocks: the week bar, a card, a tile, a change chip, the "How is this
// worked out?" button and its window, and the small menu a driver opens.

import {
  ArrowDown,
  ArrowUp,
  Calculator,
  CircleHelp,
  FileText,
  Minus,
  UserRound,
} from 'lucide-react';
import type { ReactNode } from 'react';
import { Button } from '../../ui/button';
import { Chip } from '../../ui/chip';
import { cn } from '../../ui/cn';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '../../ui/dropdown-menu';
import { Modal } from '../dataPages/Modal';
import type { WeekRange } from '../../../shared/performance';
import type { WeekRangeChoice } from '../../../shared/performanceSettings';
import {
  QUICK_PICKS,
  quickChoice,
  changeTone,
  directionOf,
  signed,
  type Explanation,
  type QuickPickId,
} from './words';

// ------------------------------------------------------------------------------ week bar

export function WeekBar({
  weeks,
  range,
  picked,
  onRange,
}: {
  weeks: readonly string[];
  range: WeekRange | null;
  picked: QuickPickId | null;
  onRange: (range: WeekRangeChoice) => void;
}) {
  const last = weeks[weeks.length - 1];
  const selectClass =
    'h-8 rounded-md border border-line-strong bg-sunken px-2 text-sm text-fg tabular-nums';
  return (
    <div
      role="group"
      aria-label="Weeks shown"
      className="flex flex-wrap items-center gap-x-4 gap-y-2"
      data-testid="dashboard-weekbar"
    >
      <div
        className="inline-flex rounded-md border border-line bg-sunken p-0.5"
        role="group"
        aria-label="Quick picks"
      >
        {QUICK_PICKS.map((pick) => (
          <button
            key={pick.id}
            type="button"
            aria-pressed={picked === pick.id}
            disabled={!last}
            data-testid={`dashboard-pick-${pick.id}`}
            onClick={() => {
              const choice = quickChoice(weeks, pick.weeks);
              if (choice) onRange(choice);
            }}
            className={cn(
              'h-7 rounded-[5px] px-3 text-sm font-medium whitespace-nowrap transition-colors',
              picked === pick.id
                ? 'bg-accent text-accent-fg'
                : 'text-muted hover:bg-raised hover:text-fg',
            )}
          >
            {pick.label}
          </button>
        ))}
      </div>
      <div className="flex items-center gap-2 text-sm text-muted">
        <label className="flex items-center gap-1.5">
          From
          <select
            className={selectClass}
            value={range?.from ?? ''}
            disabled={!last}
            data-testid="dashboard-from"
            onChange={(event) => {
              const from = event.target.value;
              const to = range && range.to >= from ? range.to : from;
              onRange({ from, to });
            }}
          >
            {weeks.map((week) => (
              <option key={week} value={week}>
                {week}
              </option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-1.5">
          to
          <select
            className={selectClass}
            value={range?.to ?? ''}
            disabled={!last}
            data-testid="dashboard-to"
            onChange={(event) => {
              const to = event.target.value;
              const from = range && range.from <= to ? range.from : to;
              onRange({ from, to });
            }}
          >
            {weeks.map((week) => (
              <option key={week} value={week}>
                {week}
              </option>
            ))}
          </select>
        </label>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------------------ cards

export function Card({
  title,
  aside,
  children,
  className,
  testId,
  titleId,
}: {
  title: string;
  aside?: ReactNode;
  children: ReactNode;
  className?: string;
  testId?: string;
  titleId?: string;
}) {
  return (
    <section
      className={cn(
        'flex min-w-0 flex-col rounded-lg border border-line bg-surface px-4 py-3',
        className,
      )}
      aria-labelledby={titleId}
      data-testid={testId}
    >
      <div className="mb-2 flex flex-wrap items-center gap-x-3 gap-y-1">
        <h2 id={titleId} className="m-0 text-base font-semibold">
          {title}
        </h2>
        {aside ? <div className="ml-auto flex items-center gap-2">{aside}</div> : null}
      </div>
      {children}
    </section>
  );
}

/** The small "How is this worked out?" button. */
export function ExplainButton({
  onClick,
  testId,
  what,
}: {
  onClick: () => void;
  testId: string;
  /** What it explains, for screen readers ("the fleet average"). */
  what: string;
}) {
  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={onClick}
      data-testid={testId}
      aria-label={`How is ${what} worked out?`}
      className="-mx-1 h-6 px-1 text-[0.857rem]"
    >
      <CircleHelp aria-hidden="true" />
      How is this worked out?
    </Button>
  );
}

export function ExplainDialog({
  explanation,
  onClose,
}: {
  explanation: Explanation;
  onClose: () => void;
}) {
  return (
    <Modal name="explain" title={explanation.title} onConfirm={onClose} confirmLabel="Close">
      {explanation.paragraphs.map((line) =>
        line.startsWith('- ') ? (
          <p key={line} className="my-1 pl-4 text-sm">
            {'• '}
            {line.slice(2)}
          </p>
        ) : (
          <p key={line} className="my-2 text-sm">
            {line}
          </p>
        ),
      )}
    </Modal>
  );
}

/** One of the four tiles along the top. */
export function Tile({
  title,
  testId,
  children,
  onExplain,
  what,
}: {
  title: string;
  testId: string;
  children: ReactNode;
  onExplain: () => void;
  what: string;
}) {
  return (
    <section
      className="flex min-w-0 flex-col gap-1 rounded-lg border border-line bg-surface px-4 pt-3 pb-2"
      aria-label={title}
      data-testid={testId}
    >
      <h2 className="m-0 text-sm font-medium text-muted">{title}</h2>
      <div className="flex min-h-0 flex-1 flex-col gap-1">{children}</div>
      <div>
        <ExplainButton onClick={onExplain} testId={`${testId}-explain`} what={what} />
      </div>
    </section>
  );
}

/** A change as a coloured chip with an arrow: green the good way, red the bad way. */
export function ChangeChip({
  change,
  upIsGood,
  decimals = 1,
  suffix,
  testId,
  format,
}: {
  change: number;
  /** Null when neither way is good or bad (packages). */
  upIsGood: boolean | null;
  decimals?: number;
  suffix?: string;
  testId?: string;
  format?: (value: number) => string;
}) {
  const direction = directionOf(change, decimals);
  const Icon = direction === 'up' ? ArrowUp : direction === 'down' ? ArrowDown : Minus;
  const text = format ? format(change) : signed(change, decimals);
  return (
    <Chip
      tone={changeTone(direction, upIsGood)}
      icon={Icon}
      data-testid={testId}
      data-direction={direction}
      className="tabular-nums"
    >
      {text}
      {suffix ? <span className="font-normal"> {suffix}</span> : null}
    </Chip>
  );
}

// ------------------------------------------------------------------------------ driver menu

export interface DriverMenuActions {
  openOnPerformance: (transporterId: string) => void;
  previewReport: (transporterId: string) => void;
  explainScore: (transporterId: string, name: string) => void;
}

/**
 * A driver's line. Clicking it (or Enter or Space on it) opens a small menu: open them on the
 * Performance page, preview their report, or explain their score. Esc closes the menu.
 */
export function DriverRow({
  transporterId,
  name,
  actions,
  children,
  testId,
  className,
  extra,
}: {
  transporterId: string;
  name: string;
  actions: DriverMenuActions;
  children: ReactNode;
  testId: string;
  className?: string;
  extra?: Record<string, string>;
}) {
  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className={cn(
            'w-full rounded-md px-2 py-1.5 text-left transition-colors hover:bg-row-hover',
            'data-[state=open]:bg-row-selected',
            className,
          )}
          data-testid={testId}
          data-driver={transporterId}
          {...extra}
        >
          {children}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" data-testid="driver-menu">
        <DropdownMenuLabel>{name}</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onSelect={() => actions.openOnPerformance(transporterId)}
          data-testid="driver-menu-open"
        >
          <UserRound aria-hidden="true" />
          Open on the Performance page
        </DropdownMenuItem>
        <DropdownMenuItem
          onSelect={() => actions.previewReport(transporterId)}
          data-testid="driver-menu-preview"
        >
          <FileText aria-hidden="true" />
          Preview report
        </DropdownMenuItem>
        <DropdownMenuItem
          onSelect={() => actions.explainScore(transporterId, name)}
          data-testid="driver-menu-explain"
        >
          <Calculator aria-hidden="true" />
          Explain this score
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
