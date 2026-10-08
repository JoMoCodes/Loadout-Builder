import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { dateFromName } from './dates';
import { Store } from './store';
import { FIELD_NAMES, ROUTE_FIELDS, VEHICLE_FIELDS } from './types';
import type { DriverRow, Roster, RouteDataSet, Vehicle } from './types';

// Made-up people, IDs and VINs, all taken from packages/fixtures/manifest.json.
const CARMEN = { name: 'Carmen Abernathy', id: 'AK92X3BJNUBTF', key: 'carmen abernathy' };
const RHEA = { name: 'Rhea Ravenscroft', id: 'A8KSSZB6LALEOL', key: 'rhea ravenscroft' };
const VAN_A = '7FCLGUT07PN118145';
const VAN_B = '7FCMFNL76NN728464';

function driverRow(driver: string, extra: Partial<DriverRow> = {}): DriverRow {
  const row = {} as DriverRow;
  for (const name of FIELD_NAMES) row[name] = '';
  row.driver = driver;
  return { ...row, ...extra };
}

function roster(rows: DriverRow[], extra: Partial<Roster> = {}): Roster {
  return {
    rows,
    load_out_date: '2026-08-31',
    source_file: 'sheet.xlsx',
    imported_at: '2026-08-30T13:10:28',
    route_source: 'schedule',
    ...extra,
  };
}

let store: Store;
beforeEach(() => {
  store = new Store(':memory:', { now: () => new Date(2026, 8, 1, 7, 5, 9) });
});
afterEach(() => store.close());

describe('roster', () => {
  it('saves and loads rows in order with their details', () => {
    const rows = [
      driverRow(CARMEN.name, { vehicle: '615977', vin: VAN_A, assign_method: 'affinity-primary' }),
      driverRow(RHEA.name, { wave_time: '9:50am', pad: '1', bags: '12', ovs: '3' }),
    ];
    store.saveRoster(roster(rows));
    expect(store.loadRoster()).toEqual(roster(rows));
  });

  it('replaces the roster on save and empties it on clear', () => {
    store.saveRoster(roster([driverRow(CARMEN.name), driverRow(RHEA.name)]));
    store.saveRoster(roster([driverRow(RHEA.name)]));
    expect(store.loadRoster().rows.map((r) => r.driver)).toEqual([RHEA.name]);
    store.clearRoster();
    expect(store.loadRoster()).toEqual({
      rows: [],
      load_out_date: null,
      source_file: '',
      imported_at: null,
      route_source: '',
    });
  });

  it('stamps the time of saving when the roster has none', () => {
    store.saveRoster(roster([], { imported_at: null }));
    expect(store.loadRoster().imported_at).toBe('2026-09-01T07:05:09');
  });

  it('keeps the previous roster apart from today and survives reopening the file', () => {
    const dir = mkdtempSync(join(tmpdir(), 'loadout-test-'));
    try {
      const path = join(dir, 'nested', 'loadout.db');
      const first = new Store(path);
      first.saveRoster(roster([driverRow(CARMEN.name)]));
      first.savePreviousRoster(
        roster([driverRow(RHEA.name, { vehicle: '618915', vin: VAN_B })], {
          load_out_date: '2026-08-30',
        }),
      );
      first.close();

      const second = new Store(path);
      expect(second.loadRoster().rows.map((r) => r.driver)).toEqual([CARMEN.name]);
      const previous = second.loadPreviousRoster();
      expect(previous.load_out_date).toBe('2026-08-30');
      expect(previous.rows[0]).toMatchObject({ driver: RHEA.name, vin: VAN_B });
      second.clearPreviousRoster();
      expect(second.loadPreviousRoster().rows).toEqual([]);
      expect(second.loadRoster().rows).toHaveLength(1);
      second.close();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('associates', () => {
  it('round-trips the book, keeping order and splitting qualifications', () => {
    const book = {
      rows: [
        {
          name: CARMEN.name,
          transporter_id: CARMEN.id,
          position: 'Driver',
          qualifications: ['EDV', 'Step Van'],
          id_expiration: '2032-05-19',
          personal_phone: '',
          work_phone: '',
          email: '',
          status: 'ACTIVE',
        },
        {
          name: RHEA.name,
          transporter_id: RHEA.id,
          position: '',
          qualifications: [],
          id_expiration: null,
          personal_phone: '',
          work_phone: '',
          email: '',
          status: '',
        },
      ],
      source_file: 'associates.csv',
      imported_at: '2026-08-30T15:42:30',
    };
    store.saveAssociates(book);
    expect(store.loadAssociates()).toEqual(book);
    store.clearAssociates();
    expect(store.loadAssociates().rows).toEqual([]);
  });
});

describe('driver links', () => {
  it('sets, replaces, deletes and clears links; a link can say "not an associate"', () => {
    store.setLink(CARMEN.key, CARMEN.name, CARMEN.id);
    store.setLink(RHEA.key, RHEA.name, null);
    expect(store.loadLinks()).toEqual({ [CARMEN.key]: CARMEN.id, [RHEA.key]: null });
    store.setLink(RHEA.key, RHEA.name, RHEA.id);
    expect(store.loadLinks()[RHEA.key]).toBe(RHEA.id);
    store.deleteLink(CARMEN.key);
    expect(Object.keys(store.loadLinks())).toEqual([RHEA.key]);
    store.clearLinks();
    expect(store.loadLinks()).toEqual({});
  });
});

describe('route data', () => {
  function dataset(kind: string): RouteDataSet {
    const row = {} as RouteDataSet['rows'][number];
    for (const name of ROUTE_FIELDS) row[name] = '';
    return {
      kind,
      rows: [
        {
          ...row,
          transporter_id: CARMEN.id,
          driver_name: CARMEN.name,
          dispatch_time: '9:50am',
          pad: '1',
        },
        { ...row, transporter_id: RHEA.id, driver_name: RHEA.name, dispatch_time: '9:55am' },
      ],
      pads: { '9:50am': 1, '9:55am': 2 },
      day: '2026-08-31',
      source_file: 'schedule.xlsx',
      imported_at: '2026-08-30T15:47:26',
      source_total: 2,
    };
  }

  it('round-trips a dataset with its PAD assignments', () => {
    store.saveRouteData(dataset('schedule'));
    expect(store.loadRouteData('schedule')).toEqual(dataset('schedule'));
  });

  it('keeps each kind apart, replaces on save and clears one kind only', () => {
    store.saveRouteData(dataset('schedule'));
    store.saveRouteData(dataset('routes'));
    store.saveRouteData({ ...dataset('schedule'), rows: [], pads: {} });
    expect(store.loadRouteData('schedule').rows).toEqual([]);
    expect(store.loadRouteData('schedule').pads).toEqual({});
    expect(store.loadRouteData('routes').rows).toHaveLength(2);
    store.clearRouteData('routes');
    expect(store.loadRouteData('routes')).toMatchObject({ rows: [], pads: {}, day: null });
  });

  it('saves PAD assignments on their own and leaves out a PAD of zero', () => {
    store.saveRouteData(dataset('schedule'));
    store.savePads('schedule', { '9:50am': 3, '9:55am': 0 });
    expect(store.loadRouteData('schedule').pads).toEqual({ '9:50am': 3 });
    expect(store.loadRouteData('schedule').rows).toHaveLength(2);
  });
});

describe('DWP', () => {
  it('round-trips the sheet and clears it', () => {
    const sheet = {
      rows: [
        { route_code: 'CX4', bags: '10', ovs: '1', staging: 'STG.G9' },
        { route_code: 'CX5', bags: '', ovs: '', staging: '' },
      ],
      day: '2026-09-11',
      source_file: 'DWP_DSP-XXXX_09-11-2026.xlsx',
      imported_at: '2026-09-11T06:00:00',
    };
    store.saveDwp(sheet);
    expect(store.loadDwp()).toEqual(sheet);
    store.clearDwp();
    expect(store.loadDwp()).toEqual({ rows: [], day: null, source_file: '', imported_at: null });
  });

  it('reads the day off the file name when none was saved', () => {
    store.saveDwp({
      rows: [],
      day: null,
      source_file: 'C:\\x\\DWP_DSP-XXXX_09-11-2026.xlsx',
      imported_at: null,
    });
    expect(store.loadDwp().day).toBe('2026-09-11');
  });

  it('reads days off file names the way the old version did', () => {
    expect(dateFromName('DWP 2026-09-11.xlsx')).toBe('2026-09-11');
    expect(dateFromName('DWP_9.5.2026.xlsx')).toBe('2026-09-05');
    expect(dateFromName('XXXX DWP 7.6.xlsx')).toBeNull();
    expect(dateFromName('13-40-2026.xlsx')).toBeNull();
  });
});

describe('vehicles', () => {
  function van(vin: string, extra: Partial<Vehicle> = {}): Vehicle {
    const v = {
      vin,
      operational: true,
      registration_expiry: '2026-12-30',
      ownership_end: null,
    } as Vehicle;
    for (const name of VEHICLE_FIELDS) v[name] = '';
    v.make = 'Rivian';
    return { ...v, ...extra };
  }

  it('round-trips the fleet and clears it', () => {
    const fleet = {
      rows: [van(VAN_A, { name: '615977' }), van(VAN_B, { operational: false })],
      source_file: 'vehicles.xlsx',
      imported_at: '2026-08-29T15:17:16',
    };
    store.saveVehicles(fleet);
    expect(store.loadVehicles()).toEqual(fleet);
    store.clearVehicles();
    expect(store.loadVehicles().rows).toEqual([]);
  });

  it('keeps overrides, priorities and affinities when the fleet is replaced', () => {
    store.setVehicleOverride(VAN_A, false);
    store.setVehiclePriority(VAN_A, '1');
    store.setAffinity(VAN_A, 'primary_1', CARMEN.id);
    store.saveVehicles({ rows: [van(VAN_A)], source_file: '', imported_at: null });
    store.saveVehicles({ rows: [], source_file: '', imported_at: null });
    expect(store.loadVehicleOverrides()).toEqual({ [VAN_A]: false });
    expect(store.loadVehiclePriorities()).toEqual({ [VAN_A]: '1' });
    expect(store.loadAffinity()).toHaveLength(1);
  });

  it('sets, flips, deletes and clears overrides', () => {
    store.setVehicleOverride(VAN_A, false);
    store.setVehicleOverride(VAN_B, true);
    expect(store.loadVehicleOverrides()).toEqual({ [VAN_A]: false, [VAN_B]: true });
    store.setVehicleOverride(VAN_A, true);
    store.deleteVehicleOverride(VAN_B);
    expect(store.loadVehicleOverrides()).toEqual({ [VAN_A]: true });
    store.clearVehicleOverrides();
    expect(store.loadVehicleOverrides()).toEqual({});
  });

  it('sets priorities, removes one with an empty value, and clears them', () => {
    store.setVehiclePriority(VAN_A, '1');
    store.setVehiclePriority(VAN_B, '2');
    store.setVehiclePriority(VAN_A, '');
    expect(store.loadVehiclePriorities()).toEqual({ [VAN_B]: '2' });
    store.clearVehiclePriorities();
    expect(store.loadVehiclePriorities()).toEqual({});
  });
});

describe('LMR approval', () => {
  it('approves, withdraws and clears', () => {
    store.setLmrApproved(CARMEN.id, true);
    store.setLmrApproved(RHEA.id, true);
    store.setLmrApproved(CARMEN.id, false);
    expect([...store.loadLmrApproved()]).toEqual([RHEA.id]);
    store.clearLmrApproved();
    expect(store.loadLmrApproved().size).toBe(0);
  });
});

describe('tenure', () => {
  const book = (year: number, week: number, routes: number, file = 'tenure.csv') => ({
    records: { [CARMEN.id]: { routes, year, week } },
    source_file: file,
    imported_at: '2026-08-30T15:45:18',
  });

  it('round-trips counts with the source', () => {
    expect(store.saveTenure(book(2026, 19, 115))).toBe(1);
    expect(store.loadTenure()).toEqual(book(2026, 19, 115));
  });

  it('only moves forward: newer weeks win, older weeks change nothing', () => {
    store.saveTenure(book(2026, 19, 115));
    expect(store.saveTenure(book(2026, 18, 100))).toBe(0);
    expect(store.loadTenure().records[CARMEN.id]).toEqual({ routes: 115, year: 2026, week: 19 });
    expect(store.saveTenure(book(2026, 20, 120))).toBe(1);
    expect(store.loadTenure().records[CARMEN.id]).toEqual({ routes: 120, year: 2026, week: 20 });
  });

  it('keeps a driver who is missing from a later import', () => {
    store.saveTenure(book(2026, 19, 115));
    store.saveTenure({ records: {}, source_file: 'later.csv', imported_at: null });
    const loaded = store.loadTenure();
    expect(loaded.records[CARMEN.id]?.routes).toBe(115);
    expect(loaded.source_file).toBe('later.csv');
  });

  it('clears every count and the source, and a later import starts afresh', () => {
    store.saveTenure(book(2026, 19, 115));
    store.saveLegacyTenureYears({ [CARMEN.id]: 5.8 });
    store.clearTenure();
    expect(store.loadTenure()).toEqual({ records: {}, source_file: '', imported_at: null });
    expect(store.loadLegacyTenureYears()).toEqual({ [CARMEN.id]: 5.8 });
    // An older week lands again once the newer count is gone.
    expect(store.saveTenure(book(2026, 18, 100))).toBe(1);
    expect(store.loadTenure().records[CARMEN.id]?.routes).toBe(100);
  });

  it('keeps the old hand-typed years apart, unread', () => {
    store.saveLegacyTenureYears({ [CARMEN.id]: 5.8 });
    expect(store.loadLegacyTenureYears()).toEqual({ [CARMEN.id]: 5.8 });
    expect(store.loadTenure().records).toEqual({});
  });
});

describe('column layout', () => {
  it('saves and resets the column order', () => {
    expect(store.loadColumnOrder('roster')).toEqual([]);
    store.setColumnOrder('roster', ['driver', 'vehicle', 'pad']);
    expect(store.loadColumnOrder('roster')).toEqual(['driver', 'vehicle', 'pad']);
    expect(store.loadColumnOrder('vans')).toEqual([]);
    store.setColumnOrder('roster', []);
    expect(store.loadColumnOrder('roster')).toEqual([]);
  });

  it('replaces hand-set widths per table', () => {
    store.setColumnWidths('roster', { vehicle: 90, driver: 140 });
    store.setColumnWidths('vans', { name: 70 });
    store.setColumnWidths('roster', { vehicle: 95 });
    expect(store.loadColumnWidths('roster')).toEqual({ vehicle: 95 });
    expect(store.loadColumnWidths('vans')).toEqual({ name: 70 });
  });
});

describe('print layouts', () => {
  it('keeps the working layout apart from named ones', () => {
    expect(store.loadPrintLayout()).toBe('');
    store.savePrintLayout(Store.WORKING_LAYOUT, '{"paper":"letter"}');
    store.savePrintLayout('zebra', '{"paper":"a4"}');
    store.savePrintLayout('Alpha', '{"scale":75}');
    expect(store.loadPrintLayout()).toBe('{"paper":"letter"}');
    expect(store.loadPrintLayout('Alpha')).toBe('{"scale":75}');
    expect(store.printLayoutNames()).toEqual(['Alpha', 'zebra']);
    store.savePrintLayout('Alpha', '{"scale":80}');
    expect(store.loadPrintLayout('Alpha')).toBe('{"scale":80}');
    store.deletePrintLayout('zebra');
    expect(store.printLayoutNames()).toEqual(['Alpha']);
    expect(store.loadPrintLayout('zebra')).toBe('');
  });
});

describe('van affinity', () => {
  it('sets, replaces, deletes and clears', () => {
    store.setAffinity(VAN_A, 'primary_1', CARMEN.id);
    store.setAffinity(VAN_A, 'primary_2', RHEA.id);
    store.setAffinity(VAN_A, 'primary_1', RHEA.id);
    expect(store.loadAffinity()).toEqual([
      { vin: VAN_A, slot: 'primary_1', transporter_id: RHEA.id },
      { vin: VAN_A, slot: 'primary_2', transporter_id: RHEA.id },
    ]);
    store.deleteAffinity(VAN_A, 'primary_2');
    expect(store.loadAffinity()).toHaveLength(1);
    store.clearAffinity();
    expect(store.loadAffinity()).toEqual([]);
  });
});

describe('transactions', () => {
  it('lands all of a group of changes or none', () => {
    expect(() =>
      store.transaction(() => {
        store.setLmrApproved(CARMEN.id, true);
        throw new Error('stop');
      }),
    ).toThrow('stop');
    expect(store.loadLmrApproved().size).toBe(0);
  });
});
