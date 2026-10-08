// One export's tab on the Route Data page (Routes, Itineraries or Weekly Schedule): bring the
// file in, see it, put its dispatch times into PADs, say who a shared route belongs to, clear it.
// Ported from the old app's RouteSourcePage.

import { FileDrop } from '../../components/FileDrop';
import {
  ROUTE_ITINERARIES,
  ROUTE_SCHEDULE,
  dispatchTimes,
  driverOptions,
  longDateLabel,
  routeDataDateLabel,
  sharedRows,
  workload,
} from '@loadout/core';
import { useCallback, useMemo, useState } from 'react';
import { call, explain } from '../../lib/channels';
import { DataGrid, type GridColumn, type RowAction } from '../../components/DataGrid';
import { databaseLayoutStore } from '../../lib/gridLayoutStore';
import { Button } from '../../ui/button';
import type { AppSnapshot, RouteSetView } from '../../../shared/snapshot';
import type { RouteKindName } from '../../../shared/channels/routeData';
import { bringInFile, dropRefused, readNow } from '../dataPages/bringIn';
import { baseName, sourceLine } from '../dataPages/format';
import { ConfirmDialog } from '../dataPages/Modal';
import { ButtonStrip, FilterSelect, HeaderCard, type Messages } from '../dataPages/PageParts';
import { useDialogs } from '../dataPages/useDialogs';
import { PadDialog } from './PadDialog';
import { SharedRouteDialog, type SharedRouteItem } from './SharedRouteDialog';
import {
  ALL_PADS,
  PAD_FILTER_OPTIONS,
  ROUTE_COLUMNS,
  ROUTE_HINTS,
  adoptMessage,
  buildRouteRows,
  importedMessage,
  padSummary,
  padsMessage,
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
  const [busy, setBusy] = useState(false);

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

  // ---------------------------------------------------------------- the windows

  /** Asks who each shared route belongs to. Returns true if the answers were saved. */
  const askShared = useCallback(
    async (items: SharedRouteItem[], revision: number, current: RouteSetView) => {
      const chosen = await ask<Map<number, string>>((done) => (
        <SharedRouteDialog sourceLabel={current.label} items={items} onDone={done} />
      ));
      if (chosen === null) return null;
      const choices = items
        .map(({ index }) => ({ rowIndex: index, transporterId: chosen.get(index) ?? '' }))
        .filter((choice) => choice.transporterId !== '');
      const reply = await call('routeData:set-route-drivers', { kind, revision, choices });
      if (!reply.ok) {
        setProblem({ title: 'That did not go through', message: explain(reply) });
        return null;
      }
      return choices;
    },
    [ask, kind, setProblem],
  );

  const resolveShared = useCallback(
    async (fresh: AppSnapshot, afterImport: boolean) => {
      const current = fresh.routeSets.find((candidate) => candidate.kind === kind);
      if (!current) return;
      const shared = sharedRows(current);
      if (shared.length === 0) {
        if (!afterImport)
          setStatus(`No ${current.label} route came through with more than one driver.`);
        return;
      }
      const items = current.rows
        .map((entry, index) => ({ index, entry }))
        .filter(({ entry }) => shared.includes(entry));
      const saved = await askShared(items, fresh.revision, current);
      if (saved === null) {
        setStatus(
          `${shared.length} shared route(s) left as imported - right-click the Driver column to set them.`,
        );
        return;
      }
      setStatus(`Assigned ${shared.length} shared route(s) to one driver each.`);
    },
    [askShared, kind, setStatus],
  );

  const assignPads = useCallback(
    async (afterImport = false, from?: AppSnapshot) => {
      const latest = from ?? (await readNow());
      const current = latest?.routeSets.find((candidate) => candidate.kind === kind);
      if (!current || current.rows.length === 0) {
        setStatus(`Import a ${label} export first.`);
        return;
      }
      const chosen = await ask<Record<string, number>>((done) => (
        <PadDialog
          sourceLabel={current.label}
          dayLabel={routeDataDateLabel(current)}
          times={dispatchTimes(current)}
          current={current.pads}
          onDone={done}
        />
      ));
      if (chosen === null) {
        if (afterImport) {
          setStatus(
            `Imported ${current.rows.length} rows - no PADs assigned yet. Use 'Assign PADs' when you're ready.`,
          );
        }
        return;
      }
      const reply = await call('routeData:set-pads', { kind, pads: chosen });
      if (!reply.ok) {
        setProblem({ title: 'That did not go through', message: explain(reply) });
        return;
      }
      setStatus(padsMessage(current.label, current, chosen));
    },
    [ask, kind, label, setProblem, setStatus],
  );

  // ---------------------------------------------------------------- the buttons

  async function importExport(dropped?: string) {
    if (busy) return;
    setBusy(true);
    try {
      const done = await bringInFile(kind, messages, dropped);
      if (!done) return;
      setPadFilter(ALL_PADS);
      const fresh = await readNow();
      const current = fresh?.routeSets.find((candidate) => candidate.kind === kind);
      if (!fresh || !current) return;
      const times = dispatchTimes(current).length;
      setStatus(importedMessage(current.rows.length, baseName(done.path), times));
      await resolveShared(fresh, true);
      await assignPads(true, fresh);
    } finally {
      setBusy(false);
    }
  }

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
        body={`Remove all ${rows.length} rows and their PAD assignments?\n\nThe other exports and the load-out roster are kept.`}
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
    const saved = await askShared([{ index: row.index, entry: row.entry }], snapshot.revision, set);
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
    <FileDrop
      page="route-data"
      kind={kind}
      onDropped={(token) => void importExport(token)}
      onProblem={(words) => dropRefused(messages, words)}
    >
      <HeaderCard
        name={`route-${kind}`}
        title={empty ? `No ${label} export loaded` : `${label}  -  ${routeDataDateLabel(set!)}`}
        sub={empty ? `Reads for ${day}.` : sourceLine(set!.sourceFile, set!.importedAt)}
        metric={empty ? '0 rows' : routeMetric(set!)}
        details={details}
      />
      <ButtonStrip label={`${label} actions`}>
        <Button onClick={() => void importExport()} disabled={busy} data-testid={`import-${kind}`}>
          Import {label}
        </Button>
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
    </FileDrop>
  );
}
