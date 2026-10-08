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
  daysUntilIdExpiry,
  idState,
  isAmbiguous,
  type AppState,
  type IsoDate,
  type Match,
  weekLabel,
} from '@loadout/core';
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
      check: state.checkText(row, today),
      assignMethodLabel: state.assignMethodLabel(row),
      issues: state.driverIssues(row, today),
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
  const rentals = new Set(state.lmrVehicles().map((v) => v.vin));
  const vehicles: VehicleView[] = state.vehicles.rows.map((vehicle) => ({
    vehicle,
    operational: state.isOperational(vehicle),
    overridden: state.isOverridden(vehicle),
    priority: state.vehiclePriority(vehicle),
    affinity: Object.fromEntries(state.affinity.slots.get(vehicle.vin) ?? []),
    rental: rentals.has(vehicle.vin),
    inUse: held.has(vehicle.vin) || held.has(vehicle.name),
    available: available.has(vehicle.vin),
  }));

  const routeSets = ROUTE_SOURCES.map(([kind, label]) => ({ ...state.routeSet(kind), label }));
  const routeRows: Record<string, number> = {};
  for (const set of routeSets) routeRows[set.kind] = set.rows.length;

  const matchSummary = state.matchSummary();
  const withCount = state.associates.rows.filter((a) => a.tenure !== null).length;

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
    affinity: Object.fromEntries(
      [...state.affinity.slots].map(([vin, held]) => [vin, Object.fromEntries(held)]),
    ),
    links: new Map(state.links),
    tenure: {
      records: state.tenureBook.records.size,
      sourceFile: state.tenureBook.sourceFile,
      importedAt: state.tenureBook.importedAt,
      associatesWithCount: withCount,
      weekLabel: weekLabel(state.tenureBook),
    },
    print: { spec: state.printSpec(), presets: state.printPresets() },
    matchSummary,
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
