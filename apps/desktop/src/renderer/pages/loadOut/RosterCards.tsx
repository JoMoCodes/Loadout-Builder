// The cards above the roster: the Roster itself, the route file it took its routes from, and the
// DWP sheet. A card for a file says how many routes came in and the file's name, and pressing it
// opens that file's tab ("Click me to View", top right). A file not brought in yet says so, and
// pressing it starts Import Route Data. No full stops on the cards: they are labels, not sentences.

import type { ReactNode } from 'react';
import type { RouteKindName } from '../../../shared/channels/routeData';
import type { AppSnapshot } from '../../../shared/snapshot';
import { Button } from '../../ui/button';
import { cn } from '../../ui/cn';
import { baseName } from './rules';

/** The route file the cards show: the one the roster took its routes from, else any loaded one. */
export function rosterRouteSet(snapshot: AppSnapshot) {
  const loaded = snapshot.routeSets.filter((set) => set.rows.length > 0);
  return loaded.find((set) => set.kind === snapshot.roster.routeSource) ?? loaded[0] ?? null;
}

interface CardProps {
  testId: string;
  label: string;
  /** The big number, and what it counts. */
  count?: number;
  unit?: string;
  /** The file's name, or the words of an empty card. */
  line: string;
  /** "Click me to View", top right. */
  hint: string;
  onOpen?: () => void;
  empty?: boolean;
  disabled?: boolean;
  /** A button under the card's own (Clear Route Data). */
  extra?: ReactNode;
}

function Card({
  testId,
  label,
  count,
  unit,
  line,
  hint,
  onOpen,
  empty,
  disabled,
  extra,
}: CardProps) {
  // Kept short (two lines of words) so the roster table below keeps its room on a small screen.
  const body = (
    <>
      <span className="flex items-baseline gap-2">
        <span className="text-xs font-semibold tracking-wider text-muted uppercase">{label}</span>
        {count !== undefined ? (
          <span className="font-bold whitespace-nowrap tabular-nums">
            {count} <span className="text-sm font-normal text-muted">{unit}</span>
          </span>
        ) : null}
      </span>
      <span
        className={cn(
          'w-full min-w-0 truncate text-sm',
          empty ? 'text-muted' : 'font-mono text-muted',
        )}
        title={line}
        data-testid={`${testId}-line`}
      >
        {line}
      </span>
      <span
        className="absolute top-1.5 right-3 text-xs font-medium text-accent"
        data-testid={`${testId}-hint`}
      >
        {hint}
      </span>
    </>
  );
  const frame = cn(
    'relative flex min-w-0 items-end gap-2 rounded-lg border bg-surface px-3 pt-5 pb-2 text-left',
    empty ? 'border-dashed border-line-strong' : 'border-line',
  );
  const inner = 'flex min-w-0 flex-1 flex-col items-start gap-0.5 text-left';
  return (
    <div className={frame} data-testid={testId}>
      {onOpen ? (
        <button
          type="button"
          onClick={onOpen}
          disabled={disabled}
          className={cn(inner, 'disabled:cursor-not-allowed disabled:opacity-60')}
          data-testid={`${testId}-open`}
        >
          {body}
        </button>
      ) : (
        <div className={inner}>{body}</div>
      )}
      {extra}
    </div>
  );
}

interface RosterCardsProps {
  snapshot: AppSnapshot;
  /** Opens a file's tab. */
  onView: (tab: RouteKindName | 'dwp') => void;
  onImport: () => void;
  onImportDwp: () => void;
  onClearRoute: () => void;
  onClearDwp: () => void;
}

export function RosterCards({
  snapshot,
  onView,
  onImport,
  onImportDwp,
  onClearRoute,
  onClearDwp,
}: RosterCardsProps) {
  const route = rosterRouteSet(snapshot);
  const dwp = snapshot.dwp.set;
  const drivers = snapshot.roster.rows.length;
  return (
    <div
      className="grid grid-cols-[repeat(auto-fit,minmax(14rem,1fr))] gap-2 border-b border-line bg-app px-6 py-2"
      data-testid="roster-cards"
    >
      <Card
        testId="card-roster"
        label="Roster"
        count={drivers}
        unit={drivers === 1 ? 'driver' : 'drivers'}
        line={snapshot.roster.sourceFile ? baseName(snapshot.roster.sourceFile) : 'No sheet yet'}
        hint="Showing below"
        empty={drivers === 0}
      />
      {route ? (
        <Card
          testId="card-route"
          label={route.label}
          count={route.rows.length}
          unit={route.rows.length === 1 ? 'route' : 'routes'}
          line={baseName(route.sourceFile)}
          hint="Click me to View"
          onOpen={() => onView(route.kind as RouteKindName)}
          extra={
            <Button
              size="sm"
              variant="danger"
              onClick={onClearRoute}
              data-testid="card-clear-route"
            >
              Clear Route Data
            </Button>
          }
        />
      ) : (
        <Card
          testId="card-route"
          label="Route Data"
          line="Not imported yet"
          hint="Click me to Import"
          onOpen={onImport}
          empty
        />
      )}
      {dwp.rows.length > 0 ? (
        <Card
          testId="card-dwp"
          label="DWP"
          count={dwp.rows.length}
          unit={dwp.rows.length === 1 ? 'route' : 'routes'}
          line={baseName(dwp.sourceFile)}
          hint="Click me to View"
          onOpen={() => onView('dwp')}
          extra={
            <Button size="sm" onClick={onClearDwp} data-testid="card-clear-dwp">
              Clear DWP Data
            </Button>
          }
        />
      ) : (
        <Card
          testId="card-dwp"
          label="DWP"
          line="Not imported yet"
          hint="Click me to Import"
          onOpen={onImportDwp}
          empty
        />
      )}
    </div>
  );
}
