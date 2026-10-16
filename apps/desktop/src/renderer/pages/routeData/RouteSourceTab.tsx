// One route file's tab on the Load Out page (Routes, Itineraries or Weekly Schedule), shown while
// that file is loaded: see it, put its dispatch times into PADs, say who a shared route belongs
// to, clear it. The file comes in with Import Route Data on the Roster. Ported from the old app's
// RouteSourcePage.

import {
  ROUTE_ITINERARIES,
  ROUTE_SCHEDULE,
  driverOptions,
  longDateLabel,
  routeDataDateLabel,
  workload,
} from '@loadout/core';
import { useCallback, useMemo, useState } from 'react';
import { call, explain } from '../../lib/channels';
import { DataGrid, type GridColumn, type RowAction } from '../../components/DataGrid';
import { databaseLayoutStore } from '../../lib/gridLayoutStore';
import { Button } from '../../ui/button';
import type { AppSnapshot } from '../../../shared/snapshot';
import type { RouteKindName } from '../../../shared/channels/routeData';
import { sourceLine } from '../dataPages/format';
import { ConfirmDialog } from '../dataPages/Modal';
import { ButtonStrip, FilterSelect, HeaderCard, type Messages } from '../dataPages/PageParts';
import { useDialogs } from '../dataPages/useDialogs';
import { askShared, assignPads as askPads } from './followUp';
import {
  ALL_PADS,
  PAD_FILTER_OPTIONS,
  ROUTE_COLUMNS,
  ROUTE_HINTS,
  adoptMessage,
  buildRouteRows,
  padSummary,
  passesPadFilter,
  routeCell,
  routeMetric,
  routeNotes,
  routeTone,
  type RouteRow,
} from './routeRows';

interface RouteSourceTabProps {
  kind: RouteKindName;
  snapshot: AppSnapshot;
  messages: Messages;
}

const rowId = (row: RouteRow) => String(row.index);

export function RouteSourceTab({ kind, snapshot, messages }: RouteSourceTabProps) {
  const { setStatus, setProblem } = messages;
  const set = snapshot.routeSets.find((candidate) => candidate.kind === kind);
  const { ask, host } = useDialogs();
  const [padFilter, setPadFilter] = useState(ALL_PADS);

  const label = set?.label ?? kind;
  const haveBook = snapshot.associates.length > 0;
  const knownIds = useMemo(
    () => new Set(snapshot.associates.map((view) => view.associate.transporterId)),
    [snapshot.associates],
  );
  const rows = useMemo(() => (set ? buildRouteRows(set, knownIds) : []), [set, knownIds]);
  const empty = rows.length === 0;

  const columns = useMemo<GridColumn<RouteRow>[]>(
    () =>
      ROUTE_COLUMNS[kind]!.map((spec) => ({
        id: spec.id,
        header: spec.header,
        value: (row: RouteRow) => routeCell(row, spec.id),
        align: spec.align,
        mono: spec.mono,
      })),
    [kind],
  );

  // ---------------------------------------------------------------- the buttons

  const assignPads = useCallback(() => askPads(ask, messages, kind), [ask, messages, kind]);

  async function grabSchedulePads() {
    const reply = await call('routeData:adopt-schedule-pads', { kind });
    // Each stop the old button had is a refusal in the old words, shown as the status.
    if (!reply.ok) {
      setStatus(explain(reply));
      return;
    }
    setStatus(adoptMessage(reply.value));
  }

  async function clearExport() {
    if (empty) {
      setStatus(`Nothing to clear - no ${label} export loaded.`);
      return;
    }
    const yes = await ask<boolean>((done) => (
      <ConfirmDialog
        title={`Clear ${label}?`}
        body={`Remove all ${rows.length} rows and their PAD assignments?\n\nThe other route files and the roster are kept. To take route data off the roster too, use Clear Route Data on the Roster.`}
        confirmLabel="Yes, clear"
        cancelLabel="No, keep it"
        danger
        onDone={done}
      />
    ));
    if (!yes) return;
    const reply = await call('routeData:clear', { kind });
    if (!reply.ok) {
      setProblem({ title: 'That did not go through', message: explain(reply) });
      return;
    }
    setPadFilter(ALL_PADS);
    setStatus(`${label} cleared.`);
  }

  async function chooseDriver(row: RouteRow) {
    if (!row.shared) {
      setStatus(
        `${workload(row.entry) || 'That row'} came through with one driver - nothing to choose.`,
      );
      return;
    }
    if (!set) return;
    const saved = await askShared(
      ask,
      messages,
      kind,
      [{ index: row.index, entry: row.entry }],
      snapshot.revision,
      set,
    );
    const chosen = saved?.[0];
    if (!chosen) return;
    const name =
      driverOptions(row.entry).find(([, id]) => id === chosen.transporterId)?.[0] ||
      chosen.transporterId;
    setStatus(`${workload(row.entry) || 'Route'} is assigned to ${name}.`);
  }

  // ---------------------------------------------------------------- the table

  const rowActions = useMemo<RowAction<RouteRow>[]>(
    () => [
      {
        id: 'choose-driver',
        label: 'Who is this route assigned to?...',
        appliesTo: (_row, column) => column === 'driver_name' || column === 'transporter_id',
        onSelect: (row) => void chooseDriver(row),
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps -- chooseDriver reads the latest snapshot on each render
    [snapshot, set],
  );

  const filter = useCallback((row: RouteRow) => passesPadFilter(row, padFilter), [padFilter]);
  const rowTone = useCallback((row: RouteRow) => routeTone(row, haveBook), [haveBook]);
  const needsAttention = useCallback(
    (row: RouteRow) => routeTone(row, haveBook) === 'warn',
    [haveBook],
  );
  const layoutStore = databaseLayoutStore;

  const day = longDateLabel(snapshot.loadOutDate ?? snapshot.today);
  const hint = ROUTE_HINTS[kind]!;
  const details =
    set && !empty ? [padSummary(set), routeNotes(set, knownIds, haveBook).join('   ')] : [];

  return (
    <div className="flex min-h-0 flex-1 flex-col" data-tab={kind}>
      <HeaderCard
        name={`route-${kind}`}
        title={empty ? `No ${label} export loaded` : `${label}  -  ${routeDataDateLabel(set!)}`}
        sub={empty ? `Reads for ${day}.` : sourceLine(set!.sourceFile, set!.importedAt)}
        metric={empty ? '0 rows' : routeMetric(set!)}
        details={details}
      />
      <ButtonStrip label={`${label} actions`}>
        <Button onClick={() => void assignPads()} data-testid={`assign-pads-${kind}`}>
          Assign PADs
        </Button>
        {kind === ROUTE_ITINERARIES ? (
          // The morning file has no dispatch times to hang a PAD map on, so each driver's PAD
          // comes over from the schedule instead.
          <Button onClick={() => void grabSchedulePads()} data-testid="pads-from-schedule">
            PADs from Schedule
          </Button>
        ) : null}
        <Button onClick={() => void clearExport()} data-testid={`clear-${kind}`}>
          Clear
        </Button>
        {kind === ROUTE_SCHEDULE ? (
          <span className="text-sm text-muted">Only the load-out day is read: {day}.</span>
        ) : null}
      </ButtonStrip>
      <div className="min-h-0 flex-1">
        <DataGrid
          view={`route-data-${kind}`}
          label={`${label} export`}
          columns={columns}
          rows={rows}
          getRowId={rowId}
          layoutStore={layoutStore}
          rowActions={rowActions}
          noActionText="Right-click the Driver or Transporter ID column to change who a route is assigned to."
          onRowActivate={() => void assignPads()}
          needsAttention={needsAttention}
          rowTone={rowTone}
          filter={filter}
          filterControls={
            <FilterSelect
              label="PAD"
              value={padFilter}
              options={PAD_FILTER_OPTIONS}
              onChange={setPadFilter}
              testId={`pad-filter-${kind}`}
            />
          }
          onResetFilters={() => setPadFilter(ALL_PADS)}
          empty={hint}
        />
      </div>
      {host}
    </div>
  );
}
