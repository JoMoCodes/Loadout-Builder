// Plain records the Store reads and writes. Field names match the database columns (and the old
// Python version) on purpose. Days are 'YYYY-MM-DD' text and times are 'YYYY-MM-DDTHH:MM:SS' text,
// so nothing shifts with the computer's time zone.
//
// These are defined here for now. Once the model port in packages/core has merged, the two sets
// of types should be unified (see the pull request's maintainer section).

/** The columns of one roster row, in the old version's order. */
export const FIELD_NAMES = [
  'driver',
  'shift_type',
  'status',
  'routes',
  'vehicle',
  'vin',
  'device',
  'staging_location',
  'bag',
  'wave_time',
  'pad',
  'service_type',
  'bags',
  'ovs',
  'assign_method',
] as const;

export type DriverRow = Record<(typeof FIELD_NAMES)[number], string>;

export interface Roster {
  rows: DriverRow[];
  load_out_date: string | null;
  source_file: string;
  imported_at: string | null;
  route_source: string;
}

export interface Associate {
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

export interface AssociateBook {
  rows: Associate[];
  source_file: string;
  imported_at: string | null;
}

export const ROUTE_FIELDS = [
  'transporter_id',
  'driver_name',
  'route_code',
  'dispatch_time',
  'service_type',
  'route_duration',
  'vin',
  'detail',
  'shared_drivers',
  'shared_ids',
  'pad',
] as const;

export type RouteEntry = Record<(typeof ROUTE_FIELDS)[number], string>;

export interface RouteDataSet {
  kind: string;
  rows: RouteEntry[];
  /** dispatch time -> PAD number */
  pads: Record<string, number>;
  day: string | null;
  source_file: string;
  imported_at: string | null;
  source_total: number | null;
}

export interface DwpEntry {
  route_code: string;
  bags: string;
  ovs: string;
  staging: string;
}

export interface DwpDataSet {
  rows: DwpEntry[];
  day: string | null;
  source_file: string;
  imported_at: string | null;
}

export const VEHICLE_FIELDS = [
  'name',
  'service_type',
  'service_tier',
  'make',
  'model',
  'sub_model',
  'plate',
  'year',
  'ownership',
  'type_label',
  'status',
  'status_note',
  'station',
] as const;

export type Vehicle = Record<(typeof VEHICLE_FIELDS)[number], string> & {
  vin: string;
  operational: boolean;
  registration_expiry: string | null;
  ownership_end: string | null;
};

export interface VehicleFleet {
  rows: Vehicle[];
  source_file: string;
  imported_at: string | null;
}

export interface TenureRecord {
  routes: number;
  year: number;
  week: number;
}

export interface TenureBook {
  /** Transporter ID -> lifetime route count */
  records: Record<string, TenureRecord>;
  source_file: string;
  imported_at: string | null;
}

/** One van's favourite driver in one slot (for example 'primary'). */
export interface AffinityEntry {
  vin: string;
  slot: string;
  transporter_id: string;
}
