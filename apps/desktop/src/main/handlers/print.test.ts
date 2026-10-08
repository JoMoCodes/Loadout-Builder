// The Print tab's and the exports' channels, driven through the real handlers on the made-up demo
// day, with stand-ins for the save window and for opening a file.

import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { printing, sheetExport } from '@loadout/core';
import { importLoadoutSheet } from '@loadout/core/importers';
import type { PrintRowsView } from '../../shared/channels/print';
import { StateHost } from '../appState';
import type { ChannelEnv, ChannelEvent, IpcLike } from '../channels';
import { DataSource } from '../dataSource';
import { inkPdf, inkWorkbook } from '../print/inspect';
import { registerAllChannels } from '.';
import type { HandlerContext, Services } from '.';
import type { SaveFileOptions } from './types';

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

const OWN = 'file:///app/index.html';
const good: ChannelEvent = { senderFrame: { url: OWN, parent: null } };

interface Rig {
  call: (name: string, input?: unknown) => Promise<{ ok: boolean; [key: string]: unknown }>;
  host: StateHost;
  source: DataSource;
  logs: string[];
  saves: SaveFileOptions[];
  opened: string[];
  next: { save: string | null; opens: boolean };
  changes: () => number;
}

let folder: string;
let rig: Rig;

function makeRig(): Rig {
  const source = new DataSource({
    dataFolder: path.join(folder, 'data'),
    fixtureDb: path.join(fixtures, 'v1', 'loadout.db'),
    tempFolder: folder,
  });
  const host = new StateHost(source, () => '2026-09-11');
  source.open(true);
  host.rebuild();
  const handlers = new Map<string, (event: ChannelEvent, input: unknown) => unknown>();
  const ipc: IpcLike = {
    handle: (name, listener) => void handlers.set(name, listener),
    on: (name, listener) => void handlers.set(name, listener),
  };
  const logs: string[] = [];
  const saves: SaveFileOptions[] = [];
  const opened: string[] = [];
  const next = { save: null as string | null, opens: true };
  let changes = 0;
  const services = {
    chooseSaveFile: async (options: SaveFileOptions) => {
      saves.push(options);
      return next.save;
    },
    openFile: async (file: string) => {
      opened.push(file);
      return next.opens;
    },
    tempFolder: () => folder,
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
    },
  };
  registerAllChannels(ipc, env);
  return {
    host,
    source,
    logs,
    saves,
    opened,
    next,
    changes: () => changes,
    call: async (name, input) => {
      const handler = handlers.get(name);
      if (!handler) throw new Error(`no handler for ${name}`);
      return (await handler(good, input)) as { ok: boolean; [key: string]: unknown };
    },
  };
}

beforeEach(() => {
  folder = mkdtempSync(path.join(tmpdir(), 'loadout-print-handlers-'));
  rig = makeRig();
});

afterEach(() => {
  rig.source.close();
  rmSync(folder, { recursive: true, force: true });
});

const saved = (spec: printing.PrintSpec) => printing.specToDict(spec);

async function rows(): Promise<PrintRowsView> {
  const reply = await rig.call('print:rows');
  expect(reply.ok).toBe(true);
  return reply.value as PrintRowsView;
}

describe('what the Print tab reads', () => {
  it('is the core’s own print rows for today, with the day and the shift types', async () => {
    const view = await rows();
    expect(view.rosterEmpty).toBe(false);
    expect(view.rows).toEqual(rig.host.state.printRows('2026-09-11'));
    expect(view.dateLabel).toMatch(/\d{4}$/);
    const total = view.shiftCounts.reduce((sum, [, count]) => sum + count, 0);
    expect(total).toBe(view.rows.length);
    const names = view.shiftCounts.map(([name]) => name.toLowerCase());
    expect(names).toEqual([...names].sort());
    expect(rig.changes()).toBe(0);
  });
});

describe('the layout on the tab', () => {
  it('is kept, read back the way a saved layout is, without announcing a change', async () => {
    const spec = printing.createPrintSpec({
      columns: [printing.createPrintColumn({ field: 'driver' })],
      title: 'Yard Sheet',
      scale: 900,
    });
    const reply = await rig.call('print:set-spec', { spec: { ...saved(spec), paper: 'napkin' } });
    expect(reply.ok).toBe(true);
    const kept = reply.value as printing.PrintSpec;
    expect(kept.scale).toBe(printing.SCALE_MAX);
    expect(kept.paper).toBe('letter');
    expect(rig.host.state.printSpec()).toEqual(kept);
    expect(rig.changes()).toBe(0);
  });

  it("keeps who is left off when tomorrow's sheet is brought in", async () => {
    const view = await rows();
    const key = view.rows[0]!.key;
    const spec = {
      ...saved(printing.defaultSpec()),
      excluded_drivers: [key, 'id:SOMEONE-NOT-HERE'],
    };
    await rig.call('print:set-spec', { spec });
    const sheet = importLoadoutSheet(
      path.join(fixtures, 'loadout-sheets', '2026_09_14_12_15_loadout_sheet.xlsx'),
    );
    rig.host.state.importRoster(await sheet);
    expect(rig.host.state.printSpec().excludedDrivers).toEqual([key, 'id:SOMEONE-NOT-HERE']);
  });

  it('refuses a layout that is not a layout at all', async () => {
    expect(await rig.call('print:set-spec', { spec: 'everything' })).toEqual({
      ok: false,
      reason: 'bad-input',
    });
  });

  it('refuses a layout name made only of spaces, in plain words', async () => {
    const before = rig.host.state.printPresets();
    const reply = await rig.call('print:save-preset', {
      name: '   ',
      spec: saved(printing.defaultSpec()),
    });
    expect(reply).toMatchObject({ ok: false, reason: 'refused' });
    expect(String(reply.message)).toContain('name');
    expect(rig.host.state.printPresets()).toEqual(before);
  });

  it('saves, lists, loads and deletes named layouts; Reset keeps them', async () => {
    const yard = printing.createPrintSpec({ columns: printing.vansColumns(), title: 'Yard Sheet' });
    const saveReply = await rig.call('print:save-preset', {
      name: ' Yard Sheet ',
      spec: saved(yard),
    });
    expect(saveReply.value).toContain('Yard Sheet');
    await rig.call('print:save-preset', {
      name: 'Check-in Sheet',
      spec: saved(printing.defaultSpec()),
    });
    expect(rig.host.state.printPresets()).toEqual(
      expect.arrayContaining(['Yard Sheet', 'Check-in Sheet']),
    );

    const loaded = await rig.call('print:load-preset', { name: 'Yard Sheet' });
    expect((loaded.value as printing.PrintSpec).title).toBe('Yard Sheet');
    expect(rig.host.state.printSpec().title).toBe('Yard Sheet');

    const reset = await rig.call('print:reset');
    expect(reset.value).toEqual(printing.defaultSpec());
    expect(rig.host.state.printPresets()).toContain('Yard Sheet');

    const left = await rig.call('print:delete-preset', { name: 'Yard Sheet' });
    expect(left.value).not.toContain('Yard Sheet');
    expect(rig.host.state.printSpec()).toEqual(printing.defaultSpec());

    expect(await rig.call('print:load-preset', { name: 'Yard Sheet' })).toEqual({
      ok: false,
      reason: 'refused',
      message: 'That saved layout is not there any more.',
    });
  });
});

describe('Print Page and Print Vans', () => {
  it('ask where to save, offering the old file name, and write the PDF there', async () => {
    const file = path.join(folder, 'sheet.pdf');
    rig.next.save = file;
    const reply = await rig.call('print:print', {
      spec: saved(printing.defaultSpec()),
      vans: false,
      openAfter: true,
    });
    expect(reply.ok).toBe(true);
    const view = await rows();
    const done = reply.value as { status: string; drivers: number; pages: number; leftOff: number };
    expect(done).toMatchObject({ status: 'written', fileName: 'sheet.pdf', leftOff: 0 });
    expect(done.drivers).toBe(view.rows.length);
    expect(rig.saves[0]).toMatchObject({
      title: 'Print page',
      defaultName: `Load Out - ${view.dateLabel}`,
    });
    const pdf = await inkPdf(new Uint8Array(readFileSync(file)));
    expect(pdf.pages).toHaveLength(done.pages);
    expect(rig.opened).toEqual([file]);
  });

  it('cut the sheet down for Print Vans: two columns, van order, only drivers with a van', async () => {
    const file = path.join(folder, 'vans.xlsx');
    rig.next.save = file;
    const reply = await rig.call('print:print', {
      spec: saved(printing.defaultSpec()),
      vans: true,
      openAfter: false,
    });
    const done = reply.value as { drivers: number; leftOff: number };
    const view = await rows();
    const withVan = view.rows.filter((r) => r.values.vehicle).length;
    expect(done.drivers).toBe(withVan);
    expect(done.leftOff).toBe(view.rows.length - withVan);
    expect(rig.saves[0]!.defaultName).toBe(`Vans - ${view.dateLabel}`);
    const [sheet] = await inkWorkbook(new Uint8Array(readFileSync(file)));
    const headings = sheet!.cells.filter((c) => /^[A-Z]3$/.test(c.address)).map((c) => c.value);
    expect(headings).toEqual(['Driver', 'Vehicle']);
    expect(rig.opened).toEqual([]);
  });

  it('write nothing when the save window is closed', async () => {
    rig.next.save = null;
    const reply = await rig.call('print:print', {
      spec: saved(printing.defaultSpec()),
      vans: false,
      openAfter: true,
    });
    expect(reply.value).toEqual({ status: 'cancelled' });
    expect(rig.opened).toEqual([]);
  });

  it('add .pdf to a name typed without one, and refuse a kind of file it cannot write', async () => {
    rig.next.save = path.join(folder, 'no-extension');
    const reply = await rig.call('print:print', {
      spec: saved(printing.defaultSpec()),
      vans: false,
      openAfter: false,
    });
    expect((reply.value as { fileName: string }).fileName).toBe('no-extension.pdf');
    rig.next.save = path.join(folder, 'sheet.csv');
    expect(
      await rig.call('print:print', {
        spec: saved(printing.defaultSpec()),
        vans: false,
        openAfter: false,
      }),
    ).toMatchObject({
      ok: false,
      reason: 'refused',
      message: expect.stringContaining('.pdf or .xlsx'),
    });
  });

  it('say so when everybody is left off', async () => {
    rig.next.save = path.join(folder, 'x.pdf');
    const view = await rows();
    const spec = {
      ...saved(printing.defaultSpec()),
      excluded_drivers: view.rows.map((r) => r.key),
    };
    const reply = await rig.call('print:print', { spec, vans: false, openAfter: false });
    expect(reply).toMatchObject({ ok: false, reason: 'refused' });
    expect(String(reply.message)).toContain('Nobody is left to print.');
    expect(existsSync(path.join(folder, 'x.pdf'))).toBe(false);
  });

  it('Preview writes one throwaway PDF and opens it', async () => {
    const reply = await rig.call('print:preview', { spec: saved(printing.defaultSpec()) });
    const file = path.join(folder, 'Loadout Builder preview.pdf');
    expect(reply).toMatchObject({ ok: true, value: { openFailed: false } });
    expect(existsSync(file)).toBe(true);
    expect(rig.opened).toEqual([file]);
    expect(rig.saves).toEqual([]);
  });

  it('log the channel and the outcome only, never a name', async () => {
    rig.next.save = path.join(folder, 'sheet.pdf');
    await rig.call('print:print', {
      spec: saved(printing.defaultSpec()),
      vans: false,
      openAfter: false,
    });
    const view = await rows();
    const names = view.rows.map((r) => r.values.driver).filter(Boolean);
    for (const line of rig.logs) {
      for (const name of names) expect(line).not.toContain(name);
      expect(line).not.toContain(folder);
    }
  });
});

describe('the two fixed exports', () => {
  it('adds .pdf to a name typed without one, but never writes over a file that way', async () => {
    rig.next.save = path.join(folder, 'typed');
    const first = await rig.call('print:export', { withDwp: false });
    expect(first.value).toMatchObject({ status: 'written', fileName: 'typed.pdf' });
    expect(existsSync(path.join(folder, 'typed.pdf'))).toBe(true);
    rig.next.save = path.join(folder, 'typed');
    const again = await rig.call('print:export', { withDwp: false });
    expect(again).toMatchObject({ ok: false, reason: 'refused' });
    expect(String(again.message)).toContain('already a file called typed.pdf');
  });

  it('starts the save window in the old Schedule Data folder when the sheet is gone', async () => {
    rig.next.save = null;
    await rig.call('print:export', { withDwp: false });
    expect(rig.saves.at(-1)).toMatchObject({ startIn: 'schedule-data' });
  });

  it('Export Roster writes every driver to the file chosen, named after the day', async () => {
    const file = path.join(folder, 'roster.xlsx');
    rig.next.save = file;
    const reply = await rig.call('print:export', { withDwp: false });
    const view = await rows();
    expect(reply.value).toMatchObject({ status: 'written', drivers: view.rows.length });
    expect(rig.saves[0]).toMatchObject({
      title: 'Export roster',
      defaultName: sheetExport.defaultFilename(rig.host.state.roster, false),
    });
    const [sheet] = await inkWorkbook(new Uint8Array(readFileSync(file)));
    expect(sheet!.cells.filter((c) => c.address.startsWith('B')).length).toBe(view.rows.length + 1);
  });

  it('Export with DWP points at Bring Over DWP when nobody carries bags, OVS or staging', async () => {
    const state = rig.host.state;
    for (const row of state.roster.rows) {
      row.bags = '';
      row.ovs = '';
      row.stagingLocation = '';
    }
    const reply = await rig.call('print:export', { withDwp: true });
    expect(reply.ok).toBe(true);
    expect(reply.value).toEqual({
      status: 'nothing',
      reason: state.dwp.rows.length > 0 ? 'no-dwp-on-roster' : 'no-dwp-sheet',
    });
    expect(rig.saves).toEqual([]);
  });

  it('Export with DWP writes the DWP version when the roster carries it', async () => {
    const state = rig.host.state;
    const first = state.roster.rows[0]!;
    first.bags = '12';
    first.stagingLocation = 'STG.G02';
    const file = path.join(folder, 'dwp.pdf');
    rig.next.save = file;
    const reply = await rig.call('print:export', { withDwp: true });
    expect(reply.value).toMatchObject({ status: 'written', fileName: 'dwp.pdf' });
    expect((reply.value as { carryingDwp: number }).carryingDwp).toBeGreaterThanOrEqual(1);
    expect(rig.saves[0]!.defaultName).toMatch(/^Load Out with DWP - /);
    const pdf = await inkPdf(new Uint8Array(readFileSync(file)));
    expect(pdf.pages[0]!.texts.slice(0, 8).map((t) => t.text)).toEqual([
      'Driver',
      'Vehicle',
      'Shift Type',
      'Routes',
      'Bags',
      'OVS',
      'Staging',
      'PAD',
    ]);
  });
});
