// The day's shared state: roster, associate book, links, route data, DWP, fleet and the rest,
// and every change the screens make to them. Ported from the old app's state.py (`AppState`);
// method names are the old ones in camelCase.
//
// No file reading happens here. The import calls take what the file readers in
// `@loadout/core/importers` produced, so this runs anywhere. Nothing reads the clock either:
// anything that depends on the day takes `today` as a parameter.

import {
  byTransporterId,
  createAssociate,
  createAssociateBook,
  daysUntilIdExpiry,
  hasQualification,
  idState,
  isActive,
  missingForShift,
  vanBadges as associateVanBadges,
  type Associate,
  type AssociateBook,
} from '../models/associates';
import {
  affinityClear,
  affinityGet,
  affinitySet,
  createVanAffinity,
  heldBy,
  slotKind,
  type VanAffinity,
} from '../models/affinity';
import {
  DWP_DAY_MISMATCH,
  DWP_DAY_OK,
  DWP_DAY_UNKNOWN,
  ROUTE_ONLY_QUALIFICATIONS,
  ROUTE_SCHEDULE,
  ROUTE_SOURCES,
  SHIFT_ORE,
} from '../models/constants';
import type { IsoDate } from '../models/dates';
import {
  byRouteCode,
  createDwpApplyResult,
  createDwpDataSet,
  routeKey,
  type DwpApplyResult,
  type DwpDataSet,
} from '../models/dwp';
import {
  createDriverRow,
  createRoster,
  isRosterEmpty,
  type DriverRow,
  type Roster,
} from '../models/roster';
import {
  createRouteApplyResult,
  createRouteDataSet,
  driverOptions,
  padFor,
  type RouteApplyResult,
  type RouteDataSet,
  type RouteEntry,
} from '../models/routes';
import { isOnRoadDriver, requiredQualification } from '../models/serviceType';
import { createTenureBook, tenureCountFor, type TenureBook } from '../models/tenure';
import { createVehicleFleet, type Vehicle, type VehicleFleet } from '../models/vehicles';
import {
  AssociateIndex,
  createMatch,
  driverKey,
  isAmbiguous,
  isMatched,
  matchDriver,
  matchRoster,
  nameKey,
  needsReview,
  summarise,
  type Match,
} from '../matching/matching';
import {
  affinityFromStored,
  associatesFromStored,
  associatesToStored,
  dwpFromStored,
  dwpToStored,
  fleetFromStored,
  fleetToStored,
  rosterFromStored,
  rosterToStored,
  routeDataFromStored,
  routeDataToStored,
  tenureFromStored,
  tenureToStored,
  type StateStore,
} from './store';
import type { AssignmentResult } from '../assignment';
import type { PrintRow, PrintSpec } from '../printing/printing';
import * as print from './print';
import * as vans from './vans';

/** A route export's kinds, in tab order. */
const ROUTE_KINDS: readonly string[] = ROUTE_SOURCES.map(([kind]) => kind);

function nameKeyText(name: string): string {
  const [first, last] = nameKey(name);
  return `${first}\u0000${last}`;
}

/** A plain copy of a roster row (the old app's dataclasses.replace). */
function copyRow(row: DriverRow): DriverRow {
  return { ...row };
}

export class AppState {
  readonly store: StateStore;
  roster: Roster = createRoster();
  associates: AssociateBook = createAssociateBook();
  /** Driver key -> Transporter ID, or null for "not an associate". */
  links = new Map<string, string | null>();
  matches = new Map<string, Match>();
  routeData = new Map<string, RouteDataSet>(
    ROUTE_KINDS.map((kind) => [kind, createRouteDataSet({ kind })]),
  );
  dwp: DwpDataSet = createDwpDataSet();
  vehicles: VehicleFleet = createVehicleFleet();
  vehicleOverrides = new Map<string, boolean>();
  affinity: VanAffinity = createVanAffinity();
  lmrApproved = new Set<string>();
  previousRoster: Roster = createRoster();
  vehiclePriorities = new Map<string, string>();
  tenureBook: TenureBook = createTenureBook();
  private readonly listeners: Array<() => void> = [];
  private previousVansCache: Map<string, string> | null = null;

  constructor(store: StateStore) {
    this.store = store;
  }

  // ------------------------------------------------------------ listeners

  subscribe(callback: () => void): void {
    this.listeners.push(callback);
  }

  notify(): void {
    for (const callback of this.listeners) callback();
  }

  // ----------------------------------------------------------------- load

  loadAll(): void {
    this.roster = rosterFromStored(this.store.loadRoster());
    this.associates = associatesFromStored(this.store.loadAssociates());
    this.links = new Map(Object.entries(this.store.loadLinks()));
    this.routeData = new Map(
      ROUTE_KINDS.map((kind) => [kind, routeDataFromStored(this.store.loadRouteData(kind))]),
    );
    this.dwp = dwpFromStored(this.store.loadDwp());
    this.vehicles = fleetFromStored(this.store.loadVehicles());
    this.vehicleOverrides = new Map(Object.entries(this.store.loadVehicleOverrides()));
    this.affinity = affinityFromStored(this.store.loadAffinity());
    this.lmrApproved = new Set(this.store.loadLmrApproved());
    this.previousRoster = rosterFromStored(this.store.loadPreviousRoster());
    this.vehiclePriorities = new Map(Object.entries(this.store.loadVehiclePriorities()));
    this.tenureBook = tenureFromStored(this.store.loadTenure());
    this.applyTenure();
    this.rematch();
  }

  rematch(): void {
    this.matches = matchRoster(this.roster.rows, this.associates.rows, this.links);
    // Anything that re-matches can change whose van yesterday's rows say a VIN belongs to, so
    // the cached walk goes with it.
    this.previousVansCache = null;
  }

  private saveRoster(): void {
    this.store.saveRoster(rosterToStored(this.roster));
  }

  private saveRouteData(dataset: RouteDataSet): void {
    this.store.saveRouteData(routeDataToStored(dataset));
  }

  // -------------------------------------------------------------- imports

  /** Store a load-out sheet read by `importLoadoutSheet` and make it today's roster. */
  importRoster(roster: Roster): Roster {
    this.roster = roster;
    this.saveRoster();
    this.rematch();
    this.notify();
    return roster;
  }

  clearRoster(): void {
    this.store.clearRoster();
    this.roster = createRoster();
    this.matches = new Map();
    this.notify();
  }

  /** Store an associate export read by `importAssociateData`. Replaces the book. */
  importAssociates(book: AssociateBook): AssociateBook {
    this.store.saveAssociates(associatesToStored(book));
    this.associates = book;
    this.applyTenure();
    this.rematch();
    this.notify();
    return book;
  }

  clearAssociates(): void {
    this.store.clearAssociates();
    this.associates = createAssociateBook();
    this.rematch();
    this.notify();
  }

  /**
   * Fold a Tenured Workforce export (read by `importTenureExport`) into the stored counts. Only
   * ever forward: the saved data decides which count is newer, and the book is read back from it.
   */
  importTenure(book: TenureBook): TenureBook {
    this.store.saveTenure(tenureToStored(book));
    this.tenureBook = tenureFromStored(this.store.loadTenure());
    this.applyTenure();
    this.notify();
    return book;
  }

  /**
   * Forget every lifetime route count and where they came from. The associate list and the
   * roster are kept; the next Tenured Workforce file starts the counts afresh.
   */
  clearTenure(): void {
    this.store.clearTenure();
    this.tenureBook = createTenureBook();
    this.applyTenure();
    this.notify();
  }

  // ----------------------------------------------------------- route data

  routeSet(kind: string): RouteDataSet {
    let dataset = this.routeData.get(kind);
    if (dataset === undefined) {
      dataset = createRouteDataSet({ kind });
      this.routeData.set(kind, dataset);
    }
    return dataset;
  }

  /**
   * Store a route export read by `importRouteExport(kind, path, state.routeDay(today))`. The
   * weekly schedule is read for the load-out day, which is why the reader is given `routeDay`.
   */
  importRouteData(kind: string, dataset: RouteDataSet): RouteDataSet {
    this.saveRouteData(dataset);
    this.routeData.set(kind, dataset);
    this.notify();
    return dataset;
  }

  /** The day route data is read for: the load-out date, else today. */
  routeDay(today: IsoDate): IsoDate {
    return this.roster.loadOutDate || today;
  }

  /** Pin each dispatch time to a PAD. Times left out become unassigned, and row-held PADs go. */
  setPads(kind: string, pads: ReadonlyMap<string, number> | Record<string, number>): void {
    const dataset = this.routeSet(kind);
    const entries = pads instanceof Map ? [...pads] : Object.entries(pads);
    dataset.pads = new Map(entries.filter(([, pad]) => pad));
    for (const row of dataset.rows) row.pad = '';
    this.saveRouteData(dataset);
    this.notify();
  }

  /**
   * Copy each driver's Weekly Schedule PAD onto this export's rows, joined on Transporter ID.
   * Returns [copied, scheduled but no PAD there, not on the schedule].
   */
  adoptSchedulePads(kind: string): [number, number, number] {
    const schedule = this.routeSet(ROUTE_SCHEDULE);
    const dataset = this.routeSet(kind);

    const padsById = new Map<string, number>();
    const scheduled = new Set<string>();
    for (const row of schedule.rows) {
      const pad = padFor(schedule, row);
      for (const [, transporterId] of driverOptions(row)) {
        if (!transporterId) continue;
        scheduled.add(transporterId);
        if (pad && !padsById.has(transporterId)) padsById.set(transporterId, pad);
      }
    }

    let copied = 0;
    let noPad = 0;
    let missing = 0;
    for (const row of dataset.rows) {
      const pad = padsById.get(row.transporterId);
      row.pad = pad ? String(pad) : '';
      if (pad) copied += 1;
      else if (scheduled.has(row.transporterId)) noPad += 1;
      else missing += 1;
    }

    this.saveRouteData(dataset);
    this.notify();
    return [copied, noPad, missing];
  }

  clearRouteData(kind: string): void {
    this.store.clearRouteData(kind);
    this.routeData.set(kind, createRouteDataSet({ kind }));
    this.notify();
  }

  /** The exports that have something in them, in tab order. */
  loadedRouteSources(): string[] {
    return ROUTE_KINDS.filter((kind) => this.routeSet(kind).rows.length > 0);
  }

  /** Who a route entry belongs to: by Transporter ID first, then by name. */
  private routeEntryMatch(
    entry: RouteEntry,
    known: Map<string, Associate>,
    index: AssociateIndex,
    created: Map<string, Associate>,
  ): Match {
    if (entry.transporterId) {
      const associate = known.get(entry.transporterId);
      if (associate !== undefined) return createMatch(entry.driverName, associate, 'exact');
    }
    if (!entry.driverName) return createMatch(entry.driverName);
    const associate = created.get(driverKey(entry.driverName));
    if (associate !== undefined) return createMatch(entry.driverName, associate, 'exact');
    return matchDriver(entry.driverName, index, this.links);
  }

  /**
   * Put people route data is the only record of on the roster and in the book. Every loaded
   * export is searched. Returns [names added, notes on the ones to look at].
   */
  addRouteOnlyDrivers(): [string[], string[]] {
    if (isRosterEmpty(this.roster)) return [[], []];

    const known = byTransporterId(this.associates);
    const index = AssociateIndex.build(this.associates.rows);
    const created = new Map<string, Associate>();
    const onRoster = new Set(this.roster.rows.map((row) => driverKey(row.driver)));
    // First + last as well, so a middle name is not enough to put the same person on twice.
    const rosteredNames = new Set(this.roster.rows.map((row) => nameKeyText(row.driver)));
    const heldIds = this.rosteredIds();

    const added: string[] = [];
    const review: string[] = [];
    let newAssociates = false;
    const seen = new Set<string>();

    for (const kind of ROUTE_KINDS) {
      const dataset = this.routeSet(kind);
      for (const entry of dataset.rows) {
        if (!(entry.routeCode || entry.serviceType)) continue; // nothing says work was given out
        const entryKey = driverKey(entry.driverName);
        if (!entry.transporterId && !entryKey) continue;
        // One person, however many exports and routes they turn up in.
        const identity = entry.transporterId || `name:${entryKey}`;
        if (seen.has(identity)) continue;
        seen.add(identity);

        const match = this.routeEntryMatch(entry, known, index, created);
        if (match.method === 'cleared') continue; // the user said this name is not an associate
        if (isAmbiguous(match)) {
          review.push(
            `${entry.driverName} - matches ${match.candidates.length} associates, left off`,
          );
          continue;
        }

        let associate = match.associate;
        if (associate === null) {
          // Everything but the qualification is left blank rather than guessed.
          associate = createAssociate({
            name: entry.driverName || entry.transporterId,
            transporterId: entry.transporterId,
            position: entry.serviceType,
            qualifications: [...ROUTE_ONLY_QUALIFICATIONS],
          });
          this.associates.rows.push(associate);
          created.set(driverKey(associate.name), associate);
          if (entry.transporterId) known.set(entry.transporterId, associate);
          newAssociates = true;
        } else {
          if (associate.qualifications.length === 0) {
            associate.qualifications = [...ROUTE_ONLY_QUALIFICATIONS];
            newAssociates = true;
          }
          if (entry.transporterId && !associate.transporterId) {
            // Found by name because the book had no ID for them: take the one route data has.
            associate.transporterId = entry.transporterId;
            known.set(entry.transporterId, associate);
            newAssociates = true;
          }
        }

        if (entry.transporterId && heldIds.has(entry.transporterId)) continue;
        if (
          onRoster.has(driverKey(associate.name)) ||
          rosteredNames.has(nameKeyText(associate.name))
        ) {
          // Already on the sheet under some spelling of the name.
          continue;
        }

        const pad = padFor(dataset, entry);
        this.roster.rows.push(
          createDriverRow({
            driver: associate.name,
            shiftType: isOnRoadDriver(entry.serviceType) ? SHIFT_ORE : '',
            serviceType: entry.serviceType,
            routes: entry.routeCode,
            waveTime: entry.dispatchTime,
            pad: pad ? String(pad) : '',
          }),
        );
        onRoster.add(driverKey(associate.name));
        rosteredNames.add(nameKeyText(associate.name));
        const needed = requiredQualification(entry.serviceType);
        if (needed && !hasQualification(associate, needed)) {
          review.push(`${associate.name} - ${entry.serviceType || 'their route'} needs ${needed}`);
        }
        if (entry.transporterId) {
          // Pin the link so the anchor holds even if the two spellings drift apart later.
          const key = driverKey(associate.name);
          this.store.setLink(key, associate.name, entry.transporterId);
          this.links.set(key, entry.transporterId);
        }
        added.push(associate.name);
      }
    }

    if (newAssociates) {
      this.store.saveAssociates(associatesToStored(this.associates));
      this.applyTenure();
    }
    if (added.length > 0) this.saveRoster();
    if (newAssociates || added.length > 0) {
      this.rematch();
      this.notify();
    }
    return [added, review];
  }

  /** Copy dispatch time, route code, service type and PAD from an export onto the roster. */
  applyRouteData(kind: string): RouteApplyResult {
    const dataset = this.routeSet(kind);
    const result = createRouteApplyResult({ kind });
    if (dataset.rows.length === 0 || isRosterEmpty(this.roster)) return result;

    [result.addedDrivers, result.needsReview] = this.addRouteOnlyDrivers();

    const byId = new Map<string, RouteEntry>();
    for (const entry of dataset.rows) {
      if (!entry.transporterId) continue;
      if (byId.has(entry.transporterId)) {
        result.duplicates += 1; // keep the first, flag the rest
        continue;
      }
      byId.set(entry.transporterId, entry);
    }

    for (const row of this.roster.rows) {
      const associate = this.associateFor(row);
      if (associate === null || !associate.transporterId) {
        result.noAssociate += 1;
        continue;
      }
      const entry = byId.get(associate.transporterId);
      if (entry === undefined) {
        result.notInExport += 1;
        continue;
      }

      let touched = false;
      if (entry.dispatchTime) {
        row.waveTime = entry.dispatchTime;
        result.dispatchTimes += 1;
        touched = true;
      }
      if (entry.routeCode) {
        row.routes = entry.routeCode;
        result.routeCodes += 1;
        touched = true;
      }
      if (entry.serviceType) {
        row.serviceType = entry.serviceType;
        result.serviceTypes += 1;
        touched = true;
        if (isOnRoadDriver(entry.serviceType)) row.shiftType = SHIFT_ORE;
      }
      const pad = padFor(dataset, entry);
      if (pad) {
        row.pad = String(pad);
        result.pads += 1;
        touched = true;
      }
      if (touched) result.filled += 1;
    }

    this.roster.routeSource = kind;
    this.saveRoster();
    this.notify();
    return result;
  }

  // ------------------------------------------------------------------- dwp

  /** Store a DWP sheet read by `importDwpSheet`. Changes nothing on the roster by itself. */
  importDwp(dataset: DwpDataSet): DwpDataSet {
    this.store.saveDwp(dwpToStored(dataset));
    this.dwp = dataset;
    this.notify();
    return dataset;
  }

  clearDwp(): void {
    this.store.clearDwp();
    this.dwp = createDwpDataSet();
    this.notify();
  }

  /** How many drivers on the roster have a line in the DWP sheet. */
  dwpMatchedCount(): number {
    if (this.dwp.rows.length === 0 || isRosterEmpty(this.roster)) return 0;
    const byCode = byRouteCode(this.dwp);
    return this.roster.rows.filter((row) => byCode.has(routeKey(row.routes))).length;
  }

  /** Whether the loaded DWP sheet is the roster's day: ok, unknown or mismatch. */
  dwpDayStatus(): string {
    if (this.dwp.day === null) return DWP_DAY_UNKNOWN;
    if (this.roster.loadOutDate === null) return DWP_DAY_UNKNOWN;
    return this.dwp.day === this.roster.loadOutDate ? DWP_DAY_OK : DWP_DAY_MISMATCH;
  }

  /** Copy staging, bags and OVS from the DWP sheet onto the roster, joined on route code. */
  applyDwp(): DwpApplyResult {
    const result = createDwpApplyResult();
    if (this.dwp.rows.length === 0 || isRosterEmpty(this.roster)) return result;

    const clear = (row: DriverRow): number => {
      if (!(row.stagingLocation || row.bags || row.ovs)) return 0;
      row.stagingLocation = '';
      row.bags = '';
      row.ovs = '';
      return 1;
    };

    const byCode = byRouteCode(this.dwp);
    let cleared = 0;
    for (const row of this.roster.rows) {
      const key = routeKey(row.routes);
      if (!key) {
        result.noRouteCode += 1;
        cleared += clear(row);
        continue;
      }
      const entry = byCode.get(key);
      if (entry === undefined) {
        result.notInSheet += 1;
        cleared += clear(row);
        continue;
      }

      let touched = false;
      if (entry.staging) {
        row.stagingLocation = entry.staging;
        result.staging += 1;
        touched = true;
      }
      if (entry.bags) {
        row.bags = entry.bags;
        result.bags += 1;
        touched = true;
      }
      if (entry.ovs) {
        row.ovs = entry.ovs;
        result.ovs += 1;
        touched = true;
      }
      if (touched) result.filled += 1;
    }

    result.cleared = cleared;
    if (result.filled || cleared) {
      this.saveRoster();
      this.notify();
    }
    return result;
  }

  // -------------------------------------------------------------- vehicles

  /** Store a vehicle export read by `importVehicleData`. Overrides and priorities are kept. */
  importVehicles(fleet: VehicleFleet): VehicleFleet {
    this.store.saveVehicles(fleetToStored(fleet));
    this.vehicles = fleet;
    this.notify();
    return fleet;
  }

  clearVehicles(): void {
    this.store.clearVehicles();
    this.vehicles = createVehicleFleet();
    this.notify();
  }

  isOperational(vehicle: Vehicle): boolean {
    return vans.isOperational(this, vehicle);
  }

  isOverridden(vehicle: Vehicle): boolean {
    return vans.isOverridden(this, vehicle);
  }

  setOperational(vehicle: Vehicle, operational: boolean): void {
    vans.setOperational(this, vehicle, operational);
  }

  clearVehicleOverrides(): void {
    this.store.clearVehicleOverrides();
    this.vehicleOverrides = new Map();
    this.notify();
  }

  operationalVehicles(): Vehicle[] {
    return vans.operationalVehicles(this);
  }

  assignableVehicles(): Vehicle[] {
    return vans.assignableVehicles(this);
  }

  availableVehicles(): Vehicle[] {
    return vans.availableVehicles(this);
  }

  // ---------------------------------------------------------- LMR approval

  isLmrApproved(transporterId: string): boolean {
    return this.lmrApproved.has(transporterId);
  }

  setLmrApproved(transporterId: string, approved: boolean): void {
    if (!transporterId) return;
    this.store.setLmrApproved(transporterId, approved);
    if (approved) this.lmrApproved.add(transporterId);
    else this.lmrApproved.delete(transporterId);
    this.notify();
  }

  clearLmrApproved(): void {
    this.store.clearLmrApproved();
    this.lmrApproved = new Set();
    this.notify();
  }

  lmrVehicles(): Vehicle[] {
    return vans.lmrVehicles(this);
  }

  overriddenCount(): number {
    return vans.overriddenCount(this);
  }

  // ------------------------------------------------------- van assignment

  assignVans(): AssignmentResult {
    return vans.assignVans(this);
  }

  reassignRoute(source: DriverRow, target: DriverRow): void {
    vans.reassignRoute(this, source, target);
  }

  reassignVan(source: DriverRow, target: DriverRow): void {
    vans.reassignVan(this, source, target);
  }

  giveVan(row: DriverRow, vehicle: Vehicle): void {
    vans.giveVan(this, row, vehicle);
  }

  takeVan(row: DriverRow): string {
    return vans.takeVan(this, row);
  }

  clearVans(): number {
    return vans.clearVans(this);
  }

  // ----------------------------------------------------- previous roster

  /** Keep today's roster as the previous one, for the next day's run. A copy, not a handover. */
  moveToPreviousRoster(): number {
    this.previousRoster = {
      rows: this.roster.rows.map(copyRow),
      loadOutDate: this.roster.loadOutDate,
      sourceFile: this.roster.sourceFile,
      importedAt: this.roster.importedAt,
      routeSource: this.roster.routeSource,
    };
    this.store.savePreviousRoster(rosterToStored(this.previousRoster));
    this.previousVansCache = null;
    this.notify();
    return this.previousRoster.rows.length;
  }

  clearPreviousRoster(): void {
    this.store.clearPreviousRoster();
    this.previousRoster = createRoster();
    this.previousVansCache = null;
    this.notify();
  }

  /** Transporter ID -> the VIN that driver had on the previous roster. Cached until a re-match. */
  previousVans(): Map<string, string> {
    if (this.previousVansCache === null) this.previousVansCache = this.computePreviousVans();
    return new Map(this.previousVansCache);
  }

  computePreviousVans(): Map<string, string> {
    const held = new Map<string, string>();
    if (isRosterEmpty(this.previousRoster)) return held;
    const book = byTransporterId(this.associates);
    // Where two associates share a name, the later one wins (a dict comprehension in the old app).
    const byName = new Map<string, Associate>();
    for (const associate of this.associates.rows) byName.set(associate.name, associate);
    const carrying = this.previousRoster.rows.filter((row) => row.vin);
    // The stored rows keep only the driver name, so they go back through the same link and
    // matching machinery the live roster uses.
    const matches = matchRoster(carrying, this.associates.rows, this.links);
    for (const row of carrying) {
      const key = driverKey(row.driver);
      let transporterId: string | null | undefined = this.links.get(key);
      if (!transporterId) {
        const match = matches.get(key);
        if (match && match.associate) transporterId = match.associate.transporterId;
      }
      if (!transporterId) {
        const associate = byName.get(row.driver);
        transporterId = associate ? associate.transporterId : '';
      }
      if (transporterId && book.has(transporterId) && !held.has(transporterId)) {
        held.set(transporterId, row.vin);
      }
    }
    return held;
  }

  // ----------------------------------------------------- vehicle priority

  vehiclePriority(vehicle: Vehicle): string {
    return vans.vehiclePriority(this, vehicle);
  }

  setVehiclePriority(vehicle: Vehicle, priority: string): void {
    vans.setVehiclePriority(this, vehicle, priority);
  }

  clearVehiclePriorities(): void {
    this.store.clearVehiclePriorities();
    this.vehiclePriorities = new Map();
    this.notify();
  }

  // ------------------------------------------------------------ tenure

  /** Put the imported route counts onto the associate records, keyed by Transporter ID. */
  applyTenure(): void {
    for (const associate of this.associates.rows) {
      associate.tenure = tenureCountFor(this.tenureBook, associate.transporterId);
    }
  }

  // -------------------------------------------------------- shared routes

  /** Say which of a shared route's drivers it belongs to. */
  setRouteDriver(kind: string, entry: RouteEntry, transporterId: string): void {
    for (const [name, heldId] of driverOptions(entry)) {
      if (heldId === transporterId) {
        entry.transporterId = heldId;
        entry.driverName = name;
        break;
      }
    }
    this.saveRouteData(this.routeSet(kind));
    this.notify();
  }

  /** Drop a driver off the roster entirely. */
  removeDriver(row: DriverRow): void {
    const position = this.roster.rows.indexOf(row);
    if (position < 0) return;
    this.roster.rows.splice(position, 1);
    this.saveRoster();
    this.rematch();
    this.notify();
  }

  // ---------------------------------------------------------- van affinity

  /**
   * Put an associate in a van's slot. A driver holds at most one primary and one secondary van,
   * so taking a slot gives up any other of the same kind. Returns what was given up.
   */
  setAffinity(vin: string, slot: string, transporterId: string): Array<[string, string]> {
    const displaced: Array<[string, string]> = [];
    if (transporterId) {
      const kind = slotKind(slot);
      for (const [heldVin, heldSlot] of heldBy(this.affinity, transporterId)) {
        if (heldVin === vin && heldSlot === slot) continue;
        if (slotKind(heldSlot) === kind) {
          this.store.deleteAffinity(heldVin, heldSlot);
          affinityClear(this.affinity, heldVin, heldSlot);
          displaced.push([heldVin, heldSlot]);
        }
      }
    }
    if (transporterId) this.store.setAffinity(vin, slot, transporterId);
    else this.store.deleteAffinity(vin, slot);
    affinitySet(this.affinity, vin, slot, transporterId);
    this.notify();
    return displaced;
  }

  clearAffinity(vin: string, slot: string): void {
    this.store.deleteAffinity(vin, slot);
    affinityClear(this.affinity, vin, slot);
    this.notify();
  }

  clearAllAffinity(): void {
    this.store.clearAffinity();
    this.affinity = createVanAffinity();
    this.notify();
  }

  affinityAssociate(vin: string, slot: string): Associate | null {
    const transporterId = affinityGet(this.affinity, vin, slot);
    if (!transporterId) return null;
    return byTransporterId(this.associates).get(transporterId) ?? null;
  }

  // ---------------------------------------------------------------- links

  /** Pin a driver to an associate, or (with null or '') to nothing at all. */
  linkDriver(driverName: string, transporterId: string | null): void {
    const key = driverKey(driverName);
    this.store.setLink(key, driverName, transporterId);
    this.links.set(key, transporterId || null);
    this.rematch();
    this.notify();
  }

  /** Drop the manual link and fall back to automatic matching. */
  unlinkDriver(driverName: string): void {
    const key = driverKey(driverName);
    this.store.deleteLink(key);
    this.links.delete(key);
    this.rematch();
    this.notify();
  }

  clearLinks(): void {
    this.store.clearLinks();
    this.links = new Map();
    this.rematch();
    this.notify();
  }

  // --------------------------------------------------------------- lookup

  matchFor(row: Pick<DriverRow, 'driver'>): Match | null {
    return this.matches.get(driverKey(row.driver)) ?? null;
  }

  associateFor(row: Pick<DriverRow, 'driver'>): Associate | null {
    const match = this.matchFor(row);
    return match ? match.associate : null;
  }

  matchSummary(): Map<string, number> {
    return summarise(this.matches);
  }

  matchedCount(): number {
    return [...this.matches.values()].filter(isMatched).length;
  }

  /** Drivers the user should look at: no match, or only a fuzzy one. Counted per driver key. */
  reviewCount(): number {
    return [...this.matches.values()].filter(needsReview).length;
  }

  /** Transporter IDs that appear on the current load-out. */
  rosteredIds(): Set<string> {
    const ids = new Set<string>();
    for (const match of this.matches.values()) {
      if (match.associate !== null) ids.add(match.associate.transporterId);
    }
    return ids;
  }

  // ------------------------------------------------------------- read-outs

  /** What the Check column says about this driver: 'OK', or what is wrong. */
  checkText(row: DriverRow, today: IsoDate): string {
    if (this.associates.rows.length === 0) return '';
    const match = this.matchFor(row);
    if (match === null) return 'No associate found';
    if (match.method === 'cleared') return 'Not an associate';
    if (!isMatched(match))
      return isAmbiguous(match) ? 'Ambiguous - pick one' : 'No associate found';

    const issues = this.driverIssues(row, today);
    if (match.method === 'fuzzy') issues.unshift('Verify match');
    return issues.length > 0 ? issues.join(', ') : 'OK';
  }

  /** The van badges, plus LMR where the driver is cleared for a rental. */
  vanBadges(associate: Associate | null): string {
    if (associate === null) return '';
    let badges = associateVanBadges(associate);
    if (this.isLmrApproved(associate.transporterId)) badges = `${badges} LMR`.trim();
    return badges;
  }

  assignMethodLabel(row: DriverRow): string {
    return vans.assignMethodLabel(row);
  }

  // ----------------------------------------------------------------- print

  /** Today's roster as the printed sheet wants it. `today` is for the Check column. */
  printRows(today: IsoDate): PrintRow[] {
    return print.printRows(this, today);
  }

  /** How the Print tab was last left. The default layout if never touched. */
  printSpec(): PrintSpec {
    return print.printSpec(this);
  }

  setPrintSpec(spec: PrintSpec): void {
    print.setPrintSpec(this, spec);
  }

  /** The layouts saved under a name, in name order. */
  printPresets(): string[] {
    return this.store.printLayoutNames();
  }

  printPreset(name: string): PrintSpec | null {
    return print.printPreset(this, name);
  }

  savePrintPreset(name: string, spec: PrintSpec): void {
    print.savePrintPreset(this, name, spec);
  }

  deletePrintPreset(name: string): void {
    this.store.deletePrintLayout(name);
  }

  /** Human-readable problems with this driver's anchor record. */
  driverIssues(row: DriverRow, today: IsoDate): string[] {
    const match = this.matchFor(row);
    if (this.associates.rows.length === 0) return [];
    if (match === null || !isMatched(match)) {
      return match === null || match.method !== 'cleared' ? ['No associate record'] : [];
    }

    const associate = match.associate as Associate;
    const issues: string[] = [];
    for (const missing of missingForShift(associate, row.shiftType)) {
      issues.push(`Not ${missing} qualified`);
    }
    const state = idState(associate, today);
    const days = daysUntilIdExpiry(associate, today) as number;
    if (state === 'expired') issues.push(`ID expired ${Math.abs(days)}d ago`);
    else if (state === 'expiring') issues.push(`ID expires in ${days}d`);
    // Only call someone inactive when the record actually says so: blank status is unknown.
    if (associate.status && !isActive(associate)) issues.push('Inactive associate');
    if (associate.qualifications.length === 0) issues.push('No qualifications on file');
    return issues;
  }
}
