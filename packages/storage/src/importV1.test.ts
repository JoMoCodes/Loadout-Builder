import Database from 'better-sqlite3';
import { copyFileSync, mkdtempSync, rmSync, statSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { importV1Database, ImportV1Error } from './importV1';
import { Store } from './store';

const FIXTURE = resolve(__dirname, '../../fixtures/v1/loadout.db');

// Rows per table in the made-up old database (counted with a separate SQLite tool).
const EXPECTED: Record<string, number> = {
  roster_meta: 1,
  driver_rows: 35,
  associates_meta: 1,
  associates: 76,
  driver_links: 13,
  route_meta: 1,
  route_entries: 25,
  dwp_meta: 0,
  dwp_rows: 0,
  pad_assignments: 2,
  previous_roster_meta: 1,
  previous_driver_rows: 41,
  vehicle_priorities: 25,
  vehicles_meta: 1,
  vehicles: 41,
  vehicle_overrides: 6,
  lmr_approved: 14,
  lifetime_routes: 166,
  tenure_meta: 1,
  column_order: 1,
  column_widths: 1,
  print_layouts: 2,
  van_affinity: 42,
  associate_tenure: 77,
};

let store: Store;
beforeEach(() => {
  store = new Store(':memory:');
});
afterEach(() => store.close());

describe('import of the old database', () => {
  it('brings over the same number of rows in every table', () => {
    const result = importV1Database(FIXTURE, store);
    expect(result.status).toBe('imported');
    expect(result.identical).toBe(true);
    expect(store.tableCounts()).toEqual(EXPECTED);
    expect(Object.fromEntries(result.tables.map((t) => [t.table, t.imported]))).toEqual(EXPECTED);
    expect(result.tables.every((t) => t.source === t.imported)).toBe(true);
  });

  it('carries over a sample of fields unchanged', () => {
    importV1Database(FIXTURE, store);

    const roster = store.loadRoster();
    expect(roster.rows).toHaveLength(35);
    expect(roster.load_out_date).toBe('2026-08-31');
    expect(roster.route_source).toBe('schedule');
    expect(roster.imported_at).toBe('2026-08-30T13:10:28');
    expect(roster.rows[0]).toMatchObject({
      driver: 'Carmen Abernathy',
      vehicle: '615977',
      vin: '7FCLGUT07PN118145',
      wave_time: '9:50am',
      pad: '1',
      assign_method: 'affinity-primary',
    });

    const previous = store.loadPreviousRoster();
    expect(previous.rows).toHaveLength(41);
    expect(previous.load_out_date).toBe('2026-08-30');
    expect(previous.rows[0]).toMatchObject({
      driver: 'Rhea Ravenscroft',
      vin: '7FCYLRZ20PN196581',
      staging_location: 'STG.G9',
    });

    const book = store.loadAssociates();
    expect(book.rows).toHaveLength(76);
    expect(book.rows[0]).toMatchObject({
      name: 'Carmen Abernathy',
      transporter_id: 'AK92X3BJNUBTF',
      id_expiration: '2032-05-19',
      status: 'ACTIVE',
    });
    expect(book.rows[0]?.qualifications).toEqual([
      'AMZL_HELPER',
      'CDV',
      'Standard Parcel',
      'EDV',
      'DOT',
      'Step Van',
    ]);

    expect(store.loadLinks()['paloma marcus selwyn']).toBe('A0DZDWECHDJ5TO');

    const schedule = store.loadRouteData('schedule');
    expect(schedule.rows).toHaveLength(25);
    expect(schedule.day).toBe('2026-08-31');
    expect(schedule.source_total).toBe(25);
    expect(schedule.pads).toEqual({ '9:50am': 1, '9:55am': 2 });
    expect(schedule.rows[0]).toMatchObject({
      transporter_id: 'AK92X3BJNUBTF',
      dispatch_time: '9:50am',
      detail: '10 hrs',
      shared_ids: 'AK92X3BJNUBTF',
    });

    expect(store.loadDwp().rows).toEqual([]);

    const fleet = store.loadVehicles();
    expect(fleet.rows).toHaveLength(41);
    expect(fleet.rows[0]).toMatchObject({
      vin: '7FCDJRA89PN141888',
      name: '619454',
      make: 'Rivian',
      operational: false,
      registration_expiry: '2026-12-30',
      ownership_end: '2043-08-08',
      station: 'XXX1',
    });

    expect(store.loadVehiclePriorities()['7FCMFNL76NN728464']).toBe('1');
    expect(store.loadVehicleOverrides()['1F69F2MV9L0F55866']).toBe(true);
    expect(store.loadVehicleOverrides()['7FCJKAP46PN336367']).toBe(false);
    expect(store.loadLmrApproved().has('A7SJ8FE0PNIK0B')).toBe(true);
    expect(store.loadAffinity()).toContainEqual({
      vin: '1F69L7CU2L0L97091',
      slot: 'primary_1',
      transporter_id: 'A8KSSZB6LALEOL',
    });

    const tenure = store.loadTenure();
    expect(Object.keys(tenure.records)).toHaveLength(166);
    expect(tenure.records['A047LNAN5VQIQR']).toEqual({ routes: 115, year: 2026, week: 19 });
    expect(store.loadLegacyTenureYears()['AK92X3BJNUBTF']).toBe(5.8);

    expect(store.loadColumnOrder('roster').slice(0, 3)).toEqual([
      'driver',
      'vehicle',
      'assign_method',
    ]);
    expect(store.loadColumnWidths('roster')).toEqual({ vehicle: 90 });
    expect(store.printLayoutNames()).toHaveLength(1);
    expect(JSON.parse(store.loadPrintLayout()).paper).toBe('letter');
  });

  it('is safe to run twice: the second run changes nothing and says it skipped', () => {
    importV1Database(FIXTURE, store);
    const second = importV1Database(FIXTURE, store);
    expect(second.status).toBe('skipped');
    expect(second.reason).toBe('destination-not-empty');
    expect(store.tableCounts()).toEqual(EXPECTED);
  });

  it('does not import over data already saved in the new database', () => {
    store.setLmrApproved('AK92X3BJNUBTF', true);
    const result = importV1Database(FIXTURE, store);
    expect(result.status).toBe('skipped');
    expect(store.loadRoster().rows).toEqual([]);
    expect(store.loadLmrApproved().size).toBe(1);
  });

  it('leaves the old database file exactly as it was', () => {
    const before = readFileSync(FIXTURE);
    const mtime = statSync(FIXTURE).mtimeMs;
    importV1Database(FIXTURE, store);
    expect(readFileSync(FIXTURE).equals(before)).toBe(true);
    expect(statSync(FIXTURE).mtimeMs).toBe(mtime);
  });

  it('says so when the old file is missing or is not a database', () => {
    const dir = mkdtempSync(join(tmpdir(), 'loadout-import-test-'));
    try {
      expect(() => importV1Database(join(dir, 'nope.db'), store)).toThrow(ImportV1Error);
      const junk = join(dir, 'junk.db');
      copyFileSync(join(__dirname, 'importV1.ts'), junk);
      expect(() => importV1Database(junk, store)).toThrow(/source-unreadable/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('accepts an older database with missing tables and columns', () => {
    const dir = mkdtempSync(join(tmpdir(), 'loadout-import-test-'));
    try {
      const old = join(dir, 'old.db');
      const db = new Database(old);
      db.exec(`
        CREATE TABLE driver_rows (id INTEGER PRIMARY KEY AUTOINCREMENT, position INTEGER NOT NULL,
          driver TEXT NOT NULL, wave_time TEXT DEFAULT '', dispatch_time TEXT DEFAULT '');
        INSERT INTO driver_rows (position, driver, wave_time, dispatch_time) VALUES
          (0, 'Carmen Abernathy', '', '9:50am'),
          (1, 'Rhea Ravenscroft', '10:00am', '9:00am');
        CREATE TABLE lmr_approved (transporter_id TEXT PRIMARY KEY);
        INSERT INTO lmr_approved VALUES ('AK92X3BJNUBTF');
      `);
      db.close();

      const result = importV1Database(old, store);
      expect(result.status).toBe('imported');
      expect(result.identical).toBe(false); // the new roster also gets its "when" record
      const rows = store.loadRoster().rows;
      expect(rows.map((r) => r.wave_time)).toEqual(['9:50am', '10:00am']);
      expect(store.loadLmrApproved().size).toBe(1);
      expect(store.tableCounts().driver_rows).toBe(2);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
