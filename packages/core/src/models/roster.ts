// The load-out roster: one row per driver.

import { NO_SHIFT } from './constants';
import { longDateLabel, type IsoDate } from './dates';
import { isRideAlong } from './serviceType';

/** One driver line from the load-out sheet. Every field is text, so empty reads as "nobody has said". */
export interface DriverRow {
  driver: string;
  shiftType: string;
  status: string;
  routes: string;
  vehicle: string;
  vin: string;
  device: string;
  stagingLocation: string;
  bag: string;
  /** The dispatch time from route data lands here, in the sheet's own column. */
  waveTime: string;
  /** The PAD digit on its own ('1'), brought over from route data. */
  pad: string;
  /** Amazon's route type, finer grained than `shiftType`. */
  serviceType: string;
  /** Off the DWP sheet, matched on the route code in `routes`. */
  bags: string;
  ovs: string;
  /** How the van in `vehicle` was arrived at. Empty whenever there is no van. */
  assignMethod: string;
}

export function createDriverRow(values: Partial<DriverRow> = {}): DriverRow {
  return {
    driver: '',
    shiftType: '',
    status: '',
    routes: '',
    vehicle: '',
    vin: '',
    device: '',
    stagingLocation: '',
    bag: '',
    waveTime: '',
    pad: '',
    serviceType: '',
    bags: '',
    ovs: '',
    assignMethod: '',
    ...values,
  };
}

/**
 * Has a route to drive, so needs a van. Service type, not shift type: shift type
 * says come in to work, service type says this person has a route today. A
 * ride-along has a service type but goes out in somebody else's van.
 */
export function needsVan(row: Pick<DriverRow, 'serviceType'>): boolean {
  const text = row.serviceType.trim();
  return text !== '' && !isRideAlong(text);
}

export function hasVan(row: Pick<DriverRow, 'vehicle'>): boolean {
  return row.vehicle.trim() !== '';
}

export function padLabel(row: Pick<DriverRow, 'pad'>): string {
  return row.pad ? `PAD ${row.pad}` : '';
}

/** A full load-out sheet: the drivers plus where they came from. */
export interface Roster {
  rows: DriverRow[];
  loadOutDate: IsoDate | null;
  sourceFile: string;
  importedAt: Date | null;
  /** Which route export the dispatch times and PADs on these rows came from. */
  routeSource: string;
}

export function createRoster(values: Partial<Roster> = {}): Roster {
  return {
    rows: [],
    loadOutDate: null,
    sourceFile: '',
    importedAt: null,
    routeSource: '',
    ...values,
  };
}

export function isRosterEmpty(roster: Pick<Roster, 'rows'>): boolean {
  return roster.rows.length === 0;
}

export function shiftTypeCounts(roster: Pick<Roster, 'rows'>): Map<string, number> {
  const counts = new Map<string, number>();
  for (const row of roster.rows) {
    const key = row.shiftType || NO_SHIFT;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return counts;
}

export function rosterDateLabel(roster: Pick<Roster, 'loadOutDate'>): string {
  return roster.loadOutDate === null ? 'Unknown date' : longDateLabel(roster.loadOutDate);
}
