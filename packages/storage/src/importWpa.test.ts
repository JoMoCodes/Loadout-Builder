import Database from 'better-sqlite3';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { DcrEventEntry, PerfData } from '@loadout/performance';
import { importWpaDatabase, ImportWpaError } from './importWpa';
import { PERF_TABLES } from './migrations';
import { PerformanceStore } from './performance';
import { perfTableSpec } from './perfTables';
import {
  asHarnessRows,
  expectedTable,
  expectedTableRows,
  PERF_DATA_TABLES,
  type Row,
} from './perfTestkit';
import { Store } from './store';

// The old Weekly Performance app's schema, copied from legacy/wpa/src/Database.cs
// (Database.Initialize). The columns it added later, on open, are in OLD_ADDED_COLUMNS below.
const OLD_SCHEMA = `
    CREATE TABLE IF NOT EXISTS Drivers (
        TransporterId TEXT PRIMARY KEY,
        Name TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS WeeklyScorecards (
        Id INTEGER PRIMARY KEY AUTOINCREMENT,
        TransporterId TEXT NOT NULL,
        Week TEXT NOT NULL,
        OverallStanding TEXT,
        OverallScore REAL,
        PackagesDelivered INTEGER,
        UNIQUE (TransporterId, Week),
        FOREIGN KEY (TransporterId) REFERENCES Drivers(TransporterId)
    );

    CREATE TABLE IF NOT EXISTS MetricEntries (
        Id INTEGER PRIMARY KEY AUTOINCREMENT,
        ScorecardId INTEGER NOT NULL,
        MetricName TEXT NOT NULL,
        MetricValue TEXT,
        Tier TEXT,
        Score REAL,
        WeightApplied REAL,
        FOREIGN KEY (ScorecardId) REFERENCES WeeklyScorecards(Id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_scorecard_week ON WeeklyScorecards(Week);
    CREATE INDEX IF NOT EXISTS idx_scorecard_driver ON WeeklyScorecards(TransporterId);
    CREATE INDEX IF NOT EXISTS idx_metric_scorecard ON MetricEntries(ScorecardId);

    CREATE TABLE IF NOT EXISTS MetricThresholds (
        MetricName TEXT PRIMARY KEY,
        Indicator TEXT,
        PlatinumThreshold REAL,
        GoldThreshold REAL,
        SilverThreshold REAL,
        BronzeThreshold REAL,
        OverallMetricWeight REAL,
        SourceWeek TEXT,
        ImportedAt TEXT
    );

    CREATE TABLE IF NOT EXISTS PodWeekEntries (
        TransporterId TEXT NOT NULL,
        Week TEXT NOT NULL,
        Name TEXT,
        Opportunities INTEGER NOT NULL DEFAULT 0,
        Success INTEGER NOT NULL DEFAULT 0,
        Bypass INTEGER NOT NULL DEFAULT 0,
        Rejects INTEGER NOT NULL DEFAULT 0,
        BlurryPhoto INTEGER NOT NULL DEFAULT 0,
        HumanInThePicture INTEGER NOT NULL DEFAULT 0,
        NoPackageDetected INTEGER NOT NULL DEFAULT 0,
        PackageInCar INTEGER NOT NULL DEFAULT 0,
        PackageInHand INTEGER NOT NULL DEFAULT 0,
        PackageNotClearlyVisible INTEGER NOT NULL DEFAULT 0,
        PackageTooClose INTEGER NOT NULL DEFAULT 0,
        PhotoTooDark INTEGER NOT NULL DEFAULT 0,
        Other INTEGER NOT NULL DEFAULT 0,
        SourceFile TEXT,
        PRIMARY KEY (TransporterId, Week)
    );

    CREATE INDEX IF NOT EXISTS idx_pod_week ON PodWeekEntries(Week);
    CREATE INDEX IF NOT EXISTS idx_pod_driver ON PodWeekEntries(TransporterId);

    CREATE TABLE IF NOT EXISTS CdfWeekEntries (
        TransporterId TEXT NOT NULL,
        Week TEXT NOT NULL,
        Name TEXT,
        Mishandled INTEGER NOT NULL DEFAULT 0,
        Unprofessional INTEGER NOT NULL DEFAULT 0,
        DidNotFollowInstructions INTEGER NOT NULL DEFAULT 0,
        WrongAddress INTEGER NOT NULL DEFAULT 0,
        NeverReceived INTEGER NOT NULL DEFAULT 0,
        WrongItem INTEGER NOT NULL DEFAULT 0,
        SourceFile TEXT,
        PRIMARY KEY (TransporterId, Week)
    );

    CREATE INDEX IF NOT EXISTS idx_cdf_week ON CdfWeekEntries(Week);
    CREATE INDEX IF NOT EXISTS idx_cdf_driver ON CdfWeekEntries(TransporterId);

    CREATE TABLE IF NOT EXISTS DsbWeekEntries (
        TransporterId TEXT NOT NULL,
        Week TEXT NOT NULL,
        Name TEXT,
        SimultaneousDeliveries INTEGER NOT NULL DEFAULT 0,
        DeliveredOver50m INTEGER NOT NULL DEFAULT 0,
        IncorrectScanAttended INTEGER NOT NULL DEFAULT 0,
        IncorrectScanUnattended INTEGER NOT NULL DEFAULT 0,
        NoPodOnDelivery INTEGER NOT NULL DEFAULT 0,
        ScannedNotDeliveredNotReturned INTEGER NOT NULL DEFAULT 0,
        SourceFile TEXT,
        PRIMARY KEY (TransporterId, Week)
    );

    CREATE INDEX IF NOT EXISTS idx_dsb_week ON DsbWeekEntries(Week);
    CREATE INDEX IF NOT EXISTS idx_dsb_driver ON DsbWeekEntries(TransporterId);

    CREATE TABLE IF NOT EXISTS PsbWeekEntries (
        TransporterId TEXT NOT NULL,
        Week TEXT NOT NULL,
        Name TEXT,
        EarlyArrivals INTEGER NOT NULL DEFAULT 0,
        LateArrivals INTEGER NOT NULL DEFAULT 0,
        GeoLocation INTEGER NOT NULL DEFAULT 0,
        NotAttempted INTEGER NOT NULL DEFAULT 0,
        ContactCompliance INTEGER NOT NULL DEFAULT 0,
        OutOfReturnLabel INTEGER NOT NULL DEFAULT 0,
        PickedUpNotReturned INTEGER NOT NULL DEFAULT 0,
        SourceFile TEXT,
        PRIMARY KEY (TransporterId, Week)
    );

    CREATE INDEX IF NOT EXISTS idx_psb_week ON PsbWeekEntries(Week);
    CREATE INDEX IF NOT EXISTS idx_psb_driver ON PsbWeekEntries(TransporterId);

    -- Tracks which weeks had a PSB CSV processed at all, so the PDF report
    -- can distinguish 'no CSV imported for this week' (render 'No data')
    -- from 'CSV imported but this driver had no failures' (render dash).
    -- We insert a row even when the CSV had zero failure events.
    CREATE TABLE IF NOT EXISTS PsbImportedWeeks (
        Week TEXT PRIMARY KEY,
        SourceFile TEXT,
        ImportedAt TEXT
    );

    -- DCR is stored per RTS event (not aggregated) so the PDF report can
    -- list specific tracking IDs / reasons. Re-imports are idempotent via
    -- DELETE WHERE Week = @week before inserting that week's rows.
    CREATE TABLE IF NOT EXISTS DcrEvents (
        Id INTEGER PRIMARY KEY AUTOINCREMENT,
        TransporterId TEXT NOT NULL,
        Week TEXT NOT NULL,
        Name TEXT,
        TrackingId TEXT,
        ImpactDcr TEXT,
        RtsCode TEXT,
        AdditionalInformation TEXT,
        ExemptionReason TEXT,
        PlannedDeliveryDate TEXT,
        SourceFile TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_dcr_week ON DcrEvents(Week);
    CREATE INDEX IF NOT EXISTS idx_dcr_driver_week ON DcrEvents(TransporterId, Week);

    -- Per-(DA, week) DCR totals parsed from Quality_DCR_XXXX_*.csv.
    -- Separate from DcrEvents because that table is per-RTS-event; this
    -- one drives the summary rows on the DCR report page.
    CREATE TABLE IF NOT EXISTS DcrWeekTotals (
        TransporterId TEXT NOT NULL,
        Week TEXT NOT NULL,
        Name TEXT,
        Dcr REAL,
        PackagesDispatched INTEGER,
        PackagesDelivered INTEGER,
        PackagesReturnedToStation INTEGER,
        PackagesReturnedToStationDaControllable INTEGER,
        RescuedPackages INTEGER,
        RtsAllExempted INTEGER,
        SourceFile TEXT,
        PRIMARY KEY (TransporterId, Week)
    );

    CREATE INDEX IF NOT EXISTS idx_dcr_totals_week ON DcrWeekTotals(Week);
    CREATE INDEX IF NOT EXISTS idx_dcr_totals_driver ON DcrWeekTotals(TransporterId);

    -- Safety (Netradyne) is stored per event (not aggregated) so the
    -- Drivers-grid popup can list each violation with its video link.
    -- Re-imports are idempotent via DELETE WHERE Week = @week. The grid
    -- counts every event whose ProgramImpact is not 'None'; the raw
    -- rows (including 'None') are kept for reference in the popup query.
    CREATE TABLE IF NOT EXISTS SafetyEvents (
        Id INTEGER PRIMARY KEY AUTOINCREMENT,
        TransporterId TEXT NOT NULL,
        Week TEXT NOT NULL,
        Name TEXT,
        EventDate TEXT,
        ProgramImpact TEXT,
        MetricType TEXT,
        MetricSubtype TEXT,
        Source TEXT,
        VideoLink TEXT,
        ReviewDetails TEXT,
        SourceFile TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_safety_week ON SafetyEvents(Week);
    CREATE INDEX IF NOT EXISTS idx_safety_driver_week ON SafetyEvents(TransporterId, Week);

    -- Ledger of files already auto-imported. Lets startup auto-import
    -- process only files that are new or changed since last time
    -- (compared by size + last-write time). A changed file re-imports
    -- through the normal idempotent path, replacing that week's data.
    CREATE TABLE IF NOT EXISTS ImportedFiles (
        Source TEXT NOT NULL,
        FileName TEXT NOT NULL,
        FileSize INTEGER NOT NULL,
        LastWriteUtcTicks INTEGER NOT NULL,
        ImportedAtUtc TEXT NOT NULL,
        PRIMARY KEY (Source, FileName)
    );
`;

// MigrateAddDriverColumns and MigrateAddScorecardColumns in Database.cs.
const OLD_ADDED_COLUMNS = `
ALTER TABLE Drivers ADD COLUMN Status TEXT;
ALTER TABLE Drivers ADD COLUMN Position TEXT;
ALTER TABLE Drivers ADD COLUMN Qualifications TEXT;
ALTER TABLE Drivers ADD COLUMN IdExpiration TEXT;
ALTER TABLE Drivers ADD COLUMN PersonalPhone TEXT;
ALTER TABLE Drivers ADD COLUMN WorkPhone TEXT;
ALTER TABLE Drivers ADD COLUMN Email TEXT;
ALTER TABLE WeeklyScorecards ADD COLUMN SourceFile TEXT;
`;

// Parents before children, so the old database's own key checks are happy.
const FILL_ORDER = [
  'Drivers',
  'WeeklyScorecards',
  'MetricEntries',
  'MetricThresholds',
  'PodWeekEntries',
  'CdfWeekEntries',
  'DsbWeekEntries',
  'PsbWeekEntries',
  'PsbImportedWeeks',
  'DcrEvents',
  'DcrWeekTotals',
  'SafetyEvents',
  'ImportedFiles',
];

/** An old app.db built from the old schema and filled with what the old app stored. */
function buildOldDatabase(path: string, options: { addedColumns: boolean }): void {
  const db = new Database(path);
  try {
    db.exec(OLD_SCHEMA);
    if (options.addedColumns) db.exec(OLD_ADDED_COLUMNS);
    db.transaction(() => {
      for (const table of FILL_ORDER) {
        const present = new Set(
          (db.prepare(`PRAGMA table_info("${table}")`).all() as { name: string }[]).map(
            (c) => c.name,
          ),
        );
        for (const row of expectedTable(table).rows) {
          const columns = Object.keys(row).filter((column) => present.has(column));
          db.prepare(
            `INSERT INTO "${table}" (${columns.map((c) => `"${c}"`).join(', ')})
             VALUES (${columns.map(() => '?').join(', ')})`,
          ).run(...columns.map((c) => row[c] ?? null));
        }
      }
    })();
  } finally {
    db.close();
  }
}

let scratch: string;
let store: Store;
let perf: PerformanceStore;
beforeEach(() => {
  scratch = mkdtempSync(join(tmpdir(), 'loadout-wpa-test-'));
  store = new Store(':memory:');
  perf = new PerformanceStore(store.db);
});
afterEach(() => {
  store.close();
  rmSync(scratch, { recursive: true, force: true, maxRetries: 3 });
});

function countsByOldName(counts: Record<string, number>): Record<string, number> {
  return Object.fromEntries(PERF_TABLES.map((t) => [perfTableSpec(t).legacy, counts[t] ?? -1]));
}

/** Expected rows of a table, as an older database without the added columns would hold them. */
function withoutAddedColumns(table: string, rows: Row[]): Row[] {
  const dropped: Record<string, string[]> = {
    Drivers: [
      'Status',
      'Position',
      'Qualifications',
      'IdExpiration',
      'PersonalPhone',
      'WorkPhone',
      'Email',
    ],
    WeeklyScorecards: ['SourceFile'],
  };
  const columns = dropped[table] ?? [];
  return rows.map((row) => {
    const copy = { ...row };
    for (const column of columns) copy[column] = null;
    return copy;
  });
}

describe('import of the old weekly performance database', () => {
  it('brings over every table, row for row', () => {
    const old = join(scratch, 'app.db');
    buildOldDatabase(old, { addedColumns: true });
    const bytes = readFileSync(old);

    const result = importWpaDatabase(old, store);
    expect(result.status).toBe('imported');
    expect(result.identical).toBe(true);
    expect(result.tables.map((t) => t.table)).toEqual([...PERF_TABLES]);
    expect(countsByOldName(perf.perfTableCounts())).toEqual(expectedTableRows());
    expect(
      countsByOldName(Object.fromEntries(result.tables.map((t) => [t.table, t.source]))),
    ).toEqual(expectedTableRows());

    const data = perf.loadPerfData();
    for (const [key, table] of Object.entries(PERF_DATA_TABLES) as Array<
      [keyof PerfData, string]
    >) {
      const expected = expectedTable(table);
      expect(asHarnessRows(data[key], expected.columns), table).toEqual(expected.rows);
    }

    // The old file is exactly as it was.
    expect(readFileSync(old).equals(bytes)).toBe(true);
    // The key checks are back on afterwards.
    expect(store.db.pragma('foreign_keys', { simple: true })).toBe(1);
  });

  it('keeps the old ids, so metrics still point at their scorecards', () => {
    const old = join(scratch, 'app.db');
    buildOldDatabase(old, { addedColumns: true });
    importWpaDatabase(old, store);
    const data = perf.loadPerfData();
    const ids = new Set(data.scorecards.map((s) => s.id));
    expect(data.metrics.every((m) => ids.has(m.scorecardId))).toBe(true);
    expect(data.scorecards.map((s) => s.id).sort((a, b) => a - b)).toEqual(
      expectedTable('WeeklyScorecards')
        .rows.map((r) => r.Id as number)
        .sort((a, b) => a - b),
    );
  });

  it('accepts an older database without the columns the old app added later', () => {
    const old = join(scratch, 'app.db');
    buildOldDatabase(old, { addedColumns: false });
    const result = importWpaDatabase(old, store);
    expect(result.status).toBe('imported');
    expect(result.identical).toBe(true);
    const data = perf.loadPerfData();
    for (const table of ['Drivers', 'WeeklyScorecards']) {
      const key = table === 'Drivers' ? 'drivers' : 'scorecards';
      const expected = expectedTable(table);
      expect(asHarnessRows(data[key], expected.columns)).toEqual(
        asHarnessRows(withoutAddedColumns(table, expected.rows).map(lowerKeys), expected.columns),
      );
    }
    expect(countsByOldName(perf.perfTableCounts())).toEqual(expectedTableRows());
  });

  it('carries over the auto-import record exactly, and numbers new rows after the old ones', () => {
    const old = join(scratch, 'app.db');
    buildOldDatabase(old, { addedColumns: true });
    const db = new Database(old);
    // .NET ticks are too big for a plain JavaScript number, so they must come over exactly.
    const ticks = 639_000_000_123_456_789n;
    db.prepare(
      `INSERT INTO ImportedFiles (Source, FileName, FileSize, LastWriteUtcTicks, ImportedAtUtc)
       VALUES ('Scorecards', 'week.csv', 1234, ?, '2026-10-01T08:00:00.0000000Z')`,
    ).run(ticks);
    // A deleted last event: the old app would number the next one after it.
    const lastId = (db.prepare('SELECT MAX(Id) AS id FROM DcrEvents').get() as { id: number }).id;
    db.prepare('DELETE FROM DcrEvents WHERE Id = ?').run(lastId);
    db.close();

    const result = importWpaDatabase(old, store);
    expect(result.identical).toBe(true);
    expect(perf.ledgerGet('Scorecards', 'week.csv')).toMatchObject({
      fileSize: 1234,
      lastWriteUtcTicks: ticks,
      importedAtUtc: '2026-10-01T08:00:00.0000000Z',
    });

    const event: Partial<DcrEventEntry> = { ...perf.loadPerfData().dcrEvents[0]! };
    delete event.id;
    perf.applyDcr({ replaceWeeks: [], rows: [event as Omit<DcrEventEntry, 'id'>] });
    expect(Math.max(...perf.loadPerfData().dcrEvents.map((e) => e.id))).toBe(lastId + 1);
  });

  it('is skipped when there is performance data already', () => {
    const old = join(scratch, 'app.db');
    buildOldDatabase(old, { addedColumns: true });
    perf.ledgerRecord('Scorecards', 'week.csv', 1, 0);
    const result = importWpaDatabase(old, store);
    expect(result.status).toBe('skipped');
    expect(result.reason).toBe('destination-not-empty');
    expect(result.identical).toBe(false);
    expect(perf.perfTableCounts().perf_drivers).toBe(0);
    expect(perf.perfTableCounts().perf_imported_files).toBe(1);
  });

  it('does not touch the load-out data', () => {
    const old = join(scratch, 'app.db');
    buildOldDatabase(old, { addedColumns: true });
    importWpaDatabase(old, store);
    expect(Object.values(store.tableCounts()).every((n) => n === 0)).toBe(true);
  });

  it('says so when the old file is missing', () => {
    expect(() => importWpaDatabase(join(scratch, 'nothing-here.db'), store)).toThrow(
      ImportWpaError,
    );
    try {
      importWpaDatabase(join(scratch, 'nothing-here.db'), store);
    } catch (error) {
      expect((error as ImportWpaError).code).toBe('source-missing');
    }
  });

  it('says so when the file is not a database', () => {
    const notDb = join(scratch, 'app.db');
    writeFileSync(notDb, 'this is not a database, just some text '.repeat(200));
    const bytes = readFileSync(notDb);
    try {
      importWpaDatabase(notDb, store);
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(ImportWpaError);
      expect((error as ImportWpaError).code).toBe('source-unreadable');
    }
    expect(readFileSync(notDb).equals(bytes)).toBe(true);
    expect(perf.isPerfEmpty()).toBe(true);
  });
});

function lowerKeys(row: Row): Row {
  return Object.fromEntries(
    Object.entries(row).map(([key, value]) => [key.charAt(0).toLowerCase() + key.slice(1), value]),
  );
}
