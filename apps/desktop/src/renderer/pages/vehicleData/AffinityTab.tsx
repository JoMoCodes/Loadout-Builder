// Van Affinity: which associates belong to which van. A van takes two preferred drivers and two
// backups; a driver holds one van of each kind. Assignments are made on the vehicle side, off
// where the pointer is (double-click a driver column, or right-click it). "Group by vehicle"
// turned off shows one row per associate with their primary and secondary van, read only.
// Ported from the old app's VanAffinityPage.

import { useCallback, useMemo, useState } from 'react';
import type { GridColumn, RowAction } from '../../components/DataGrid';
import { DataGrid } from '../../components/DataGrid';
import type { AffinitySlotId } from '../../../shared/channels/vehicles';
import type { AppSnapshot, VehicleView } from '../../../shared/snapshot';
import { databaseLayoutStore } from '../../lib/gridLayoutStore';
import { Button } from '../../ui/button';
import { command } from '../dataPages/bringIn';
import { ConfirmDialog, MessageDialog } from '../dataPages/Modal';
import { ButtonStrip, FilterCheck, HeaderCard, type Messages } from '../dataPages/PageParts';
import { useDialogs } from '../dataPages/useDialogs';
import { DriverDialog, type DriverChoice } from './DriverDialog';
import {
  AFFINITY_EMPTY,
  SLOTS,
  affinityCounts,
  assignedMessage,
  driverSideRows,
  emptiedMessage,
  gaveUpText,
  holdsSummary,
  isSlot,
  slotCell,
  slotLabel,
  type DriverSideRow,
} from './affinityRows';
import { vehicleId } from './vehicleRows';

export function AffinityTab({ snapshot, messages }: { snapshot: AppSnapshot; messages: Messages }) {
  const { setStatus } = messages;
  const { ask, host } = useDialogs();
  const [byVehicle, setByVehicle] = useState(true);
  const [operationalOnly, setOperationalOnly] = useState(false);

  const counts = affinityCounts(snapshot);
  const views = snapshot.vehicles;

  // ------------------------------------------------------------ the vehicle side

  const vehicleColumns = useMemo<GridColumn<VehicleView>[]>(
    () => [
      { id: 'name', header: 'Vehicle', value: (view) => view.vehicle.name },
      {
        id: 'state',
        header: 'Status',
        value: (view) => (view.operational ? 'Operational' : 'Grounded'),
      },
      { id: 'service_type', header: 'Service Type', value: (view) => view.vehicle.serviceType },
      ...SLOTS.map<GridColumn<VehicleView>>(({ id, label }) => ({
        id,
        header: label,
        value: (view) => slotCell(snapshot, view, id),
      })),
    ],
    [snapshot],
  );

  async function assignSlot(view: VehicleView, slot: string) {
    if (!isSlot(slot)) {
      setStatus('Double-click one of the driver columns to set it.');
      return;
    }
    if (snapshot.associates.length === 0) {
      await ask<boolean>((done) => (
        <MessageDialog
          title="No associate data"
          body="Import the associate export on the Associates page first - affinity is set against those records."
          onDone={() => done(true)}
        />
      ));
      return;
    }
    const currentId = view.affinity[slot] ?? '';
    const choice = await ask<DriverChoice>((done) => (
      <DriverDialog
        vehicleName={view.vehicle.name}
        slotLabel={slotLabel(slot)}
        associates={snapshot.associates}
        currentId={currentId}
        holds={holdsSummary(snapshot)}
        occupied={Boolean(currentId)}
        onDone={done}
      />
    ));
    if (choice === null) return;

    if (choice.action === 'clear') {
      const reply = await command(messages, 'vehicles:clear-affinity', {
        vin: view.vehicle.vin,
        slot: slot as AffinitySlotId,
      });
      if (reply.ok) setStatus(emptiedMessage(slot, view.vehicle.name));
      return;
    }
    const reply = await command(messages, 'vehicles:set-affinity', {
      vin: view.vehicle.vin,
      slot: slot as AffinitySlotId,
      transporterId: choice.transporterId,
    });
    if (!reply.ok) return;
    const person = snapshot.associates.find(
      (candidate) => candidate.associate.transporterId === choice.transporterId,
    );
    setStatus(
      assignedMessage(person?.associate.name ?? choice.transporterId, slot, view.vehicle.name) +
        gaveUpText(snapshot, reply.value.displaced),
    );
  }

  async function emptySlot(view: VehicleView, slot: string) {
    if (!isSlot(slot)) {
      setStatus('Right-click the slot you want to empty.');
      return;
    }
    if (!view.affinity[slot]) {
      setStatus('That slot is already empty.');
      return;
    }
    const reply = await command(messages, 'vehicles:clear-affinity', {
      vin: view.vehicle.vin,
      slot: slot as AffinitySlotId,
    });
    if (reply.ok) setStatus(emptiedMessage(slot, view.vehicle.name));
  }

  const vehicleActions = useMemo<RowAction<VehicleView>[]>(
    () => [
      {
        id: 'assign',
        label: 'Assign driver...',
        appliesTo: (_view, column) => isSlot(column),
        onSelect: (view, column) => void assignSlot(view, column),
      },
      {
        id: 'empty',
        label: 'Empty this slot',
        appliesTo: (_view, column) => isSlot(column),
        onSelect: (view, column) => void emptySlot(view, column),
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps -- the actions read the latest snapshot on each render
    [snapshot],
  );

  const vehicleFilter = useCallback(
    (view: VehicleView) => !operationalOnly || view.operational,
    [operationalOnly],
  );

  // --------------------------------------------------------------- the driver side

  const driverRows = useMemo(() => driverSideRows(snapshot), [snapshot]);
  const driverColumns = useMemo<GridColumn<DriverSideRow>[]>(
    () => [
      { id: 'name', header: 'Associate', value: (row) => row.view.associate.name },
      { id: 'vans', header: 'Vans', value: (row) => row.view.vanBadges },
      { id: 'status', header: 'Status', value: (row) => row.view.associate.status },
      { id: 'primary', header: 'Primary Van', value: (row) => row.primary },
      { id: 'secondary', header: 'Secondary Van', value: (row) => row.secondary },
    ],
    [],
  );

  async function clearAll() {
    if (counts.assignments === 0) {
      setStatus('No affinity set yet.');
      return;
    }
    const yes = await ask<boolean>((done) => (
      <ConfirmDialog
        title="Clear van affinity?"
        body={`Remove all ${counts.assignments} driver assignments?\n\nThis cannot be undone.`}
        confirmLabel="Yes, clear"
        cancelLabel="No, keep it"
        danger
        onDone={done}
      />
    ));
    if (!yes) return;
    const reply = await command(messages, 'vehicles:clear-all-affinity');
    if (reply.ok) setStatus('Van affinity cleared.');
  }

  return (
    <>
      <HeaderCard
        name="affinity"
        title="Van Affinity"
        sub="A van takes two preferred drivers and two backups. A driver holds one van of each kind."
        metric={`${counts.assignments} assignments`}
        details={
          counts.assignments === 0 ? [] : [`${counts.drivers} drivers across ${counts.vans} vans`]
        }
      />
      <ButtonStrip label="Van affinity actions">
        <FilterCheck
          label="Group by vehicle"
          checked={byVehicle}
          onChange={setByVehicle}
          testId="group-by-vehicle"
        />
        <Button onClick={() => void clearAll()} data-testid="clear-all-affinity">
          Clear All
        </Button>
        {byVehicle ? (
          <FilterCheck
            label="Operational only"
            checked={operationalOnly}
            onChange={setOperationalOnly}
            testId="affinity-operational-only"
          />
        ) : (
          <span className="text-sm text-muted">
            Read only - switch on "Group by vehicle" to change who belongs to which van.
          </span>
        )}
      </ButtonStrip>
      <div className="min-h-0 flex-1">
        {byVehicle ? (
          <DataGrid
            view="van-affinity"
            label="Van affinity by vehicle"
            columns={vehicleColumns}
            rows={views}
            getRowId={vehicleId}
            layoutStore={databaseLayoutStore}
            rowActions={vehicleActions}
            noActionText="Right-click the driver column you want to set."
            onRowActivate={(view, column) => void assignSlot(view, column)}
            rowTone={(view) => (view.operational ? undefined : 'ghost')}
            filter={vehicleFilter}
            onResetFilters={() => setOperationalOnly(false)}
            empty={AFFINITY_EMPTY}
          />
        ) : (
          <DataGrid
            view="van-affinity-drivers"
            label="Van affinity by associate"
            columns={driverColumns}
            rows={driverRows}
            getRowId={(row) => row.view.associate.transporterId || row.view.associate.name}
            layoutStore={databaseLayoutStore}
            onRowActivate={() => setStatus("Switch to 'Group by vehicle' to change affinity.")}
            rowTone={(row) =>
              row.view.associate.status.trim().toUpperCase() === 'ACTIVE' ? undefined : 'ghost'
            }
            empty={{
              title: 'No associate data loaded.',
              body: 'Import the associate export on the Associates page first.',
            }}
          />
        )}
      </div>
      {host}
    </>
  );
}
