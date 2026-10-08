// Names and fixed lists the rest of the core shares. Ported from the old app's models.

// ---------------------------------------------------------------- load-out sheet

/** The fields of one roster row, in the order the load-out export writes its columns. */
export const COLUMNS = [
  ['driver', 'Driver'],
  ['shiftType', 'Shift Type'],
  ['status', 'Status'],
  ['routes', 'Routes'],
  ['vehicle', 'Vehicle'],
  ['vin', 'VIN'],
  ['device', 'Device'],
  ['stagingLocation', 'Staging'],
  ['bag', 'Bag'],
  ['waveTime', 'Wave Time'],
] as const;

/**
 * Filled in by the app from a route export or the DWP sheet, not present in the
 * load-out sheet. `bags` and `ovs` are counts off the DWP; `bag` above is the
 * load-out sheet's own yes/no.
 */
export const DERIVED_COLUMNS = [
  ['pad', 'PAD'],
  ['serviceType', 'Service Type'],
  ['bags', 'Bags'],
  ['ovs', 'OVS'],
] as const;

/** Written by the van assignment rather than read off a file: how a driver's van was arrived at. */
export const ASSIGNMENT_COLUMNS = [['assignMethod', 'Matched On']] as const;

export const FIELD_NAMES = [
  ...COLUMNS.map(([name]) => name),
  ...DERIVED_COLUMNS.map(([name]) => name),
  ...ASSIGNMENT_COLUMNS.map(([name]) => name),
] as const;

export type FieldName = (typeof FIELD_NAMES)[number];

/** Shift types that read as route work on the scheduler. Used for grouping, never to decide who gets a van. */
export const ROUTE_SHIFT_TYPES = ['Electric Route', 'Step Van Route'] as const;

/** What a ride-along's shift reads as, since the scheduler has no word for it. */
export const SHIFT_ORE = 'ORE';

/** What a driver with no shift type is grouped under. */
export const NO_SHIFT = '(none)';

// ------------------------------------------------------------- qualifications

export const QUAL_EDV = 'EDV';
export const QUAL_STEP_VAN = 'Step Van';
export const QUAL_CDV = 'CDV';
export const QUAL_DOT = 'DOT';
export const QUAL_STANDARD = 'Standard Parcel';
export const QUAL_HELPER = 'AMZL_HELPER';

/** Short badges for the compact "Vans" column. */
export const QUAL_BADGES = [
  [QUAL_CDV, 'CDV'],
  [QUAL_EDV, 'EDV'],
  [QUAL_STEP_VAN, 'SV'],
  [QUAL_DOT, 'DOT'],
] as const;

/** What a driver must hold to run each route type. */
export const SHIFT_REQUIREMENTS: ReadonlyMap<string, readonly string[]> = new Map([
  ['Electric Route', [QUAL_EDV]],
  ['Step Van Route', [QUAL_STEP_VAN]],
]);

/** An ID inside this many days is worth flagging before it bites. */
export const ID_EXPIRY_WARNING_DAYS = 45;

// ----------------------------------------------------------------- route data

export const ROUTE_ROUTES = 'routes';
export const ROUTE_ITINERARIES = 'itineraries';
export const ROUTE_SCHEDULE = 'schedule';

export type RouteKind = typeof ROUTE_ROUTES | typeof ROUTE_ITINERARIES | typeof ROUTE_SCHEDULE;

/** The Amazon exports that say who is dispatched and when, in tab order. */
export const ROUTE_SOURCES = [
  [ROUTE_ROUTES, 'Routes'],
  [ROUTE_ITINERARIES, 'Itineraries'],
  [ROUTE_SCHEDULE, 'Weekly Schedule'],
] as const;

export const ROUTE_SOURCE_LABELS: ReadonlyMap<string, string> = new Map(ROUTE_SOURCES);

/** The PADs a dispatch time can be assigned to. */
export const PAD_CHOICES = [1, 2, 3] as const;

// ------------------------------------------------------------------------ dwp

/** What comparing the DWP sheet's day against the roster's can come back as. */
export const DWP_DAY_OK = 'ok';
/** The file name didn't say which day it is. */
export const DWP_DAY_UNKNOWN = 'unknown';
/** It said, and it isn't the roster's day. */
export const DWP_DAY_MISMATCH = 'mismatch';

// ------------------------------------------------------------------- vehicles

/** Registration inside this many days is worth flagging before it bites. */
export const REGISTRATION_WARNING_DAYS = 45;

/** The categories the auto-assignment execution order works through. */
export const CATEGORY_STEP_VAN = 'Step Van';
export const CATEGORY_RENTAL = 'Rental Van';
export const CATEGORY_BRANDED = 'Branded Van';

/** The order auto-assignment works through the fleet. */
export const VEHICLE_ORDER = [CATEGORY_STEP_VAN, CATEGORY_BRANDED, CATEGORY_RENTAL] as const;

/** The kind of vehicle a service type implies, for routes whose names the fleet has no word for. */
export const FAMILY_STEP_VAN = 'step van';
export const FAMILY_ELECTRIC = 'electric';
export const FAMILY_LARGE = 'large van';

/**
 * What someone is taken to hold when route data is the only record of them.
 * EDV is the one qualification route data can stand behind on its own.
 */
export const ROUTE_ONLY_QUALIFICATIONS = [QUAL_EDV] as const;

/** What a driver must hold to be allowed in each kind of van, by the export's service tier. */
export const TIER_QUALIFICATION: ReadonlyMap<string, string> = new Map([
  ['STEP_VAN_MEDIUM', QUAL_STEP_VAN],
  ['ELECTRIC_RPV_MEDIUM', QUAL_EDV],
  ['ELECTRIC_RPV_SMALL', QUAL_EDV],
  ['LARGE_CARGO_VAN', QUAL_CDV],
]);

// -------------------------------------------------------------- van affinity

/** A van holds two preferred drivers and two backups; a driver may hold one of each, on different vans. */
export const SLOT_PRIMARY_1 = 'primary_1';
export const SLOT_PRIMARY_2 = 'primary_2';
export const SLOT_SECONDARY_1 = 'secondary_1';
export const SLOT_SECONDARY_2 = 'secondary_2';

export const AFFINITY_SLOTS = [
  [SLOT_PRIMARY_1, 'Primary Driver 1'],
  [SLOT_PRIMARY_2, 'Primary Driver 2'],
  [SLOT_SECONDARY_1, 'Secondary Driver 1'],
  [SLOT_SECONDARY_2, 'Secondary Driver 2'],
] as const;

export const SLOT_LABELS: ReadonlyMap<string, string> = new Map(AFFINITY_SLOTS);
export const PRIMARY_SLOTS: readonly string[] = [SLOT_PRIMARY_1, SLOT_PRIMARY_2];
export const SECONDARY_SLOTS: readonly string[] = [SLOT_SECONDARY_1, SLOT_SECONDARY_2];
