// What the Route Data tables show, worked out from the snapshot: the rows, their words, and the
// summaries in the header. Pure functions, so they are tested without a screen. The wording and
// the colour rules are the old Route Data page's.

import {
  PAD_CHOICES,
  ROUTE_ITINERARIES,
  ROUTE_ROUTES,
  ROUTE_SCHEDULE,
  dispatchTimes,
  driverOptions,
  heldPads,
  isShared,
  padFor,
  sharedRows,
  totalMismatch,
  workload,
  type RouteEntry,
} from '@loadout/core';
import type { RouteSetView } from '../../../shared/snapshot';
import { plural } from '../dataPages/format';

export const NO_TIME = '(no dispatch time)';
export const ALL_PADS = 'All PADs';
export const UNASSIGNED_PAD = 'Unassigned';
export const PAD_FILTER_OPTIONS = [
  ALL_PADS,
  ...PAD_CHOICES.map((pad) => `PAD ${pad}`),
  UNASSIGNED_PAD,
] as const;

/** A column of a route table: its id, its heading, and which field it reads. */
export interface RouteColumnSpec {
  id: string;
  header: string;
  align?: 'center';
  mono?: boolean;
}

const DRIVER = { id: 'driver_name', header: 'Driver' } as const;
const ID = { id: 'transporter_id', header: 'Transporter ID' } as const;
const ROUTE = { id: 'route_code', header: 'Route' } as const;
const TIME = { id: 'dispatch_time', header: 'Dispatch Time' } as const;
const PAD = { id: 'pad', header: 'PAD', align: 'center' } as const;
const SERVICE = { id: 'service_type', header: 'Service Type' } as const;

/** The columns each export shows, in the old page's order and words. */
export const ROUTE_COLUMNS: Record<string, readonly RouteColumnSpec[]> = {
  [ROUTE_ROUTES]: [DRIVER, ID, ROUTE, TIME, PAD, SERVICE, { id: 'detail', header: 'Progress' }],
  [ROUTE_ITINERARIES]: [
    DRIVER,
    ID,
    ROUTE,
    TIME,
    PAD,
    { id: 'detail', header: 'Progress' },
    SERVICE,
    { id: 'route_duration', header: 'Route Duration' },
    { id: 'vin', header: 'VIN', mono: true },
  ],
  [ROUTE_SCHEDULE]: [
    { id: 'driver_name', header: 'Associate' },
    ID,
    TIME,
    PAD,
    { id: 'detail', header: 'Block' },
    SERVICE,
  ],
};

/** What to say on an empty tab, and what the file window should offer. */
export const ROUTE_HINTS: Record<string, { title: string; body: string }> = {
  [ROUTE_ROUTES]: {
    title: 'No Routes export loaded.',
    body: 'Import Routes_<station>_<date>.xlsx for one row per dispatched route, with its planned departure time.',
  },
  [ROUTE_ITINERARIES]: {
    title: 'No Itineraries export loaded.',
    body: "Import Itineraries_<station>_<date>.xlsx - one row per planned route, with its progress and route duration. The morning export's 'Pre Dispatch' sheet is found automatically.",
  },
  [ROUTE_SCHEDULE]: {
    title: 'No weekly schedule loaded.',
    body: 'Import Week-<n>-Schedule.xlsx to see who is rostered and what time their block starts. Only the load-out day is read.',
  },
};

export interface RouteRow {
  /** The row's place in the export. */
  index: number;
  entry: RouteEntry;
  pad: number | null;
  shared: boolean;
  /** Its Transporter ID has an associate record behind it. Only meaningful when `checkAnchors`. */
  known: boolean;
}

/** Every row of an export with what the table needs to colour it. */
export function buildRouteRows(set: RouteSetView, knownIds: ReadonlySet<string>): RouteRow[] {
  return set.rows.map((entry, index) => ({
    index,
    entry,
    pad: padFor(set, entry),
    shared: isShared(entry),
    known: knownIds.has(entry.transporterId),
  }));
}

/** The colour of a row: amber for an ID nobody has a record for or a shared route, grey for no PAD. */
export function routeTone(row: RouteRow, checkAnchors: boolean): 'warn' | 'ghost' | undefined {
  let tone: 'warn' | 'ghost' | undefined;
  if (checkAnchors && !row.known) tone = 'warn';
  else if (!row.pad) tone = 'ghost';
  if (row.shared && !tone) tone = 'warn';
  return tone;
}

/** The words in one cell, or '' for empty (the table then shows a dash). */
export function routeCell(row: RouteRow, columnId: string): string {
  const { entry } = row;
  switch (columnId) {
    case 'driver_name': {
      const others = driverOptions(entry).length - 1;
      return others > 0 ? `${entry.driverName || '-'}   (+${others} more)` : entry.driverName;
    }
    case 'transporter_id':
      return entry.transporterId;
    case 'route_code':
      return entry.routeCode;
    case 'dispatch_time':
      return entry.dispatchTime;
    case 'pad':
      return row.pad ? `PAD ${row.pad}` : '';
    case 'service_type':
      return entry.serviceType;
    case 'route_duration':
      return entry.routeDuration;
    case 'vin':
      return entry.vin;
    case 'detail':
      return entry.detail;
    default:
      return '';
  }
}

/** Does this row pass the PAD drop-down? */
export function passesPadFilter(row: RouteRow, choice: string): boolean {
  if (choice === UNASSIGNED_PAD) return !row.pad;
  if (choice.startsWith('PAD ')) return `PAD ${row.pad}` === choice;
  return true;
}

/**
 * Where the rows of one dispatch time sit. Read from the rows (not the time's map), because PADs
 * copied from the schedule sit on the rows and one time can span several of them.
 */
export function padPlace(set: RouteSetView, time: string, none = 'unassigned'): string {
  const pads = new Set<number | null>();
  for (const row of set.rows) if (row.dispatchTime === time) pads.add(padFor(set, row));
  if (pads.size === 1 && pads.has(null)) return none;
  if (pads.has(null)) return 'partly assigned';
  const sorted = [...pads].sort((a, b) => (a as number) - (b as number));
  return sorted.map((pad) => `PAD ${pad}`).join('/');
}

/** "10:20am -> PAD 1 (12)   10:25am -> PAD 2 (9)": the header's line of where each time sits. */
export function padSummary(set: RouteSetView): string {
  return dispatchTimes(set)
    .map(([time, count]) => `${time || NO_TIME} -> ${padPlace(set, time)} (${count})`)
    .join('   ');
}

/** Rows whose Transporter ID has no associate record behind it (0 until associates are loaded). */
export function unknownCount(set: RouteSetView, knownIds: ReadonlySet<string>, haveBook: boolean) {
  if (!haveBook) return 0;
  return set.rows.filter((row) => !knownIds.has(row.transporterId)).length;
}

/** The small notes under the header's numbers. */
export function routeNotes(
  set: RouteSetView,
  knownIds: ReadonlySet<string>,
  haveBook: boolean,
): string[] {
  const notes: string[] = [];
  const held = heldPads(set);
  if (held) notes.push(`${held} PADs from schedule`);
  const stated = totalMismatch(set);
  // Amazon's own headcount has been seen to disagree with its grid.
  if (stated !== null) notes.push(`export header says ${stated}`);
  const shared = sharedRows(set).length;
  if (shared) notes.push(`${shared} shared with another driver`);
  const unknown = unknownCount(set, knownIds, haveBook);
  if (unknown) notes.push(`${unknown} not in associate data`);
  return notes;
}

/** "29 rows  -  3 dispatch times". */
export function routeMetric(set: RouteSetView): string {
  const times = dispatchTimes(set).length;
  return `${set.rows.length} rows  -  ${times} dispatch times`;
}

/** The status line after a file came in: "Imported 29 rows from X - 3 dispatch times." */
export function importedMessage(rows: number, fileName: string, times: number): string {
  return `Imported ${rows} rows from ${fileName} - ${plural(times, 'dispatch time')}.`;
}

/** What the status says after the PAD window was saved. */
export function padsMessage(
  label: string,
  set: RouteSetView,
  chosen: Record<string, number>,
): string {
  const assigned = dispatchTimes(set).reduce(
    (sum, [time, count]) => sum + (chosen[time] ? count : 0),
    0,
  );
  const left = set.rows.length - assigned;
  const tail = left ? ` ${left} still unassigned.` : '';
  return `${label}: ${assigned} of ${set.rows.length} drivers placed in a PAD.${tail}`;
}

/** What the status says after the PADs came over from the schedule. */
export function adoptMessage(result: {
  copied: number;
  noPad: number;
  missing: number;
  total: number;
}): string {
  const bits = [`${result.copied} of ${result.total} PADs copied from the Weekly Schedule`];
  if (result.noPad) bits.push(`${result.noPad} scheduled but with no PAD there`);
  if (result.missing) bits.push(`${result.missing} not on the schedule`);
  return `${bits.join('. ')}.`;
}

/** The name the window and the messages use for a piece of work. */
export function workLabel(entry: RouteEntry): string {
  return workload(entry);
}
