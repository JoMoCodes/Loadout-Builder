// The Load Out page's commands, driven through the real channel handlers on a throwaway copy of
// the made-up demo data (the rig is the one in stateHost.test.ts). The last test runs a whole
// fixture day the way a person would on the page, and compares the roster it ends with to the
// parity harness's record of what the old app did (scripts/parity/expected).
//
// Failure messages carry counts and positions only, never a name.

import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { AssignmentResult } from '@loadout/core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { AppSnapshot } from '../../shared/snapshot';
import { StateHost } from '../appState';
import type { ChannelEnv, ChannelEvent, IpcLike } from '../channels';
import { DataSource } from '../dataSource';
import { registerAllChannels } from './index';
import type { HandlerContext, Services } from './types';
import { STALE_ROSTER } from './loadOut';
import { ROSTER_COLUMNS } from '../../renderer/pages/loadOut/columns';

const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
  '..',
  '..',
  '..',
);
const fixtures = path.join(root, 'packages', 'fixtures');
const expected = path.join(root, 'scripts', 'parity', 'expected');
const fixture = (...parts: string[]) => path.join(fixtures, ...parts);

const OWN = 'file:///app/index.html';
const good: ChannelEvent = { senderFrame: { url: OWN, parent: null } };

type Reply = { ok: boolean; value?: unknown; reason?: string; message?: string };

interface Rig {
  host: StateHost;
  source: DataSource;
  call: (name: string, input?: unknown) => Promise<Reply>;
  bringIn: (kind: string, file: string) => Promise<Reply>;
}

let folder: string;
let rig: Rig;
let today = '2026-09-11';

function makeRig(): Rig {
  const source = new DataSource({
    dataFolder: path.join(folder, 'data'),
    fixtureDb: fixture('v1', 'loadout.db'),
    tempFolder: folder,
  });
  const host = new StateHost(source, () => today);
  source.open(true); // the made-up demo day
  host.rebuild();

  const handlers = new Map<string, (event: ChannelEvent, input: unknown) => unknown>();
  const ipc: IpcLike = {
    handle: (name, listener) => void handlers.set(name, listener),
    on: (name, listener) => void handlers.set(name, listener),
  };
  const picks = { next: null as string | null };
  const services = { pickFile: async () => picks.next } as unknown as Services;
  const context: HandlerContext = {
    get state() {
      return host.state;
    },
    host,
    services,
    picked: new Set(),
    dropped: new Map(),
    today: host.today,
  };
  const env: ChannelEnv<HandlerContext> = {
    isOwnPage: (url) => url === OWN,
    context: () => context,
    log: () => {},
    afterCommand: () => void host.bump(),
  };
  registerAllChannels(ipc, env);

  const call = async (name: string, input?: unknown) => {
    const handler = handlers.get(name);
    if (!handler) throw new Error(`no handler for ${name}`);
    return (await handler(good, input)) as Reply;
  };
  return {
    host,
    source,
    call,
    bringIn: async (kind, file) => {
      picks.next = file;
      await call('files:pick', { kind });
      return call('files:import', { kind, path: file });
    },
  };
}

beforeEach(() => {
  today = '2026-09-11';
  folder = mkdtempSync(path.join(tmpdir(), 'loadout-loadout-test-'));
  rig = makeRig();
});

afterEach(() => {
  rig.source.close();
  rmSync(folder, { recursive: true, force: true });
});

async function snapshot(): Promise<AppSnapshot> {
  const reply = await rig.call('state:snapshot');
  expect(reply.ok).toBe(true);
  // A copy, as the page gets one: the rig hands over the state's own objects.
  return structuredClone(reply.value as AppSnapshot);
}

/** The 2026-09-11 fixture sheet with its route export and DWP brought in, nothing over yet. */
async function morning(): Promise<void> {
  await rig.bringIn('loadout', fixture('loadout-sheets', '2026_09_11_17_37_loadout_sheet.xlsx'));
  await rig.bringIn('routes', fixture('routes', 'Routes_XXX1_2026-09-01_12_20 (CDT).xlsx'));
  await rig.bringIn('dwp', fixture('dwp', 'DWP_DSP-XXXX_09-11-2026.xlsx'));
}

/** That day with route data and the DWP brought over and vans assigned. */
async function assignedDay(): Promise<AppSnapshot> {
  await morning();
  await rig.call('loadOut:bring-over-route-data', { kind: 'routes' });
  await rig.call('loadOut:bring-over-dwp');
  const done = await rig.call('loadOut:assign-vans');
  expect(done.ok).toBe(true);
  return snapshot();
}

describe('Load Out commands', () => {
  it('copies today to the Previous Roster and leaves today alone, then clears it', async () => {
    const before = await snapshot();
    const moved = await rig.call('loadOut:move-to-previous-roster');
    expect(moved).toEqual({ ok: true, value: before.roster.rows.length });
    const after = await snapshot();
    expect(after.previousRoster.rows.length).toBe(before.roster.rows.length);
    expect(after.roster.rows.map((r) => r.row)).toEqual(before.roster.rows.map((r) => r.row));
    expect(await rig.call('loadOut:clear-previous-roster')).toEqual({ ok: true, value: null });
    expect((await snapshot()).counts.previousRosterRows).toBe(0);
  });

  it('clears the roster but keeps the associates and the manual links', async () => {
    const before = await snapshot();
    expect(before.counts.links).toBeGreaterThan(0);
    await rig.call('loadOut:clear-roster');
    const after = await snapshot();
    expect(after.roster.rows).toHaveLength(0);
    expect(after.counts.associates).toBe(before.counts.associates);
    expect(after.counts.links).toBe(before.counts.links);
  });

  it('brings route data and the DWP over, assigns vans, and clears them again', async () => {
    await morning();
    const routes = await rig.call('loadOut:bring-over-route-data', { kind: 'routes' });
    expect(routes.ok).toBe(true);
    expect((routes.value as { filled: number }).filled).toBeGreaterThan(0);
    const dwp = await rig.call('loadOut:bring-over-dwp');
    expect(dwp.ok).toBe(true);
    const assigned = await rig.call('loadOut:assign-vans');
    const result = assigned.value as AssignmentResult;
    expect(result.considered).toBeGreaterThan(0);
    expect(result.assignments.some((a) => a.vehicle !== null)).toBe(true);
    const withVans = (await snapshot()).roster.rows.filter((r) => r.row.vehicle).length;
    expect(withVans).toBeGreaterThan(0);
    expect(await rig.call('loadOut:clear-vans')).toEqual({ ok: true, value: withVans });
    const after = await snapshot();
    expect(after.roster.rows.every((r) => !r.row.vehicle && !r.row.vin)).toBe(true);
    expect(after.roster.rows.every((r) => r.assignMethodLabel === '')).toBe(true);
  });

  it('refuses a row command sent from an old snapshot, in plain words', async () => {
    const snap = await snapshot();
    await rig.call('loadOut:clear-vans'); // anything that changes the data moves the revision on
    const reply = await rig.call('loadOut:remove-driver', { revision: snap.revision, rowIndex: 0 });
    expect(reply).toEqual({ ok: false, reason: 'refused', message: STALE_ROSTER });
    expect((await snapshot()).roster.rows).toHaveLength(snap.roster.rows.length);
  });

  it('refuses a row that is not there, and an input of the wrong shape', async () => {
    const snap = await snapshot();
    const gone = await rig.call('loadOut:take-van', {
      revision: snap.revision,
      rowIndex: snap.roster.rows.length + 3,
    });
    expect(gone.reason).toBe('refused');
    const wrong = await rig.call('loadOut:remove-driver', {
      revision: snap.revision,
      rowIndex: -1,
    });
    expect(wrong.reason).toBe('bad-input');
    const kind = await rig.call('loadOut:bring-over-route-data', { kind: 'photos' });
    expect(kind.reason).toBe('bad-input');
  });

  it('takes a driver off the roster', async () => {
    const snap = await snapshot();
    const reply = await rig.call('loadOut:remove-driver', { revision: snap.revision, rowIndex: 0 });
    expect(reply.ok).toBe(true);
    const after = await snapshot();
    expect(after.roster.rows).toHaveLength(snap.roster.rows.length - 1);
    expect(after.roster.rows[0]?.row.driver).toBe(snap.roster.rows[1]?.row.driver);
  });

  it('links by hand, marks as not an associate, and goes back to automatic matching', async () => {
    let snap = await snapshot();
    const view = snap.roster.rows.find((r) => r.match.method !== 'manual' && r.associateId)!;
    const other = snap.associates.find((a) => a.associate.transporterId !== view.associateId)!;
    const id = other.associate.transporterId;

    let reply = await rig.call('loadOut:link-driver', {
      revision: snap.revision,
      rowIndex: view.index,
      transporterId: id,
    });
    expect(reply.ok).toBe(true);
    snap = await snapshot();
    expect(snap.roster.rows[view.index]?.associateId).toBe(id);
    expect(snap.roster.rows[view.index]?.match.method).toBe('manual');

    reply = await rig.call('loadOut:link-driver', {
      revision: snap.revision,
      rowIndex: view.index,
      transporterId: null,
    });
    expect(reply.ok).toBe(true);
    snap = await snapshot();
    expect(snap.roster.rows[view.index]?.match.method).toBe('cleared');
    expect(snap.roster.rows[view.index]?.check).toBe('Not an associate');

    reply = await rig.call('loadOut:unlink-driver', {
      revision: snap.revision,
      rowIndex: view.index,
    });
    expect(reply.ok).toBe(true);
    snap = await snapshot();
    expect(snap.roster.rows[view.index]?.associateId).toBe(view.associateId);
    expect(snap.roster.rows[view.index]?.match.method).toBe(view.match.method);

    const unknown = await rig.call('loadOut:link-driver', {
      revision: snap.revision,
      rowIndex: view.index,
      transporterId: 'NOT-IN-THE-LIST',
    });
    expect(unknown.reason).toBe('refused');
  });

  it('forgets every manual link', async () => {
    expect((await snapshot()).counts.links).toBeGreaterThan(0);
    await rig.call('loadOut:clear-links');
    expect((await snapshot()).counts.links).toBe(0);
  });

  it('hands a route over with its van, and marks both rows as given by hand', async () => {
    let snap = await assignedDay();
    const from = snap.roster.rows.find((r) => r.row.routes && r.row.vehicle)!;
    const to = snap.roster.rows.find((r) => !r.row.routes && !r.row.serviceType)!;
    const reply = await rig.call('loadOut:reassign-route', {
      revision: snap.revision,
      from: from.index,
      to: to.index,
    });
    expect(reply.ok).toBe(true);
    snap = await snapshot();
    expect(snap.roster.rows[to.index]?.row.routes).toBe(from.row.routes);
    expect(snap.roster.rows[to.index]?.row.vehicle).toBe(from.row.vehicle);
    expect(snap.roster.rows[to.index]?.assignMethodLabel).toBe('given by hand');
    expect(snap.roster.rows[from.index]?.row.routes).toBe('');
    expect(snap.roster.rows[from.index]?.assignMethodLabel).toBe('');

    const same = await rig.call('loadOut:reassign-route', {
      revision: snap.revision,
      from: to.index,
      to: to.index,
    });
    expect(same.reason).toBe('refused');
  });

  it('swaps two vans, takes one away, and gives a free one by hand', async () => {
    let snap = await assignedDay();
    const [a, b] = snap.roster.rows.filter((r) => r.row.vehicle);
    let reply = await rig.call('loadOut:reassign-van', {
      revision: snap.revision,
      from: a!.index,
      to: b!.index,
    });
    expect(reply.ok).toBe(true);
    snap = await snapshot();
    expect(snap.roster.rows[a!.index]?.row.vehicle).toBe(b!.row.vehicle);
    expect(snap.roster.rows[b!.index]?.row.vehicle).toBe(a!.row.vehicle);
    expect(snap.roster.rows[a!.index]?.assignMethodLabel).toBe('given by hand');
    expect(snap.roster.rows[b!.index]?.assignMethodLabel).toBe('given by hand');

    reply = await rig.call('loadOut:take-van', { revision: snap.revision, rowIndex: a!.index });
    expect(reply).toEqual({ ok: true, value: b!.row.vehicle });
    snap = await snapshot();
    expect(snap.roster.rows[a!.index]?.row.vehicle).toBe('');
    expect(snap.roster.rows[a!.index]?.assignMethodLabel).toBe('');
    const freed = snap.vehicles.find((v) => v.vehicle.name === b!.row.vehicle)!;
    expect(freed.available).toBe(true);

    reply = await rig.call('loadOut:give-van', {
      revision: snap.revision,
      rowIndex: a!.index,
      vin: freed.vehicle.vin,
    });
    expect(reply.ok).toBe(true);
    snap = await snapshot();
    expect(snap.roster.rows[a!.index]?.row.vin).toBe(freed.vehicle.vin);
    expect(snap.roster.rows[a!.index]?.assignMethodLabel).toBe('given by hand');
    expect(snap.vehicles.find((v) => v.vehicle.vin === freed.vehicle.vin)?.available).toBe(false);

    // A van somebody holds is not free to give.
    const taken = await rig.call('loadOut:give-van', {
      revision: snap.revision,
      rowIndex: b!.index,
      vin: freed.vehicle.vin,
    });
    expect(taken.reason).toBe('refused');
  });

  it('prints in every cell what the Roster table shows in it, from the same records', async () => {
    const snap = await assignedDay();
    const reply = await rig.call('print:rows');
    expect(reply.ok).toBe(true);
    const printed = (reply.value as { rows: Array<{ values: Record<string, string> }> }).rows;
    expect(printed).toHaveLength(snap.roster.rows.length);
    const differences: string[] = [];
    snap.roster.rows.forEach((view, index) => {
      for (const column of ROSTER_COLUMNS) {
        let onPaper = printed[index]?.values[column.id];
        // The one difference the old app had too: the table says "PAD 1", the sheet says "1".
        if (column.id === 'pad' && onPaper) onPaper = `PAD ${onPaper}`;
        if (onPaper !== column.value(view)) differences.push(`row ${index}: ${column.header}`);
      }
    });
    expect(differences, `${differences.length} cells differ`).toEqual([]);
  });

  it('counts who had a van last time and is on today too', async () => {
    await assignedDay();
    await rig.call('loadOut:move-to-previous-roster');
    const snap = await snapshot();
    expect(snap.counts.previousOnToday).toBeGreaterThan(0);
    expect(snap.counts.previousOnToday).toBeLessThanOrEqual(
      snap.previousRoster.rows.filter((r) => r.vehicle).length,
    );
  });
});

// ------------------------------------------------------------------ parity

interface ExpectedVans {
  result: {
    considered: number;
    vans_available: number;
    assigned: number;
    unassigned: number;
    loose: number;
    by_method: Record<string, number>;
  };
  roster_after: Array<{ driver: string; vehicle: string; vin: string; assign_method: string }>;
}

interface ExpectedRows {
  rows: Array<{
    check_text: string;
    assign_method_label: string;
    van_badges: string;
    match_method: string | null;
  }>;
}

const DAY = '2026-09-01';
const read = <T>(file: string): T =>
  JSON.parse(readFileSync(path.join(expected, DAY, file), 'utf8')) as T;
const named = (folderName: string, name: string) => fixture(folderName, name);

describe('a whole fixture day, done as a person would on the Load Out page', () => {
  it(`ends with the roster the old app made on ${DAY}`, { timeout: 60_000 }, async () => {
    today = DAY; // the harness counts the load-out date as today
    const days = JSON.parse(readFileSync(path.join(expected, 'days.json'), 'utf8')) as {
      days: Array<{
        day: string;
        files: { loadout: string };
        routes: { file: string };
        itineraries: { file: string };
        schedule: { file: string };
        dwp: { file: string };
      }>;
    };
    const day = days.days.find((d) => d.day === DAY)!;

    // A normal morning (CONTRACT.md section 3): the driver list, tenure, the vans, the sheet,
    // the three route exports and the DWP. This day has a file for each route export.
    expect((await rig.bringIn('associates', named('associates', 'AssociateData.csv'))).ok).toBe(
      true,
    );
    for (const name of readdirSync(fixture('tenure'))
      .filter((n) => n.endsWith('.csv'))
      .sort()) {
      expect((await rig.bringIn('tenure', named('tenure', name))).ok).toBe(true);
    }
    expect((await rig.bringIn('vehicles', named('vehicles', 'VehiclesData.xlsx'))).ok).toBe(true);
    expect((await rig.bringIn('loadout', named('loadout-sheets', day.files.loadout))).ok).toBe(
      true,
    );
    expect((await rig.bringIn('routes', named('routes', day.routes.file))).ok).toBe(true);
    const routesByTime = JSON.parse(readFileSync(path.join(expected, DAY, 'routes.json'), 'utf8'))
      .scenarios['routes/by_time'] as {
      pads_set: Record<string, number>;
      rows_after: Array<Record<string, string>>;
    };
    expect((await rig.bringIn('itineraries', named('itineraries', day.itineraries.file))).ok).toBe(
      true,
    );
    expect((await rig.bringIn('schedule', named('schedules', day.schedule.file))).ok).toBe(true);
    // The harness pins each export's dispatch times to PADs in clock order (inputs.json).
    const sources = read<{ route_sources: Record<string, { pads: Record<string, number> }> }>(
      'inputs.json',
    ).route_sources;
    for (const kind of ['routes', 'itineraries', 'schedule']) {
      const pads = sources[kind]!.pads;
      expect((await rig.call('routeData:set-pads', { kind, pads })).ok).toBe(true);
    }
    expect((await rig.bringIn('dwp', named('dwp', day.dwp.file))).ok).toBe(true);

    // The page's buttons: Bring Over Route Data (Routes), the DWP after it, then Assign Vans.
    expect((await rig.call('loadOut:bring-over-route-data', { kind: 'routes' })).ok).toBe(true);
    expect((await rig.call('loadOut:bring-over-dwp')).ok).toBe(true);
    const assigned = await rig.call('loadOut:assign-vans');
    const result = assigned.value as AssignmentResult;

    const vans = read<ExpectedVans>('vans.json');
    const assignedCount = result.assignments.filter((a) => a.vehicle !== null).length;
    expect(result.considered, 'drivers considered').toBe(vans.result.considered);
    expect(result.vansAvailable, 'vans in the pool').toBe(vans.result.vans_available);
    expect(assignedCount, 'drivers given a van').toBe(vans.result.assigned);
    expect(result.assignments.length - assignedCount, 'drivers left without').toBe(
      vans.result.unassigned,
    );

    const snap = await snapshot();
    expect(snap.roster.rows.length, 'rows on the roster').toBe(vans.roster_after.length);
    const differences: string[] = [];
    snap.roster.rows.forEach((view, index) => {
      const want = vans.roster_after[index]!;
      if (view.row.vehicle !== want.vehicle) differences.push(`row ${index}: vehicle`);
      if (view.row.vin !== want.vin) differences.push(`row ${index}: VIN`);
      if (view.row.assignMethod !== want.assign_method) differences.push(`row ${index}: method`);
    });
    const rows = read<ExpectedRows>('rows.json').rows;
    const dwpRows = read<{ after_route_bring_over: { rows_after: Array<Record<string, string>> } }>(
      'dwp.json',
    ).after_route_bring_over.rows_after;
    snap.roster.rows.forEach((view, index) => {
      const want = rows[index]!;
      if (view.check !== want.check_text) differences.push(`row ${index}: Check`);
      if (view.assignMethodLabel !== want.assign_method_label)
        differences.push(`row ${index}: Matched On`);
      if (view.vanBadges !== want.van_badges) differences.push(`row ${index}: Vans`);
      if (view.match.method !== (want.match_method ?? 'none'))
        differences.push(`row ${index}: match`);
      const route = routesByTime.rows_after[index] ?? {};
      for (const [mine, theirs] of [
        ['routes', 'routes'],
        ['pad', 'pad'],
        ['waveTime', 'wave_time'],
        ['serviceType', 'service_type'],
      ] as const) {
        if (view.row[mine] !== route[theirs]) differences.push(`row ${index}: ${mine}`);
      }
      const dwp = dwpRows[index] ?? {};
      for (const [mine, theirs] of [
        ['stagingLocation', 'staging_location'],
        ['bags', 'bags'],
        ['ovs', 'ovs'],
      ] as const) {
        if (view.row[mine] !== dwp[theirs]) differences.push(`row ${index}: ${mine}`);
      }
    });
    expect(differences, `${differences.length} differences`).toEqual([]);
  });
});
