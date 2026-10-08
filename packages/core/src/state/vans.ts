// The van side of the day's state: which vans are in service, the numbers set against vans, and
// handing vans out (automatically or by hand).
//
// Ported from the vehicle and assignment methods of the old app's AppState (state.py). Each takes
// the state as its first argument and `AppState` delegates to them: `assignVans(state)` is
// Python's `state.assign_vans()`. LMR approval, van affinity and the van badges live on
// `AppState` itself.

import { BY_HAND, methodLabel, plan, type AssignmentResult, type Candidate } from '../assignment';
import { needsVan, type DriverRow } from '../models/roster';
import { isRental, manualOnly, type Vehicle } from '../models/vehicles';
import { pyStrip } from '../models/text';
import type { AppState } from './appState';
import { rosterToStored } from './store';

function saveRoster(state: AppState): void {
  state.store.saveRoster(rosterToStored(state.roster));
}

// ------------------------------------------------------------- vehicles

/** What the export said, unless it has been changed here. */
export function isOperational(state: AppState, vehicle: Vehicle): boolean {
  const override = state.vehicleOverrides.get(vehicle.vin);
  return override === undefined ? vehicle.operational : override;
}

export function isOverridden(state: AppState, vehicle: Vehicle): boolean {
  const override = state.vehicleOverrides.get(vehicle.vin);
  return override !== undefined && override !== vehicle.operational;
}

/**
 * Ground a van or put it back in service. Stored apart from the export, so re-importing tomorrow's
 * vehicle data doesn't quietly undo it.
 */
export function setOperational(state: AppState, vehicle: Vehicle, operational: boolean): void {
  if (operational === vehicle.operational) {
    // Back in step with the export - drop the override entirely.
    state.store.deleteVehicleOverride(vehicle.vin);
    state.vehicleOverrides.delete(vehicle.vin);
  } else {
    state.store.setVehicleOverride(vehicle.vin, operational);
    state.vehicleOverrides.set(vehicle.vin, operational);
  }
  state.notify();
}

export function operationalVehicles(state: AppState): Vehicle[] {
  return state.vehicles.rows.filter((v) => isOperational(state, v));
}

/** What auto-assignment may draw on. Self-owned vans are always handed out by hand. */
export function assignableVehicles(state: AppState): Vehicle[] {
  return operationalVehicles(state).filter((v) => !manualOnly(v));
}

/**
 * Operational vans nobody on the roster is holding right now. Includes the self-owned ones - those
 * are exactly what you'd be looking at this list to hand out.
 */
export function availableVehicles(state: AppState): Vehicle[] {
  const inUse = new Set<string>();
  for (const row of state.roster.rows) if (row.vin) inUse.add(row.vin);
  for (const row of state.roster.rows) if (row.vehicle) inUse.add(row.vehicle);
  return operationalVehicles(state).filter((v) => !inUse.has(v.vin) && !inUse.has(v.name));
}

export function lmrVehicles(state: AppState): Vehicle[] {
  return state.vehicles.rows.filter((v) => isRental(v));
}

export function overriddenCount(state: AppState): number {
  return state.vehicles.rows.filter((v) => isOverridden(state, v)).length;
}

// ----------------------------------------------------- vehicle priority

export function vehiclePriority(state: AppState, vehicle: Vehicle): string {
  return state.vehiclePriorities.get(vehicle.vin) ?? '';
}

export function setVehiclePriority(state: AppState, vehicle: Vehicle, priority: string): void {
  const text = pyStrip(priority || '');
  state.store.setVehiclePriority(vehicle.vin, text);
  if (text) state.vehiclePriorities.set(vehicle.vin, text);
  else state.vehiclePriorities.delete(vehicle.vin);
  state.notify();
}

// ------------------------------------------------------- van assignment

/**
 * Fill the roster's Vehicle and VIN columns from the fleet. A full recompute rather than a top-up:
 * every route driver's van is worked out again.
 */
export function assignVans(state: AppState): AssignmentResult {
  const candidates: Candidate[] = state.roster.rows
    .filter((row) => needsVan(row))
    .map((row) => ({ row, associate: state.associateFor(row) }));
  const result = plan(
    candidates,
    assignableVehicles(state),
    state.affinity,
    state.lmrApproved,
    state.previousVans(),
    state.vehiclePriorities,
  );

  // Every row, not just the ones in scope: a driver who loses their route loses the van with it.
  for (const row of state.roster.rows) {
    row.vehicle = '';
    row.vin = '';
    row.assignMethod = '';
  }
  candidates.forEach((candidate, index) => {
    const assignment = result.assignments[index];
    if (assignment && assignment.vehicle !== null) {
      candidate.row.vehicle = assignment.vehicle.name;
      candidate.row.vin = assignment.vehicle.vin;
      candidate.row.assignMethod = assignment.method;
    }
  });

  saveRoster(state);
  state.notify();
  return result;
}

type RowField = keyof DriverRow;

/**
 * Everything a route carries with it when it changes hands. The three DWP fields describe the
 * route, not the driver, so they travel with it.
 */
export const ROUTE_PACKAGE: readonly RowField[] = [
  'routes',
  'serviceType',
  'waveTime',
  'pad',
  'vehicle',
  'vin',
  'stagingLocation',
  'bags',
  'ovs',
];
export const VAN_PACKAGE: readonly RowField[] = ['vehicle', 'vin'];

/** `_swap`: trade these fields between two rows. Both then say the van was given by hand. */
export function swap(
  state: AppState,
  source: DriverRow,
  target: DriverRow,
  fields: readonly RowField[],
): void {
  for (const name of fields) {
    const held = source[name];
    source[name] = target[name];
    target[name] = held;
  }
  // The reason doesn't travel with the van - it was about the driver who had it.
  for (const row of [source, target]) row.assignMethod = row.vehicle || row.vin ? BY_HAND : '';
  saveRoster(state);
  state.notify();
}

/** Hand a route to someone else, van and all, swapping if they already had one. */
export function reassignRoute(state: AppState, source: DriverRow, target: DriverRow): void {
  swap(state, source, target, ROUTE_PACKAGE);
}

/** Hand a van to someone else, swapping if they already had one. */
export function reassignVan(state: AppState, source: DriverRow, target: DriverRow): void {
  swap(state, source, target, VAN_PACKAGE);
}

/** Put a driver in a specific van, by hand. */
export function giveVan(state: AppState, row: DriverRow, vehicle: Vehicle): void {
  row.vehicle = vehicle.name;
  row.vin = vehicle.vin;
  row.assignMethod = BY_HAND;
  saveRoster(state);
  state.notify();
}

/** Take a driver's van away. Returns what they had. */
export function takeVan(state: AppState, row: DriverRow): string {
  const had = row.vehicle;
  row.vehicle = '';
  row.vin = '';
  row.assignMethod = '';
  saveRoster(state);
  state.notify();
  return had;
}

/** Empty the Vehicle and VIN columns. Returns how many were cleared. */
export function clearVans(state: AppState): number {
  let cleared = 0;
  for (const row of state.roster.rows) {
    if (row.vehicle || row.vin) {
      row.vehicle = '';
      row.vin = '';
      row.assignMethod = '';
      cleared += 1;
    }
  }
  if (cleared) {
    saveRoster(state);
    state.notify();
  }
  return cleared;
}

// ------------------------------------------------------------- read-outs

/**
 * Why this driver is in that van, worded as the read-out words it. Empty where there is no van to
 * explain.
 */
export function assignMethodLabel(row: DriverRow): string {
  if (!(row.vehicle || row.vin)) return '';
  return methodLabel(row.assignMethod);
}
