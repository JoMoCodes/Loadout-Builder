// The Dashboard's building blocks: the week bar, a card, a tile, a change chip, the "How is this
// worked out?" button and its window, and the small menu a driver opens.

import {
  ArrowDown,
  ArrowUp,
  Calculator,
  CircleHelp,
  Eye,
  EyeOff,
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
  onPick,
}: {
  weeks: readonly string[];
  range: WeekRange | null;
  picked: QuickPickId | null;
  onRange: (range: WeekRangeChoice) => void;
  /**
   * Given when the layout keeps its own weeks: a quick pick is then remembered as the pick
   * itself ("the last 4 weeks", whichever they are) instead of as two weeks.
   */
  onPick?: (pick: QuickPickId) => void;
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
              if (onPick) return onPick(pick.id);
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
  fixed = false,
}: {
  title: string;
  aside?: ReactNode;
  children: ReactNode;
  className?: string;
  testId?: string;
  titleId?: string;
  /** The section has a set height: the card fills it, and what does not fit scrolls. */
  fixed?: boolean;
}) {
  return (
    <section
      className={cn(
        'flex min-w-0 flex-col rounded-lg border border-line bg-surface px-4 py-3',
        fixed && 'min-h-0 flex-1',
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
      {fixed ? (
        // The lists reach a little past the card's padding, so the scrolling box does too.
        <div
          className="-mx-2 flex min-h-0 flex-1 flex-col overflow-y-auto px-2"
          role="group"
          aria-labelledby={titleId}
          tabIndex={0}
        >
          {children}
        </div>
      ) : (
        children
      )}
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

/** A tile: one number (or one small picture) with its name above it. */
export function Tile({
  title,
  testId,
  children,
  onExplain,
  what,
  target = null,
  fixed = false,
}: {
  title: string;
  testId: string;
  children: ReactNode;
  onExplain: () => void;
  what: string;
  /** The number against the person's target: a missed one gives the tile a red edge. */
  target?: 'met' | 'missed' | null;
  /** The section has a set height: what does not fit scrolls. */
  fixed?: boolean;
}) {
  return (
    <section
      className={cn(
        'flex min-w-0 flex-1 flex-col gap-1 rounded-lg border bg-surface px-4 pt-3 pb-2',
        target === 'missed' ? 'border-bad shadow-[inset_0_0_0_1px_var(--bad)]' : 'border-line',
        fixed && 'min-h-0',
      )}
      aria-label={title}
      data-testid={testId}
      data-target={target ?? undefined}
    >
      <h2 className="m-0 text-sm font-medium text-muted">{title}</h2>
      <div className={cn('flex min-h-0 flex-1 flex-col gap-1', fixed && 'overflow-y-auto')}>
        {children}
      </div>
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
  /** The driver is on the watch list. */
  watched: (transporterId: string) => boolean;
  /** Puts the driver on the watch list, or takes them off. */
  toggleWatch: (transporterId: string) => void;
}

/**
 * A driver's line. Clicking it (or Enter or Space on it) opens a small menu: open them on the
 * Scorecards page, preview their report, explain their score, or put them on the watch list (or
 * take them off). Esc closes the menu.
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
          Open on the Scorecards page
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
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onSelect={() => actions.toggleWatch(transporterId)}
          data-testid="driver-menu-watch"
        >
          {actions.watched(transporterId) ? (
            <EyeOff aria-hidden="true" />
          ) : (
            <Eye aria-hidden="true" />
          )}
          {actions.watched(transporterId) ? 'Take off the watch list' : 'Add to the watch list'}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
