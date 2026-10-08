// The three Amazon route exports (Routes, Itineraries, Weekly Schedule), in one shape.

import { clockKey, compareKeys } from './clock';
import { ROUTE_ROUTES, ROUTE_SOURCE_LABELS } from './constants';
import { longDateLabel, type IsoDate } from './dates';

/**
 * One line of a route export: who, which route, and when they dispatch.
 *
 * `detail` is whatever that export's last useful column is - route progress,
 * actual departure, or the length of the rostered block. `routeDuration` is the
 * '(440 mins)' Amazon appends to the service type, split off.
 *
 * A route worked by more than one person comes through as one line with the
 * names and the ids pipe-joined. Those are kept whole in `sharedDrivers` and
 * `sharedIds`, while `driverName` and `transporterId` hold whichever of them the
 * route is assigned to.
 */
export interface RouteEntry {
  transporterId: string;
  driverName: string;
  routeCode: string;
  dispatchTime: string;
  serviceType: string;
  routeDuration: string;
  vin: string;
  detail: string;
  sharedDrivers: string;
  sharedIds: string;
  /** A PAD carried by the row itself (copied from the Weekly Schedule). '1'..'3', or '' for none. */
  pad: string;
}

export function createRouteEntry(values: Partial<RouteEntry> = {}): RouteEntry {
  return {
    transporterId: '',
    driverName: '',
    routeCode: '',
    dispatchTime: '',
    serviceType: '',
    routeDuration: '',
    vin: '',
    detail: '',
    sharedDrivers: '',
    sharedIds: '',
    pad: '',
    ...values,
  };
}

/** Every [name, transporter id] this route came through with. */
export function driverOptions(entry: RouteEntry): Array<[string, string]> {
  const names = (entry.sharedDrivers || '').split('|').map((part) => part.trim());
  const ids = (entry.sharedIds || '').split('|').map((part) => part.trim());
  const pairs: Array<[string, string]> = [];
  names.forEach((name, index) => {
    const id = index < ids.length ? (ids[index] as string) : '';
    if (name || (index < ids.length && ids[index])) pairs.push([name, id]);
  });
  if (pairs.length === 0 && (entry.driverName || entry.transporterId)) {
    return [[entry.driverName, entry.transporterId]];
  }
  return pairs;
}

/** Was this route exported against more than one person? */
export function isShared(entry: RouteEntry): boolean {
  return driverOptions(entry).length > 1;
}

/** What to call this piece of work - its route code, or its service. */
export function workload(entry: Pick<RouteEntry, 'routeCode' | 'serviceType'>): string {
  return entry.routeCode || entry.serviceType;
}

/** One imported export, plus the PAD chosen for each of its dispatch times. */
export interface RouteDataSet {
  kind: string;
  rows: RouteEntry[];
  /** Dispatch time text -> PAD. Each export keeps its own map: the clocks differ. */
  pads: Map<string, number>;
  day: IsoDate | null;
  sourceFile: string;
  importedAt: Date | null;
  /** The headcount the export states for this day, where it states one. */
  sourceTotal: number | null;
}

export function createRouteDataSet(values: Partial<RouteDataSet> = {}): RouteDataSet {
  return {
    kind: ROUTE_ROUTES,
    rows: [],
    pads: new Map(),
    day: null,
    sourceFile: '',
    importedAt: null,
    sourceTotal: null,
    ...values,
  };
}

/** The export's own headcount, when it doesn't match the rows we read. */
export function totalMismatch(dataSet: Pick<RouteDataSet, 'sourceTotal' | 'rows'>): number | null {
  if (dataSet.sourceTotal === null || dataSet.sourceTotal === dataSet.rows.length) return null;
  return dataSet.sourceTotal;
}

export function routeDataLabel(dataSet: Pick<RouteDataSet, 'kind'>): string {
  return ROUTE_SOURCE_LABELS.get(dataSet.kind) ?? dataSet.kind;
}

/** Distinct dispatch times, earliest first, with how many drivers have each. */
export function dispatchTimes(dataSet: Pick<RouteDataSet, 'rows'>): Array<[string, number]> {
  const counts = new Map<string, number>();
  for (const row of dataSet.rows) {
    counts.set(row.dispatchTime, (counts.get(row.dispatchTime) ?? 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => compareKeys(clockKey(a[0]), clockKey(b[0])));
}

/** The PAD the row itself carries, else the one its dispatch time has. */
export function padFor(dataSet: Pick<RouteDataSet, 'pads'>, row: RouteEntry): number | null {
  if (/^\d+$/.test(row.pad)) return Number(row.pad);
  return dataSet.pads.get(row.dispatchTime) ?? null;
}

/** How many rows carry a PAD of their own rather than their time's. */
export function heldPads(dataSet: Pick<RouteDataSet, 'rows'>): number {
  return dataSet.rows.filter((row) => row.pad).length;
}

/** The schedule doesn't name routes; the day-of exports do. */
export function hasRouteCodes(dataSet: Pick<RouteDataSet, 'rows'>): boolean {
  return dataSet.rows.some((row) => row.routeCode);
}

export function hasServiceTypes(dataSet: Pick<RouteDataSet, 'rows'>): boolean {
  return dataSet.rows.some((row) => row.serviceType);
}

/**
 * Dispatch times where at least one row still has no PAD. Row-held PADs count,
 * so a blank time whose rows were all covered from the schedule doesn't read as unassigned.
 */
export function unassignedTimes(dataSet: Pick<RouteDataSet, 'rows' | 'pads'>): string[] {
  return dispatchTimes(dataSet)
    .map(([text]) => text)
    .filter((text) =>
      dataSet.rows.some((row) => row.dispatchTime === text && !padFor(dataSet, row)),
    );
}

/** The entries that came through with more than one driver on them. */
export function sharedRows(dataSet: Pick<RouteDataSet, 'rows'>): RouteEntry[] {
  return dataSet.rows.filter(isShared);
}

/** PAD -> how many drivers land in it. */
export function padCounts(dataSet: Pick<RouteDataSet, 'rows' | 'pads'>): Map<number, number> {
  const counts = new Map<number, number>();
  for (const row of dataSet.rows) {
    const pad = padFor(dataSet, row);
    if (pad) counts.set(pad, (counts.get(pad) ?? 0) + 1);
  }
  return counts;
}

export function routeDataDateLabel(dataSet: Pick<RouteDataSet, 'day'>): string {
  return dataSet.day === null ? 'Unknown date' : longDateLabel(dataSet.day);
}

/** What copying a route export onto the roster actually did. */
export interface RouteApplyResult {
  kind: string;
  /** Drivers that took at least one value. */
  filled: number;
  dispatchTimes: number;
  routeCodes: number;
  serviceTypes: number;
  pads: number;
  /** Driver isn't anchored to an associate record. */
  noAssociate: number;
  /** Anchored, but that export doesn't list them. */
  notInExport: number;
  /** Same Transporter ID twice in the export. */
  duplicates: number;
  /** Drivers the route data brought onto the roster, route data being the only record of them. */
  addedDrivers: string[];
  /** Of those, the ones the user has to look at before assigning vans. Already worded for display. */
  needsReview: string[];
}

export function createRouteApplyResult(values: Partial<RouteApplyResult> = {}): RouteApplyResult {
  return {
    kind: '',
    filled: 0,
    dispatchTimes: 0,
    routeCodes: 0,
    serviceTypes: 0,
    pads: 0,
    noAssociate: 0,
    notInExport: 0,
    duplicates: 0,
    addedDrivers: [],
    needsReview: [],
    ...values,
  };
}

export function routeApplyLabel(result: Pick<RouteApplyResult, 'kind'>): string {
  return ROUTE_SOURCE_LABELS.get(result.kind) ?? result.kind;
}

export function routeApplySkipped(
  result: Pick<RouteApplyResult, 'noAssociate' | 'notInExport'>,
): number {
  return result.noAssociate + result.notInExport;
}
