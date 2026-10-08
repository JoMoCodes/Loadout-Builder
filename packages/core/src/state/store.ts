// What the day's state needs from saved data, and the translation between the saved records
// (snake_case, as the database columns and the old app name them) and the core's models.
//
// The core does not import @loadout/storage: that package needs Node and a database driver, and
// the core must load anywhere. `Store` from @loadout/storage fits `StateStore` as it is, so the
// app passes one in. Tests can pass a small in-memory stand-in.

import { affinitySet, createVanAffinity, type VanAffinity } from '../models/affinity';
import { createAssociate, type Associate, type AssociateBook } from '../models/associates';
import type { DwpDataSet } from '../models/dwp';
import { createDriverRow, type DriverRow, type Roster } from '../models/roster';
import { createRouteEntry, type RouteDataSet, type RouteEntry } from '../models/routes';
import type { TenureBook, TenureRecord } from '../models/tenure';
import { createVehicle, type Vehicle, type VehicleFleet } from '../models/vehicles';

// ------------------------------------------------------------ saved records

export type StoredDriverRow = Record<
  | 'driver'
  | 'shift_type'
  | 'status'
  | 'routes'
  | 'vehicle'
  | 'vin'
  | 'device'
  | 'staging_location'
  | 'bag'
  | 'wave_time'
  | 'pad'
  | 'service_type'
  | 'bags'
  | 'ovs'
  | 'assign_method',
  string
>;

export interface StoredRoster {
  rows: StoredDriverRow[];
  load_out_date: string | null;
  source_file: string;
  imported_at: string | null;
  route_source: string;
}

export interface StoredAssociate {
  name: string;
  transporter_id: string;
  position: string;
  qualifications: string[];
  id_expiration: string | null;
  personal_phone: string;
  work_phone: string;
  email: string;
  status: string;
}

export interface StoredAssociateBook {
  rows: StoredAssociate[];
  source_file: string;
  imported_at: string | null;
}

export type StoredRouteEntry = Record<
  | 'transporter_id'
  | 'driver_name'
  | 'route_code'
  | 'dispatch_time'
  | 'service_type'
  | 'route_duration'
  | 'vin'
  | 'detail'
  | 'shared_drivers'
  | 'shared_ids'
  | 'pad',
  string
>;

export interface StoredRouteDataSet {
  kind: string;
  rows: StoredRouteEntry[];
  pads: Record<string, number>;
  day: string | null;
  source_file: string;
  imported_at: string | null;
  source_total: number | null;
}

export interface StoredDwpDataSet {
  rows: Array<{ route_code: string; bags: string; ovs: string; staging: string }>;
  day: string | null;
  source_file: string;
  imported_at: string | null;
}

export type StoredVehicle = Record<
  | 'name'
  | 'service_type'
  | 'service_tier'
  | 'make'
  | 'model'
  | 'sub_model'
  | 'plate'
  | 'year'
  | 'ownership'
  | 'type_label'
  | 'status'
  | 'status_note'
  | 'station',
  string
> & {
  vin: string;
  operational: boolean;
  registration_expiry: string | null;
  ownership_end: string | null;
};

export interface StoredVehicleFleet {
  rows: StoredVehicle[];
  source_file: string;
  imported_at: string | null;
}

export interface StoredTenureBook {
  records: Record<string, TenureRecord>;
  source_file: string;
  imported_at: string | null;
}

export interface StoredAffinityEntry {
  vin: string;
  slot: string;
  transporter_id: string;
}

/** The saved-data calls the day's state makes. `Store` from @loadout/storage provides all of them. */
export interface StateStore {
  saveRoster(roster: StoredRoster): void;
  loadRoster(): StoredRoster;
  clearRoster(): void;
  savePreviousRoster(roster: StoredRoster): void;
  loadPreviousRoster(): StoredRoster;
  clearPreviousRoster(): void;
  saveAssociates(book: StoredAssociateBook): void;
  loadAssociates(): StoredAssociateBook;
  clearAssociates(): void;
  loadLinks(): Record<string, string | null>;
  setLink(driverKey: string, driverName: string, transporterId: string | null): void;
  deleteLink(driverKey: string): void;
  clearLinks(): void;
  saveRouteData(dataset: StoredRouteDataSet): void;
  loadRouteData(kind: string): StoredRouteDataSet;
  clearRouteData(kind: string): void;
  saveDwp(dataset: StoredDwpDataSet): void;
  loadDwp(): StoredDwpDataSet;
  clearDwp(): void;
  saveVehicles(fleet: StoredVehicleFleet): void;
  loadVehicles(): StoredVehicleFleet;
  clearVehicles(): void;
  loadVehicleOverrides(): Record<string, boolean>;
  setVehicleOverride(vin: string, operational: boolean): void;
  deleteVehicleOverride(vin: string): void;
  clearVehicleOverrides(): void;
  loadLmrApproved(): Set<string>;
  setLmrApproved(transporterId: string, approved: boolean): void;
  clearLmrApproved(): void;
  loadTenure(): StoredTenureBook;
  saveTenure(book: StoredTenureBook): number;
  clearTenure(): void;
  loadVehiclePriorities(): Record<string, string>;
  setVehiclePriority(vin: string, priority: string): void;
  clearVehiclePriorities(): void;
  loadAffinity(): StoredAffinityEntry[];
  setAffinity(vin: string, slot: string, transporterId: string): void;
  deleteAffinity(vin: string, slot: string): void;
  clearAffinity(): void;
  loadPrintLayout(name?: string): string;
  savePrintLayout(name: string, payload: string): void;
  deletePrintLayout(name: string): void;
  printLayoutNames(): string[];
}

// -------------------------------------------------------------- time stamps

function pad2(value: number): string {
  return String(value).padStart(2, '0');
}

/** A moment as saved text: local date and time to the second. */
export function stampText(value: Date | null): string | null {
  if (value === null) return null;
  return (
    `${value.getFullYear()}-${pad2(value.getMonth() + 1)}-${pad2(value.getDate())}` +
    `T${pad2(value.getHours())}:${pad2(value.getMinutes())}:${pad2(value.getSeconds())}`
  );
}

/** Saved text back to a moment (read as local time), or null. */
export function stampDate(value: string | null): Date | null {
  if (!value) return null;
  const parsed = new Date(value.replace(' ', 'T'));
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

// ------------------------------------------------------------------- roster

export function rowFromStored(row: StoredDriverRow): DriverRow {
  return createDriverRow({
    driver: row.driver,
    shiftType: row.shift_type,
    status: row.status,
    routes: row.routes,
    vehicle: row.vehicle,
    vin: row.vin,
    device: row.device,
    stagingLocation: row.staging_location,
    bag: row.bag,
    waveTime: row.wave_time,
    pad: row.pad,
    serviceType: row.service_type,
    bags: row.bags,
    ovs: row.ovs,
    assignMethod: row.assign_method,
  });
}

export function rowToStored(row: DriverRow): StoredDriverRow {
  return {
    driver: row.driver,
    shift_type: row.shiftType,
    status: row.status,
    routes: row.routes,
    vehicle: row.vehicle,
    vin: row.vin,
    device: row.device,
    staging_location: row.stagingLocation,
    bag: row.bag,
    wave_time: row.waveTime,
    pad: row.pad,
    service_type: row.serviceType,
    bags: row.bags,
    ovs: row.ovs,
    assign_method: row.assignMethod,
  };
}

export function rosterFromStored(roster: StoredRoster): Roster {
  return {
    rows: roster.rows.map(rowFromStored),
    loadOutDate: roster.load_out_date,
    sourceFile: roster.source_file,
    importedAt: stampDate(roster.imported_at),
    routeSource: roster.route_source,
  };
}

export function rosterToStored(roster: Roster): StoredRoster {
  return {
    rows: roster.rows.map(rowToStored),
    load_out_date: roster.loadOutDate,
    source_file: roster.sourceFile,
    imported_at: stampText(roster.importedAt),
    route_source: roster.routeSource,
  };
}

// --------------------------------------------------------------- associates

export function associateFromStored(a: StoredAssociate): Associate {
  return createAssociate({
    name: a.name,
    transporterId: a.transporter_id,
    position: a.position,
    qualifications: [...a.qualifications],
    idExpiration: a.id_expiration,
    personalPhone: a.personal_phone,
    workPhone: a.work_phone,
    email: a.email,
    status: a.status,
  });
}

export function associateToStored(a: Associate): StoredAssociate {
  return {
    name: a.name,
    transporter_id: a.transporterId,
    position: a.position,
    qualifications: [...a.qualifications],
    id_expiration: a.idExpiration,
    personal_phone: a.personalPhone,
    work_phone: a.workPhone,
    email: a.email,
    status: a.status,
  };
}

export function associatesFromStored(book: StoredAssociateBook): AssociateBook {
  return {
    rows: book.rows.map(associateFromStored),
    sourceFile: book.source_file,
    importedAt: stampDate(book.imported_at),
  };
}

export function associatesToStored(book: AssociateBook): StoredAssociateBook {
  return {
    rows: book.rows.map(associateToStored),
    source_file: book.sourceFile,
    imported_at: stampText(book.importedAt),
  };
}

// --------------------------------------------------------------- route data

function entryFromStored(row: StoredRouteEntry): RouteEntry {
  return createRouteEntry({
    transporterId: row.transporter_id,
    driverName: row.driver_name,
    routeCode: row.route_code,
    dispatchTime: row.dispatch_time,
    serviceType: row.service_type,
    routeDuration: row.route_duration,
    vin: row.vin,
    detail: row.detail,
    sharedDrivers: row.shared_drivers,
    sharedIds: row.shared_ids,
    pad: row.pad,
  });
}

function entryToStored(row: RouteEntry): StoredRouteEntry {
  return {
    transporter_id: row.transporterId,
    driver_name: row.driverName,
    route_code: row.routeCode,
    dispatch_time: row.dispatchTime,
    service_type: row.serviceType,
    route_duration: row.routeDuration,
    vin: row.vin,
    detail: row.detail,
    shared_drivers: row.sharedDrivers,
    shared_ids: row.sharedIds,
    pad: row.pad,
  };
}

export function routeDataFromStored(dataset: StoredRouteDataSet): RouteDataSet {
  return {
    kind: dataset.kind,
    rows: dataset.rows.map(entryFromStored),
    pads: new Map(Object.entries(dataset.pads)),
    day: dataset.day,
    sourceFile: dataset.source_file,
    importedAt: stampDate(dataset.imported_at),
    sourceTotal: dataset.source_total,
  };
}

export function routeDataToStored(dataset: RouteDataSet): StoredRouteDataSet {
  return {
    kind: dataset.kind,
    rows: dataset.rows.map(entryToStored),
    pads: Object.fromEntries(dataset.pads),
    day: dataset.day,
    source_file: dataset.sourceFile,
    imported_at: stampText(dataset.importedAt),
    source_total: dataset.sourceTotal,
  };
}

// ---------------------------------------------------------------------- dwp

export function dwpFromStored(dataset: StoredDwpDataSet): DwpDataSet {
  return {
    rows: dataset.rows.map((r) => ({
      routeCode: r.route_code,
      bags: r.bags,
      ovs: r.ovs,
      staging: r.staging,
    })),
    day: dataset.day,
    sourceFile: dataset.source_file,
    importedAt: stampDate(dataset.imported_at),
  };
}

export function dwpToStored(dataset: DwpDataSet): StoredDwpDataSet {
  return {
    rows: dataset.rows.map((r) => ({
      route_code: r.routeCode,
      bags: r.bags,
      ovs: r.ovs,
      staging: r.staging,
    })),
    day: dataset.day,
    source_file: dataset.sourceFile,
    imported_at: stampText(dataset.importedAt),
  };
}

// ----------------------------------------------------------------- vehicles

function vehicleFromStored(v: StoredVehicle): Vehicle {
  return createVehicle({
    vin: v.vin,
    name: v.name,
    serviceType: v.service_type,
    serviceTier: v.service_tier,
    make: v.make,
    model: v.model,
    subModel: v.sub_model,
    plate: v.plate,
    year: v.year,
    ownership: v.ownership,
    typeLabel: v.type_label,
    operational: v.operational,
    status: v.status,
    statusNote: v.status_note,
    registrationExpiry: v.registration_expiry,
    ownershipEnd: v.ownership_end,
    station: v.station,
  });
}

function vehicleToStored(v: Vehicle): StoredVehicle {
  return {
    vin: v.vin,
    name: v.name,
    service_type: v.serviceType,
    service_tier: v.serviceTier,
    make: v.make,
    model: v.model,
    sub_model: v.subModel,
    plate: v.plate,
    year: v.year,
    ownership: v.ownership,
    type_label: v.typeLabel,
    operational: v.operational,
    status: v.status,
    status_note: v.statusNote,
    registration_expiry: v.registrationExpiry,
    ownership_end: v.ownershipEnd,
    station: v.station,
  };
}

export function fleetFromStored(fleet: StoredVehicleFleet): VehicleFleet {
  return {
    rows: fleet.rows.map(vehicleFromStored),
    sourceFile: fleet.source_file,
    importedAt: stampDate(fleet.imported_at),
  };
}

export function fleetToStored(fleet: VehicleFleet): StoredVehicleFleet {
  return {
    rows: fleet.rows.map(vehicleToStored),
    source_file: fleet.sourceFile,
    imported_at: stampText(fleet.importedAt),
  };
}

// ------------------------------------------------------------------- tenure

export function tenureFromStored(book: StoredTenureBook): TenureBook {
  return {
    records: new Map(Object.entries(book.records).map(([id, r]) => [id, { ...r }])),
    sourceFile: book.source_file,
    importedAt: stampDate(book.imported_at),
  };
}

export function tenureToStored(book: TenureBook): StoredTenureBook {
  return {
    records: Object.fromEntries([...book.records].map(([id, r]) => [id, { ...r }])),
    source_file: book.sourceFile,
    imported_at: stampText(book.importedAt),
  };
}

// ----------------------------------------------------------------- affinity

export function affinityFromStored(entries: readonly StoredAffinityEntry[]): VanAffinity {
  const affinity = createVanAffinity();
  for (const entry of entries) affinitySet(affinity, entry.vin, entry.slot, entry.transporter_id);
  return affinity;
}
