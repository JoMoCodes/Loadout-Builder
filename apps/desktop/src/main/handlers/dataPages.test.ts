// The commands behind Route Data, DWP, Vehicle Data and Associates, driven through the real
// channel handlers on a temporary database with a stand-in for Electron's message bus. Uses only
// the made-up fixture files. Messages are checked by counts and words, never by who is in them.

import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { AppSnapshot } from '../../shared/snapshot';
import { StateHost } from '../appState';
import type { ChannelEnv, ChannelEvent, IpcLike } from '../channels';
import { DataSource } from '../dataSource';
import { registerAllChannels } from './index';
import type { HandlerContext, Services } from './index';

const fixtures = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
  '..',
  '..',
  '..',
  'packages',
  'fixtures',
);
const fixture = (...parts: string[]) => path.join(fixtures, ...parts);

const FILES = {
  loadout0914: fixture('loadout-sheets', '2026_09_14_12_15_loadout_sheet.xlsx'),
  loadout0911: fixture('loadout-sheets', '2026_09_11_17_37_loadout_sheet.xlsx'),
  routes0901: fixture('routes', 'Routes_XXX1_2026-09-01_12_20 (CDT).xlsx'),
  routes0925: fixture('routes', 'Routes_XXX1_2026-09-25_09_54 (CDT).xlsx'),
  itineraries: fixture('itineraries', 'Itineraries_XXX1_2026-10-03_21_36 (CDT).xlsx'),
  schedule38: fixture('schedules', 'Week-38-Schedule.xlsx'),
  dwp0911: fixture('dwp', 'DWP_DSP-XXXX_09-11-2026.xlsx'),
  dwpUndated: fixture('dwp', 'XXXX DWP 9.2.xlsx'),
  vehicles: fixture('vehicles', 'VehiclesData.xlsx'),
  associates: fixture('associates', 'AssociateData.csv'),
  tenureOld: fixture('tenure', 'Tenured_Workforce_DA_1756800000.csv'),
  tenureNew: fixture('tenure', 'Tenured_Workforce_DA_1756900000.csv'),
};

const TODAY = '2026-09-14';
const OWN = 'file:///app/index.html';
const good: ChannelEvent = { senderFrame: { url: OWN, parent: null } };

interface Reply {
  ok: boolean;
  value?: unknown;
  reason?: string;
  message?: string;
}

let folder: string;
let host: StateHost;
let source: DataSource;
let call: (name: string, input?: unknown) => Promise<Reply>;
let changes = 0;

beforeEach(() => {
  folder = mkdtempSync(path.join(tmpdir(), 'loadout-pages-test-'));
  source = new DataSource({
    dataFolder: path.join(folder, 'data'),
    fixtureDb: fixture('v1', 'loadout.db'),
    tempFolder: folder,
  });
  host = new StateHost(source, () => TODAY);
  source.open(false);
  host.rebuild();

  const handlers = new Map<string, (event: ChannelEvent, input: unknown) => unknown>();
  const ipc: IpcLike = {
    handle: (name, listener) => void handlers.set(name, listener),
    on: (name, listener) => void handlers.set(name, listener),
  };
  changes = 0;
  const context: HandlerContext = {
    get state() {
      return host.state;
    },
    host,
    // The file window is not used: the tests pick by asking for a path directly.
    services: { pickFile: async () => null } as unknown as Services,
    picked: new Set(),
    dropped: new Map(),
    today: host.today,
  };
  const env: ChannelEnv<HandlerContext> = {
    isOwnPage: (url) => url === OWN,
    context: () => context,
    log: () => undefined,
    afterCommand: () => {
      changes += 1;
      host.bump();
    },
  };
  registerAllChannels(ipc, env);
  call = async (name, input) => {
    const handler = handlers.get(name);
    if (!handler) throw new Error(`no handler for ${name}`);
    return (await handler(good, input)) as Reply;
  };
  // Remember a file as chosen in the file window, so the app is willing to read it.
  pick = (file) => void context.picked.add(file);
});

let pick: (file: string) => void;

afterEach(() => {
  source.close();
  rmSync(folder, { recursive: true, force: true });
});

async function snapshot(): Promise<AppSnapshot> {
  const reply = await call('state:snapshot');
  expect(reply.ok).toBe(true);
  return reply.value as AppSnapshot;
}

async function bringIn(kind: string, file: string): Promise<number> {
  pick(file);
  const reply = await call('files:import', { kind, path: file });
  expect(reply.ok, `${kind}: ${JSON.stringify(reply)}`).toBe(true);
  return (reply.value as { rows: number }).rows;
}

describe('Route Data commands', () => {
  it('pins dispatch times to PADs, and a fresh start clears them again', async () => {
    await bringIn('routes', FILES.routes0901);
    const before = await snapshot();
    const set = before.routeSets.find((one) => one.kind === 'routes')!;
    expect(set.rows).toHaveLength(29);
    expect(set.pads.size).toBe(0);

    const times = [...new Set(set.rows.map((row) => row.dispatchTime))];
    const pads = Object.fromEntries(times.map((time, index) => [time, (index % 3) + 1]));
    expect(await call('routeData:set-pads', { kind: 'routes', pads })).toEqual({
      ok: true,
      value: null,
    });
    const after = (await snapshot()).routeSets.find((one) => one.kind === 'routes')!;
    expect([...after.pads.keys()].sort()).toEqual([...times].sort());

    // A time left out becomes unassigned, and a PAD of 0 means none.
    await call('routeData:set-pads', { kind: 'routes', pads: { [times[0]!]: 2, [times[1]!]: 0 } });
    const trimmed = (await snapshot()).routeSets.find((one) => one.kind === 'routes')!;
    expect([...trimmed.pads.entries()]).toEqual([[times[0], 2]]);

    // Bringing the file in again starts without the assignments.
    await bringIn('routes', FILES.routes0901);
    const fresh = (await snapshot()).routeSets.find((one) => one.kind === 'routes')!;
    expect(fresh.pads.size).toBe(0);
  });

  it('refuses a PAD that is not 0 to 3, and an export that does not exist', async () => {
    expect(
      (await call('routeData:set-pads', { kind: 'routes', pads: { '9:50am': 4 } })).reason,
    ).toBe('bad-input');
    expect((await call('routeData:set-pads', { kind: 'dwp', pads: {} })).reason).toBe('bad-input');
    expect((await call('routeData:clear', { kind: 'photos' })).reason).toBe('bad-input');
  });

  it('clears one export and leaves the others', async () => {
    await bringIn('routes', FILES.routes0901);
    await bringIn('itineraries', FILES.itineraries);
    await call('routeData:clear', { kind: 'routes' });
    const snap = await snapshot();
    expect(snap.counts.routeRows.routes).toBe(0);
    expect(snap.counts.routeRows.itineraries).toBe(25);
  });

  it('copies PADs from the schedule, stopping with the old words when it cannot', async () => {
    const empty = await call('routeData:adopt-schedule-pads', { kind: 'itineraries' });
    expect(empty).toMatchObject({ ok: false, reason: 'refused' });
    expect(empty.message).toBe('Import a Itineraries export first.');

    await bringIn('itineraries', FILES.itineraries);
    const noSchedule = await call('routeData:adopt-schedule-pads', { kind: 'itineraries' });
    expect(noSchedule.message).toBe(
      'Import a Weekly Schedule export first - its PADs are what come over.',
    );

    await bringIn('loadout', FILES.loadout0914);
    await bringIn('schedule', FILES.schedule38);
    const noPads = await call('routeData:adopt-schedule-pads', { kind: 'itineraries' });
    expect(noPads.message).toBe(
      'The Weekly Schedule has no PADs assigned yet - use Assign PADs on its tab first.',
    );

    await call('routeData:set-pads', { kind: 'schedule', pads: { '9:50am': 1, '9:55am': 2 } });
    const done = await call('routeData:adopt-schedule-pads', { kind: 'itineraries' });
    expect(done.ok).toBe(true);
    const result = done.value as { copied: number; noPad: number; missing: number; total: number };
    expect(result.total).toBe(25);
    // Every row is counted once: copied, scheduled with no PAD, or not on the schedule.
    expect(result.copied + result.noPad + result.missing).toBe(25);
    const set = (await snapshot()).routeSets.find((one) => one.kind === 'itineraries')!;
    expect(set.rows.filter((row) => row.pad !== '').length).toBe(result.copied);
  });

  it('sets who a shared route belongs to, and only for the table the page saw', async () => {
    await bringIn('routes', FILES.routes0901);
    await bringIn('itineraries', FILES.itineraries);
    await bringIn('schedule', FILES.schedule38);
    const snap = await snapshot();

    // Find a shared route in whichever export has one.
    let found: { kind: string; index: number; ids: string[] } | null = null;
    for (const set of snap.routeSets) {
      set.rows.forEach((row, index) => {
        const ids = row.sharedIds
          .split('|')
          .map((part) => part.trim())
          .filter(Boolean);
        if (!found && ids.length > 1) found = { kind: set.kind, index, ids };
      });
    }
    expect(found, 'the made-up files hold a shared route').not.toBeNull();
    const { kind, index, ids } = found as { kind: string; index: number; ids: string[] };
    const other = ids.find(
      (id) => id !== snap.routeSets.find((s) => s.kind === kind)!.rows[index]!.transporterId,
    )!;

    const was = structuredClone(snap.routeSets.find((s) => s.kind === kind)!.rows[index]!);
    const stale = await call('routeData:set-route-drivers', {
      kind,
      revision: snap.revision - 1,
      choices: [{ rowIndex: index, transporterId: other }],
    });
    expect(stale).toMatchObject({ ok: false, reason: 'refused' });

    // A refusal also counts as a change, so the page reads the table again before the next try.
    const stranger = await call('routeData:set-route-drivers', {
      kind,
      revision: (await snapshot()).revision,
      choices: [{ rowIndex: index, transporterId: 'NOT-ON-THIS-ROUTE' }],
    });
    expect(stranger).toMatchObject({ ok: false, reason: 'refused' });

    const done = await call('routeData:set-route-drivers', {
      kind,
      revision: (await snapshot()).revision,
      choices: [{ rowIndex: index, transporterId: other }],
    });
    expect(done).toEqual({ ok: true, value: { set: 1 } });
    const after = (await snapshot()).routeSets.find((s) => s.kind === kind)!;
    expect(after.rows[index]!.transporterId).toBe(other);
    // Both names are kept either way: only the one the route is assigned to changes.
    expect(after.rows[index]!.sharedDrivers).toBe(was.sharedDrivers);
    expect(after.rows[index]!.sharedIds).toBe(was.sharedIds);
    expect(after.rows[index]!.driverName).not.toBe(was.driverName);
  });

  it('keeps a PAD map for each export, since the clocks differ', async () => {
    await bringIn('routes', FILES.routes0901);
    await bringIn('itineraries', FILES.itineraries);
    await call('routeData:set-pads', { kind: 'routes', pads: { '10:20am': 1 } });
    await call('routeData:set-pads', { kind: 'itineraries', pads: { '10:20am': 3 } });
    const sets = (await snapshot()).routeSets;
    expect([...sets.find((s) => s.kind === 'routes')!.pads]).toEqual([['10:20am', 1]]);
    expect([...sets.find((s) => s.kind === 'itineraries')!.pads]).toEqual([['10:20am', 3]]);
  });

  it('replaces PADs copied from the schedule with what the PAD window says afterwards', async () => {
    await bringIn('loadout', FILES.loadout0914);
    await bringIn('itineraries', FILES.itineraries);
    await bringIn('schedule', FILES.schedule38);
    await call('routeData:set-pads', { kind: 'schedule', pads: { '9:50am': 1, '9:55am': 2 } });
    const copied = (await call('routeData:adopt-schedule-pads', { kind: 'itineraries' })).value as {
      copied: number;
    };
    expect(copied.copied).toBeGreaterThan(0);
    const held = () =>
      host.state.routeSet('itineraries').rows.filter((row) => row.pad !== '').length;
    expect(held()).toBe(copied.copied);
    await call('routeData:set-pads', { kind: 'itineraries', pads: { '10:20am': 1 } });
    expect(held()).toBe(0);
  });

  it('reads the weekly schedule for today when no roster is loaded', async () => {
    expect((await snapshot()).loadOutDate).toBeNull();
    await bringIn('schedule', FILES.schedule38);
    const set = (await snapshot()).routeSets.find((one) => one.kind === 'schedule')!;
    expect(set.day).toBe(TODAY);
    expect(set.rows).toHaveLength(28);
  });

  it('refuses a row that is not there', async () => {
    const snap = await snapshot();
    const reply = await call('routeData:set-route-drivers', {
      kind: 'routes',
      revision: snap.revision,
      choices: [{ rowIndex: 3, transporterId: 'A1' }],
    });
    expect(reply).toMatchObject({ ok: false, reason: 'refused' });
  });
});

describe('DWP commands', () => {
  it('reads the day from the file name, and clears the sheet', async () => {
    await bringIn('loadout', FILES.loadout0911);
    expect(await bringIn('dwp', FILES.dwp0911)).toBe(26);
    expect((await snapshot()).dwp.dayStatus).toBe('ok');

    await bringIn('dwp', FILES.dwpUndated);
    expect((await snapshot()).dwp.dayStatus).toBe('unknown');

    await bringIn('loadout', FILES.loadout0914);
    await bringIn('dwp', FILES.dwp0911);
    expect((await snapshot()).dwp.dayStatus).toBe('mismatch');

    expect(await call('dwp:clear')).toEqual({ ok: true, value: null });
    const cleared = await snapshot();
    expect(cleared.counts.dwpRows).toBe(0);
    // The roster is untouched.
    expect(cleared.counts.rosterRows).toBe(37);
  });
});

describe('Vehicle Data commands', () => {
  async function withFleet() {
    await bringIn('associates', FILES.associates);
    await bringIn('vehicles', FILES.vehicles);
    return snapshot();
  }

  it('grounds and returns vans, keeping the change apart from the export', async () => {
    const snap = await withFleet();
    const van = snap.vehicles.find((view) => view.operational)!;
    const vin = van.vehicle.vin;

    expect(await call('vehicles:set-operational', { vins: [vin], operational: false })).toEqual({
      ok: true,
      value: { changed: 1 },
    });
    const grounded = (await snapshot()).vehicles.find((view) => view.vehicle.vin === vin)!;
    expect(grounded).toMatchObject({ operational: false, overridden: true });

    // Setting it to what the export says drops the change rather than storing a no-op.
    await call('vehicles:set-operational', { vins: [vin], operational: true });
    const back = (await snapshot()).vehicles.find((view) => view.vehicle.vin === vin)!;
    expect(back).toMatchObject({ operational: true, overridden: false });

    // Saying what is already true changes nothing.
    expect(await call('vehicles:set-operational', { vins: [vin], operational: true })).toEqual({
      ok: true,
      value: { changed: 0 },
    });
  });

  it('keeps a grounded van grounded through a new import, and goes back with "match the export"', async () => {
    const snap = await withFleet();
    const vin = snap.vehicles.find((view) => view.operational)!.vehicle.vin;
    await call('vehicles:set-operational', { vins: [vin], operational: false });
    await bringIn('vehicles', FILES.vehicles);
    const again = await snapshot();
    expect(again.vehicles.find((view) => view.vehicle.vin === vin)).toMatchObject({
      operational: false,
      overridden: true,
    });
    expect(again.counts.overriddenVehicles).toBe(1);

    const reset = await call('vehicles:match-export', { vins: [vin] });
    expect(reset).toEqual({ ok: true, value: { reset: 1 } });
    expect((await call('vehicles:match-export', { vins: [vin] })).value).toEqual({ reset: 0 });
    expect((await snapshot()).counts.overriddenVehicles).toBe(0);
  });

  it('clears every status set here in one go', async () => {
    const snap = await withFleet();
    const vins = snap.vehicles
      .filter((view) => view.operational)
      .slice(0, 3)
      .map((v) => v.vehicle.vin);
    await call('vehicles:set-operational', { vins, operational: false });
    expect((await snapshot()).counts.overriddenVehicles).toBe(3);
    await call('vehicles:clear-overrides');
    expect((await snapshot()).counts.overriddenVehicles).toBe(0);
  });

  it('refuses a van that is not in the fleet', async () => {
    await withFleet();
    const reply = await call('vehicles:set-operational', {
      vins: ['NOT-A-VIN'],
      operational: false,
    });
    expect(reply).toMatchObject({ ok: false, reason: 'refused' });
    expect(reply.message).toContain('no longer in the list');
  });

  it('sets a priority number, empties it, and refuses words', async () => {
    const snap = await withFleet();
    const vins = snap.vehicles.slice(0, 2).map((view) => view.vehicle.vin);
    await call('vehicles:set-priority', { vins, priority: ' 7 ' });
    let now = await snapshot();
    expect(
      now.vehicles.filter((view) => vins.includes(view.vehicle.vin)).map((v) => v.priority),
    ).toEqual(['7', '7']);

    const bad = await call('vehicles:set-priority', { vins, priority: 'high' });
    expect(bad).toMatchObject({ ok: false, reason: 'refused' });
    expect(bad.message).toContain("isn't a number");
    expect(bad.message).not.toContain('high');

    await call('vehicles:set-priority', { vins: [vins[0]], priority: '' });
    now = await snapshot();
    expect(now.vehicles.find((view) => view.vehicle.vin === vins[0])!.priority).toBe('');
    expect(now.vehicles.find((view) => view.vehicle.vin === vins[1])!.priority).toBe('7');

    await call('vehicles:clear-priorities');
    expect((await snapshot()).vehicles.every((view) => view.priority === '')).toBe(true);
  });

  it('moves a driver who takes a second slot of the same kind, and says what was given up', async () => {
    const snap = await withFleet();
    const [first, second] = snap.vehicles;
    const driver = snap.associates[0]!.associate.transporterId;

    const one = await call('vehicles:set-affinity', {
      vin: first!.vehicle.vin,
      slot: 'primary_1',
      transporterId: driver,
    });
    expect(one.value).toEqual({ displaced: [] });
    const two = await call('vehicles:set-affinity', {
      vin: second!.vehicle.vin,
      slot: 'primary_2',
      transporterId: driver,
    });
    expect(two.value).toEqual({
      displaced: [{ vin: first!.vehicle.vin, slot: 'primary_1' }],
    });
    const after = await snapshot();
    expect(after.affinity[second!.vehicle.vin]).toEqual({ primary_2: driver });
    expect(after.affinity[first!.vehicle.vin]).toBeUndefined();

    // A secondary slot is a different kind: nothing is given up.
    const three = await call('vehicles:set-affinity', {
      vin: first!.vehicle.vin,
      slot: 'secondary_1',
      transporterId: driver,
    });
    expect(three.value).toEqual({ displaced: [] });
    expect((await snapshot()).counts.affinitySlots).toBe(2);
  });

  it('refuses a driver who is not in the list, and a van that is not in the fleet', async () => {
    const snap = await withFleet();
    const vin = snap.vehicles[0]!.vehicle.vin;
    expect(
      await call('vehicles:set-affinity', { vin, slot: 'primary_1', transporterId: 'NOBODY' }),
    ).toMatchObject({ ok: false, reason: 'refused' });
    expect(
      await call('vehicles:set-affinity', {
        vin: 'NOT-A-VIN',
        slot: 'primary_1',
        transporterId: snap.associates[0]!.associate.transporterId,
      }),
    ).toMatchObject({ ok: false, reason: 'refused' });
    expect(
      (await call('vehicles:set-affinity', { vin, slot: 'tertiary', transporterId: 'x' })).reason,
    ).toBe('bad-input');
  });

  it('empties one slot, and then all of them', async () => {
    const snap = await withFleet();
    const people = snap.associates.slice(0, 2).map((view) => view.associate.transporterId);
    const vin = snap.vehicles[0]!.vehicle.vin;
    await call('vehicles:set-affinity', { vin, slot: 'primary_1', transporterId: people[0] });
    await call('vehicles:set-affinity', { vin, slot: 'secondary_1', transporterId: people[1] });
    await call('vehicles:clear-affinity', { vin, slot: 'primary_1' });
    expect((await snapshot()).affinity[vin]).toEqual({ secondary_1: people[1] });
    await call('vehicles:clear-all-affinity');
    expect((await snapshot()).counts.affinitySlots).toBe(0);
  });

  it('approves and removes LMR approval, counting only real changes', async () => {
    const snap = await withFleet();
    const ids = snap.associates.slice(0, 3).map((view) => view.associate.transporterId);
    expect(await call('vehicles:set-lmr', { transporterIds: ids, approved: true })).toEqual({
      ok: true,
      value: { changed: 3 },
    });
    expect((await snapshot()).lmrApproved).toEqual(expect.arrayContaining(ids));
    expect(await call('vehicles:set-lmr', { transporterIds: ids, approved: true })).toEqual({
      ok: true,
      value: { changed: 0 },
    });
    await call('vehicles:set-lmr', { transporterIds: [ids[0]], approved: false });
    expect((await snapshot()).counts.lmrApproved).toBe(2);
    await call('vehicles:clear-lmr');
    expect((await snapshot()).counts.lmrApproved).toBe(0);
  });

  it('refuses to approve somebody who is not in the associate list', async () => {
    await withFleet();
    const reply = await call('vehicles:set-lmr', {
      transporterIds: ['NOT-ON-THE-LIST'],
      approved: true,
    });
    expect(reply).toMatchObject({ ok: false, reason: 'refused' });
    expect((await snapshot()).lmrApproved).not.toContain('NOT-ON-THE-LIST');
  });

  it('keeps affinity, statuses set here and LMR approval when the fleet is cleared and brought back', async () => {
    const snap = await withFleet();
    const vin = snap.vehicles.find((view) => view.operational)!.vehicle.vin;
    const driver = snap.associates[0]!.associate.transporterId;
    await call('vehicles:set-affinity', { vin, slot: 'primary_1', transporterId: driver });
    await call('vehicles:set-operational', { vins: [vin], operational: false });
    await call('vehicles:set-priority', { vins: [vin], priority: '4' });
    await call('vehicles:set-lmr', { transporterIds: [driver], approved: true });

    expect(await call('vehicles:clear')).toEqual({ ok: true, value: null });
    const cleared = await snapshot();
    expect(cleared.counts.vehicles).toBe(0);
    // Affinity and approvals are kept by VIN and Transporter ID, whether or not the van is listed.
    expect(cleared.affinity[vin]).toEqual({ primary_1: driver });
    expect(cleared.lmrApproved).toContain(driver);

    await bringIn('vehicles', FILES.vehicles);
    const back = (await snapshot()).vehicles.find((view) => view.vehicle.vin === vin)!;
    expect(back).toMatchObject({ operational: false, overridden: true, priority: '4' });
    expect(back.affinity).toEqual({ primary_1: driver });
  });
});

describe('Associates commands', () => {
  it('clears the list but keeps the lifetime route counts', async () => {
    await bringIn('associates', FILES.associates);
    pick(FILES.tenureNew);
    const tenure = await call('files:import', { kind: 'tenure', path: FILES.tenureNew });
    expect(tenure.ok).toBe(true);
    const kept = (await snapshot()).tenure.records;
    expect(kept).toBeGreaterThan(0);

    expect(await call('associates:clear')).toEqual({ ok: true, value: null });
    const after = await snapshot();
    expect(after.counts.associates).toBe(0);
    expect(after.tenure.records).toBe(kept);

    // Bringing the list back picks the counts up again.
    await bringIn('associates', FILES.associates);
    expect((await snapshot()).tenure.associatesWithCount).toBeGreaterThan(0);
  });

  it('clears the lifetime route counts and keeps the associate list', async () => {
    await bringIn('associates', FILES.associates);
    pick(FILES.tenureNew);
    await call('files:import', { kind: 'tenure', path: FILES.tenureNew });
    const before = await snapshot();
    expect(before.tenure.records).toBeGreaterThan(0);

    expect(await call('associates:clear-tenure')).toEqual({ ok: true, value: null });
    const after = await snapshot();
    expect(after.tenure.records).toBe(0);
    expect(after.tenure.associatesWithCount).toBe(0);
    expect(after.tenure.sourceFile).toBe('');
    expect(after.counts.associates).toBe(before.counts.associates);
    expect(after.associates.every((view) => view.associate.tenure === null)).toBe(true);
  });

  it('says when an older Tenured Workforce file was brought in after a newer one', async () => {
    await bringIn('associates', FILES.associates);
    pick(FILES.tenureNew);
    const first = await call('files:import', { kind: 'tenure', path: FILES.tenureNew });
    const firstResult = (first.value as { tenure: Record<string, unknown> }).tenure;
    expect(firstResult.older).toBe(false);
    expect(firstResult.keptWeek).toMatch(/^Week \d+, \d{4}$/);
    expect(firstResult.associates).toBe(78);

    pick(FILES.tenureOld);
    const second = await call('files:import', { kind: 'tenure', path: FILES.tenureOld });
    const secondResult = (second.value as { tenure: Record<string, unknown> }).tenure;
    // Whatever the weeks are, the answer matches what is kept: an older file never rolls back.
    const snap = await snapshot();
    expect(secondResult.kept).toBe(snap.tenure.records);
    expect(secondResult.keptWeek).toBe(snap.tenure.weekLabel);
    expect(secondResult.older).toBe(
      secondResult.fileWeek !== secondResult.keptWeek &&
        weekNumber(secondResult.fileWeek as string) < weekNumber(secondResult.keptWeek as string),
    );
    expect(String(secondResult.fileName)).toContain('Tenured_Workforce_DA_');
  });

  it('reads the tenure file only when the person chose it, and passes on the reader’s words', async () => {
    const sneaked = await call('files:import', { kind: 'tenure', path: FILES.tenureNew });
    expect(sneaked).toEqual({ ok: false, reason: 'not-allowed' });

    pick(FILES.vehicles);
    const wrong = await call('files:import', { kind: 'tenure', path: FILES.vehicles });
    expect(wrong).toMatchObject({ ok: false, reason: 'refused' });
    expect(String(wrong.message).length).toBeGreaterThan(10);
    expect((await snapshot()).tenure.records).toBe(0);
  });
});

describe('every one of these is a command that tells the pages', () => {
  it('counts as a change, so every page reads the data again', async () => {
    await bringIn('vehicles', FILES.vehicles);
    const before = changes;
    await call('vehicles:clear-priorities');
    await call('dwp:clear');
    expect(changes).toBe(before + 2);
    await call('state:snapshot');
    expect(changes).toBe(before + 2);
  });
});

/** "Week 34, 2026" as a number to compare. */
function weekNumber(label: string): number {
  const match = /Week (\d+), (\d+)/.exec(label);
  return match ? Number(match[2]) * 100 + Number(match[1]) : 0;
}
