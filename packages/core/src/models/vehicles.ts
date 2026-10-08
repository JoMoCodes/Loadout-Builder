// The fleet: one record per van at the station.

import { sortedText } from './clock';
import {
  CATEGORY_BRANDED,
  CATEGORY_RENTAL,
  CATEGORY_STEP_VAN,
  QUAL_CDV,
  QUAL_EDV,
  QUAL_STEP_VAN,
  REGISTRATION_WARNING_DAYS,
  TIER_QUALIFICATION,
  VEHICLE_ORDER,
} from './constants';
import { daysBetween, todayDate, type IsoDate } from './dates';
import type { ExpiryState } from './associates';
import { serviceFamily } from './serviceType';

/**
 * One van at the station. `name` is the identity that matters: it's what the
 * load-out sheet's Vehicle column holds. `serviceType` uses the same vocabulary
 * as the route exports, so it says which routes this van can run.
 */
export interface Vehicle {
  vin: string;
  name: string;
  serviceType: string;
  serviceTier: string;
  make: string;
  model: string;
  subModel: string;
  plate: string;
  year: string;
  ownership: string;
  typeLabel: string;
  operational: boolean;
  status: string;
  statusNote: string;
  registrationExpiry: IsoDate | null;
  ownershipEnd: IsoDate | null;
  station: string;
}

export function createVehicle(values: Partial<Vehicle> = {}): Vehicle {
  return {
    vin: '',
    name: '',
    serviceType: '',
    serviceTier: '',
    make: '',
    model: '',
    subModel: '',
    plate: '',
    year: '',
    ownership: '',
    typeLabel: '',
    operational: true,
    status: '',
    statusNote: '',
    registrationExpiry: null,
    ownershipEnd: null,
    station: '',
    ...values,
  };
}

export function makeModel(vehicle: Pick<Vehicle, 'make' | 'model'>): string {
  return [vehicle.make, vehicle.model].filter((part) => part).join(' ');
}

export function isStepVan(vehicle: Pick<Vehicle, 'serviceType'>): boolean {
  return vehicle.serviceType.toLowerCase().includes('step van');
}

/** A Last Mile Rental - only approved drivers may take one. */
export function isRental(vehicle: Pick<Vehicle, 'ownership'>): boolean {
  return vehicle.ownership.toUpperCase() === 'AMAZON_RENTAL';
}

/** Self-owned vans are handed out by hand, never auto-assigned. */
export function manualOnly(vehicle: Pick<Vehicle, 'ownership'>): boolean {
  return vehicle.ownership.toUpperCase() === 'SELF_OWNED';
}

/** Step Van, Rental Van or Branded Van - the auto-assignment order. */
export function category(vehicle: Pick<Vehicle, 'serviceType' | 'ownership'>): string {
  if (isStepVan(vehicle)) return CATEGORY_STEP_VAN;
  if (isRental(vehicle)) return CATEGORY_RENTAL;
  return CATEGORY_BRANDED;
}

export function daysUntilRegistrationExpiry(
  vehicle: Pick<Vehicle, 'registrationExpiry'>,
  today: IsoDate = todayDate(),
): number | null {
  return vehicle.registrationExpiry === null
    ? null
    : daysBetween(vehicle.registrationExpiry, today);
}

export function registrationState(
  vehicle: Pick<Vehicle, 'registrationExpiry'>,
  today: IsoDate = todayDate(),
): ExpiryState {
  const days = daysUntilRegistrationExpiry(vehicle, today);
  if (days === null) return 'unknown';
  if (days < 0) return 'expired';
  if (days <= REGISTRATION_WARNING_DAYS) return 'expiring';
  return 'ok';
}

export function vehicleFamily(vehicle: Pick<Vehicle, 'serviceType'>): string {
  return serviceFamily(vehicle.serviceType);
}

/** Is this exactly the service type the route asked for? */
export function canRun(vehicle: Pick<Vehicle, 'serviceType'>, serviceType: string): boolean {
  return serviceType !== '' && vehicle.serviceType === serviceType;
}

/**
 * Is this a van the route could reasonably go out in? The exact service type, or
 * failing that the same family - which is what lets a nursery route find a Rivian.
 */
export function canServe(vehicle: Pick<Vehicle, 'serviceType'>, serviceType: string): boolean {
  if (canRun(vehicle, serviceType)) return true;
  const family = serviceFamily(serviceType);
  return family !== '' && vehicleFamily(vehicle) === family;
}

/**
 * What a driver must hold to take this van out. Read off the service tier where
 * there is one; the service type is the fallback.
 */
export function vehicleRequiredQualification(
  vehicle: Pick<Vehicle, 'serviceTier' | 'serviceType'>,
): string {
  const byTier = TIER_QUALIFICATION.get(vehicle.serviceTier.toUpperCase());
  if (byTier) return byTier;
  const text = vehicle.serviceType.toLowerCase();
  if (text.includes('step van')) return QUAL_STEP_VAN;
  if (text.includes('electric')) return QUAL_EDV;
  if (text.includes('large van') || text.includes('cargo')) return QUAL_CDV;
  return '';
}

export function orderRank(vehicle: Pick<Vehicle, 'serviceType' | 'ownership'>): number {
  const index = (VEHICLE_ORDER as readonly string[]).indexOf(category(vehicle));
  return index === -1 ? VEHICLE_ORDER.length : index;
}

/** The imported vehicle roster. */
export interface VehicleFleet {
  rows: Vehicle[];
  sourceFile: string;
  importedAt: Date | null;
}

export function createVehicleFleet(values: Partial<VehicleFleet> = {}): VehicleFleet {
  return { rows: [], sourceFile: '', importedAt: null, ...values };
}

export function byVin(fleet: Pick<VehicleFleet, 'rows'>): Map<string, Vehicle> {
  const found = new Map<string, Vehicle>();
  for (const vehicle of fleet.rows) if (vehicle.vin) found.set(vehicle.vin, vehicle);
  return found;
}

export function byName(fleet: Pick<VehicleFleet, 'rows'>): Map<string, Vehicle> {
  const found = new Map<string, Vehicle>();
  for (const vehicle of fleet.rows) if (vehicle.name) found.set(vehicle.name, vehicle);
  return found;
}

export function serviceTypeCounts(fleet: Pick<VehicleFleet, 'rows'>): Map<string, number> {
  const counts = new Map<string, number>();
  for (const vehicle of fleet.rows) {
    const key = vehicle.serviceType || '(none)';
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return counts;
}

export function serviceTypeVocabulary(fleet: Pick<VehicleFleet, 'rows'>): string[] {
  return sortedText(serviceTypeCounts(fleet).keys());
}
