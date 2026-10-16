import { createDriverRow, type DriverRow } from '@loadout/core';
import { describe, expect, it } from 'vitest';
import type { AppSnapshot } from '../../shared/snapshot';
import {
  allDone,
  checklistFacts,
  currentStep,
  doneCount,
  STEP_ORDER,
  stepAction,
  stepsDone,
  type ChecklistFacts,
} from './checklist';

/** A snapshot with only what the checklist reads. Names come from the made-up fixture people. */
function snapshotWith(options: {
  associates?: number;
  vehicles?: number;
  rows?: Partial<DriverRow>[];
  routeRows?: Record<string, number>;
  routeSheets?: {
    runId: string | null;
    sheets: number;
    ready: number;
    unsent: number;
    needsDecision: number;
    exceptions: number;
  };
}): AppSnapshot {
  const rows = (options.rows ?? []).map((values, index) => ({
    index,
    row: createDriverRow({ driver: 'Barrett Ainsworth', ...values }),
  }));
  return {
    roster: { rows },
    routeSheets: options.routeSheets,
    counts: {
      associates: options.associates ?? 0,
      vehicles: options.vehicles ?? 0,
      routeRows: options.routeRows ?? {},
    },
  } as unknown as AppSnapshot;
}

const nothing: ChecklistFacts = checklistFacts(snapshotWith({}), false);

describe('the first-day checklist', () => {
  it('comes last: the route sheets step follows Assign vans and print', () => {
    expect(STEP_ORDER.slice(-2)).toEqual(['assign-print', 'route-sheets']);
  });

  it('starts with nothing ticked, pointing at the driver list', () => {
    const done = stepsDone(nothing);
    expect(doneCount(done)).toBe(0);
    expect(allDone(done)).toBe(false);
    expect(currentStep(done)).toBe('drivers');
  });

  it('ticks the driver list and the vans once they are brought in', () => {
    const done = stepsDone(checklistFacts(snapshotWith({ associates: 40, vehicles: 25 }), false));
    expect(done.drivers).toBe(true);
    expect(done.vans).toBe(true);
    expect(done.sheet).toBe(false);
    expect(doneCount(done)).toBe(2);
    expect(currentStep(done)).toBe('sheet');
  });

  it("ticks today's load-out sheet when the roster has drivers", () => {
    const done = stepsDone(checklistFacts(snapshotWith({ rows: [{}, {}] }), false));
    expect(done.sheet).toBe(true);
    expect(done['route-data']).toBe(false);
  });

  it('ticks route data only once it is on the roster, not just brought in', () => {
    const loaded = checklistFacts(snapshotWith({ rows: [{}], routeRows: { routes: 30 } }), false);
    expect(stepsDone(loaded)['route-data']).toBe(false);
    const withTimes = checklistFacts(
      snapshotWith({ rows: [{ waveTime: '10:20 AM' }], routeRows: { routes: 30 } }),
      false,
    );
    expect(stepsDone(withTimes)['route-data']).toBe(true);
    const withPad = checklistFacts(snapshotWith({ rows: [{ pad: '1' }] }), false);
    expect(stepsDone(withPad)['route-data']).toBe(true);
  });

  it('ticks the last step only when vans are given out and the roster was printed', () => {
    const vansOnly = checklistFacts(snapshotWith({ rows: [{ vehicle: 'Van 12' }] }), false);
    expect(stepsDone(vansOnly)['assign-print']).toBe(false);
    const printedOnly = checklistFacts(snapshotWith({ rows: [{}] }), true);
    expect(stepsDone(printedOnly)['assign-print']).toBe(false);
    const both = checklistFacts(snapshotWith({ rows: [{ vehicle: 'Van 12' }] }), true);
    expect(stepsDone(both)['assign-print']).toBe(true);
  });

  it('ticks the route sheets step once every sheet is decided and every ready one has gone out', () => {
    const run = 'XXX1_2026-09-01_CYCLE1';
    const none = checklistFacts(snapshotWith({}), false);
    expect(stepsDone(none)['route-sheets']).toBe(false);
    const empty = checklistFacts(
      snapshotWith({
        routeSheets: {
          runId: null,
          sheets: 0,
          ready: 0,
          unsent: 0,
          needsDecision: 0,
          exceptions: 0,
        },
      }),
      false,
    );
    expect(stepsDone(empty)['route-sheets']).toBe(false);
    // The PDF is in and sheets are still waiting to go out.
    const waiting = checklistFacts(
      snapshotWith({
        routeSheets: {
          runId: run,
          sheets: 6,
          ready: 4,
          unsent: 3,
          needsDecision: 0,
          exceptions: 0,
        },
      }),
      false,
    );
    expect(waiting.routeSheets).toBe(6);
    expect(stepsDone(waiting)['route-sheets']).toBe(false);
    // Nothing is ready yet (everything waits for a choice): not done.
    const undecided = checklistFacts(
      snapshotWith({
        routeSheets: {
          runId: run,
          sheets: 6,
          ready: 0,
          unsent: 0,
          needsDecision: 0,
          exceptions: 0,
        },
      }),
      false,
    );
    expect(stepsDone(undecided)['route-sheets']).toBe(false);
    // Everything ready has gone out, but a route still waits for a choice: not done.
    const choosing = checklistFacts(
      snapshotWith({
        routeSheets: {
          runId: run,
          sheets: 6,
          ready: 4,
          unsent: 0,
          needsDecision: 1,
          exceptions: 0,
        },
      }),
      false,
    );
    expect(stepsDone(choosing)['route-sheets']).toBe(false);
    const noMatch = checklistFacts(
      snapshotWith({
        routeSheets: {
          runId: run,
          sheets: 6,
          ready: 4,
          unsent: 0,
          needsDecision: 0,
          exceptions: 2,
        },
      }),
      false,
    );
    expect(stepsDone(noMatch)['route-sheets']).toBe(false);
    const sent = checklistFacts(
      snapshotWith({
        routeSheets: {
          runId: run,
          sheets: 6,
          ready: 4,
          unsent: 0,
          needsDecision: 0,
          exceptions: 0,
        },
      }),
      false,
    );
    expect(stepsDone(sent)['route-sheets']).toBe(true);
  });

  it('is all done with every step ticked', () => {
    const facts = checklistFacts(
      snapshotWith({
        associates: 3,
        vehicles: 2,
        rows: [{ waveTime: '10:20 AM', vehicle: 'Van 12' }],
        routeRows: { routes: 3 },
        routeSheets: {
          runId: 'XXX1_2026-09-01_CYCLE1',
          sheets: 3,
          ready: 3,
          unsent: 0,
          needsDecision: 0,
          exceptions: 0,
        },
      }),
      true,
    );
    const done = stepsDone(facts);
    expect(doneCount(done)).toBe(6);
    expect(allDone(done)).toBe(true);
    expect(currentStep(done)).toBeNull();
  });

  it('counts the rows of every route export', () => {
    const facts = checklistFacts(
      snapshotWith({ routeRows: { routes: 0, itineraries: 4, schedule: 6 } }),
      false,
    );
    expect(facts.routeExportRows).toBe(10);
  });
});

describe("what each step's button does", () => {
  it('brings in the three files on their own pages', () => {
    expect(stepAction('drivers', nothing)).toBe('import-associates');
    expect(stepAction('vans', nothing)).toBe('import-vehicles');
    expect(stepAction('sheet', nothing)).toBe('import-loadout');
  });

  it('imports route data on the Roster, which puts it on the roster too', () => {
    expect(stepAction('route-data', nothing)).toBe('import-routes');
    expect(stepAction('route-data', { ...nothing, routeExportRows: 12 })).toBe('import-routes');
  });

  it('gives out vans first, then opens the Print tab', () => {
    expect(stepAction('assign-print', nothing)).toBe('assign-vans');
    expect(stepAction('assign-print', { ...nothing, driversWithVan: 5 })).toBe('open-print');
  });

  it('brings in the route sheet PDF first, then opens Route Sheets', () => {
    expect(stepAction('route-sheets', nothing)).toBe('import-route-sheets');
    expect(stepAction('route-sheets', { ...nothing, routeSheets: 29 })).toBe('open-route-sheets');
  });
});
