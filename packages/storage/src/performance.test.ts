import type { PerfData } from '@loadout/performance';
import { parseCdf, parseDcr, parsePsb, parseSafety } from '@loadout/performance/importers';
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { PERF_TABLES } from './migrations';
import {
  PerformanceStore,
  localStamp,
  msFromTicks,
  roundTripUtc,
  ticksFromMs,
} from './performance';
import { perfTableSpec } from './perfTables';
import {
  applyAll,
  asHarnessRows,
  driversAlike,
  expectedTable,
  expectedTableRows,
  fixtureFiles,
  loadFixtureImports,
  PERF_DATA_TABLES,
  type FixtureImports,
} from './perfTestkit';
import { Store } from './store';

// A fixed clock, so "imported at" stamps are known.
const NOW = new Date(2026, 9, 11, 8, 30, 15);

let files: FixtureImports;
beforeAll(async () => {
  files = await loadFixtureImports();
}, 60_000);

let store: Store;
let perf: PerformanceStore;
beforeEach(() => {
  store = new Store(':memory:');
  perf = new PerformanceStore(store.db, { now: () => NOW });
});
afterEach(() => store.close());

/** The table counts under the old app's table names (its Drivers table is the driver list). */
function countsByOldName(): Record<string, number> {
  const counts = perf.perfTableCounts();
  return {
    Drivers: perf.knownDriverIds().length,
    ...Object.fromEntries(PERF_TABLES.map((t) => [perfTableSpec(t).legacy, counts[t]])),
  };
}

describe('the made-up files, imported in the old order', () => {
  beforeEach(() => applyAll(perf, files));

  it('fills every table with as many rows as the old app did', () => {
    expect(countsByOldName()).toEqual(expectedTableRows());
    expect(perf.isPerfEmpty()).toBe(false);
  });

  it.each(Object.entries(PERF_DATA_TABLES) as Array<[keyof PerfData, string]>)(
    '%s reads back the same as the old %s table',
    (key, table) => {
      const expected = expectedTable(table);
      const got = asHarnessRows(perf.loadPerfData()[key], expected.columns);
      if (key === 'drivers') expect(driversAlike(got)).toEqual(driversAlike(expected.rows));
      else expect(got).toEqual(expected.rows);
    },
  );

  it('stamps the thresholds and the PSB weeks with the clock', () => {
    const data = perf.loadPerfData();
    expect(new Set(data.thresholds.map((t) => t.importedAt))).toEqual(
      new Set(['2026-10-11 08:30:15']),
    );
    expect(new Set(data.psbImportedWeeks.map((w) => w.importedAt))).toEqual(
      new Set([roundTripUtc(NOW)]),
    );
  });

  it('knows every driver', () => {
    expect(perf.knownDriverIds()).toHaveLength(expectedTableRows().Drivers ?? -1);
  });

  it('changes nothing when the same files are imported again', () => {
    const before = perf.loadPerfData();
    applyAll(perf, files);
    const after = perf.loadPerfData();
    // Scorecards, metrics and events get new ids when replaced; everything else is unchanged.
    const noIds = (rows: readonly object[]) =>
      rows.map((row) => {
        const rest: Record<string, unknown> = { ...row };
        delete rest.id;
        delete rest.scorecardId;
        return rest;
      });
    for (const key of Object.keys(before) as Array<keyof PerfData>) {
      expect(noIds(after[key]), key).toEqual(noIds(before[key]));
    }
    expect(countsByOldName()).toEqual(expectedTableRows());
  });

  it('replaces only the week that is imported again', () => {
    const cdfFile = fixtureFiles('cdf').at(-1)!;
    const week = parseCdf(cdfFile).replaceWeeks[0]!;
    const before = perf.loadPerfData();

    // Read that week's file again, this time with its header only (no events in it).
    const lines = cdfFile.text.split(/\r?\n/);
    const shorter = { fileName: cdfFile.fileName, text: lines.slice(0, 1).join('\n') + '\n' };
    const counts = perf.applyCdf(parseCdf(shorter));
    expect(counts).toEqual({
      weeksReplaced: 1,
      rowsRemoved: before.cdf.filter((r) => r.week === week).length,
      rowsWritten: 0,
    });

    const after = perf.loadPerfData();
    expect(after.cdf.filter((r) => r.week === week)).toEqual([]);
    expect(after.cdf).toEqual(before.cdf.filter((r) => r.week !== week));
  });

  it('gives events of a week imported again new ids after the last one', () => {
    const dcrFile = fixtureFiles('dcr').at(-1)!;
    const result = parseDcr(dcrFile);
    const before = perf.loadPerfData().dcrEvents;
    const highest = Math.max(...before.map((e) => e.id));
    perf.applyDcr(result);
    const after = perf.loadPerfData().dcrEvents;
    const week = result.replaceWeeks[0];
    expect(after.filter((e) => e.week !== week)).toEqual(before.filter((e) => e.week !== week));
    const again = after.filter((e) => e.week === week);
    expect(again).toHaveLength(result.rows.length);
    expect(Math.min(...again.map((e) => e.id))).toBe(highest + 1);
  });

  it('records a PSB week again with the newer file and time', () => {
    const later = new PerformanceStore(store.db, { now: () => new Date(Date.UTC(2026, 9, 12)) });
    const psbFile = fixtureFiles('psb').at(-1)!;
    const counts = later.applyPsb(parsePsb(psbFile));
    expect(counts.importedWeeksRecorded).toBe(1);
    const weeks = perf.loadPerfData().psbImportedWeeks;
    expect(weeks).toHaveLength(expectedTableRows().PsbImportedWeeks ?? -1);
    expect(weeks.filter((w) => w.importedAt === '2026-10-12T00:00:00.0000000Z')).toHaveLength(1);
  });
});

describe('writing one reader result', () => {
  // Archer Gresham and Nadine Abernathy are made-up people from packages/fixtures/manifest.json.
  const archer = {
    name: 'Archer Gresham',
    transporter_id: 'A02V4L9HIELIDL',
    position: 'Driver',
    qualifications: ['EDV', 'CDV'],
    id_expiration: '2027-01-31',
    personal_phone: '',
    work_phone: '',
    email: 'driver001@example.com',
    status: 'ACTIVE',
  };

  it('reads the driver list as the performance side needs it', () => {
    store.saveAssociates({
      rows: [
        archer,
        { ...archer, name: 'Made up from route data', transporter_id: '', status: '' },
      ],
      source_file: 'AssociateData.csv',
      imported_at: null,
    });
    // A row with no Transporter ID is not a driver here; blanks read as null.
    expect(perf.knownDriverIds()).toEqual(['A02V4L9HIELIDL']);
    expect(perf.loadPerfData().drivers).toEqual([
      {
        transporterId: 'A02V4L9HIELIDL',
        name: 'Archer Gresham',
        status: 'ACTIVE',
        position: 'Driver',
        qualifications: 'EDV, CDV',
        idExpiration: '2027-01-31',
        personalPhone: null,
        workPhone: null,
        email: 'driver001@example.com',
      },
    ]);
  });

  it('adds a driver seen on a scorecard to the list by name, and leaves a known one alone', () => {
    store.saveAssociates({ rows: [archer], source_file: 'AssociateData.csv', imported_at: null });
    const counts = perf.applyScorecards({
      drivers: [
        { transporterId: 'A02V4L9HIELIDL', name: 'Archer G' },
        { transporterId: 'A083QLD1CI9YSZ', name: 'Nadine Abernathy' },
      ],
      scorecards: [],
    });
    expect(counts.driversAdded).toBe(1);
    expect(perf.loadPerfData().drivers).toEqual([
      expect.objectContaining({ name: 'Archer Gresham', status: 'ACTIVE', position: 'Driver' }),
      {
        transporterId: 'A083QLD1CI9YSZ',
        name: 'Nadine Abernathy',
        status: 'OFFBOARDED',
        position: null,
        qualifications: null,
        idExpiration: null,
        personalPhone: null,
        workPhone: null,
        email: null,
      },
    ]);
    // On the Associates page too, after the last row, offboarded until an export names them.
    const list = store.loadAssociates().rows;
    expect(list.map((a) => a.name)).toEqual(['Archer Gresham', 'Nadine Abernathy']);
    expect(list[1]).toMatchObject({ status: 'OFFBOARDED', transporter_id: 'A083QLD1CI9YSZ' });
    // Bringing the same scorecard in again adds nobody.
    expect(
      perf.applyScorecards({
        drivers: [{ transporterId: 'A083QLD1CI9YSZ', name: 'Nadine A' }],
        scorecards: [],
      }).driversAdded,
    ).toBe(0);
    expect(store.loadAssociates().rows).toHaveLength(2);
  });

  it('replaces a scorecard for the same driver and week, metrics included', () => {
    const card = {
      transporterId: 'A02V4L9HIELIDL',
      week: '2026-W31',
      overallStanding: 'Gold',
      overallScore: 88.5,
      packagesDelivered: 700,
      sourceFile: 'one.csv',
      metrics: [
        {
          metricName: 'CDF DPMO',
          metricValue: '0',
          tier: 'Platinum',
          score: 100,
          weightApplied: 7,
        },
        { metricName: 'POD', metricValue: '99%', tier: 'Gold', score: 90, weightApplied: 5 },
      ],
    };
    const drivers = [{ transporterId: 'A02V4L9HIELIDL', name: 'Archer Gresham' }];
    expect(perf.applyScorecards({ drivers, scorecards: [card] })).toEqual({
      driversAdded: 1,
      scorecardsWritten: 1,
      scorecardsReplaced: 0,
      metricsWritten: 2,
    });
    const again = { ...card, overallScore: 91, metrics: card.metrics.slice(0, 1) };
    expect(perf.applyScorecards({ drivers, scorecards: [again] })).toEqual({
      driversAdded: 0,
      scorecardsWritten: 1,
      scorecardsReplaced: 1,
      metricsWritten: 1,
    });
    const data = perf.loadPerfData();
    expect(data.scorecards).toEqual([{ id: 2, ...without(again, 'metrics') }]);
    expect(data.metrics).toEqual([{ id: 3, scorecardId: 2, ...card.metrics[0] }]);
  });

  it('leaves the thresholds alone when the file could not be read', () => {
    perf.applyThresholds({
      replaceAll: true,
      rows: [
        {
          metricName: 'CDF DPMO',
          indicator: 'NEGATIVE',
          platinumThreshold: 0,
          goldThreshold: 900,
          silverThreshold: 1500,
          bronzeThreshold: 2000,
          overallMetricWeight: 7,
          sourceWeek: '2026-W32',
        },
      ],
    });
    expect(perf.applyThresholds({ replaceAll: false, rows: [] })).toEqual({
      replaced: false,
      rowsRemoved: 0,
      rowsWritten: 0,
    });
    expect(perf.loadPerfData().thresholds).toHaveLength(1);
    expect(perf.applyThresholds({ replaceAll: true, rows: [] })).toEqual({
      replaced: true,
      rowsRemoved: 1,
      rowsWritten: 0,
    });
    expect(perf.loadPerfData().thresholds).toEqual([]);
  });

  it('empties a POD week whose report listed nobody, when told to', () => {
    const row = {
      transporterId: 'A02V4L9HIELIDL',
      week: '2026-W31',
      name: 'Archer Gresham',
      opportunities: 10,
      success: 9,
      bypass: 1,
      rejects: 0,
      blurryPhoto: 0,
      humanInThePicture: 0,
      noPackageDetected: 0,
      packageInCar: 0,
      packageInHand: 0,
      packageNotClearlyVisible: 0,
      packageTooClose: 0,
      photoTooDark: 0,
      other: 0,
      sourceFile: 'pod.pdf',
    };
    perf.applyPod({ rows: [row] });
    expect(perf.applyPod({ rows: [] })).toEqual({
      weeksReplaced: 0,
      rowsRemoved: 0,
      rowsWritten: 0,
    });
    expect(perf.loadPerfData().pod).toEqual([row]);
    expect(perf.applyPod({ rows: [] }, ['2026-W31'])).toEqual({
      weeksReplaced: 1,
      rowsRemoved: 1,
      rowsWritten: 0,
    });
    expect(perf.loadPerfData().pod).toEqual([]);
  });

  it('writes nothing at all when one row cannot be written', () => {
    const safety = parseSafety(fixtureFiles('safety'));
    const broken = {
      ...safety,
      rows: [...safety.rows, { ...safety.rows[0]!, week: null as never }],
    };
    expect(() => perf.applySafety(broken)).toThrow();
    expect(perf.perfTableCounts().perf_safety_events).toBe(0);
  });
});

describe('the auto-import record', () => {
  it('remembers each file once, with its size and last-change time', () => {
    const lastWriteMs = Date.UTC(2026, 9, 5, 14, 3, 7, 250);
    expect(perf.ledgerGet('Scorecards', 'week.csv')).toBeNull();
    perf.ledgerRecord('Scorecards', 'week.csv', 1234, lastWriteMs, '2026-10-11T08:00:00.0000000Z');
    expect(perf.ledgerGet('Scorecards', 'week.csv')).toEqual({
      source: 'Scorecards',
      fileName: 'week.csv',
      fileSize: 1234,
      lastWriteMs,
      lastWriteUtcTicks: ticksFromMs(lastWriteMs),
      importedAtUtc: '2026-10-11T08:00:00.0000000Z',
    });
    expect(perf.ledgerHas('Scorecards', 'week.csv', 1234, lastWriteMs)).toBe(true);
    expect(perf.ledgerHas('Scorecards', 'week.csv', 1235, lastWriteMs)).toBe(false);
    expect(perf.ledgerHas('Scorecards', 'week.csv', 1234, lastWriteMs + 1)).toBe(false);

    perf.ledgerRecord('Scorecards', 'week.csv', 2000, lastWriteMs + 1000);
    perf.ledgerRecord('CDF', 'other.csv', 10, lastWriteMs);
    expect(
      perf.ledgerList().map((e) => [e.source, e.fileName, e.fileSize, e.importedAtUtc]),
    ).toEqual([
      ['CDF', 'other.csv', 10, roundTripUtc(NOW)],
      ['Scorecards', 'week.csv', 2000, roundTripUtc(NOW)],
    ]);
    expect(perf.perfTableCounts().perf_imported_files).toBe(2);
  });

  it('keeps times the old app’s way', () => {
    // 1 January 1970 in the old app's 100-nanosecond steps since year 1.
    expect(ticksFromMs(0)).toBe(621355968000000000n);
    expect(msFromTicks(621355968000000000n + 12_345_678n)).toBeCloseTo(1234.5678, 6);
    expect(localStamp(new Date(2026, 0, 2, 3, 4, 5))).toBe('2026-01-02 03:04:05');
    expect(roundTripUtc(new Date(Date.UTC(2026, 0, 2, 3, 4, 5, 6)))).toBe(
      '2026-01-02T03:04:05.0060000Z',
    );
  });
});

describe('an empty database', () => {
  it('has no performance data and nothing to read back', () => {
    expect(perf.isPerfEmpty()).toBe(true);
    expect(Object.values(perf.perfTableCounts()).every((n) => n === 0)).toBe(true);
    expect(perf.knownDriverIds()).toEqual([]);
    expect(Object.values(perf.loadPerfData()).every((rows) => rows.length === 0)).toBe(true);
  });

  it('counts only the driver list as load-out data', () => {
    applyAll(perf, files);
    const counts = store.tableCounts();
    expect(counts.associates).toBe(expectedTableRows().Drivers);
    for (const [table, n] of Object.entries(counts)) {
      if (table !== 'associates') expect(n, table).toBe(0);
    }
  });
});

function without<T extends object, K extends keyof T>(row: T, key: K): Omit<T, K> {
  const copy = { ...row };
  delete copy[key];
  return copy;
}
