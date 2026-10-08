// What the Load Out page says and lists, worked out from the snapshot. Ported line by line from
// the old app's page code (loadout_page.py, available_vans_page.py, previous_roster_page.py and
// the dialogs). Nothing here decides a rule of its own: matching, linking and van assignment are
// the core's. These are the page's own words and orderings, which the old app kept on the page.
//
// Pure functions only, so vitest can check them (rules.test.ts).

import {
  METHOD_LABELS,
  NO_SHIFT,
  ROUTE_SOURCE_LABELS,
  assignedOf,
  byMethod,
  canRun,
  category,
  dispatchTimes,
  dwpDateLabel,
  dwpSkipped,
  hasQualification,
  hasRouteCodes,
  hasServiceTypes,
  hasVan,
  isActive,
  isRental,
  looseCount,
  makeModel,
  manualOnly,
  methodLabel,
  needsVan,
  normalizeName,
  orderRank,
  padFor,
  registrationState,
  daysUntilRegistrationExpiry,
  rosterDateLabel,
  routeApplyLabel,
  shiftTypeCounts,
  unassignedOf,
  unassignedTimes,
  vehicleRequiredQualification,
  type Associate,
  type AssignmentResult,
  type DriverRow,
  type DwpApplyResult,
  type IsoDate,
  type RouteApplyResult,
  type RouteDataSet,
  type Vehicle,
} from '@loadout/core';
import type { AppSnapshot, RosterRowView, VehicleView } from '../../../shared/snapshot';

export type Severity = 'bad' | 'warn' | '';

export const ALL_SHIFTS = 'All shift types';
export const ALL_SERVICE_TYPES = 'All service types';
export const ALL_CATEGORIES = 'All categories';

/** Python's plain string comparison (by character code), for `sorted()` on text. */
export function pyCompare(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/** Compares tuples of booleans and text the way Python compares sort keys. */
function compareTuple(a: ReadonlyArray<boolean | string>, b: ReadonlyArray<boolean | string>) {
  for (let i = 0; i < a.length; i += 1) {
    const x = a[i];
    const y = b[i];
    if (typeof x === 'boolean' && typeof y === 'boolean') {
      if (x !== y) return x ? 1 : -1;
    } else {
      const order = pyCompare(String(x), String(y));
      if (order !== 0) return order;
    }
  }
  return 0;
}

/** The file name on its own, without the folder. */
export function baseName(path: string): string {
  return path.split(/[\\/]/).pop() ?? path;
}

// ------------------------------------------------------------------ header

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const two = (n: number) => String(n).padStart(2, '0');

/** Python's `strftime('%b %d, %Y at %I:%M %p')`: "Sep 11, 2026 at 05:37 PM". */
export function importedAtLabel(when: Date): string {
  const hour = when.getHours() % 12 || 12;
  const half = when.getHours() < 12 ? 'AM' : 'PM';
  return (
    `${MONTHS[when.getMonth()]} ${two(when.getDate())}, ${when.getFullYear()} at ` +
    `${two(hour)}:${two(when.getMinutes())} ${half}`
  );
}

/** Python's `strftime('%b %d, %Y')`. */
export function shortDateLabel(when: Date): string {
  return `${MONTHS[when.getMonth()]} ${two(when.getDate())}, ${when.getFullYear()}`;
}

export interface RosterHeader {
  title: string;
  source: string;
  count: string;
  breakdown: string;
  anchor: string;
}

/** The card above the Roster table (`_refresh_header`). */
export function rosterHeader(snapshot: AppSnapshot): RosterHeader {
  const rows = snapshot.roster.rows.map((view) => view.row);
  if (rows.length === 0) {
    return { title: 'No roster loaded', source: '', count: '0 drivers', breakdown: '', anchor: '' };
  }
  const title = `Load Out - ${rosterDateLabel({ loadOutDate: snapshot.loadOutDate })}`;

  const bits: string[] = [];
  if (snapshot.roster.sourceFile) bits.push(baseName(snapshot.roster.sourceFile));
  if (snapshot.roster.importedAt)
    bits.push(`imported ${importedAtLabel(new Date(snapshot.roster.importedAt))}`);

  const counts = [...shiftTypeCounts({ rows }).entries()];
  // Python's sort is stable: equal counts keep the order they were first seen in.
  counts.sort((a, b) => b[1] - a[1]);
  const breakdown = counts.map(([name, count]) => `${name}: ${count}`).join('   ');
  const assigned = rows.filter((row) => hasVan(row)).length;
  const needs = rows.filter((row) => needsVan(row)).length;
  let tail = `${breakdown}    |    vans assigned: ${assigned}/${needs}`;
  if (snapshot.roster.routeSource) {
    const source =
      ROUTE_SOURCE_LABELS.get(snapshot.roster.routeSource) ?? snapshot.roster.routeSource;
    const pads = rows.filter((row) => row.pad).length;
    tail += `    |    route data: ${source} (${pads} PADs)`;
  }

  let anchor: string;
  if (snapshot.counts.associates === 0) {
    anchor = 'No associate data imported';
  } else {
    const review = snapshot.counts.needReview;
    const end = review ? `, ${review} need review` : ', all set';
    anchor = `${snapshot.counts.matched} of ${rows.length} drivers found in the driver list${end}`;
  }

  return {
    title,
    source: bits.join('  -  '),
    count: `${rows.length} drivers`,
    breakdown: tail,
    anchor,
  };
}

/** The shift filter's choices: everyone, then each shift type on the roster in name order. */
export function shiftOptions(rows: readonly RosterRowView[]): string[] {
  const names = [...shiftTypeCounts({ rows: rows.map((view) => view.row) }).keys()];
  return [ALL_SHIFTS, ...names.sort(pyCompare)];
}

export function matchesShift(view: RosterRowView, shift: string): boolean {
  return !shift || shift === ALL_SHIFTS || (view.row.shiftType || NO_SHIFT) === shift;
}

// ---------------------------------------------------------- status lines

/** What Bring Over Route Data says when it is done (`_apply_summary`). */
export function applySummary(result: RouteApplyResult, rosterSize: number): string {
  const label = routeApplyLabel(result);
  if (!result.filled && result.addedDrivers.length === 0) {
    return `Nothing to bring over from ${label} - none of the roster's drivers appear in it.`;
  }
  const parts = [`${result.dispatchTimes} dispatch times`];
  if (result.routeCodes) parts.push(`${result.routeCodes} routes`);
  if (result.serviceTypes) parts.push(`${result.serviceTypes} service types`);
  parts.push(`${result.pads} PADs`);
  let message =
    `Brought over ${label} to ${result.filled} of ${rosterSize} drivers - ` +
    `${parts.join(', ')}.`;
  if (result.notInExport) message += ` ${result.notInExport} not in the export.`;
  if (result.noAssociate) message += ` ${result.noAssociate} not found in the driver list.`;
  if (result.addedDrivers.length > 0) {
    const names = result.addedDrivers.slice(0, 3).join(', ');
    const more =
      result.addedDrivers.length > 3 ? ` and ${result.addedDrivers.length - 3} more` : '';
    message += ` Added ${names}${more} to the roster and associates from route data.`;
  }
  if (result.needsReview.length > 0)
    message += ` ${result.needsReview.length} need a look before vans.`;
  return message;
}

/** What Bring Over DWP says when it is done (`_dwp_summary`). */
export function dwpSummary(result: DwpApplyResult): string {
  const emptied = result.cleared
    ? ` ${result.cleared} cleared - this sheet has nothing for the route they hold now.`
    : '';
  if (!result.filled) {
    if (result.noRouteCode && !result.notInSheet) {
      return `No DWP data brought over - no driver has a route code to match on yet.${emptied}`;
    }
    return `No DWP data brought over - no route on the roster is in the DWP sheet.${emptied}`;
  }
  const parts = [`${result.staging} staging`, `${result.bags} bags`, `${result.ovs} OVS`];
  const skipped = dwpSkipped(result);
  const tail = skipped ? ` ${skipped} without a match.` : '';
  return `DWP: ${parts.join(', ')} onto ${result.filled} drivers.${tail}${emptied}`;
}

/** What Assign Vans says on the status line (`_assign_summary`). */
export function assignSummary(result: AssignmentResult): string {
  const assigned = assignedOf(result).length;
  if (!assigned) {
    return (
      `No vans assigned - none of the ${result.considered} drivers ` +
      'could be matched to a free van.'
    );
  }
  let message =
    `Assigned ${assigned} of ${result.considered} drivers ` +
    `from ${result.vansAvailable} operational vans.`;
  const loose = looseCount(result);
  if (loose) message += ` ${loose} on qualification only.`;
  const left = unassignedOf(result).length;
  if (left) message += ` ${left} left without one.`;
  return message;
}

/** The two lines at the top of the Assign Vans read-out (`AssignDialog._build`). */
export function assignHeading(result: AssignmentResult): {
  title: string;
  summary: string;
  loose: string;
} {
  const counts = byMethod(result);
  const bits: string[] = [];
  for (const [method, label] of METHOD_LABELS) {
    const count = counts.get(method);
    if (count) bits.push(`${count} by ${label}`);
  }
  const summary = bits.length > 0 ? bits.join(', ') : 'nothing matched';
  const loose = looseCount(result);
  return {
    title: `${assignedOf(result).length} of ${result.considered} drivers have a van`,
    summary: `${summary}.  ${result.vansAvailable} operational vans in the fleet.`,
    loose: loose
      ? `${loose} took a van that isn't the service type their route asked for - amber below.`
      : '',
  };
}

export interface AssignLine {
  driver: string;
  vehicle: string;
  how: string;
  detail: string;
  severity: Severity;
}

/** The read-out's rows: anyone not placed first, then by name (`AssignDialog._populate`). */
export function assignLines(result: AssignmentResult): AssignLine[] {
  const lines = result.assignments.map((item) => {
    const assigned = item.vehicle !== null;
    const line: AssignLine = assigned
      ? {
          driver: item.driver,
          vehicle: item.vehicle!.name,
          how: methodLabel(item.method),
          detail: `${item.vehicle!.serviceType}  -  ${category(item.vehicle!)}`,
          severity: item.method === 'qualified-only' ? 'warn' : '',
        }
      : {
          driver: item.driver,
          vehicle: '',
          how: 'not assigned',
          detail: item.reason,
          severity: 'bad',
        };
    return { line, key: [assigned, item.driver.toLowerCase()] as [boolean, string] };
  });
  lines.sort((a, b) => compareTuple(a.key, b.key));
  return lines.map((entry) => entry.line);
}

// --------------------------------------------------------- the pickers

/** What a roster driver is already holding, for the roster pick dialog's Holding column. */
export function holdingText(row: DriverRow): string {
  if (row.routes && row.vehicle) return 'route + van';
  if (row.routes) return 'a route';
  if (row.vehicle) return 'a van';
  return 'free';
}

/** The work a Routes or Service Type cell hands over: the route code, else the service type. */
export function workOf(row: DriverRow): string {
  return row.routes || row.serviceType;
}

/**
 * Who could take a route from `source`: everyone else, drivers with no work first, then by name.
 * Picking one who has work is a swap (`reassign_route_selected`).
 */
export function routeTakers(
  rows: readonly RosterRowView[],
  source: RosterRowView,
): RosterRowView[] {
  const keyed = rows
    .filter((view) => view.index !== source.index)
    .map((view) => ({ view, key: [Boolean(workOf(view.row)), view.row.driver.toLowerCase()] }));
  keyed.sort((a, b) => compareTuple(a.key, b.key));
  return keyed.map((entry) => entry.view);
}

/**
 * Who could take a van from `source`: only drivers with a route, those still without a van first,
 * then by name (`reassign_van_selected`). Picking one who has a van is a swap.
 */
export function vanTakers(rows: readonly RosterRowView[], source: RosterRowView): RosterRowView[] {
  const keyed = rows
    .filter((view) => view.index !== source.index && view.row.routes)
    .map((view) => ({ view, key: [Boolean(view.row.vehicle), view.row.driver.toLowerCase()] }));
  keyed.sort((a, b) => compareTuple(a.key, b.key));
  return keyed.map((entry) => entry.view);
}

export interface VanChoice {
  vehicle: Vehicle;
  fit: string;
  severity: Severity;
}

/**
 * Every free van, best fit first, each saying how it fits (`_van_choices`). Nothing is left out:
 * this is the by-hand path, and the self-owned vans automatic assignment will not touch are the
 * whole point of it.
 */
export function vanChoices(
  row: DriverRow,
  associate: Associate | null,
  available: readonly Vehicle[],
  lmrApproved: ReadonlySet<string>,
): VanChoice[] {
  const choices = available.map((vehicle) => {
    const required = vehicleRequiredQualification(vehicle);
    const qualified = associate !== null && (!required || hasQualification(associate, required));
    const approved =
      !isRental(vehicle) || (associate !== null && lmrApproved.has(associate.transporterId));
    let entry: [string, Severity, number];
    if (!qualified) entry = [`Not ${required} qualified`, 'bad', 3];
    else if (!approved) entry = ['Not approved for LMR', 'warn', 2];
    else if (row.serviceType && canRun(vehicle, row.serviceType))
      entry = ['Matches the route', '', 0];
    else if (row.serviceType) entry = ['Qualified, other service type', 'warn', 1];
    else entry = ['Qualified', '', 1];
    const [fit, severity, rank] = entry;
    return { choice: { vehicle, fit, severity }, rank };
  });
  choices.sort(
    (a, b) =>
      a.rank - b.rank ||
      orderRank(a.choice.vehicle) - orderRank(b.choice.vehicle) ||
      pyCompare(a.choice.vehicle.name, b.choice.vehicle.name),
  );
  return choices.map((entry) => entry.choice);
}

/**
 * The link dialog's list: suggestions first, then active before inactive, then by name, after the
 * search (`LinkDialog._ordered`).
 */
export function linkCandidates(
  associates: readonly Associate[],
  suggested: ReadonlySet<string>,
  search: string,
): Associate[] {
  const query = normalizeName(search);
  let rows = [...associates];
  if (query) {
    const compact = query.replace(/ /g, '');
    rows = rows.filter(
      (a) =>
        normalizeName(a.name).includes(query) || a.transporterId.toLowerCase().includes(compact),
    );
  }
  const keyed = rows.map((a) => ({
    a,
    key: [!suggested.has(a.transporterId), !isActive(a), a.name.toLowerCase()] as [
      boolean,
      boolean,
      string,
    ],
  }));
  keyed.sort((x, y) => compareTuple(x.key, y.key));
  return keyed.map((entry) => entry.a);
}

// ---------------------------------------------------- bringing data over

/** One line per export in the source dialog (`SourceDialog._describe`). */
export function describeSource(dataset: RouteDataSet): string[] {
  const brings = ['dispatch time'];
  if (hasRouteCodes(dataset)) brings.push('route code');
  if (hasServiceTypes(dataset)) brings.push('service type');
  brings.push('PAD');

  const times = dispatchTimes(dataset).map(([text, count]) => {
    const pads = new Set(
      dataset.rows.filter((row) => row.dispatchTime === text).map((row) => padFor(dataset, row)),
    );
    let where: string;
    if (pads.size === 1 && pads.has(null)) where = 'no PAD yet';
    else if (pads.has(null)) where = 'partly assigned';
    else if (pads.size > 1)
      where = [...pads]
        .map(Number)
        .sort((a, b) => a - b)
        .map((pad) => `PAD ${pad}`)
        .join('/');
    else where = `PAD ${[...pads][0]}`;
    return `${text || '(no dispatch time)'} -> ${where} (${count})`;
  });

  const lines = [`${dataset.rows.length} rows  -  brings ${brings.join(', ')}`, times.join('   ')];
  if (unassignedTimes(dataset).length > 0)
    lines.push('Some rows have no PAD - assign them on the Route Data page.');
  return lines;
}

/**
 * Why a DWP sheet might be the wrong day's, or '' when it is the roster's day
 * (`_confirm_dwp_day`).
 */
export function dwpDayProblem(snapshot: AppSnapshot): string {
  if (snapshot.dwp.dayStatus === 'ok') return '';
  const rosterDay =
    snapshot.loadOutDate !== null
      ? rosterDateLabel({ loadOutDate: snapshot.loadOutDate })
      : 'an unknown date';
  const name = baseName(snapshot.dwp.set.sourceFile) || 'The DWP sheet';
  if (snapshot.dwp.dayStatus === 'mismatch') {
    return `${name} is for ${dwpDateLabel(snapshot.dwp.set)}.\n\nThe roster is for ${rosterDay}.`;
  }
  return (
    `Can't tell which day ${name} is for - a DWP sheet carries no date inside it, and this ` +
    `one's file name doesn't say either.\n\nThe roster is for ${rosterDay}.`
  );
}

// ------------------------------------------------------- Available Vans

/** "Standard Parcel Electric - Rivian MEDIUM" -> "Electric - Rivian MEDIUM" (`_short`). */
export function shortServiceType(serviceType: string): string {
  const whole = serviceType || '(none)';
  let text = whole.startsWith('Standard Parcel') ? whole.slice('Standard Parcel'.length) : whole;
  text = text.trim();
  text = text.replace(/^[- ]+/, '').trim();
  return text || whole;
}

export interface AvailableVanRow {
  view: VehicleView;
  values: {
    name: string;
    serviceType: string;
    category: string;
    assign: string;
    makeModel: string;
    plate: string;
    registration: string;
    note: string;
    vin: string;
  };
  severity: Severity;
}

/** One Available Vans line (`AvailableVansPage._values`). */
export function availableVanRow(view: VehicleView, today: IsoDate): AvailableVanRow {
  const vehicle = view.vehicle;
  let registration = '';
  let severity: Severity = '';
  if (vehicle.registrationExpiry !== null) {
    const state = registrationState(vehicle, today);
    const days = daysUntilRegistrationExpiry(vehicle, today);
    registration = vehicle.registrationExpiry;
    if (state === 'expired') {
      registration = `${vehicle.registrationExpiry}  (expired)`;
      severity = 'bad';
    } else if (state === 'expiring') {
      registration = `${vehicle.registrationExpiry}  (${days}d left)`;
      severity = 'warn';
    }
  }
  let note = vehicle.statusNote;
  if (!note && vehicle.ownershipEnd) note = `until ${vehicle.ownershipEnd}`;
  return {
    view,
    values: {
      name: vehicle.name,
      serviceType: vehicle.serviceType,
      category: category(vehicle),
      assign: manualOnly(vehicle) ? 'Manual' : 'Auto',
      makeModel: makeModel(vehicle),
      plate: vehicle.plate,
      registration,
      note,
      vin: vehicle.vin,
    },
    severity,
  };
}

export interface AvailableHeader {
  count: string;
  source: string;
  mix: string;
  manual: string;
}

/** The card above the Available Vans table (`_refresh_header`). */
export function availableHeader(vehicles: readonly VehicleView[]): AvailableHeader {
  const available = vehicles.filter((v) => v.available).map((v) => v.vehicle);
  const operational = vehicles.filter((v) => v.operational).length;
  const inUse = operational - available.length;
  const counts = new Map<string, number>();
  for (const vehicle of available) {
    const key = shortServiceType(vehicle.serviceType);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  const mix = [...counts.entries()]
    .sort((a, b) => pyCompare(a[0], b[0]))
    .map(([name, count]) => `${name}: ${count}`)
    .join('   ');
  const manual = available.filter((v) => manualOnly(v));
  return {
    count: `${available.length} available`,
    source:
      `Operational vans nobody on the roster is holding. ` + `${inUse} of ${operational} are out.`,
    mix,
    manual: manual.length
      ? `${manual.length} hand-assign only: ${manual.map((v) => v.name).join(', ')}`
      : '',
  };
}

/** What the Available Vans table says when it is empty (`_empty_text`). */
export function availableEmpty(vehicles: readonly VehicleView[]): { title: string; body: string } {
  if (vehicles.length === 0) {
    return { title: 'No vehicles loaded.', body: 'Import the fleet on the Vehicle Data page.' };
  }
  if (!vehicles.some((v) => v.operational)) {
    return {
      title: 'Every van in the fleet is grounded.',
      body: 'Return some to service on the Vehicle Data page.',
    };
  }
  return { title: 'Every operational van is out with a driver.', body: '' };
}

/** The filter choices of the Available Vans tab: service types and categories on the list. */
export function availableFilterOptions(vehicles: readonly VehicleView[]): {
  services: string[];
  categories: string[];
} {
  const available = vehicles.filter((v) => v.available).map((v) => v.vehicle);
  const services = [...new Set(available.map((v) => v.serviceType).filter(Boolean))].sort(
    pyCompare,
  );
  const categories = [...new Set(available.map((v) => category(v)))].sort(pyCompare);
  return {
    services: [ALL_SERVICE_TYPES, ...services],
    categories: [ALL_CATEGORIES, ...categories],
  };
}
