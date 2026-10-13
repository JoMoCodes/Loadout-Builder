// The route sheet runs in the database: a whole run saved and read back as it was, with the made-up
// route sheets the parity harness read from the synthetic PDF
// (scripts/parity/rsd/expected/2026-09-01/sheets.json).

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { RouteSheet } from '@loadout/route-sheets';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { RouteSheetsStore, type StoredRun } from './routeSheets';
import { Store } from './store';

const expectedDir = fileURLToPath(
  new URL('../../../scripts/parity/rsd/expected/2026-09-01/', import.meta.url),
);
const SHEETS = (
  JSON.parse(readFileSync(`${expectedDir}sheets.json`, 'utf8')) as { sheets: RouteSheet[] }
).sheets;
const INPUTS = JSON.parse(readFileSync(`${expectedDir}inputs.json`, 'utf8')) as {
  decisions: StoredRun['decisions'];
  wavePads: Record<string, string>;
};

let clock = new Date(Date.UTC(2026, 8, 1, 12, 0, 0));
let store: Store;
let runs: RouteSheetsStore;

beforeEach(() => {
  clock = new Date(Date.UTC(2026, 8, 1, 12, 0, 0));
  store = new Store(':memory:');
  runs = new RouteSheetsStore(store.db, { now: () => clock });
});
afterEach(() => store.close());

function run(values: Partial<StoredRun> = {}): StoredRun {
  const first = SHEETS[0]!;
  return {
    id: 'XXX1_2026-09-01_CYCLE1',
    station: first.station,
    date: first.date,
    dateLabel: first.dateLabel,
    cycle: first.cycle,
    pdfFileName: '2026-09-01.pdf',
    importedAt: '2026-09-01T11:00:00.000Z',
    pageCount: 33,
    warnings: ['Page 1: no route code was found on this page.'],
    routesFileName: 'Routes_XXX1_2026-09-01_12_20 (CDT).xlsx',
    wavePads: { '02:30 PM': 'B12' },
    createdAt: '2026-09-01T11:00:00.000Z',
    updatedAt: '2026-09-01T11:00:00.000Z',
    sheets: SHEETS,
    decisions: INPUTS.decisions,
    sent: {
      CX2: { how: 'emailed', at: '2026-09-01T11:30:00.000Z', to: ['driver056@example.com'] },
      CX3: { how: 'copied', at: '2026-09-01T11:31:00.000Z' },
    },
    ...values,
  };
}

describe('the route sheet runs', () => {
  it('reads a whole run back as it was saved', () => {
    expect(runs.hasRun('XXX1_2026-09-01_CYCLE1')).toBe(false);
    const stamp = runs.saveRun(run());
    expect(stamp).toBe(clock.toISOString());
    expect(runs.hasRun('XXX1_2026-09-01_CYCLE1')).toBe(true);
    expect(runs.loadRun('XXX1_2026-09-01_CYCLE1')).toEqual({ ...run(), updatedAt: stamp });
    expect(runs.tableCounts()).toEqual({
      rs_runs: 1,
      rs_sheets: SHEETS.length,
      rs_decisions: Object.keys(INPUTS.decisions).length,
      rs_sent: 2,
    });
    // Route sheet data is not load-out data.
    expect(Object.values(store.tableCounts()).every((n) => n === 0)).toBe(true);
    expect(runs.loadRun('nothing')).toBeNull();
  });

  it('saving again replaces the run, choices and marks included', () => {
    runs.saveRun(run());
    runs.saveRun(run({ sheets: SHEETS.slice(0, 2), decisions: {}, sent: {} }));
    const back = runs.loadRun('XXX1_2026-09-01_CYCLE1')!;
    expect(back.sheets).toEqual(SHEETS.slice(0, 2));
    expect(back.decisions).toEqual({});
    expect(back.sent).toEqual({});
  });

  it('changes one choice, every choice, one sent mark and the typed pads', () => {
    runs.saveRun(run({ decisions: {}, sent: {}, wavePads: {} }));
    clock = new Date(Date.UTC(2026, 8, 1, 13, 0, 0));
    runs.setDecision('XXX1_2026-09-01_CYCLE1', 'CX12', {
      recipients: ['A4OQGIPQ6DAKF4'],
      viaSuggestion: true,
      at: 'x',
    });
    runs.setDecision('XXX1_2026-09-01_CYCLE1', 'CX1', { skipped: true });
    runs.markSent('XXX1_2026-09-01_CYCLE1', 'CX2', { how: 'manual', at: 'y' });
    runs.setWavePads('XXX1_2026-09-01_CYCLE1', { '10:20 AM': '4' });
    let back = runs.loadRun('XXX1_2026-09-01_CYCLE1')!;
    expect(back.decisions).toEqual({
      CX12: { recipients: ['A4OQGIPQ6DAKF4'], viaSuggestion: true, at: 'x' },
      CX1: { skipped: true },
    });
    expect(back.sent).toEqual({ CX2: { how: 'manual', at: 'y' } });
    expect(back.wavePads).toEqual({ '10:20 AM': '4' });
    expect(back.updatedAt).toBe(clock.toISOString());

    runs.setDecision('XXX1_2026-09-01_CYCLE1', 'CX1', null);
    runs.markSent('XXX1_2026-09-01_CYCLE1', 'CX2', null);
    runs.setDecisions('XXX1_2026-09-01_CYCLE1', { CX900: { recipients: [], manual: true } });
    back = runs.loadRun('XXX1_2026-09-01_CYCLE1')!;
    expect(back.decisions).toEqual({ CX900: { recipients: [], manual: true } });
    expect(back.sent).toEqual({});
  });

  it('lists the newest day first, removes a run with everything in it, and old days at once', () => {
    runs.saveRun(run());
    runs.saveRun(run({ id: 'XXX1_2026-08-02_CYCLE1', date: '2026-08-02', sheets: [] }));
    clock = new Date(Date.UTC(2026, 8, 2, 12, 0, 0));
    runs.saveRun(
      run({ id: 'XXX1_2026-09-01_CYCLE2', cycle: 'CYCLE_2', sheets: SHEETS.slice(0, 1) }),
    );
    expect(runs.listRuns().map((r) => [r.id, r.sheets])).toEqual([
      ['XXX1_2026-09-01_CYCLE2', 1],
      ['XXX1_2026-09-01_CYCLE1', SHEETS.length],
      ['XXX1_2026-08-02_CYCLE1', 0],
    ]);
    expect(runs.listRuns()[1]).toMatchObject({
      station: 'XXX1',
      dateLabel: 'TUE, SEP 1, 2026',
      pdfFileName: '2026-09-01.pdf',
      routesFileName: 'Routes_XXX1_2026-09-01_12_20 (CDT).xlsx',
    });

    expect(runs.deleteRun('XXX1_2026-09-01_CYCLE2')).toBe(true);
    expect(runs.deleteRun('XXX1_2026-09-01_CYCLE2')).toBe(false);
    expect(runs.deleteRunsBefore('2026-08-03')).toEqual(['XXX1_2026-08-02_CYCLE1']);
    expect(runs.listRuns().map((r) => r.id)).toEqual(['XXX1_2026-09-01_CYCLE1']);
    runs.deleteRun('XXX1_2026-09-01_CYCLE1');
    expect(runs.tableCounts()).toEqual({ rs_runs: 0, rs_sheets: 0, rs_decisions: 0, rs_sent: 0 });
  });
});
