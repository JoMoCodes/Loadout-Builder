// The Previous Roster tab: yesterday's sheet, kept so drivers stay in the same cab
// (previous_roster_page.py). Read-only. Move Data to Previous Roster on the Roster tab fills it,
// and van assignment reads it: a driver who had a van last time and is working again gets that
// one back ("same van as last time" in Matched On), provided it is free and suits today's route.

import { padLabel, rosterDateLabel, type DriverRow } from '@loadout/core';
import { useCallback, useMemo, useState } from 'react';
import type { AppSnapshot } from '../../../shared/snapshot';
import { DataGrid, type GridColumn } from '../../components/DataGrid';
import { call, explain } from '../../lib/channels';
import { databaseLayoutStore } from '../../lib/gridLayoutStore';
import { Button } from '../../ui/button';
import { useAsk } from './Modal';
import { baseName, shortDateLabel } from './rules';

interface PreviousLine {
  index: number;
  row: DriverRow;
}

const COLUMNS: GridColumn<PreviousLine>[] = [
  { id: 'driver', header: 'Driver', value: (l) => l.row.driver, hideable: false },
  { id: 'shift_type', header: 'Shift Type', value: (l) => l.row.shiftType },
  { id: 'routes', header: 'Routes', value: (l) => l.row.routes },
  { id: 'wave_time', header: 'Wave Time', value: (l) => l.row.waveTime },
  { id: 'pad', header: 'PAD', value: (l) => padLabel(l.row), align: 'center' },
  { id: 'service_type', header: 'Service Type', value: (l) => l.row.serviceType },
  { id: 'vehicle', header: 'Vehicle', value: (l) => l.row.vehicle },
  { id: 'vin', header: 'VIN', value: (l) => l.row.vin, mono: true },
];

/** The header card's words (`PreviousRosterPage._refresh_header`). */
export function previousHeader(snapshot: AppSnapshot) {
  const roster = snapshot.previousRoster;
  if (roster.rows.length === 0) {
    return {
      title: 'No previous roster kept',
      source: 'Van assignment has nothing to carry forward from.',
      count: '',
      carry: '',
    };
  }
  const bits: string[] = [];
  if (roster.sourceFile) bits.push(baseName(roster.sourceFile));
  if (roster.importedAt) bits.push(`sheet imported ${shortDateLabel(new Date(roster.importedAt))}`);
  const held = roster.rows.filter((row) => row.vehicle).length;
  const today = snapshot.roster.rows.some((view) => view.associateId);
  return {
    title: `Previous Roster  -  ${rosterDateLabel(roster)}`,
    source: bits.join('  -  '),
    count: `${roster.rows.length} drivers  -  ${held} had a van`,
    carry: today
      ? `${snapshot.counts.previousOnToday} of them are on today's roster`
      : 'no roster loaded to carry into',
  };
}

interface PreviousRosterTabProps {
  snapshot: AppSnapshot;
  say: (text: string) => void;
  /** The left-menu page shows the title as its main heading. */
  headingLevel?: 1 | 2;
}

export function PreviousRosterTab({ snapshot, say, headingLevel = 2 }: PreviousRosterTabProps) {
  const { confirm, dialog } = useAsk();
  const [heldOnly, setHeldOnly] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [gridKey, setGridKey] = useState(0);
  const header = previousHeader(snapshot);
  const Heading = headingLevel === 1 ? 'h1' : 'h2';

  const lines = useMemo(
    () => snapshot.previousRoster.rows.map((row, index) => ({ index, row })),
    [snapshot.previousRoster],
  );
  const filter = useCallback(
    (line: PreviousLine) => !heldOnly || Boolean(line.row.vehicle),
    [heldOnly],
  );

  async function clearIt() {
    setProblem(null);
    const rows = snapshot.previousRoster.rows.length;
    if (rows === 0) {
      say('Nothing to clear - no previous roster kept.');
      return;
    }
    const yes = await confirm(
      'Clear the previous roster?',
      `Remove all ${rows} rows?\n\nVan assignment will stop putting drivers back in the van ` +
        'they had until you move a roster across again.',
      { danger: true },
    );
    if (!yes) return;
    const reply = await call('loadOut:clear-previous-roster');
    // Nothing else to do on success: the app says the data changed, and the snapshot follows.
    if (!reply.ok) {
      setProblem(explain(reply));
      return;
    }
    setHeldOnly(false);
    setGridKey((key) => key + 1);
    say('Previous roster cleared.');
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col" data-tab-panel="previous-roster">
      <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-2 border-b border-line bg-surface px-6 py-3">
        <div className="min-w-0">
          <Heading
            id={headingLevel === 1 ? 'title-previous-roster' : undefined}
            className={
              headingLevel === 1
                ? 'text-[1.6rem] leading-tight font-semibold'
                : 'text-lg font-semibold'
            }
          >
            {header.title}
          </Heading>
          <p className="text-sm text-muted">{header.source}</p>
        </div>
        <div className="text-right">
          <p className="text-lg font-semibold" data-testid="previous-roster-count">
            {header.count || 'No previous roster kept'}
          </p>
          {header.carry ? (
            <p className="text-sm text-muted" data-testid="previous-roster-carry">
              {header.carry}
            </p>
          ) : null}
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2 border-b border-line bg-surface px-6 py-2">
        <Button
          variant="danger"
          disabled={lines.length === 0}
          onClick={() => void clearIt()}
          data-testid="clear-previous-roster"
        >
          Clear Previous Roster
        </Button>
        {problem ? (
          <p
            role="alert"
            data-testid="previous-roster-action-problem"
            className="text-sm font-semibold text-bad"
          >
            {problem}
          </p>
        ) : null}
      </div>
      <div className="min-h-0 flex-1">
        <DataGrid
          key={gridKey}
          view="previous-roster"
          label="Previous roster"
          columns={COLUMNS}
          rows={lines}
          getRowId={(line) => String(line.index)}
          layoutStore={databaseLayoutStore}
          rowTone={(line) => (line.row.vehicle ? undefined : 'ghost')}
          filter={filter}
          onResetFilters={() => setHeldOnly(false)}
          filterControls={
            <label className="flex items-center gap-1.5 text-sm text-muted">
              <input
                type="checkbox"
                checked={heldOnly}
                onChange={(event) => setHeldOnly(event.target.checked)}
                data-testid="held-a-van"
              />
              <span>Held a van</span>
            </label>
          }
          searchPlaceholder="Search the previous roster"
          empty={{
            title: 'No previous roster kept.',
            body:
              "Press 'Move Data to Previous Roster' on the Roster tab at the end of the day. " +
              "Tomorrow's assignment will then put drivers back in the van they had.",
          }}
        />
      </div>
      {dialog}
    </div>
  );
}
