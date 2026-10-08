// Vehicle Management: the fleet, and whether each van can go out today. Ported from the old app's
// VehicleManagementPage. Grounding a van here is kept apart from the export, so tomorrow's import
// does not quietly put it back on the road.

import { FileDrop } from '../../components/FileDrop';
import { useCallback, useMemo, useState } from 'react';
import type { GridColumn, RowAction } from '../../components/DataGrid';
import { DataGrid } from '../../components/DataGrid';
import type { AppSnapshot, VehicleView } from '../../../shared/snapshot';
import { databaseLayoutStore } from '../../lib/gridLayoutStore';
import { Button } from '../../ui/button';
import { Chip } from '../../ui/chip';
import { bringInFile, command, dropRefused, readNow } from '../dataPages/bringIn';
import { baseName, nameList, sourceLine } from '../dataPages/format';
import { ConfirmDialog, PromptDialog } from '../dataPages/Modal';
import { ButtonStrip, FilterSelect, HeaderCard, type Messages } from '../dataPages/PageParts';
import { chosenRows, rowsForMenu, usePicks } from '../dataPages/picks';
import { useDialogs } from '../dataPages/useDialogs';
import {
  ALL_SERVICE_TYPES,
  ALL_VEHICLES,
  FLEET_COLUMNS,
  STATUS_OPTIONS,
  VEHICLE_EMPTY,
  fleetCountLine,
  fleetFlags,
  fleetMix,
  fleetTitle,
  passesFleetFilters,
  priorityProblem,
  registrationText,
  serviceOptions,
  stateText,
  vehicleCell,
  vehicleId,
  vehicleTone,
  vehiclesImportedMessage,
} from './vehicleRows';

export function ManagementTab({
  snapshot,
  messages,
}: {
  snapshot: AppSnapshot;
  messages: Messages;
}) {
  const { setStatus } = messages;
  const { ask, host } = useDialogs();
  const picks = usePicks();
  const [status, setStatusFilter] = useState<string>(ALL_VEHICLES);
  const [service, setService] = useState(ALL_SERVICE_TYPES);
  const [currentId, setCurrentId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const views = snapshot.vehicles;
  const today = snapshot.today;
  const empty = views.length === 0;
  const services = useMemo(() => serviceOptions(views), [views]);
  // The drop-down falls back to "all" when its service type is no longer in the fleet.
  const serviceChoice = services.includes(service) ? service : ALL_SERVICE_TYPES;

  const columns = useMemo<GridColumn<VehicleView>[]>(() => {
    const fleet = FLEET_COLUMNS.map<GridColumn<VehicleView>>((spec) => {
      const base: GridColumn<VehicleView> = {
        id: spec.id,
        header: spec.header,
        value: (view) => vehicleCell(view, spec.id, today),
        align: 'align' in spec ? spec.align : undefined,
        mono: 'mono' in spec ? spec.mono : undefined,
      };
      if (spec.id === 'state') {
        return {
          ...base,
          fitExtra: 24,
          cell: (view) => {
            const { text, tone } = stateText(view);
            return tone ? <Chip tone="bad">{text}</Chip> : <span className="truncate">{text}</span>;
          },
        };
      }
      if (spec.id === 'registration') {
        return {
          ...base,
          fitExtra: 24,
          cell: (view) => {
            const { text, tone } = registrationText(view, today);
            if (!text) return <span className="text-faint">-</span>;
            return tone ? (
              <Chip tone={tone}>{text}</Chip>
            ) : (
              <span className="truncate">{text}</span>
            );
          },
        };
      }
      return base;
    });
    return [picks.column(vehicleId), ...fleet];
  }, [today, picks]);

  const filter = useCallback(
    (view: VehicleView) => passesFleetFilters(view, status, serviceChoice),
    [status, serviceChoice],
  );
  const rowTone = useCallback(
    (view: VehicleView) => vehicleTone(view, today) || undefined,
    [today],
  );

  // ---------------------------------------------------------------- the actions

  function theChosen(clicked?: VehicleView): VehicleView[] {
    const rows = clicked
      ? rowsForMenu(views, vehicleId, picks.ids, clicked)
      : chosenRows(
          views,
          vehicleId,
          picks.ids,
          views.find((view) => vehicleId(view) === currentId) ?? null,
        );
    if (rows.length === 0) setStatus('Select a vehicle first.');
    return rows;
  }

  async function ground(rows: VehicleView[]) {
    if (rows.length === 0) return;
    // Mixed selection: bring everything to whatever the first one isn't.
    const target = !rows[0]!.operational;
    const reply = await command(messages, 'vehicles:set-operational', {
      vins: rows.map((view) => view.vehicle.vin),
      operational: target,
    });
    if (!reply.ok) return;
    setStatus(
      `${nameList(rows.map((view) => view.vehicle.name))} ${target ? 'back in service' : 'grounded'}.`,
    );
  }

  async function setPriority(rows: VehicleView[]) {
    if (rows.length === 0) return;
    const names = rows
      .slice(0, 4)
      .map((view) => view.vehicle.name)
      .join(', ');
    const answer = await ask<string>((done) => (
      <PromptDialog
        title="Set priority"
        body={`Priority number for ${names}${rows.length > 4 ? ' and others' : ''}.\n\nHigher goes out first, to the longest-serving driver who can take it. A van with no number sits below every van that has one. Leave it empty to remove the number.`}
        initial={rows[0]!.priority}
        check={priorityProblem}
        onDone={done}
      />
    ));
    if (answer === null) return;
    const reply = await command(messages, 'vehicles:set-priority', {
      vins: rows.map((view) => view.vehicle.vin),
      priority: answer,
    });
    if (!reply.ok) return;
    const listed = nameList(rows.map((view) => view.vehicle.name));
    setStatus(answer ? `${listed} set to priority ${answer}.` : `Priority removed from ${listed}.`);
  }

  async function matchExport(rows: VehicleView[]) {
    if (rows.length === 0) return;
    const reply = await command(messages, 'vehicles:match-export', {
      vins: rows.map((view) => view.vehicle.vin),
    });
    if (!reply.ok) return;
    setStatus(
      reply.value.reset > 0
        ? `${reply.value.reset} vehicle(s) back to the status in the export.`
        : 'Those vehicles already match the export.',
    );
  }

  async function importVehicles(dropped?: string) {
    if (busy) return;
    setBusy(true);
    try {
      const done = await bringInFile('vehicles', messages, dropped);
      if (!done) return;
      setStatusFilter(ALL_VEHICLES);
      setService(ALL_SERVICE_TYPES);
      picks.clear();
      const fresh = await readNow();
      if (fresh) setStatus(vehiclesImportedMessage(fresh, done.rows, baseName(done.path)));
    } finally {
      setBusy(false);
    }
  }

  async function confirmThen(
    title: string,
    body: string,
    name: 'vehicles:clear' | 'vehicles:clear-overrides' | 'vehicles:clear-priorities',
    message: string,
  ) {
    const yes = await ask<boolean>((done) => (
      <ConfirmDialog
        title={title}
        body={body}
        confirmLabel="Yes, clear"
        cancelLabel="No, keep it"
        danger
        onDone={done}
      />
    ));
    if (!yes) return;
    const reply = await command(messages, name);
    if (!reply.ok) return;
    picks.clear();
    setStatus(message);
  }

  function clearVehicles() {
    if (empty) {
      setStatus('Nothing to clear - no vehicles loaded.');
      return;
    }
    void confirmThen(
      'Clear vehicles?',
      `Remove all ${views.length} vehicles?\n\nVan affinity and any statuses you set here are kept, and come back when you import the fleet again.`,
      'vehicles:clear',
      'Vehicles cleared.',
    );
  }

  function clearOverrides() {
    if (snapshot.counts.overriddenVehicles === 0) {
      setStatus('No van has a status set here.');
      return;
    }
    void confirmThen(
      'Go back to the export?',
      `Put all ${snapshot.counts.overriddenVehicles} vans with a status set here back to what the export says?`,
      'vehicles:clear-overrides',
      'Every van is back to the status in the export.',
    );
  }

  function clearPriorities() {
    if (views.every((view) => view.priority === '')) {
      setStatus('No van has a priority number.');
      return;
    }
    void confirmThen(
      'Clear priorities?',
      'Remove the priority number from every van?\n\nVans then go out in the usual order.',
      'vehicles:clear-priorities',
      'Priorities cleared.',
    );
  }

  const rowActions = useMemo<RowAction<VehicleView>[]>(
    () => [
      {
        id: 'ground',
        label: 'Ground / return to service',
        onSelect: (view) => void ground(theChosen(view)),
      },
      {
        id: 'priority',
        label: 'Set priority...',
        onSelect: (view) => void setPriority(theChosen(view)),
      },
      {
        id: 'match-export',
        label: 'Match the export again',
        onSelect: (view) => void matchExport(theChosen(view)),
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps -- the actions read the latest rows and ticks on each render
    [views, picks.ids],
  );

  function activate(view: VehicleView, columnId: string) {
    if (columnId === 'pick') picks.toggle(vehicleId(view));
    // Double-click, Enter or Space flips this van, as double-clicking a row did.
    else void ground([view]);
  }

  return (
    <FileDrop
      page="vehicle-data"
      kind="vehicles"
      onDropped={(token) => void importVehicles(token)}
      onProblem={(words) => dropRefused(messages, words)}
    >
      <HeaderCard
        name="fleet"
        title={empty ? 'No vehicles loaded' : fleetTitle(views)}
        sub={
          empty
            ? ''
            : sourceLine(snapshot.sources.vehicles.sourceFile, snapshot.sources.vehicles.importedAt)
        }
        metric={empty ? '0 vehicles' : fleetCountLine(views)}
        details={empty ? [] : [fleetMix(views), fleetFlags(snapshot)]}
      />
      <ButtonStrip label="Vehicle actions">
        <Button onClick={() => void importVehicles()} disabled={busy} data-testid="import-vehicles">
          Import Vehicles
        </Button>
        <Button onClick={() => void ground(theChosen())} data-testid="ground-return">
          Ground / Return
        </Button>
        <Button onClick={() => void setPriority(theChosen())} data-testid="set-priority">
          Set Priority
        </Button>
        <Button onClick={clearVehicles} data-testid="clear-vehicles">
          Clear Vehicles
        </Button>
        <Button onClick={clearOverrides} data-testid="clear-overrides">
          Match All to Export
        </Button>
        <Button onClick={clearPriorities} data-testid="clear-priorities">
          Clear Priorities
        </Button>
        {picks.ids.size > 0 ? (
          <span className="text-sm text-muted" data-testid="picked-count">
            {picks.ids.size} picked.{' '}
            <button type="button" className="underline" onClick={picks.clear}>
              Clear the ticks
            </button>
          </span>
        ) : (
          <span className="text-sm text-muted">
            Tick vans in the first column to change several at once.
          </span>
        )}
      </ButtonStrip>
      <div className="min-h-0 flex-1">
        <DataGrid
          view="vehicles"
          label="Fleet"
          columns={columns}
          rows={views}
          getRowId={vehicleId}
          layoutStore={databaseLayoutStore}
          rowActions={rowActions}
          onRowActivate={activate}
          onSelectionChange={(view) => setCurrentId(view ? vehicleId(view) : null)}
          rowTone={rowTone}
          needsAttention={(view) => vehicleTone(view, today) !== ''}
          filter={filter}
          filterControls={
            <>
              <FilterSelect
                label="Status"
                value={status}
                options={STATUS_OPTIONS}
                onChange={setStatusFilter}
                testId="vehicle-status-filter"
              />
              <FilterSelect
                label="Service"
                value={serviceChoice}
                options={services}
                onChange={setService}
                testId="vehicle-service-filter"
              />
            </>
          }
          onResetFilters={() => {
            setStatusFilter(ALL_VEHICLES);
            setService(ALL_SERVICE_TYPES);
          }}
          empty={VEHICLE_EMPTY}
        />
      </div>
      {host}
    </FileDrop>
  );
}
