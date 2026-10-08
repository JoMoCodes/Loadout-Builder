// The first-day checklist on Home: five steps that tick themselves off as the app sees them done.
// Pure functions only, so vitest can check them (checklist.test.ts). The words people read are
// in FirstRunChecklist.tsx; this file only says which steps are done and what each button does.

import type { AppSnapshot } from '../../shared/snapshot';

export type StepId = 'drivers' | 'vans' | 'sheet' | 'route-data' | 'assign-print';

export const STEP_ORDER: readonly StepId[] = [
  'drivers',
  'vans',
  'sheet',
  'route-data',
  'assign-print',
];

/** What the checklist needs to know, read from the snapshot (counts only, never names). */
export interface ChecklistFacts {
  drivers: number;
  vans: number;
  rosterRows: number;
  /** Rows in any of the three route exports (Routes, Itineraries, Weekly Schedule). */
  routeExportRows: number;
  /** The roster has dispatch times or PADs on it: route data was brought over. */
  routeDataOnRoster: boolean;
  /** Drivers on the roster who have a van. */
  driversWithVan: number;
  /** A roster was printed or saved as a file. */
  printed: boolean;
}

export function checklistFacts(snapshot: AppSnapshot, printed: boolean): ChecklistFacts {
  const rows = snapshot.roster.rows;
  const routeExportRows = Object.values(snapshot.counts.routeRows ?? {}).reduce(
    (sum, n) => sum + n,
    0,
  );
  return {
    drivers: snapshot.counts.associates,
    vans: snapshot.counts.vehicles,
    rosterRows: rows.length,
    routeExportRows,
    routeDataOnRoster: rows.some(
      (view) => view.row.waveTime.trim() !== '' || view.row.pad.trim() !== '',
    ),
    driversWithVan: rows.filter((view) => view.row.vehicle.trim() !== '').length,
    printed,
  };
}

/** Which steps are done. Each step is judged on its own, so they can tick in any order. */
export function stepsDone(facts: ChecklistFacts): Record<StepId, boolean> {
  return {
    drivers: facts.drivers > 0,
    vans: facts.vans > 0,
    sheet: facts.rosterRows > 0,
    'route-data': facts.rosterRows > 0 && facts.routeDataOnRoster,
    'assign-print': facts.driversWithVan > 0 && facts.printed,
  };
}

export function doneCount(done: Record<StepId, boolean>): number {
  return STEP_ORDER.filter((id) => done[id]).length;
}

export function allDone(done: Record<StepId, boolean>): boolean {
  return doneCount(done) === STEP_ORDER.length;
}

/** The first step not done yet: the one the checklist points at. Null when all are done. */
export function currentStep(done: Record<StepId, boolean>): StepId | null {
  return STEP_ORDER.find((id) => !done[id]) ?? null;
}

/**
 * What a step's button does. Each one opens the page and presses that page's own button, so the
 * page asks its usual questions (for example before it replaces a roster).
 */
export type StepAction =
  | 'import-associates'
  | 'import-vehicles'
  | 'import-loadout'
  | 'import-routes'
  | 'bring-over'
  | 'assign-vans'
  | 'open-print';

export function stepAction(id: StepId, facts: ChecklistFacts): StepAction {
  switch (id) {
    case 'drivers':
      return 'import-associates';
    case 'vans':
      return 'import-vehicles';
    case 'sheet':
      return 'import-loadout';
    case 'route-data':
      // Route data is brought in on its own page first, then brought over onto the roster.
      return facts.routeExportRows > 0 ? 'bring-over' : 'import-routes';
    case 'assign-print':
      return facts.driversWithVan > 0 ? 'open-print' : 'assign-vans';
  }
}
