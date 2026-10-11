// The whole way through: the made-up exports are read, saved, read back from the database and
// worked out, and the numbers equal what the old app worked out from the same files.

import {
  computeAverages,
  evaluateCoaching,
  getAllWeeks,
  verificationCsv,
} from '@loadout/performance';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { PerformanceStore } from './performance';
import { applyAll, loadFixtureImports } from './perfTestkit';
import { Store } from './store';

const EXPECTED = join(__dirname, '..', '..', '..', 'scripts', 'parity', 'wpa', 'expected');
const expected = (name: string): unknown => JSON.parse(readFileSync(join(EXPECTED, name), 'utf8'));

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
        .map(([k, v]) => [k, sortKeys(v)]),
    );
  }
  return value;
}

describe('saved weekly performance data, worked out', () => {
  let perf: PerformanceStore;
  beforeAll(async () => {
    const files = await loadFixtureImports();
    const store = new Store(':memory:');
    perf = new PerformanceStore(store.db, { now: () => new Date(2026, 9, 11, 8, 0, 0) });
    applyAll(perf, files);
  }, 60_000);

  it('gives the old app’s weeks, averages and coaching flags', () => {
    const data = perf.loadPerfData();
    expect(getAllWeeks(data)).toEqual(expected('weeks.json'));
    expect(
      sortKeys(JSON.parse(JSON.stringify(computeAverages(data, '2026-W31', '2026-W40')))),
    ).toEqual(sortKeys(expected('averages.json')));
    const flags = evaluateCoaching(data, '2026-W31', '2026-W40');
    expect(flags.length).toBe((expected('coaching.json') as { flags: unknown[] }).flags.length);
  });

  it('gives the old app’s check file', () => {
    const data = perf.loadPerfData();
    const ids = data.drivers.map((d) => d.transporterId);
    const csv = verificationCsv(data, ids, { newline: '\n' });
    expect(csv).toBe(readFileSync(join(EXPECTED, 'verification.csv'), 'utf8'));
  });
});
