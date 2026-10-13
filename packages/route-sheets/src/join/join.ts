// The join between the app's own data and the matcher. Route Sheet Distributor read its own
// Routes export and its own driver list; inside Loadout Builder the matcher reads what the Route
// Data and Associates pages already hold (docs/RSD-MIGRATION-PLAN.md, section 3, items 1 to 3).
//
// These functions turn the core's route set and associate book into the lists the matcher takes,
// with the same rules the old app's readers used (scripts/parity/rsd/core/tableParsers.js:
// parseRoutes and parseAssociates), and find each wave's pad in the route data. They take plain
// shapes ("RouteEntry-like"), so this package does not depend on the core.

import type { AssociateInput, RouteInput, WavePads } from '../matcher/distribute';

/** The fields of the core's RouteEntry the join reads. */
export interface RouteRowLike {
  transporterId: string;
  driverName: string;
  routeCode: string;
  dispatchTime: string;
  serviceType: string;
  sharedDrivers: string;
  sharedIds: string;
  /** A pad carried by the row itself ('1'..'3'), or ''. */
  pad: string;
}

/** The fields of the core's RouteDataSet the join reads. */
export interface RouteSetLike {
  rows: readonly RouteRowLike[];
  /** Dispatch time text -> pad. */
  pads?: ReadonlyMap<string, number>;
}

/** The fields of the core's Associate the join reads. */
export interface AssociateLike {
  transporterId: string;
  name: string;
  email: string;
  status: string;
}

// The old readers' clean-up: runs of white space become one space, ends trimmed; IDs upper case.
const norm = (s: unknown): string =>
  String(s ?? '')
    .replace(/\s+/g, ' ')
    .trim();
const normId = (s: unknown): string => norm(s).toUpperCase();
const split = (v: string): string[] =>
  String(v ?? '')
    .split('|')
    .map(norm);

/**
 * The matcher's routes from a loaded route set: one entry per route code, every driver listed on
 * it paired ID with name in order (the longer list sets the count; a pair with neither is
 * skipped), and a route code that comes twice gets the drivers it did not already list.
 */
export function routesFromRouteSet(set: Pick<RouteSetLike, 'rows'>): RouteInput[] {
  const byCode = new Map<string, RouteInput>();
  for (const row of set.rows) {
    const routeCode = normId(row.routeCode);
    if (!routeCode) continue;
    const shared = norm(row.sharedIds) !== '' || norm(row.sharedDrivers) !== '';
    const ids = (shared ? split(row.sharedIds) : [norm(row.transporterId)]).map(normId);
    const names = shared ? split(row.sharedDrivers) : [norm(row.driverName)];
    const drivers: RouteInput['drivers'] = [];
    const count = Math.max(ids.length, names.length);
    for (let i = 0; i < count; i++) {
      const transporterId = ids[i] || '';
      const driverName = names[i] || '';
      if (!transporterId && !driverName) continue;
      drivers.push({ transporterId, driverName });
    }
    const existing = byCode.get(routeCode);
    if (existing) {
      for (const d of drivers) {
        if (!existing.drivers.some((x) => x.transporterId === d.transporterId)) {
          existing.drivers.push(d);
        }
      }
      continue;
    }
    byCode.set(routeCode, {
      routeCode,
      drivers,
      // The core does not keep the DSP column; nothing in the matcher reads it.
      dsp: '',
      serviceType: norm(row.serviceType),
      plannedDeparture: norm(row.dispatchTime),
    });
  }
  return [...byCode.values()];
}

/** Does this route set name at least one route code with a Transporter ID on it? */
export function hasRouteDrivers(set: Pick<RouteSetLike, 'rows'>): boolean {
  return routesFromRouteSet(set).some((r) => r.drivers.some((d) => d.transporterId));
}

/**
 * The matcher's driver list from the Associates page's list: IDs upper case, a blank status read
 * as UNKNOWN, a row with no ID left out, the first row of a repeated ID kept, sorted by name.
 */
export function associatesFromBook(book: { rows: readonly AssociateLike[] }): AssociateInput[] {
  const seen = new Set<string>();
  const out: AssociateInput[] = [];
  for (const a of book.rows) {
    const transporterId = normId(a.transporterId);
    if (!transporterId || seen.has(transporterId)) continue;
    seen.add(transporterId);
    out.push({
      transporterId,
      name: norm(a.name),
      email: norm(a.email),
      status: (norm(a.status) || 'UNKNOWN').toUpperCase(),
    });
  }
  return out.sort((a, b) => a.name.localeCompare(b.name));
}

const CLOCK = /^(\d{1,2}):(\d{2})\s*(?:([ap])\.?\s*m\.?)?$/i;

/**
 * The clock value of a time however it is written ('09:50 AM', '9:50am', '9:50 AM', '09:50',
 * '2:30pm', '14:30'), as 'HH:MM' on a 24-hour clock, or null when it is not a time.
 */
export function clockKey(text: string | null | undefined): string | null {
  const m = CLOCK.exec(String(text ?? '').trim());
  if (!m) return null;
  let hour = Number(m[1]);
  const minute = Number(m[2]);
  if (minute > 59) return null;
  const meridiem = (m[3] ?? '').toLowerCase();
  if (meridiem) {
    if (hour < 1 || hour > 12) return null;
    if (meridiem === 'p' && hour !== 12) hour += 12;
    if (meridiem === 'a' && hour === 12) hour = 0;
  } else if (hour > 23) {
    return null;
  }
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

/** The core's padFor rule: a pad carried by the row wins, else the one its dispatch time has. */
function padOf(set: RouteSetLike, row: RouteRowLike): number | null {
  if (/^\d+$/.test(row.pad)) return Number(row.pad);
  return set.pads?.get(row.dispatchTime) ?? null;
}

/** The pad the route data gives a wave time: the first row at that clock time that has one. */
function routeDataPad(waveTime: string, set: RouteSetLike): string | null {
  const key = clockKey(waveTime);
  if (key === null) return null;
  for (const row of set.rows) {
    if (clockKey(row.dispatchTime) !== key) continue;
    const pad = padOf(set, row);
    if (pad) return String(pad);
  }
  return null;
}

/**
 * The wave times on the route sheets that match no dispatch time in the route data (by clock
 * value). Only these get the old "Pad for each wave" box.
 */
export function unmatchedWaves(
  waveTimes: readonly string[],
  set: Pick<RouteSetLike, 'rows'> | null,
): string[] {
  const known = new Set((set?.rows ?? []).map((row) => clockKey(row.dispatchTime)));
  return waveTimes.filter((wave) => {
    const key = clockKey(wave);
    return key === null || !known.has(key);
  });
}

/**
 * The pad for each wave time on the route sheets: the route data's pad for the dispatch time with
 * the same clock value. A typed pad counts only for a wave that matches no dispatch time in the
 * route data (section 3, item 3). Waves with no pad are left out.
 */
export function wavePadsFromRouteSet(
  waveTimes: readonly string[],
  set: RouteSetLike | null,
  typedPads: Readonly<Record<string, string>> = {},
): WavePads {
  const out: WavePads = {};
  const typedWaves = new Set(unmatchedWaves(waveTimes, set));
  for (const wave of waveTimes) {
    const fromData = set ? routeDataPad(wave, set) : null;
    const pad = fromData ?? (typedWaves.has(wave) ? typedPads[wave] || null : null);
    if (pad) out[wave] = pad;
  }
  return out;
}
