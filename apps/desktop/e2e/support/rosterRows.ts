// Made-up roster rows for the browser tests, in the shape the snapshot gives the Load Out page.
// They come from e2e/support/roster-demo.json, written from the fixture files by
// `npm run demo-data -w @loadout/desktop` (the three fixture days, repeated to 520 rows).

import type { RosterRowView } from '../../src/shared/snapshot';
import demo from './roster-demo.json';

interface DemoRow {
  id: string;
  driver: string;
  shiftType: string;
  transporterId: string;
  tenure: string;
  vans: string;
  check: string;
  routes: string;
  waveTime: string;
  pad: string;
  serviceType: string;
  vehicle: string;
  vin: string;
  matchedOn: string;
  device: string;
  staging: string;
  bags: string;
  ovs: string;
  bag: string;
}

const ALL = (demo as { rows: DemoRow[] }).rows;

export function demoRosterRows(count = 240): RosterRowView[] {
  return ALL.slice(0, count).map((d, index) => ({
    index,
    row: {
      driver: d.driver,
      shiftType: d.shiftType,
      status: '',
      routes: d.routes,
      vehicle: d.vehicle,
      vin: d.vin,
      device: d.device,
      stagingLocation: d.staging,
      bag: d.bag,
      waveTime: d.waveTime,
      pad: d.pad.replace(/^PAD /, ''),
      serviceType: d.serviceType,
      bags: d.bags,
      ovs: d.ovs,
      assignMethod: '',
    },
    match: { method: d.transporterId ? 'exact' : 'none', ambiguous: false, candidates: [] },
    associateId: d.transporterId,
    associateName: d.transporterId ? d.driver : '',
    vanBadges: d.vans,
    tenure: d.tenure ? Number(d.tenure) : null,
    check: d.check,
    assignMethodLabel: d.matchedOn,
    issues: d.check && d.check !== 'OK' ? d.check.split(', ') : [],
  }));
}

/** The snapshot fields a roster of these rows needs. */
export function demoRosterSnapshot(count = 240) {
  const rows = demoRosterRows(count);
  return {
    loadOutDate: '2026-09-01',
    roster: {
      sourceFile: 'demo_loadout_sheet.xlsx',
      importedAt: null,
      routeSource: 'routes',
      rows,
    },
    counts: {
      rosterRows: rows.length,
      associates: 100,
      matched: rows.filter((r) => r.associateId).length,
    },
  };
}
