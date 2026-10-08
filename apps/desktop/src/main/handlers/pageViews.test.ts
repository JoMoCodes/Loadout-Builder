// What the Route Data, Vehicle Data and Associates pages show, worked out from a real snapshot of
// each of the three parity days (the made-up files, loaded the way the old harness loaded them).
// The counts are checked against the harness's own expected files, so a page that shows a number
// shows the old app's number. Only counts and words are compared, never who is in a row.

import { readFileSync } from 'node:fs';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { dispatchTimes } from '@loadout/core';
import {
  importAssociateData,
  importDwpSheet,
  importLoadoutSheet,
  importRouteExport,
  importTenureExport,
  importVehicleData,
} from '@loadout/core/importers';
import { importV1Database } from '@loadout/storage';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  associateCountLine,
  expiryLine,
  qualificationLine,
  qualificationOptions,
} from '../../renderer/pages/associates/associateRows';
import {
  affinityCounts,
  holdsSummary,
  driverSideRows,
} from '../../renderer/pages/vehicleData/affinityRows';
import {
  fleetCountLine,
  fleetFlags,
  fleetMix,
  fleetTitle,
  vehicleTone,
} from '../../renderer/pages/vehicleData/vehicleRows';
import {
  buildDwpRows,
  dwpDayNote,
  dwpMatchLine,
  dwpNotes,
} from '../../renderer/pages/routeData/dwpRows';
import {
  buildRouteRows,
  padSummary,
  routeMetric,
  routeNotes,
  routeTone,
} from '../../renderer/pages/routeData/routeRows';
import type { AppSnapshot } from '../../shared/snapshot';
import { StateHost } from '../appState';
import { DataSource } from '../dataSource';

const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
  '..',
  '..',
  '..',
);
const fixture = (...parts: string[]) => path.join(root, 'packages', 'fixtures', ...parts);
const expected = (day: string, file: string) =>
  JSON.parse(readFileSync(path.join(root, 'scripts', 'parity', 'expected', day, file), 'utf8'));

interface Day {
  day: string;
  loadout: string;
  routes: string;
  itineraries: string;
  schedule: string | null;
  dwp: string;
}

// The same files the old app's harness loaded for each day (inputs.json says which).
const DAYS: Day[] = [
  {
    day: '2026-09-01',
    loadout: '2026_09_02_15_27_loadout_sheet.xlsx',
    routes: 'Routes_XXX1_2026-09-01_12_20 (CDT).xlsx',
    itineraries: 'Itineraries_XXX1_2026-10-03_21_36 (CDT).xlsx',
    schedule: 'Week-36-Schedule.xlsx',
    dwp: 'XXXX DWP 9.2.xlsx',
  },
  {
    day: '2026-09-11',
    loadout: '2026_09_11_17_37_loadout_sheet.xlsx',
    routes: 'Routes_XXX1_2026-09-01_12_20 (CDT).xlsx',
    itineraries: 'Itineraries_XXX1_2026-10-03_21_36 (CDT).xlsx',
    schedule: null,
    dwp: 'DWP_DSP-XXXX_09-11-2026.xlsx',
  },
  {
    day: '2026-09-14',
    loadout: '2026_09_14_12_15_loadout_sheet.xlsx',
    routes: 'Routes_XXX1_2026-09-25_09_54 (CDT).xlsx',
    itineraries: 'Itineraries_XXX1_2026-10-03_21_36 (CDT).xlsx',
    schedule: 'Week-38-Schedule.xlsx',
    dwp: 'DWP_DSP-XXXX_09-11-2026.xlsx',
  },
];

let folder: string;
let source: DataSource;

beforeEach(() => {
  folder = mkdtempSync(path.join(tmpdir(), 'loadout-views-test-'));
  source = new DataSource({
    dataFolder: path.join(folder, 'data'),
    fixtureDb: fixture('v1', 'loadout.db'),
    tempFolder: folder,
  });
});
afterEach(() => {
  source.close();
  rmSync(folder, { recursive: true, force: true });
});

/** Distinct non-blank dispatch times in clock order take PAD 1, 2, 3, 1, 2, 3... (the harness's rule). */
function padsByTime(set: Parameters<typeof dispatchTimes>[0]): Map<string, number> {
  const times = dispatchTimes(set)
    .map(([text]) => text)
    .filter((text) => text);
  return new Map(times.map((text, index) => [text, (index % 3) + 1]));
}

/** Loads one day the way the harness does (the saved data first, then the day's files). */
async function loadDay(day: Day, withPads = true): Promise<{ host: StateHost; snap: AppSnapshot }> {
  const host = new StateHost(source, () => day.day);
  source.open(false);
  importV1Database(fixture('v1', 'loadout.db'), source.getStore()!);
  host.rebuild();
  const { state } = host;
  state.importAssociates(await importAssociateData(fixture('associates', 'AssociateData.csv')));
  for (const name of [
    'Tenured_Workforce_DA_1756800000.csv',
    'Tenured_Workforce_DA_1756900000.csv',
  ]) {
    state.importTenure(await importTenureExport(fixture('tenure', name)));
  }
  state.importVehicles(await importVehicleData(fixture('vehicles', 'VehiclesData.xlsx')));
  state.importRoster(await importLoadoutSheet(fixture('loadout-sheets', day.loadout)));
  const files: Array<[string, string, string | null]> = [
    ['routes', 'routes', day.routes],
    ['itineraries', 'itineraries', day.itineraries],
    ['schedule', 'schedules', day.schedule],
  ];
  for (const [kind, folder, name] of files) {
    if (!name) {
      state.clearRouteData(kind);
      continue;
    }
    state.importRouteData(
      kind,
      await importRouteExport(kind, fixture(folder, name), state.routeDay(day.day)),
    );
    if (withPads) state.setPads(kind, padsByTime(state.routeSet(kind)));
  }
  state.importDwp(await importDwpSheet(fixture('dwp', day.dwp)));
  return { host, snap: host.snapshot() };
}

describe.each(DAYS)('the pages on $day', (day) => {
  it('hold the counts the old harness held', async () => {
    const { host, snap } = await loadDay(day);
    const inputs = expected(day.day, 'inputs.json');

    expect(snap.counts.rosterRows).toBe(inputs.loadout.row_count);
    expect(snap.counts.associates).toBe(inputs.associates.count);
    expect(snap.associates.filter((view) => view.associate.tenure !== null)).toHaveLength(
      inputs.associates.with_tenure,
    );
    expect(snap.counts.vehicles).toBe(inputs.vehicles.count);
    expect(snap.vehicles.filter((view) => view.operational)).toHaveLength(
      inputs.vehicles.operational,
    );
    // Six are stored; a stored one only shows as "set here" where it differs from the export.
    expect(host.state.vehicleOverrides.size).toBe(inputs.vehicle_overrides);
    expect(snap.counts.overriddenVehicles).toBeLessThanOrEqual(inputs.vehicle_overrides);
    expect(snap.vehicles.filter((view) => view.priority !== '')).toHaveLength(
      inputs.vehicle_priorities,
    );
    expect(snap.lmrApproved).toHaveLength(inputs.lmr_approved);
    expect(snap.counts.affinitySlots).toBe(inputs.affinity_slots_held);
    expect(snap.tenure.records).toBe(inputs.tenure.record_count);
    expect(snap.counts.dwpRows).toBe(inputs.dwp.row_count);
    expect(snap.dwp.set.day).toBe(inputs.dwp.day);
    for (const kind of ['routes', 'itineraries', 'schedule']) {
      expect(snap.counts.routeRows[kind], kind).toBe(inputs.route_sources[kind].row_count);
      const set = snap.routeSets.find((one) => one.kind === kind)!;
      expect(set.day, kind).toBe(inputs.route_sources[kind].day);
    }
    // The day the DWP tab reports is the day the harness reported.
    expect(snap.dwp.dayStatus).toBe(
      expected(day.day, 'dwp.json').after_route_bring_over.before.day_status,
    );
  });

  it('are worded the way the old pages worded them', async () => {
    const { snap } = await loadDay(day);
    const inputs = expected(day.day, 'inputs.json');

    // Route Data: the header numbers.
    for (const set of snap.routeSets) {
      expect(routeMetric(set)).toBe(
        `${set.rows.length} rows  -  ${dispatchTimes(set).length} dispatch times`,
      );
      const known = new Set(snap.associates.map((view) => view.associate.transporterId));
      const rows = buildRouteRows(set, known);
      expect(rows).toHaveLength(set.rows.length);
      const notes = routeNotes(set, known, true).join(' ');
      const unknown = rows.filter((row) => !row.known).length;
      expect(notes.includes('not in associate data')).toBe(unknown > 0);
      if (unknown > 0) expect(notes).toContain(`${unknown} not in associate data`);
      for (const row of rows) {
        const tone = routeTone(row, true);
        if (!row.known) expect(tone).toBe('warn');
        else if (row.shared) expect(tone).toBe(row.pad ? 'warn' : 'ghost');
        else expect(tone).toBe(row.pad ? undefined : 'ghost');
      }
    }

    // DWP: the match line says how many of the roster's drivers were matched.
    const dwpLine = dwpMatchLine(snap);
    expect(dwpLine).toBe(
      `${snap.dwp.matchedCount} of ${inputs.loadout.row_count} drivers matched by route code`,
    );
    expect(buildDwpRows(snap)).toHaveLength(inputs.dwp.row_count);
    expect(dwpNotes(snap)).not.toContain('NaN');
    const note = dwpDayNote(snap)!;
    expect(note.tone).toBe(snap.dwp.dayStatus === 'ok' ? 'ok' : 'warn');

    // Vehicles: the count line and the mix, from the same fleet the harness read.
    expect(fleetCountLine(snap.vehicles)).toMatch(
      new RegExp(
        `^${inputs.vehicles.count} vehicles {2}- {2}${inputs.vehicles.operational} operational`,
      ),
    );
    expect(fleetTitle(snap.vehicles)).toMatch(/^Fleet/);
    expect(fleetMix(snap.vehicles)).toMatch(/\w+: \d+/);
    expect(typeof fleetFlags(snap)).toBe('string');
    snap.vehicles.forEach((view) =>
      expect(['bad', 'warn', '']).toContain(vehicleTone(view, snap.today)),
    );

    // Associates.
    expect(associateCountLine(snap)).toMatch(
      new RegExp(`^${inputs.associates.count} associates {2}- {2}\\d+ active$`),
    );
    expect(qualificationLine(snap.associates)).toMatch(/^EDV: \d+ {3}Step Van: \d+ {3}DOT: \d+$/);
    expect(expiryLine(snap)).toContain(
      `lifetime routes: ${inputs.associates.with_tenure}/${inputs.associates.count}`,
    );
    expect(expiryLine(snap)).toContain(
      `on load out: ${snap.counts.matched}/${inputs.loadout.row_count}`,
    );
    expect(qualificationOptions(snap.associates)[0]).toBe('All qualifications');

    // Van affinity: the saved assignments the harness held.
    const counts = affinityCounts(snap);
    expect(counts.assignments).toBe(inputs.affinity_slots_held);
    expect(counts.drivers).toBeGreaterThan(0);
    expect(counts.vans).toBeGreaterThan(0);
    expect(holdsSummary(snap).size).toBe(counts.drivers);
    expect(driverSideRows(snap)).toHaveLength(inputs.associates.count);
  });
});

describe('PAD summaries', () => {
  it('say where each dispatch time sits, from the rows', async () => {
    const day = DAYS[0]!;
    const { host, snap } = await loadDay(day, false);
    const set = snap.routeSets.find((one) => one.kind === 'routes')!;
    expect(padSummary(set)).toMatch(/-> unassigned \(\d+\)/);

    const pads = expected(day.day, 'inputs.json').route_sources.routes.pads as Record<
      string,
      number
    >;
    host.state.setPads('routes', pads);
    const after = host.snapshot().routeSets.find((one) => one.kind === 'routes')!;
    const text = padSummary(after);
    for (const [time, pad] of Object.entries(pads)) {
      expect(text).toContain(`${time} -> PAD ${pad} (`);
    }
  });

  it('say a time is partly assigned when its rows disagree, and name the PADs when they differ', async () => {
    const { host } = await loadDay(DAYS[2]!, false);
    const set = host.state.routeSet('routes');
    const [time] = dispatchTimes(set)[0]!;
    const same = set.rows.filter((row) => row.dispatchTime === time);
    expect(same.length).toBeGreaterThan(1);

    same[0]!.pad = '2';
    const view = () => host.snapshot().routeSets.find((one) => one.kind === 'routes')!;
    expect(padSummary(view())).toContain(`${time} -> partly assigned (${same.length})`);
    for (const row of same) row.pad = '2';
    expect(padSummary(view())).toContain(`${time} -> PAD 2 (${same.length})`);
    same[0]!.pad = '1';
    expect(padSummary(view())).toContain(`${time} -> PAD 1/PAD 2 (${same.length})`);
    // The header counts the rows that carry a PAD of their own.
    expect(routeNotes(view(), new Set(), false)[0]).toBe(`${same.length} PADs from schedule`);
  });
});
