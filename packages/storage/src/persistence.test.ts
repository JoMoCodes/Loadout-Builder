import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { Store } from './store';
import { FIELD_NAMES, VEHICLE_FIELDS } from './types';
import type { DriverRow, Roster, Vehicle } from './types';

// Made-up people, IDs and VINs, all taken from packages/fixtures/manifest.json.
const CARMEN = { name: 'Carmen Abernathy', id: 'AK92X3BJNUBTF' };
const RHEA = { name: 'Rhea Ravenscroft', id: 'A8KSSZB6LALEOL', key: 'rhea ravenscroft' };
const VAN_A = '7FCLGUT07PN118145';

function driverRow(driver: string, extra: Partial<DriverRow> = {}): DriverRow {
  const row = {} as DriverRow;
  for (const name of FIELD_NAMES) row[name] = '';
  return { ...row, driver, ...extra };
}

function roster(rows: DriverRow[]): Roster {
  return {
    rows,
    load_out_date: '2026-08-31',
    source_file: 'sheet.xlsx',
    imported_at: '2026-08-30T13:10:28',
    route_source: 'schedule',
  };
}

function van(vin: string): Vehicle {
  const v = {
    vin,
    operational: true,
    registration_expiry: null,
    ownership_end: null,
  } as Vehicle;
  for (const name of VEHICLE_FIELDS) v[name] = '';
  return v;
}

describe('after closing and reopening the file', () => {
  it('everything the app keeps is still there', () => {
    const dir = mkdtempSync(join(tmpdir(), 'loadout-test-'));
    try {
      const path = join(dir, 'loadout.db');
      const first = new Store(path);
      first.saveRoster(roster([driverRow(CARMEN.name, { assign_method: 'affinity-primary' })]));
      first.savePreviousRoster(roster([driverRow(RHEA.name)]));
      first.saveAssociates({
        rows: [
          {
            name: CARMEN.name,
            transporter_id: CARMEN.id,
            position: '',
            qualifications: ['EDV'],
            id_expiration: null,
            personal_phone: '',
            work_phone: '',
            email: '',
            status: '',
          },
        ],
        source_file: 'a.csv',
        imported_at: '2026-08-30T15:42:30',
      });
      first.setLink(RHEA.key, RHEA.name, RHEA.id);
      first.saveRouteData({
        kind: 'schedule',
        rows: [],
        pads: { '9:50am': 1 },
        day: '2026-08-31',
        source_file: 's.xlsx',
        imported_at: '2026-08-30T15:47:26',
        source_total: 0,
      });
      first.saveDwp({
        rows: [{ route_code: 'CX4', bags: '1', ovs: '0', staging: '' }],
        day: '2026-09-11',
        source_file: 'd.xlsx',
        imported_at: '2026-09-11T06:00:00',
      });
      first.saveVehicles({
        rows: [van(VAN_A)],
        source_file: 'v.xlsx',
        imported_at: '2026-08-29T15:17:16',
      });
      first.setVehicleOverride(VAN_A, false);
      first.setVehiclePriority(VAN_A, '2');
      first.setAffinity(VAN_A, 'primary_1', CARMEN.id);
      first.setLmrApproved(CARMEN.id, true);
      first.saveTenure({
        records: { [CARMEN.id]: { routes: 7, year: 2026, week: 19 } },
        source_file: 't.csv',
        imported_at: '2026-08-30T15:45:18',
      });
      first.setColumnOrder('roster', ['driver', 'vehicle']);
      first.setColumnWidths('roster', { vehicle: 90 });
      first.savePrintLayout(Store.WORKING_LAYOUT, '{"paper":"letter"}');
      first.savePrintLayout('Yard Sheet', '{"paper":"a4"}');
      const counts = first.tableCounts();
      first.close();

      const again = new Store(path);
      expect(again.tableCounts()).toEqual(counts);
      expect(again.loadRoster().rows[0]?.assign_method).toBe('affinity-primary');
      expect(again.loadPreviousRoster().rows[0]?.driver).toBe(RHEA.name);
      expect(again.loadAssociates().rows[0]?.transporter_id).toBe(CARMEN.id);
      expect(again.loadLinks()).toEqual({ [RHEA.key]: RHEA.id });
      expect(again.loadRouteData('schedule').pads).toEqual({ '9:50am': 1 });
      expect(again.loadDwp().rows).toHaveLength(1);
      expect(again.loadVehicles().rows[0]?.vin).toBe(VAN_A);
      expect(again.loadVehicleOverrides()).toEqual({ [VAN_A]: false });
      expect(again.loadVehiclePriorities()).toEqual({ [VAN_A]: '2' });
      expect(again.loadAffinity()).toHaveLength(1);
      expect([...again.loadLmrApproved()]).toEqual([CARMEN.id]);
      expect(again.loadTenure().records[CARMEN.id]?.routes).toBe(7);
      expect(again.loadColumnOrder('roster')).toEqual(['driver', 'vehicle']);
      expect(again.loadColumnWidths('roster')).toEqual({ vehicle: 90 });
      expect(again.printLayoutNames()).toEqual(['Yard Sheet']);
      expect(again.loadPrintLayout()).toBe('{"paper":"letter"}');
      again.close();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('tenure and associates are stored apart', () => {
  it('re-importing or clearing associates does not touch route counts', () => {
    const store = new Store(':memory:');
    store.saveTenure({
      records: { [CARMEN.id]: { routes: 7, year: 2026, week: 19 } },
      source_file: 't.csv',
      imported_at: null,
    });
    store.saveAssociates({ rows: [], source_file: 'a.csv', imported_at: null });
    store.clearAssociates();
    expect(store.loadTenure().records[CARMEN.id]?.routes).toBe(7);
    store.saveTenure({ records: {}, source_file: 't2.csv', imported_at: null });
    store.saveAssociates({ rows: [], source_file: 'a2.csv', imported_at: null });
    expect(store.loadTenure().records[CARMEN.id]?.routes).toBe(7);
    store.close();
  });
});
