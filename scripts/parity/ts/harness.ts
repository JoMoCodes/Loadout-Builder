// Parity harness, TypeScript half: the shared pieces. Builds each fixture day's state the way
// python_dump.py does (CONTRACT.md section 3) and writes JSON the way it does (section 2).
//
// Only the made-up files in packages/fixtures/ are read. Nothing here writes names to the
// console; the files go to scripts/parity/actual/, which is not committed.

import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  AppState,
  ROUTE_SOURCES,
  dispatchTimes,
  type Associate,
  type IsoDate,
  type RouteDataSet,
  type Vehicle,
} from '@loadout/core';
import {
  importAssociateData,
  importDwpSheet,
  importLoadoutSheet,
  importRouteExport,
  importTenureExport,
  importVehicleData,
} from '@loadout/core/importers';
import { Store, importV1Database } from '@loadout/storage';

const here = dirname(fileURLToPath(import.meta.url));
export const ROOT = join(here, '..', '..', '..');
export const FIXTURES = join(ROOT, 'packages', 'fixtures');
export const EXPECTED = join(here, '..', 'expected');
export const ACTUAL = join(here, '..', 'actual');

export const ROUTE_KINDS: string[] = ROUTE_SOURCES.map(([kind]) => kind);
/** The export the main run brings over, as the Load Out button does first. */
export const MAIN_KIND = 'routes';

const FOLDERS: Record<string, string> = {
  routes: 'routes',
  itineraries: 'itineraries',
  schedule: 'schedules',
  dwp: 'dwp',
  loadout: 'loadout-sheets',
};
export const ASSOCIATES_FILE = join(FIXTURES, 'associates', 'AssociateData.csv');
export const VEHICLES_FILE = join(FIXTURES, 'vehicles', 'VehiclesData.xlsx');
export const TENURE_FILES = readdirSync(join(FIXTURES, 'tenure'))
  .filter((name) => name.endsWith('.csv'))
  .sort()
  .map((name) => join(FIXTURES, 'tenure', name));
export const DB_FILE = join(FIXTURES, 'v1', 'loadout.db');
export const DWP_FILES = readdirSync(join(FIXTURES, 'dwp'))
  .filter((name) => name.endsWith('.xlsx'))
  .sort()
  .map((name) => join(FIXTURES, 'dwp', name));

export function baseName(path: string): string {
  return path.split(/[\\/]/).pop() ?? path;
}

// ----------------------------------------------------------------- the days

export interface Day {
  id: string;
  date: IsoDate;
  loadout: string;
  /** routes, itineraries, schedule, dwp -> the fixture file, or null when the day has none. */
  files: Record<string, string | null>;
}

interface DaySpec {
  day: string;
  today: string;
  files: { loadout: string };
  [kind: string]: unknown;
}

/** The fixture days and which file belongs to each, as days.json records them. */
export function loadDays(): Day[] {
  const spec = JSON.parse(readFileSync(join(EXPECTED, 'days.json'), 'utf8')) as {
    days: DaySpec[];
  };
  return spec.days.map((entry) => {
    const files: Record<string, string | null> = {};
    for (const kind of [...ROUTE_KINDS, 'dwp']) {
      const name = (entry[kind] as { file: string | null }).file;
      files[kind] = name ? join(FIXTURES, FOLDERS[kind] as string, name) : null;
    }
    return {
      id: entry.day,
      date: entry.today,
      loadout: join(FIXTURES, FOLDERS.loadout as string, entry.files.loadout),
      files,
    };
  });
}

// ---------------------------------------------------------------- the state

// Reading a spreadsheet takes a while, and every scenario starts again from the same files, so
// each file is read once and every scenario gets its own copy.
const cache = new Map<string, Promise<unknown>>();
async function cached<T>(key: string, read: () => Promise<T>): Promise<T> {
  let found = cache.get(key) as Promise<T> | undefined;
  if (found === undefined) {
    found = read();
    cache.set(key, found);
  }
  return structuredClone(await found);
}

export const readers = {
  associates: () => cached(`associates`, () => importAssociateData(ASSOCIATES_FILE)),
  tenure: (path: string) => cached(`tenure:${path}`, () => importTenureExport(path)),
  vehicles: () => cached(`vehicles`, () => importVehicleData(VEHICLES_FILE)),
  loadout: (path: string) => cached(`loadout:${path}`, () => importLoadoutSheet(path)),
  route: (kind: string, path: string, day: IsoDate) =>
    cached(`route:${kind}:${path}:${day}`, () => importRouteExport(kind, path, day)),
  dwp: (path: string) => cached(`dwp:${path}`, () => importDwpSheet(path)),
};

export interface Ctx {
  day: Day;
  store: Store;
  state: AppState;
  close(): void;
}

/** Distinct non-blank dispatch times in clock order take PAD 1, 2, 3, 1, 2, 3... */
export function padsByTime(dataset: RouteDataSet): Map<string, number> {
  const times = dispatchTimes(dataset)
    .map(([text]) => text)
    .filter((text) => text);
  return new Map(times.map((text, index) => [text, (index % 3) + 1]));
}

/** The app after a normal morning's imports, before anything is brought over (CONTRACT.md 3). */
export async function fresh(day: Day): Promise<Ctx> {
  const store = new Store(':memory:', { now: () => new Date(2000, 0, 1) });
  importV1Database(DB_FILE, store);
  const state = new AppState(store);
  state.loadAll();
  state.importAssociates(await readers.associates());
  for (const path of TENURE_FILES) state.importTenure(await readers.tenure(path));
  state.importVehicles(await readers.vehicles());
  state.importRoster(await readers.loadout(day.loadout));
  for (const kind of ROUTE_KINDS) {
    const path = day.files[kind];
    if (!path) {
      state.clearRouteData(kind);
    } else {
      state.importRouteData(kind, await readers.route(kind, path, state.routeDay(day.date)));
      state.setPads(kind, padsByTime(state.routeSet(kind)));
    }
  }
  const dwp = day.files.dwp;
  if (dwp) state.importDwp(await readers.dwp(dwp));
  return { day, store, state, close: () => store.close() };
}

// ----------------------------------------------------------------- writing

type Json = null | boolean | number | string | Json[] | { [key: string]: Json };

/** Make a value ready for the JSON file: CONTRACT.md section 2. */
export function norm(value: unknown): Json {
  if (value === null || value === undefined) return null;
  if (typeof value === 'boolean' || typeof value === 'string') return value;
  if (typeof value === 'number') {
    if (Number.isInteger(value)) return value;
    // Rounded only here, never in the logic. Ties may round differently from Python's round();
    // the diff allows a millionth for that.
    return Math.round(value * 1e6) / 1e6;
  }
  if (value instanceof Set) {
    return [...value].map(norm).sort((a, b) => compareJson(a, b));
  }
  if (value instanceof Map) {
    const out: Record<string, Json> = {};
    for (const [key, item] of value) out[String(key)] = norm(item);
    return out;
  }
  if (Array.isArray(value)) return value.map(norm);
  if (typeof value === 'object') {
    const out: Record<string, Json> = {};
    for (const [key, item] of Object.entries(value)) out[key] = norm(item);
    return out;
  }
  throw new TypeError(`cannot write ${typeof value} to JSON`);
}

function compareJson(a: Json, b: Json): number {
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  const x = String(a);
  const y = String(b);
  return x < y ? -1 : x > y ? 1 : 0;
}

/** Keys sorted by code point, at every level. */
function sortKeys(value: Json): Json {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (value !== null && typeof value === 'object') {
    const out: Record<string, Json> = {};
    for (const key of Object.keys(value).sort(byCodePoint)) out[key] = sortKeys(value[key] as Json);
    return out;
  }
  return value;
}

function byCodePoint(a: string, b: string): number {
  const x = Array.from(a).map((c) => c.codePointAt(0) as number);
  const y = Array.from(b).map((c) => c.codePointAt(0) as number);
  for (let i = 0; i < Math.min(x.length, y.length); i += 1) {
    if (x[i] !== y[i]) return (x[i] as number) - (y[i] as number);
  }
  return x.length - y.length;
}

export function writeJson(path: string, payload: unknown): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(sortKeys(norm(payload)), null, 2) + '\n', 'utf8');
}

export function writeModule(day: Day, name: string, payload: unknown): void {
  writeJson(join(ACTUAL, day.id, `${name}.json`), payload);
}

// --------------------------------------------------------------- references

export function assocRef(associate: Associate | null | undefined) {
  if (!associate) return null;
  return { name: associate.name, transporter_id: associate.transporterId };
}

export function vehicleRef(vehicle: Vehicle | null | undefined) {
  if (!vehicle) return null;
  return { name: vehicle.name, vin: vehicle.vin };
}
