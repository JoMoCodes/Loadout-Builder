// Turns the core's AppState into the plain snapshot the pages draw from.
//
// Everything in the result is plain data (objects, arrays, Map, Set, Date, text, numbers), because
// it crosses to the page by structured clone, which drops the methods of a class instance. The
// core's models are all plain already; the one class in the core (the spreadsheet reader's time
// of day) never reaches the state. `snapshot.test.ts` walks a real snapshot to keep it that way.

import {
  ROUTE_SOURCES,
  activeCount,
  affinitySize,
  tenureCount,
  daysUntilIdExpiry,
  idState,
  isAmbiguous,
  looksLikeLmr,
  typeRanks,
  unknownWords,
  vanCategory,
  vanKind,
  type AppState,
  type IsoDate,
  type Match,
  weekLabel,
} from '@loadout/core';
import { EMPTY_PERF_SNAPSHOT } from '../shared/performance';
import type { PerfSnapshot } from '../shared/performance';
import { EMPTY_ROUTE_SHEETS, type RouteSheetsCounts } from '../shared/routeSheets';
import type {
  AppSnapshot,
  AssociateView,
  MatchView,
  RosterRowView,
  VehicleView,
} from '../shared/snapshot';

function matchView(match: Match | null): MatchView {
  if (match === null) return { method: 'none', ambiguous: false, candidates: [] };
  return {
    method: match.method,
    ambiguous: isAmbiguous(match),
    candidates: match.candidates.map((c) => ({ name: c.name, transporterId: c.transporterId })),
  };
}

export interface SnapshotOptions {
  today: IsoDate;
  revision: number;
  mode: 'real' | 'demo';
  /** The weekly performance data in brief. Empty when the main process has none to give. */
  performance?: PerfSnapshot;
  /** The open route sheet run's numbers. Empty when the main process has none to give. */
  routeSheets?: RouteSheetsCounts;
}

export function buildSnapshot(state: AppState, options: SnapshotOptions): AppSnapshot {
  const { today } = options;

  const rosterRows: RosterRowView[] = state.roster.rows.map((row, index) => {
    const associate = state.associateFor(row);
    return {
      index,
      row,
      match: matchView(state.matchFor(row)),
      associateId: associate?.transporterId ?? '',
      associateName: associate?.name ?? '',
      vanBadges: state.vanBadges(associate),
      tenure: associate?.tenure ?? null,
      check: state.rowCheck(row, today),
      assignMethodLabel: state.assignMethodLabel(row),
      issues: [...state.driverIssues(row, today), ...state.vanIssues(row)],
    };
  });

  const rostered = state.rosteredIds();
  const associates: AssociateView[] = state.associates.rows.map((associate) => ({
    associate,
    vanBadges: state.vanBadges(associate),
    lmrApproved: state.isLmrApproved(associate.transporterId),
    idState: idState(associate, today),
    daysUntilIdExpiry: daysUntilIdExpiry(associate, today),
    onRoster: rostered.has(associate.transporterId),
  }));

  const available = new Set(state.availableVehicles().map((v) => v.vin));
  const held = new Set<string>();
  for (const row of state.roster.rows) {
    if (row.vin) held.add(row.vin);
    if (row.vehicle) held.add(row.vehicle);
  }
  const ranks = typeRanks(state.vehicleTypes);
  const typeCounts = new Map<string, number>();
  const vehicles: VehicleView[] = state.vehicles.rows.map((vehicle) => {
    const { type, source } = state.vanType(vehicle);
    const kind = vanKind(vehicle, type, ranks);
    typeCounts.set(type.id, (typeCounts.get(type.id) ?? 0) + 1);
    return {
      vehicle,
      operational: state.isOperational(vehicle),
      overridden: state.isOverridden(vehicle),
      priority: state.vehiclePriority(vehicle),
      affinity: Object.fromEntries(state.affinity.slots.get(vehicle.vin) ?? []),
      rental: kind.lmrOnly,
      typeId: type.id,
      typeName: type.name,
      category: vanCategory(vehicle, type),
      typeSource: source,
      handOnly: kind.handOnly,
      rank: kind.rank,
      looksLikeLmr: looksLikeLmr(vehicle, type),
      inUse: held.has(vehicle.vin) || held.has(vehicle.name),
      available: available.has(vehicle.vin),
    };
  });
  const vehicleTypes = state.vehicleTypes.map((type) => ({
    ...type,
    words: [...type.words],
    vans: typeCounts.get(type.id) ?? 0,
    place: type.drive === 'hand' ? null : (ranks.get(type.id) ?? 0) + 1,
  }));

  const routeSets = ROUTE_SOURCES.map(([kind, label]) => ({ ...state.routeSet(kind), label }));
  const routeRows: Record<string, number> = {};
  for (const set of routeSets) routeRows[set.kind] = set.rows.length;

  const matchSummary = state.matchSummary();
  const withCount = tenureCount(state.associates);

  return {
    revision: options.revision,
    today,
    mode: options.mode,
    loadOutDate: state.roster.loadOutDate,
    roster: {
      sourceFile: state.roster.sourceFile,
      importedAt: state.roster.importedAt,
      routeSource: state.roster.routeSource,
      rows: rosterRows,
    },
    associates,
    vehicles,
    sources: {
      associates: {
        sourceFile: state.associates.sourceFile,
        importedAt: state.associates.importedAt,
      },
      vehicles: { sourceFile: state.vehicles.sourceFile, importedAt: state.vehicles.importedAt },
    },
    routeSets,
    dwp: {
      set: state.dwp,
      matchedCount: state.dwpMatchedCount(),
      dayStatus: state.dwpDayStatus(),
    },
    previousRoster: state.previousRoster,
    lmrApproved: [...state.lmrApproved],
    vehicleTypes,
    vehicleTypeOverrides: Object.fromEntries(state.vehicleTypeOverrides),
    unknownOwnership: unknownWords(state.vehicles.rows, state.vehicleTypes),
    affinity: Object.fromEntries(
      [...state.affinity.slots].map(([vin, held]) => [vin, Object.fromEntries(held)]),
    ),
    links: new Map(state.links),
    linkList: state.linkList(),
    tenure: {
      records: state.tenureBook.records.size,
      sourceFile: state.tenureBook.sourceFile,
      importedAt: state.tenureBook.importedAt,
      associatesWithCount: withCount,
      weekLabel: weekLabel(state.tenureBook),
    },
    print: { spec: state.printSpec(), presets: state.printPresets() },
    matchSummary,
    performance: options.performance ?? EMPTY_PERF_SNAPSHOT,
    routeSheets: options.routeSheets ?? { ...EMPTY_ROUTE_SHEETS },
    counts: {
      rosterRows: rosterRows.length,
      matched: state.matchedCount(),
      needReview: state.reviewCount(),
      associates: associates.length,
      activeAssociates: activeCount(state.associates),
      vehicles: vehicles.length,
      operationalVehicles: state.operationalVehicles().length,
      availableVehicles: available.size,
      overriddenVehicles: state.overriddenCount(),
      rentalVehicles: vehicles.filter((v) => v.rental).length,
      lmrApproved: state.lmrApproved.size,
      dwpRows: state.dwp.rows.length,
      dwpMatched: state.dwpMatchedCount(),
      previousRosterRows: state.previousRoster.rows.length,
      previousOnToday: [...state.previousVans().keys()].filter((id) => rostered.has(id)).length,
      links: state.links.size,
      affinitySlots: affinitySize(state.affinity),
      routeRows,
    },
  };
}
