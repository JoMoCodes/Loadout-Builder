// What the Vehicle Management table says, worked out from the snapshot. The columns, the words
// and the colour rules are the old Vehicle Data page's.

import {
  category,
  daysUntilRegistrationExpiry,
  makeModel,
  manualOnly,
  registrationState,
  serviceTypeVocabulary,
  type IsoDate,
} from '@loadout/core';
import type { AppSnapshot, VehicleView } from '../../../shared/snapshot';
import { ownershipLabel } from '../dataPages/format';

export const ALL_VEHICLES = 'All vehicles';
export const OPERATIONAL_ONLY = 'Operational';
export const GROUNDED_ONLY = 'Grounded';
export const ALL_SERVICE_TYPES = 'All service types';
export const STATUS_OPTIONS = [ALL_VEHICLES, OPERATIONAL_ONLY, GROUNDED_ONLY] as const;

export const VEHICLE_EMPTY = {
  title: 'No vehicles loaded.',
  body: 'Import VehiclesData.xlsx to bring in the fleet - vehicle names, service types, VINs, and what is operational.',
};

/** The id a table row goes by. VINs are what overrides, priorities and affinity are kept under. */
export const vehicleId = (view: VehicleView) => view.vehicle.vin || view.vehicle.name;

export type Tone = 'bad' | 'warn' | '';

/** "Operational", "Grounded", with "(set here)" where the status was changed here. */
export function stateText(view: VehicleView): { text: string; tone: Tone } {
  const here = view.overridden ? '  (set here)' : '';
  return view.operational
    ? { text: `Operational${here}`, tone: '' }
    : { text: `Grounded${here}`, tone: 'bad' };
}

/** "2026-11-30", "2026-11-30  (expired)" or "2026-11-30  (12d left)". */
export function registrationText(view: VehicleView, today: IsoDate): { text: string; tone: Tone } {
  const expiry = view.vehicle.registrationExpiry;
  if (expiry === null) return { text: '', tone: '' };
  const state = registrationState(view.vehicle, today);
  if (state === 'expired') return { text: `${expiry}  (expired)`, tone: 'bad' };
  if (state === 'expiring') {
    return {
      text: `${expiry}  (${daysUntilRegistrationExpiry(view.vehicle, today)}d left)`,
      tone: 'warn',
    };
  }
  return { text: expiry, tone: '' };
}

/** Why a van is grounded, or when a rental is due back. */
export function noteText(view: VehicleView): string {
  const { statusNote, ownershipEnd } = view.vehicle;
  return statusNote || (ownershipEnd ? `until ${ownershipEnd}` : '');
}

/** The colour of a row: red for a grounded van or an expired registration, amber when it is close. */
export function vehicleTone(view: VehicleView, today: IsoDate): Tone {
  return stateText(view).tone || registrationText(view, today).tone;
}

export function vehicleCell(view: VehicleView, columnId: string, today: IsoDate): string {
  const { vehicle } = view;
  switch (columnId) {
    case 'name':
      return vehicle.name;
    case 'priority':
      return view.priority;
    case 'state':
      return stateText(view).text;
    case 'service_type':
      return vehicle.serviceType;
    case 'category':
      return category(vehicle);
    case 'assign':
      return manualOnly(vehicle) ? 'Manual' : 'Auto';
    case 'make_model':
      return makeModel(vehicle);
    case 'plate':
      return vehicle.plate;
    case 'year':
      return vehicle.year;
    case 'ownership':
      return ownershipLabel(vehicle.ownership);
    case 'registration':
      return registrationText(view, today).text;
    case 'note':
      return noteText(view);
    case 'vin':
      return vehicle.vin;
    default:
      return '';
  }
}

export const FLEET_COLUMNS = [
  { id: 'name', header: 'Vehicle' },
  { id: 'priority', header: 'Priority', align: 'center' },
  { id: 'state', header: 'Status' },
  { id: 'service_type', header: 'Service Type' },
  { id: 'category', header: 'Category' },
  { id: 'assign', header: 'Assign' },
  { id: 'make_model', header: 'Make / Model' },
  { id: 'plate', header: 'Plate' },
  { id: 'year', header: 'Year', align: 'center' },
  { id: 'ownership', header: 'Ownership' },
  { id: 'registration', header: 'Registration' },
  { id: 'note', header: 'Note' },
  { id: 'vin', header: 'VIN', mono: true },
] as const;

/** Does this van pass the Status and Service drop-downs? */
export function passesFleetFilters(view: VehicleView, status: string, service: string): boolean {
  if (status === OPERATIONAL_ONLY && !view.operational) return false;
  if (status === GROUNDED_ONLY && view.operational) return false;
  if (service !== ALL_SERVICE_TYPES && view.vehicle.serviceType !== service) return false;
  return true;
}

export function serviceOptions(vehicles: readonly VehicleView[]): string[] {
  return [
    ALL_SERVICE_TYPES,
    ...serviceTypeVocabulary({ rows: vehicles.map((view) => view.vehicle) }),
  ];
}

/** "Fleet" with the station after it, once the fleet says which station it is. */
export function fleetTitle(vehicles: readonly VehicleView[]): string {
  const station = vehicles.map((view) => view.vehicle.station).find((name) => name) ?? '';
  return `Fleet${station ? `  -  ${station}` : ''}`;
}

/** "41 vehicles  -  26 operational  -  24 handed out automatically". */
export function fleetCountLine(vehicles: readonly VehicleView[]): string {
  const operational = vehicles.filter((view) => view.operational);
  const assignable = operational.filter((view) => !manualOnly(view.vehicle));
  const tail =
    assignable.length !== operational.length
      ? `  -  ${assignable.length} handed out automatically`
      : '';
  return `${vehicles.length} vehicles  -  ${operational.length} operational${tail}`;
}

/** "Rental Van: 3   Step Van: 9": the operational vans by category. */
export function fleetMix(vehicles: readonly VehicleView[]): string {
  const counts = new Map<string, number>();
  for (const view of vehicles) {
    if (!view.operational) continue;
    const name = category(view.vehicle);
    counts.set(name, (counts.get(name) ?? 0) + 1);
  }
  return [...counts]
    .sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))
    .map(([name, count]) => `${name}: ${count}`)
    .join('   ');
}

/** "registration expired: 2   expiring soon: 3   status set here: 6". */
export function fleetFlags(snapshot: AppSnapshot): string {
  const states = snapshot.vehicles.map((view) => registrationState(view.vehicle, snapshot.today));
  const expired = states.filter((state) => state === 'expired').length;
  const expiring = states.filter((state) => state === 'expiring').length;
  const overridden = snapshot.counts.overriddenVehicles;
  const parts: string[] = [];
  if (expired) parts.push(`registration expired: ${expired}`);
  if (expiring) parts.push(`expiring soon: ${expiring}`);
  if (overridden) parts.push(`status set here: ${overridden}`);
  return parts.join('   ');
}

/** The names of up to four vans, then how many more ("A, B, C, D and 2 more"). */
export function vanNames(views: readonly VehicleView[]): string[] {
  return views.map((view) => view.vehicle.name);
}

/** What the status says after the fleet came in. */
export function vehiclesImportedMessage(
  snapshot: AppSnapshot,
  rows: number,
  fileName: string,
): string {
  const kept = snapshot.counts.overriddenVehicles;
  const tail = kept ? ` ${kept} kept the status set here.` : '';
  return `Imported ${rows} vehicles from ${fileName} - ${snapshot.counts.operationalVehicles} operational.${tail}`;
}

/** The old window's check on a priority: whole numbers only, or empty to take the number away. */
export function priorityProblem(answer: string): string | null {
  if (answer !== '' && !/^[0-9]+$/.test(answer)) {
    return `'${answer}' isn't a number. Use a whole number, or leave it empty to remove the priority.`;
  }
  return null;
}
