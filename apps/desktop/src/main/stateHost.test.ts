// The day's data held in the main process, driven through the real channel handlers with a
// stand-in for Electron's message bus. Uses only the made-up fixture files.

import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { AppSnapshot } from '../shared/snapshot';
import { StateHost } from './appState';
import type { ChannelEnv, ChannelEvent, IpcLike } from './channels';
import { DataSource } from './dataSource';
import { registerAllChannels } from './handlers';
import type { HandlerContext, Services } from './handlers';

const fixtures = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
  '..',
  '..',
  'packages',
  'fixtures',
);
const fixture = (...parts: string[]) => path.join(fixtures, ...parts);

const TODAY = '2026-09-11';
const OWN = 'file:///app/index.html';
const good: ChannelEvent = { senderFrame: { url: OWN, parent: null } };

interface Rig {
  host: StateHost;
  source: DataSource;
  call: (name: string, input?: unknown) => Promise<{ ok: boolean; [key: string]: unknown }>;
  changes: () => number;
  logs: string[];
  picks: { next: string | null };
  switchTo: (demo: boolean) => void;
}

let folder: string;
let rig: Rig;

function makeRig(): Rig {
  const source = new DataSource({
    dataFolder: path.join(folder, 'data'),
    fixtureDb: fixture('v1', 'loadout.db'),
    tempFolder: folder,
  });
  const host = new StateHost(source, () => TODAY);
  source.open(false);
  host.rebuild();

  const handlers = new Map<string, (event: ChannelEvent, input: unknown) => unknown>();
  const ipc: IpcLike = {
    handle: (name, listener) => void handlers.set(name, listener),
    on: (name, listener) => void handlers.set(name, listener),
  };
  const picks = { next: null as string | null };
  const logs: string[] = [];
  let changes = 0;
  const services = {
    pickFile: async () => picks.next,
  } as unknown as Services;
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
    log: (line) => logs.push(line),
    afterCommand: () => {
      changes += 1;
      host.bump();
    },
  };
  registerAllChannels(ipc, env);

  return {
    host,
    source,
    logs,
    picks,
    changes: () => changes,
    call: async (name, input) => {
      const handler = handlers.get(name);
      if (!handler) throw new Error(`no handler for ${name}`);
      return (await handler(good, input)) as { ok: boolean; [key: string]: unknown };
    },
    switchTo: (demo) => {
      source.open(demo);
      host.rebuild();
    },
  };
}

beforeEach(() => {
  folder = mkdtempSync(path.join(tmpdir(), 'loadout-host-test-'));
  rig = makeRig();
});

afterEach(() => {
  rig.source.close();
  rmSync(folder, { recursive: true, force: true });
});

async function snapshot(): Promise<AppSnapshot> {
  const reply = await rig.call('state:snapshot');
  expect(reply.ok).toBe(true);
  return reply.value as AppSnapshot;
}

/** Every object inside is plain data or a Map, Set or Date: nothing a clone would strip. */
function classInstances(value: unknown, where = 'snapshot', found: string[] = []): string[] {
  if (value === null || typeof value !== 'object') return found;
  if (value instanceof Date) return found;
  if (value instanceof Map) {
    for (const [k, v] of value) {
      classInstances(k, `${where}.key`, found);
      classInstances(v, `${where}.value`, found);
    }
    return found;
  }
  if (value instanceof Set) {
    for (const v of value) classInstances(v, `${where}.item`, found);
    return found;
  }
  const proto = Object.getPrototypeOf(value) as unknown;
  if (!Array.isArray(value) && proto !== Object.prototype && proto !== null) {
    found.push(`${where} is a ${(proto as { constructor?: { name?: string } }).constructor?.name}`);
    return found;
  }
  for (const [key, inner] of Object.entries(value)) classInstances(inner, `${where}.${key}`, found);
  return found;
}

describe('the day’s data in the main process', () => {
  it('starts empty on a new computer', async () => {
    const empty = await snapshot();
    expect(empty.mode).toBe('real');
    expect(empty.roster.rows).toEqual([]);
    expect(empty.counts.rosterRows).toBe(0);
    expect(empty.today).toBe(TODAY);
  });

  it('shows the demo roster’s rows in demo mode, and drops them when demo mode goes off', async () => {
    rig.switchTo(true);
    const demo = await snapshot();
    const expected = rig.source.getInfo().counts.driver_rows ?? 0;
    expect(expected).toBeGreaterThan(0);
    expect(demo.mode).toBe('demo');
    expect(demo.roster.rows).toHaveLength(expected);
    expect(demo.counts.rosterRows).toBe(expected);
    expect(demo.counts.associates).toBe(rig.source.getInfo().counts.associates);
    expect(demo.counts.vehicles).toBe(rig.source.getInfo().counts.vehicles);

    rig.switchTo(false);
    expect((await snapshot()).roster.rows).toEqual([]);
  });

  it('draws every roster row with its match, check text and van method', async () => {
    rig.switchTo(true);
    const demo = await snapshot();
    const first = demo.roster.rows[0]!;
    expect(first.index).toBe(0);
    expect(first.row.driver).not.toBe('');
    expect(typeof first.check).toBe('string');
    expect(Array.isArray(first.issues)).toBe(true);
    expect(demo.roster.rows.some((row) => row.associateId !== '')).toBe(true);
    expect(demo.roster.rows.some((row) => row.check === 'OK')).toBe(true);
    expect(demo.counts.matched).toBeGreaterThan(0);
  });

  it('crosses to the page as plain data: no class instance survives a clone', async () => {
    rig.switchTo(true);
    const demo = await snapshot();
    expect(classInstances(demo)).toEqual([]);
    expect(structuredClone(demo)).toEqual(demo);
  });

  it('still crosses cleanly with every kind of file brought in', async () => {
    const steps: Array<[string, string[]]> = [
      ['associates', ['associates', 'AssociateData.csv']],
      ['tenure', ['tenure', 'Tenured_Workforce_DA_1756800000.csv']],
      ['vehicles', ['vehicles', 'VehiclesData.xlsx']],
      ['loadout', ['loadout-sheets', '2026_09_14_12_15_loadout_sheet.xlsx']],
      ['dwp', ['dwp', 'DWP_DSP-XXXX_09-11-2026.xlsx']],
      ['routes', ['routes', 'Routes_XXX1_2026-09-01_12_20 (CDT).xlsx']],
      ['itineraries', ['itineraries', 'Itineraries_XXX1_2026-10-03_21_36 (CDT).xlsx']],
      ['schedule', ['schedules', 'Week-38-Schedule.xlsx']],
    ];
    for (const [kind, parts] of steps) {
      rig.picks.next = fixture(...parts);
      const picked = await rig.call('files:pick', { kind });
      expect(picked).toEqual({ ok: true, value: { path: rig.picks.next } });
      const done = await rig.call('files:import', { kind, path: rig.picks.next });
      expect(done.ok, `${kind}: ${JSON.stringify(done)}`).toBe(true);
      expect((done.value as { rows: number }).rows).toBeGreaterThan(0);
    }
    const full = await snapshot();
    expect(full.counts.rosterRows).toBeGreaterThan(0);
    expect(full.counts.associates).toBeGreaterThan(0);
    expect(full.counts.vehicles).toBeGreaterThan(0);
    expect(full.counts.dwpRows).toBeGreaterThan(0);
    expect(full.tenure.records).toBeGreaterThan(0);
    expect(full.counts.routeRows.routes).toBeGreaterThan(0);
    expect(full.counts.routeRows.schedule).toBeGreaterThan(0);
    expect(full.routeSets.map((set) => set.label)).toEqual([
      'Routes',
      'Itineraries',
      'Weekly Schedule',
    ]);
    expect(full.routeSets[0]!.pads).toBeInstanceOf(Map);
    expect(classInstances(full)).toEqual([]);
    expect(structuredClone(full)).toEqual(full);
    // What was brought in is now saved: a fresh state on the same data sees it.
    rig.source.open(false);
    rig.host.rebuild();
    expect((await snapshot()).counts.rosterRows).toBe(full.counts.rosterRows);
  });
});

describe('bringing in a file', () => {
  it('refuses a file nobody picked', async () => {
    const reply = await rig.call('files:import', {
      kind: 'vehicles',
      path: fixture('vehicles', 'VehiclesData.xlsx'),
    });
    expect(reply).toEqual({ ok: false, reason: 'not-allowed' });
    expect((await snapshot()).counts.vehicles).toBe(0);
  });

  it('gives back the reader’s own words when it refuses a file, and changes nothing', async () => {
    const wrong = fixture('vehicles', 'VehiclesData.xlsx');
    rig.picks.next = wrong;
    await rig.call('files:pick', { kind: 'dwp' });
    const reply = await rig.call('files:import', { kind: 'dwp', path: wrong });
    expect(reply.ok).toBe(false);
    expect(reply.reason).toBe('refused');
    expect(String(reply.message).length).toBeGreaterThan(10);
    expect((await snapshot()).counts.dwpRows).toBe(0);
    // The words are for the person. The log carries the code only.
    expect(rig.logs.join('\n')).toContain('files:import did not run: refused');
    expect(rig.logs.join('\n')).not.toContain(String(reply.message));
  });

  it('reads a dropped file through its token, once, and never hands back its place', async () => {
    const sheet = fixture('loadout-sheets', '2026_09_14_12_15_loadout_sheet.xlsx');
    const dropped = await rig.call('files:dropped', {
      page: 'load-out',
      kind: 'loadout',
      path: sheet,
    });
    expect(dropped.ok).toBe(true);
    const token = (dropped.value as { token: string }).token;
    expect(token).toMatch(/^dropped-[0-9a-f-]+\/2026_09_14_12_15_loadout_sheet\.xlsx$/);
    expect(token).not.toContain(path.dirname(sheet));
    // Dropping changes nothing by itself.
    expect((await snapshot()).counts.rosterRows).toBe(0);
    expect(rig.changes()).toBe(0);

    const done = await rig.call('files:import', { kind: 'loadout', path: token });
    expect(done.ok).toBe(true);
    expect((await snapshot()).counts.rosterRows).toBeGreaterThan(0);
    // Good for one import only, and never for the place itself.
    expect(await rig.call('files:import', { kind: 'loadout', path: token })).toEqual({
      ok: false,
      reason: 'not-allowed',
    });
    expect(await rig.call('files:import', { kind: 'loadout', path: sheet })).toEqual({
      ok: false,
      reason: 'not-allowed',
    });
    expect(rig.logs.join('\n')).not.toContain('loadout_sheet');
  });

  it('refuses a dropped file of the wrong kind in plain words, and a kind the page does not take', async () => {
    const vehicles = fixture('vehicles', 'VehiclesData.xlsx');
    const csv = await rig.call('files:dropped', {
      page: 'load-out',
      kind: 'loadout',
      path: fixture('associates', 'AssociateData.csv'),
    });
    expect(csv).toEqual({
      ok: false,
      reason: 'refused',
      message: "That file doesn't look like a load-out sheet. It should end in .xlsx.",
    });
    expect(
      await rig.call('files:dropped', { page: 'load-out', kind: 'vehicles', path: vehicles }),
    ).toEqual({ ok: false, reason: 'not-allowed' });
    // A token from one kind does not bring in another.
    const token = (
      (await rig.call('files:dropped', { page: 'vehicle-data', kind: 'vehicles', path: vehicles }))
        .value as { token: string }
    ).token;
    expect(await rig.call('files:import', { kind: 'dwp', path: token })).toEqual({
      ok: false,
      reason: 'not-allowed',
    });
    expect(rig.logs.join('\n')).not.toContain('AssociateData');
    expect(rig.logs.join('\n')).not.toContain("doesn't look like");
  });

  it('closing the file window picks nothing', async () => {
    rig.picks.next = null;
    expect(await rig.call('files:pick', { kind: 'loadout' })).toEqual({
      ok: true,
      value: { path: null },
    });
  });

  it('refuses a kind that does not exist', async () => {
    expect(await rig.call('files:pick', { kind: 'photos' })).toEqual({
      ok: false,
      reason: 'bad-input',
    });
  });

  it('reads the weekly schedule for the load-out day', async () => {
    rig.picks.next = fixture('loadout-sheets', '2026_09_14_12_15_loadout_sheet.xlsx');
    await rig.call('files:pick', { kind: 'loadout' });
    await rig.call('files:import', { kind: 'loadout', path: rig.picks.next });
    expect((await snapshot()).loadOutDate).not.toBeNull();
  });
});

describe('commands', () => {
  it('count as a change, and queries do not', async () => {
    await rig.call('state:snapshot');
    expect(rig.changes()).toBe(0);
    await rig.call('loadOut:clear-previous-roster');
    expect(rig.changes()).toBe(1);
  });

  it('forgets the previous roster', async () => {
    rig.switchTo(true);
    rig.host.state.moveToPreviousRoster();
    const before = await snapshot();
    expect(before.counts.previousRosterRows).toBeGreaterThan(0);
    const revision = before.revision;

    expect(await rig.call('loadOut:clear-previous-roster')).toEqual({ ok: true, value: null });
    const after = await snapshot();
    expect(after.counts.previousRosterRows).toBe(0);
    expect(after.previousRoster.rows).toEqual([]);
    expect(after.revision).toBeGreaterThan(revision);
  });

  it('says the saved data is not open when it is not', async () => {
    rig.source.close();
    rig.host.rebuild();
    expect(await rig.call('state:snapshot')).toEqual({ ok: false, reason: 'no-data' });
    expect(await rig.call('loadOut:clear-previous-roster')).toEqual({
      ok: false,
      reason: 'no-data',
    });
  });
});

describe('column layouts', () => {
  it('start empty, then keep what was set, per table', async () => {
    expect(await rig.call('layout:get', { view: 'roster' })).toEqual({
      ok: true,
      value: { order: [], widths: {} },
    });
    const set = await rig.call('layout:set', {
      view: 'roster',
      order: ['vehicle', 'driver'],
      widths: { driver: 180 },
    });
    expect(set).toEqual({ ok: true, value: null });
    expect(await rig.call('layout:get', { view: 'roster' })).toEqual({
      ok: true,
      value: { order: ['vehicle', 'driver'], widths: { driver: 180 } },
    });
    expect((await rig.call('layout:get', { view: 'vehicles' })).value).toEqual({
      order: [],
      widths: {},
    });
  });

  it('survives closing and opening the data again', async () => {
    await rig.call('layout:set', { view: 'roster', order: ['a', 'b'], widths: { b: 90 } });
    rig.source.open(false);
    rig.host.rebuild();
    expect((await rig.call('layout:get', { view: 'roster' })).value).toEqual({
      order: ['a', 'b'],
      widths: { b: 90 },
    });
  });

  it('putting the table back to usual clears it', async () => {
    await rig.call('layout:set', { view: 'roster', order: ['a', 'b'], widths: { b: 90 } });
    await rig.call('layout:set', { view: 'roster', order: [], widths: {} });
    expect((await rig.call('layout:get', { view: 'roster' })).value).toEqual({
      order: [],
      widths: {},
    });
  });

  it('is not a change to the day’s data', async () => {
    await rig.call('layout:set', { view: 'roster', order: ['a'], widths: {} });
    expect(rig.changes()).toBe(0);
  });

  it('refuses a layout of the wrong shape', async () => {
    for (const input of [
      { view: 'roster', order: 'a', widths: {} },
      { view: 'roster', order: [], widths: { a: 'wide' } },
      { view: '', order: [], widths: {} },
      { order: [], widths: {} },
    ]) {
      expect(await rig.call('layout:set', input)).toEqual({ ok: false, reason: 'bad-input' });
    }
  });
});
