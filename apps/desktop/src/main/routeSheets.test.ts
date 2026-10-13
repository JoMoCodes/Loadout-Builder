// The route sheets, driven through the real channel handlers on a temporary database with
// stand-ins for the file and folder windows, the computer's safe storage and the email server.
// Uses only the made-up files in packages/fixtures, and checks the answers against what the old
// Route Sheet Distributor's own code said about the same files (scripts/parity/rsd/expected).

import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { clockKey, type Decision, type Distribution } from '@loadout/route-sheets';
import { RouteSheetsStore, type StoredRun } from '@loadout/storage';
import { PDFDocument } from 'pdf-lib';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import type {
  EmailRoutesResult,
  ExportAllResult,
  RouteSheetsDistributionView,
  RouteSheetsPreview,
  RouteSheetsRunListing,
  RouteSheetsStateView,
} from '../shared/routeSheets';
import { mergeSettings, type AppSettings } from '../shared/settings';
import type { AppSnapshot } from '../shared/snapshot';
import { StateHost } from './appState';
import type { ChannelEnv, ChannelEvent, IpcLike } from './channels';
import { DataSource } from './dataSource';
import { registerAllChannels } from './handlers';
import type { HandlerContext, Services } from './handlers';
import { EmailAccount } from './mail/emailAccount';
import type { MailMessage, MailTransport, SmtpConfig } from './mail/mailer';
import { PDF_MISSING } from './routeSheets/host';
import { SettingsFile } from './settingsFile';

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, '..', '..', '..', '..');
const fixtures = path.join(repo, 'packages', 'fixtures');
const fixture = (...parts: string[]) => path.join(fixtures, ...parts);
const expectedDir = path.join(repo, 'scripts', 'parity', 'rsd', 'expected', '2026-09-01');
const expected = <T>(name: string): T =>
  JSON.parse(readFileSync(path.join(expectedDir, name), 'utf8')) as T;

const ROUTES_FILE = fixture('routes', 'Routes_XXX1_2026-09-01_12_20 (CDT).xlsx');
const DRIVERS_FILE = fixture('associates', 'AssociateData.csv');
const PDF_FILE = fixture('route-sheets', '2026-09-01.pdf');
const RUN_ID = 'XXX1_2026-09-01_CYCLE1';

interface Inputs {
  routes: Array<{
    routeCode: string;
    drivers: Array<{ transporterId: string; driverName: string }>;
  }>;
  decisions: Record<string, Decision>;
  wavePads: Record<string, string>;
  twists: {
    inactiveId: string;
    missingId: string;
    noIdRoute: string;
    wrongNameRoute: string;
    noEmailId: string;
  };
}
const INPUTS = expected<Inputs>('inputs.json');

const OWN = 'file:///app/index.html';
const good: ChannelEvent = { senderFrame: { url: OWN, parent: null } };

interface FakeTransport extends MailTransport {
  config: SmtpConfig;
  sent: MailMessage[];
  closed: boolean;
  verified: number;
}

interface Rig {
  host: StateHost;
  source: DataSource;
  account: EmailAccount;
  call: (name: string, input?: unknown) => Promise<{ ok: boolean; [key: string]: unknown }>;
  ok: <T>(name: string, input?: unknown) => Promise<T>;
  logs: string[];
  clock: { today: string };
  picks: { next: string | null };
  /** What the next folder / save window answers. */
  dialog: { next: Array<string | null>; asked: string[] };
  opened: string[];
  mailto: string[];
  oldApp: { exists: boolean };
  transports: FakeTransport[];
  mail: { refuse: Set<string>; failConnect: boolean };
  base: string;
  settings: () => AppSettings;
  setSettings: (patch: unknown) => AppSettings;
  settingsFile: SettingsFile;
  switchTo: (demo: boolean) => void;
  rebuild: () => void;
}

let folder: string;
const rigs: Rig[] = [];

function makeRig(today = '2026-09-01'): Rig {
  const base = mkdtempSync(path.join(folder, 'rig-'));
  const file = new SettingsFile(path.join(base, 'settings.json'));
  let settings = file.load();
  const source = new DataSource({
    dataFolder: path.join(base, 'data'),
    fixtureDb: fixture('v1', 'loadout.db'),
    tempFolder: base,
  });
  const logs: string[] = [];
  const clock = { today };
  const host = new StateHost(source, () => clock.today, {
    log: (line) => logs.push(line),
    lastRouteSheetRun: {
      get: () => file.getMainOnly().lastRunId ?? null,
      set: (id) => void file.updateMainOnly((kept) => ({ ...kept, lastRunId: id })),
    },
  });
  source.open(false);
  host.rebuild();

  const transports: FakeTransport[] = [];
  const mail = { refuse: new Set<string>(), failConnect: false };
  const account = new EmailAccount({
    settings: () => settings.email,
    mainOnly: () => file.getMainOnly(),
    updateMainOnly: (change) => void file.updateMainOnly(change),
    sealer: {
      isEncryptionAvailable: () => true,
      encryptString: (plain) => Buffer.from(`sealed:${[...plain].reverse().join('')}`),
      decryptString: (sealed) => {
        const text = sealed.toString();
        if (!text.startsWith('sealed:')) throw new Error('not sealed here');
        return [...text.slice(7)].reverse().join('');
      },
    },
    transport: (config) => {
      const transport: FakeTransport = {
        config,
        sent: [],
        closed: false,
        verified: 0,
        verify: async () => {
          transport.verified++;
          if (mail.failConnect) {
            throw Object.assign(new Error('Invalid login'), { code: 'EAUTH', responseCode: 535 });
          }
        },
        send: async (message) => {
          if (mail.refuse.has(message.to.address)) {
            throw Object.assign(new Error('Mailbox unavailable'), {
              code: 'EENVELOPE',
              responseCode: 550,
            });
          }
          transport.sent.push(message);
        },
        close: () => {
          transport.closed = true;
        },
      };
      transports.push(transport);
      return transport;
    },
    log: (line) => logs.push(line),
  });

  const picks = { next: null as string | null };
  const dialog = { next: [] as Array<string | null>, asked: [] as string[] };
  const opened: string[] = [];
  const mailto: string[] = [];
  const oldApp = { exists: false };
  const setSettings = (patch: unknown) => {
    const before = settings;
    settings = mergeSettings(settings, patch);
    if (settings.demoMode !== before.demoMode) {
      source.open(settings.demoMode);
      host.rebuild();
    }
    file.save(settings);
    return settings;
  };
  const services = {
    getSettings: () => settings,
    setSettings,
    pickFile: async () => picks.next,
    tempFolder: () => base,
    openFile: async (place: string) => {
      opened.push(place);
      return true;
    },
    chooseFolder: async (title: string) => {
      dialog.asked.push(title);
      return dialog.next.length > 0 ? (dialog.next.shift() ?? null) : null;
    },
    chooseSaveFile: async (options: { title: string }) => {
      dialog.asked.push(options.title);
      return dialog.next.length > 0 ? (dialog.next.shift() ?? null) : null;
    },
    openMailApp: async (link: string) => {
      mailto.push(link);
      return true;
    },
    oldRouteSheetsFolderExists: () => oldApp.exists,
    emailAccount: account,
  } as unknown as Services;

  const handlers = new Map<string, (event: ChannelEvent, input: unknown) => unknown>();
  const ipc: IpcLike = {
    handle: (name, listener) => void handlers.set(name, listener),
    on: (name, listener) => void handlers.set(name, listener),
  };
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
    afterCommand: () => void host.bump(),
  };
  registerAllChannels(ipc, env);
  const call = async (name: string, input?: unknown) => {
    const handler = handlers.get(name);
    if (!handler) throw new Error(`no handler for ${name}`);
    return (await handler(good, input)) as { ok: boolean; [key: string]: unknown };
  };
  const rig: Rig = {
    host,
    source,
    account,
    call,
    ok: async <T>(name: string, input?: unknown) => {
      const reply = await call(name, input);
      expect(reply.ok, `${name}: ${JSON.stringify(reply).slice(0, 300)}`).toBe(true);
      return reply.value as T;
    },
    logs,
    clock,
    picks,
    dialog,
    opened,
    mailto,
    oldApp,
    transports,
    mail,
    base,
    settings: () => settings,
    setSettings,
    settingsFile: file,
    switchTo: (demo) => void setSettings({ demoMode: demo }),
    rebuild: () => host.rebuild(),
  };
  rigs.push(rig);
  return rig;
}

beforeAll(() => {
  folder = mkdtempSync(path.join(tmpdir(), 'loadout-route-sheets-test-'));
});

afterEach(() => {
  while (rigs.length > 0) rigs.pop()?.source.close();
});

afterAll(() => {
  rmSync(folder, { recursive: true, force: true });
});

async function bringIn(rig: Rig, kind: string, file: string) {
  rig.picks.next = file;
  await rig.ok('files:pick', { kind });
  return rig.call('files:import', { kind, path: file });
}

/** The fixture day: the Routes export, the driver list and the synthetic route sheet PDF. */
async function fixtureDay(rig: Rig): Promise<void> {
  expect((await bringIn(rig, 'routes', ROUTES_FILE)).ok).toBe(true);
  expect((await bringIn(rig, 'associates', DRIVERS_FILE)).ok).toBe(true);
  const pdf = await bringIn(rig, 'route-sheets', PDF_FILE);
  expect(pdf.ok, JSON.stringify(pdf).slice(0, 300)).toBe(true);
}

/**
 * The twists inputs.json gave the old app's lists (scripts/parity/rsd/inputs.mjs), made to the
 * app's own data in memory: one driver marked INACTIVE, one taken off the driver list, one email
 * blanked, one route's Transporter IDs blanked, one route given another person's name.
 */
function twist(rig: Rig): void {
  const state = rig.host.state;
  const { twists } = INPUTS;
  const rows = state.associates.rows;
  rows.splice(
    rows.findIndex((a) => a.transporterId === twists.missingId),
    1,
  );
  for (const a of rows) {
    if (a.transporterId === twists.inactiveId) a.status = 'INACTIVE';
    if (a.transporterId === twists.noEmailId) a.email = '';
  }
  const otherName = INPUTS.routes.find((r) => r.routeCode === twists.wrongNameRoute)!.drivers[0]!
    .driverName;
  for (const row of state.routeSet('routes').rows) {
    if (row.routeCode === twists.noIdRoute) {
      row.transporterId = '';
      row.sharedIds = '';
    }
    if (row.routeCode === twists.wrongNameRoute) {
      row.driverName = otherName;
      row.sharedDrivers = otherName;
    }
  }
}

/** The matcher's answer from the distribution reply (without what the page view adds). */
function matcherPart(view: RouteSheetsDistributionView): Distribution {
  const { routes, people, counts, waves } = view;
  return { routes, people, counts, waves };
}

/** Pins each dispatch time on the Route Data page to the pad inputs.json gave its wave. */
async function padsFromInputs(rig: Rig): Promise<void> {
  const pads: Record<string, number> = {};
  for (const row of rig.host.state.routeSet('routes').rows) {
    const wave = Object.keys(INPUTS.wavePads).find(
      (w) => clockKey(w) === clockKey(row.dispatchTime),
    );
    pads[row.dispatchTime] = wave ? Number(INPUTS.wavePads[wave]) : 0;
  }
  await rig.ok('routeData:set-pads', { kind: 'routes', pads });
}

async function decideFromInputs(rig: Rig): Promise<void> {
  for (const [routeCode, decision] of Object.entries(INPUTS.decisions)) {
    const { at: _at, ...choice } = decision;
    void _at;
    await rig.ok('routeSheets:set-decision', { routeCode, decision: choice });
  }
}

async function snapshot(rig: Rig): Promise<AppSnapshot> {
  return rig.ok<AppSnapshot>('state:snapshot');
}

/** The made-up Gmail setup, with a saved app password. */
function setUpEmail(rig: Rig): void {
  rig.setSettings({
    email: {
      fromAddress: 'dispatch@example.com',
      fromName: 'Dispatch',
      bccAddress: 'lead@example.com',
    },
  });
  rig.account.setPassword('abcd efgh ijkl mnop');
}

// -------------------------------------------------------------------------------- the join

describe('the join with the app’s own route data, driver list and pads', () => {
  it('a fixture day’s Routes export, the synthetic PDF and the fixture driver list give the parity harness’s distribution', async () => {
    const rig = makeRig();
    await fixtureDay(rig);
    // Every twist inputs.json applied is made to the app's data too, so every route is compared
    // exactly (nothing is compared on its state only).
    twist(rig);

    const undecided = await rig.ok<RouteSheetsDistributionView>('routeSheets:distribution');
    expect(matcherPart(undecided)).toEqual(expected('distribution-undecided.json'));

    // Pads come from the Route Data page: 10:20 and 10:25 get 1 and 2, the 2:30 pm wave none.
    await padsFromInputs(rig);
    await decideFromInputs(rig);
    const decided = await rig.ok<RouteSheetsDistributionView>('routeSheets:distribution');
    expect(matcherPart(decided)).toEqual(expected('distribution.json'));
    // Every wave on the PDF has a dispatch time in the route data, so no pad box is needed.
    expect(decided.typedPadWaves).toEqual([]);
    expect(decided.unsent).toEqual(
      decided.routes
        .filter((r) => r.state === 'ready' && r.recipients.every((p) => p.email))
        .map((r) => r.routeCode),
    );

    const counts = (await snapshot(rig)).routeSheets;
    expect(counts).toEqual({
      runId: RUN_ID,
      sheets: 29,
      ready: 21,
      needsDecision: 3,
      exceptions: 4,
      noSheet: 1,
      skipped: 1,
      unsent: decided.unsent.length,
      runs: 1,
    });
  });

  it('says which route data it reads, and asks for the Routes export when none is loaded', async () => {
    // A day the made-up Weekly Schedule covers.
    const rig = makeRig('2026-09-14');
    let state = await rig.ok<RouteSheetsStateView>('routeSheets:state');
    expect(state.routeData).toBeNull();
    expect(state.driverList).toEqual({
      count: 0,
      fileName: '',
      importedAt: null,
      refreshDueAt: null,
    });

    expect((await bringIn(rig, 'schedule', fixture('schedules', 'Week-38-Schedule.xlsx'))).ok).toBe(
      true,
    );
    // The Weekly Schedule names no route codes, so it cannot be matched.
    expect((await rig.ok<RouteSheetsStateView>('routeSheets:state')).routeData).toBeNull();

    const itineraries = fixture('itineraries', 'Itineraries_XXX1_2026-10-03_21_36 (CDT).xlsx');
    expect((await bringIn(rig, 'itineraries', itineraries)).ok).toBe(true);
    state = await rig.ok<RouteSheetsStateView>('routeSheets:state');
    expect(state.routeData).toEqual({
      kind: 'itineraries',
      label: 'Itineraries',
      fileName: path.basename(itineraries),
    });

    await fixtureDay(rig);
    state = await rig.ok<RouteSheetsStateView>('routeSheets:state');
    expect(state.routeData).toEqual({
      kind: 'routes',
      label: 'Routes',
      fileName: path.basename(ROUTES_FILE),
    });
    expect(state.run.routesFileName).toBe(path.basename(ROUTES_FILE));
    // The driver list's age, for the "over a month old" reminder.
    expect(state.driverList.count).toBeGreaterThan(50);
    expect(state.driverList.fileName).toBe('AssociateData.csv');
    const importedAt = state.driverList.importedAt!;
    const due = new Date(state.driverList.refreshDueAt!);
    const at = new Date(importedAt);
    expect(due.getDate()).toBe(at.getDate());
    expect((due.getMonth() - at.getMonth() + 12) % 12).toBe(1);

    // With no route data at all, every route sheet is "in the PDF but not on the routes file".
    await rig.ok('routeData:clear', { kind: 'routes' });
    await rig.ok('routeData:clear', { kind: 'itineraries' });
    const alone = await rig.ok<RouteSheetsDistributionView>('routeSheets:distribution');
    expect(new Set(alone.routes.map((r) => r.headline))).toContain(
      'Route is in the PDF but not on the routes file',
    );
    expect(alone.routes.every((r) => r.onRoutesFile === false)).toBe(true);
    // ...and every wave gets the old "Pad for each wave" box.
    expect(alone.typedPadWaves).toEqual(['10:20 AM', '10:25 AM', '02:30 PM']);
  });
});

// ------------------------------------------------------------------------- every channel

describe('every route sheets channel, through the real handlers', () => {
  it('brings in the PDF through files:pick, files:import and files:dropped, and refuses what is not one', async () => {
    const rig = makeRig();
    expect(
      (await rig.ok<{ path: string }>('files:pick', { kind: 'route-sheets' })).path,
    ).toBeNull();
    // A file nobody picked is not read.
    expect(await rig.call('files:import', { kind: 'route-sheets', path: PDF_FILE })).toEqual({
      ok: false,
      reason: 'not-allowed',
    });
    // Something that is not a route sheet PDF is refused in the old app's words.
    expect(await bringIn(rig, 'route-sheets', ROUTES_FILE)).toEqual({
      ok: false,
      reason: 'refused',
      message: `No route sheets were found in ${path.basename(ROUTES_FILE)}.`,
    });

    // Dropped on the Route Sheets page: only a .pdf, only as the route sheet kind.
    expect(
      await rig.call('files:dropped', {
        page: 'route-sheets',
        kind: 'route-sheets',
        path: ROUTES_FILE,
      }),
    ).toEqual({
      ok: false,
      reason: 'refused',
      message: "That file doesn't look like a route sheet PDF. It should end in .pdf.",
    });
    expect(
      await rig.call('files:dropped', { page: 'route-data', kind: 'route-sheets', path: PDF_FILE }),
    ).toEqual({ ok: false, reason: 'not-allowed' });
    const { token } = await rig.ok<{ token: string }>('files:dropped', {
      page: 'route-sheets',
      kind: 'route-sheets',
      path: PDF_FILE,
    });
    expect(token).toMatch(/2026-09-01\.pdf$/);
    const done = await rig.ok<{
      kind: string;
      rows: number;
      routeSheets: { message: string; warnings: string[]; runId: string };
    }>('files:import', { kind: 'route-sheets', path: token });
    expect(done.kind).toBe('route-sheets');
    expect(done.rows).toBe(29);
    expect(done.routeSheets.runId).toBe(RUN_ID);
    expect(done.routeSheets.message).toBe(
      'Read 29 route sheets from 2026-09-01.pdf — 1 did not pass the number check.',
    );
    expect(done.routeSheets.warnings.length).toBeGreaterThan(0);
    // The token is good for one import.
    expect((await rig.call('files:import', { kind: 'route-sheets', path: token })).ok).toBe(false);
    // The PDF is kept beside the database.
    expect(existsSync(path.join(rig.base, 'data', 'route-sheets', `${RUN_ID}.pdf`))).toBe(true);
    // Nothing that names the file or a person goes to the log.
    expect(rig.logs.join('\n')).not.toMatch(/2026-09-01\.pdf|@example\.com/);
  });

  it('reads the open run, History, and the old app’s folder; opens, starts and deletes runs', async () => {
    const rig = makeRig();
    let state = await rig.ok<RouteSheetsStateView>('routeSheets:state');
    expect(state.run).toMatchObject({
      id: 'draft',
      label: 'New run (no route sheet PDF yet)',
      saved: false,
      sheetCount: 0,
      pdfMissing: false,
    });
    expect(state.oldAppFolder).toBe(false);
    expect(state.emailProblem).toBe('Add the from address and the app password in Settings first.');
    rig.oldApp.exists = true;
    expect((await rig.ok<RouteSheetsStateView>('routeSheets:state')).oldAppFolder).toBe(true);

    await fixtureDay(rig);
    state = await rig.ok<RouteSheetsStateView>('routeSheets:state');
    expect(state.run).toMatchObject({
      id: RUN_ID,
      label: 'XXX1 · Tue, Sep 1, 2026 · CYCLE_1',
      saved: true,
      station: 'XXX1',
      date: '2026-09-01',
      cycle: 'CYCLE_1',
      pdfFileName: '2026-09-01.pdf',
      sheetCount: 29,
      pdfMissing: false,
    });
    expect(state.run.checkFailures).toHaveLength(1);
    const runs = await rig.ok<RouteSheetsRunListing[]>('routeSheets:runs');
    expect(runs).toEqual(state.runs);
    expect(runs.map((r) => [r.id, r.sheets, r.pdfMissing])).toEqual([[RUN_ID, 29, false]]);

    expect(await rig.ok('routeSheets:new-run')).toBeNull();
    expect((await snapshot(rig)).routeSheets).toMatchObject({ runId: null, sheets: 0, runs: 1 });
    expect(await rig.ok('routeSheets:load-run', { id: RUN_ID })).toBeNull();
    expect((await snapshot(rig)).routeSheets).toMatchObject({ runId: RUN_ID, sheets: 29 });
    expect(await rig.call('routeSheets:load-run', { id: 'XXX1_2020-01-01_CYCLE1' })).toEqual({
      ok: false,
      reason: 'refused',
      message: 'That run could not be found.',
    });
    expect(await rig.call('routeSheets:load-run', { id: '' })).toEqual({
      ok: false,
      reason: 'bad-input',
    });

    expect(await rig.ok('routeSheets:delete-run', { id: RUN_ID })).toBeNull();
    expect(existsSync(path.join(rig.base, 'data', 'route-sheets', `${RUN_ID}.pdf`))).toBe(false);
    expect((await snapshot(rig)).routeSheets).toMatchObject({ runId: null, runs: 0 });
    expect(await rig.call('routeSheets:delete-run', { id: RUN_ID })).toEqual({
      ok: false,
      reason: 'refused',
      message: 'That run could not be found.',
    });
  });

  it('previews, chooses, accepts the suggestions, marks sent and keeps typed pads', async () => {
    const rig = makeRig();
    await fixtureDay(rig);
    twist(rig);

    const preview = await rig.ok<RouteSheetsPreview>('routeSheets:preview', { routeCode: 'CX2' });
    expect(preview.subject).toMatch(/^Route Sheet: CX2 · /);
    expect(preview.html).toContain('<html');
    expect(preview.text).toContain('CX2');
    expect(preview.recipients).toHaveLength(1);
    expect(preview.route?.state).toBe('ready');
    // A route on the Routes export with no page: no email to show.
    expect(
      await rig.ok<RouteSheetsPreview>('routeSheets:preview', { routeCode: 'CX29' }),
    ).toMatchObject({
      subject: null,
      html: null,
      route: { state: 'no-sheet' },
    });
    expect(await rig.call('routeSheets:preview', { routeCode: 'ZZ99' })).toEqual({
      ok: false,
      reason: 'refused',
      message: 'That route is not in this run.',
    });
    expect(await rig.call('routeSheets:preview', { routeCode: 'X'.repeat(17) })).toEqual({
      ok: false,
      reason: 'bad-input',
    });

    // Choose someone, Don't send, and Change (undo).
    const suggested = (
      await rig.ok<RouteSheetsDistributionView>('routeSheets:distribution')
    ).routes.filter((r) => r.state === 'needs-decision' && r.suggestion);
    expect(suggested.length).toBeGreaterThan(1);
    const first = suggested[0]!;
    await rig.ok('routeSheets:set-decision', {
      routeCode: first.routeCode,
      decision: { recipients: [first.suggestion], junk: 'left out' },
    });
    let dist = await rig.ok<RouteSheetsDistributionView>('routeSheets:distribution');
    expect(dist.routes.find((r) => r.routeCode === first.routeCode)).toMatchObject({
      state: 'ready',
      headline: 'Resolved by you',
    });
    const kept = (await rig.ok<RouteSheetsStateView>('routeSheets:state')).run.decisions[
      first.routeCode
    ];
    expect(Object.keys(kept!).sort()).toEqual(['at', 'recipients']);
    await rig.ok('routeSheets:set-decision', { routeCode: 'CX2', decision: { skipped: true } });
    dist = await rig.ok<RouteSheetsDistributionView>('routeSheets:distribution');
    expect(dist.routes.find((r) => r.routeCode === 'CX2')!.state).toBe('skipped');
    await rig.ok('routeSheets:set-decision', { routeCode: 'CX2', decision: null });
    dist = await rig.ok<RouteSheetsDistributionView>('routeSheets:distribution');
    expect(dist.routes.find((r) => r.routeCode === 'CX2')!.state).toBe('ready');
    expect(
      await rig.call('routeSheets:set-decision', {
        routeCode: 'ZZ99',
        decision: { skipped: true },
      }),
    ).toEqual({ ok: false, reason: 'refused', message: 'That route is not in this run.' });
    expect(
      await rig.call('routeSheets:set-decision', {
        routeCode: 'CX2',
        decision: { recipients: 'everyone' },
      }),
    ).toEqual({ ok: false, reason: 'bad-input' });

    // Accept all suggestions: the ones still waiting.
    expect(await rig.ok<number>('routeSheets:accept-suggestions')).toBe(suggested.length - 1);
    expect(await rig.ok<number>('routeSheets:accept-suggestions')).toBe(0);

    // Mark as sent, and back.
    await rig.ok('routeSheets:mark-sent', { routeCode: 'CX2', how: 'manual' });
    let state = await rig.ok<RouteSheetsStateView>('routeSheets:state');
    expect(state.run.sent.CX2).toMatchObject({ how: 'manual' });
    expect(
      (await rig.ok<RouteSheetsDistributionView>('routeSheets:distribution')).unsent,
    ).not.toContain('CX2');
    await rig.ok('routeSheets:mark-sent', { routeCode: 'CX2', how: null });
    expect((await rig.ok<RouteSheetsStateView>('routeSheets:state')).run.sent).toEqual({});
    expect(await rig.call('routeSheets:mark-sent', { routeCode: 'CX2', how: 'posted' })).toEqual({
      ok: false,
      reason: 'bad-input',
    });

    // A wave the route data knows gets its pad from the Route Data page only, even with none
    // there yet: the 2:30 pm wave has a dispatch time but no pad, and no box.
    const fromRouteData = {
      ok: false,
      reason: 'refused',
      message: 'That wave already gets its pad from the Route Data page.',
    };
    expect(await rig.call('routeSheets:set-wave-pad', { waveTime: '02:30 PM', pad: '4' })).toEqual(
      fromRouteData,
    );
    // Take that dispatch time off the route data: now the wave matches none, and a typed pad is
    // used; trimmed, and cleared with a blank.
    for (const row of rig.host.state.routeSet('routes').rows) {
      if (row.routeCode === 'AX13') row.dispatchTime = '';
    }
    expect(await rig.ok('routeSheets:set-wave-pad', { waveTime: '02:30 PM', pad: '  4 ' })).toBe(
      '4',
    );
    dist = await rig.ok<RouteSheetsDistributionView>('routeSheets:distribution');
    expect(dist.typedPadWaves).toEqual(['02:30 PM']);
    expect(dist.waves.find((w) => w.waveTime === '02:30 PM')!.pad).toBe('4');
    expect(
      (await rig.ok<RouteSheetsPreview>('routeSheets:preview', { routeCode: 'AX13' })).subject,
    ).toMatch(/Pad 4$/);
    await padsFromInputs(rig);
    expect(await rig.call('routeSheets:set-wave-pad', { waveTime: '10:20 AM', pad: '9' })).toEqual(
      fromRouteData,
    );
    dist = await rig.ok<RouteSheetsDistributionView>('routeSheets:distribution');
    expect(dist.waves.map((w) => w.pad)).toEqual(['1', '2', '4']);
    expect(
      await rig.ok('routeSheets:set-wave-pad', { waveTime: '02:30 PM', pad: '   ' }),
    ).toBeNull();
    expect(await rig.call('routeSheets:set-wave-pad', { waveTime: '11:11 AM', pad: '1' })).toEqual({
      ok: false,
      reason: 'refused',
      message: 'That wave time is not in this run.',
    });
    expect(await rig.ok('routeSheets:set-wave-pad', { waveTime: '02:30 PM', pad: 'B12' })).toBe(
      'B12',
    );
    state = await rig.ok<RouteSheetsStateView>('routeSheets:state');
    expect(state.run.typedPads).toEqual({ '02:30 PM': 'B12' });

    // Everything was saved at once: a fresh start on the same day reopens the same run.
    rig.rebuild();
    const again = await rig.ok<RouteSheetsStateView>('routeSheets:state');
    expect(again.run.id).toBe(RUN_ID);
    expect(again.run.decisions).toEqual(state.run.decisions);
    expect(again.run.typedPads).toEqual({ '02:30 PM': 'B12' });
  });

  it('copies the email, opens the draft and the mail app, saves and shows the page', async () => {
    const rig = makeRig();
    await fixtureDay(rig);
    const copy = await rig.ok<{ html: string; text: string; subject: string }>(
      'routeSheets:copy-email',
      { routeCode: 'CX2' },
    );
    expect(copy.subject).toMatch(/^Route Sheet: CX2 · /);
    expect(copy.html).toContain('<html');
    expect(copy.text).toContain('CX2');
    expect(await rig.call('routeSheets:copy-email', { routeCode: 'CX29' })).toEqual({
      ok: false,
      reason: 'refused',
      message: 'CX29 has no route sheet page.',
    });

    expect(await rig.ok('routeSheets:open-draft', { routeCode: 'CX2' })).toEqual({ opened: true });
    const draft = rig.opened.at(-1)!;
    expect(path.basename(draft)).toBe('CX2 route sheet.eml');
    const eml = readFileSync(draft, 'utf8');
    expect(eml).toMatch(/X-Unsent: 1/);
    expect(eml).toContain('application/pdf');

    const mail = await rig.ok<{ mailto: string; opened: boolean }>('routeSheets:open-mail-app', {
      routeCode: 'CX2',
    });
    expect(mail.opened).toBe(true);
    expect(mail.mailto).toMatch(/^mailto:driver\d+%40example\.com\?subject=Route%20Sheet%3A%20CX2/);
    expect(rig.mailto).toEqual([mail.mailto]);
    // Copy for email and the rest are marked as sent by the page, once they worked.
    await rig.ok('routeSheets:mark-sent', { routeCode: 'CX2', how: 'mail-app' });

    const out = path.join(rig.base, 'saved-page.pdf');
    rig.dialog.next.push(out);
    expect(await rig.ok('routeSheets:save-pdf-page', { routeCode: 'CX2' })).toEqual({
      saved: true,
      fileName: 'saved-page.pdf',
    });
    expect((await PDFDocument.load(readFileSync(out))).getPageCount()).toBe(1);
    expect(await rig.ok('routeSheets:save-pdf-page', { routeCode: 'CX2' })).toEqual({
      saved: false,
      fileName: null,
    });

    expect(await rig.ok('routeSheets:view-original-page', { routeCode: 'CX2' })).toEqual({
      opened: true,
    });
    expect(path.basename(rig.opened.at(-1)!)).toBe('CX2 original page.pdf');
  });

  it('Export all writes the same folder of drafts, PDFs and summary as the old app', async () => {
    const rig = makeRig();
    await fixtureDay(rig);
    twist(rig);
    await padsFromInputs(rig);
    await decideFromInputs(rig);

    // They closed the folder window.
    expect(await rig.ok('routeSheets:export-all')).toBeNull();
    const target = path.join(rig.base, 'export');
    mkdirSync(target);
    rig.dialog.next.push(target);
    const result = await rig.ok<ExportAllResult>('routeSheets:export-all');
    const plan = expected<{ folder: string; drafts: number; files: string[] }>('export-files.json');
    expect(result).toEqual({ folder: plan.folder, drafts: plan.drafts });
    const root = path.join(target, plan.folder);
    const written = [
      ...readdirSync(root).filter((name) => name.includes('.')),
      ...readdirSync(path.join(root, 'Email drafts')).map((n) => `Email drafts/${n}`),
      ...readdirSync(path.join(root, 'Route sheet PDFs')).map((n) => `Route sheet PDFs/${n}`),
    ].sort();
    expect(written).toEqual(plan.files);
    for (const name of ['summary.csv', 'summary.html']) {
      expect(readFileSync(path.join(root, `Distribution ${name}`), 'utf8'), name).toBe(
        readFileSync(path.join(expectedDir, name), 'utf8'),
      );
    }
    // The folder is opened afterwards, as the old app did.
    expect(rig.opened.at(-1)).toBe(root);
  });

  it('a run whose PDF is gone still shows its sheets; only cutting a page needs the PDF', async () => {
    const rig = makeRig();
    await fixtureDay(rig);
    rmSync(path.join(rig.base, 'data', 'route-sheets', `${RUN_ID}.pdf`));
    const state = await rig.ok<RouteSheetsStateView>('routeSheets:state');
    expect(state.run.pdfMissing).toBe(true);
    expect(state.runs[0]!.pdfMissing).toBe(true);
    expect(
      (await rig.ok<RouteSheetsDistributionView>('routeSheets:distribution')).routes,
    ).toHaveLength(30);
    expect(
      (await rig.ok<RouteSheetsPreview>('routeSheets:preview', { routeCode: 'CX2' })).html,
    ).toContain('<html');
    setUpEmail(rig);
    const refusal = { ok: false, reason: 'refused', message: PDF_MISSING };
    for (const name of [
      'routeSheets:save-pdf-page',
      'routeSheets:view-original-page',
      'routeSheets:open-draft',
    ]) {
      expect(await rig.call(name, { routeCode: 'CX2' }), name).toEqual(refusal);
    }
    // Sending and Export all carry on, as the old app did: emails without the attachment, and
    // drafts without the PDFs.
    expect(await rig.ok<EmailRoutesResult>('routeSheets:send-one', { routeCode: 'CX2' })).toEqual({
      sent: ['CX2'],
      failed: [],
      skipped: [],
    });
    expect(rig.transports[0]!.sent[0]!.attachments).toEqual([]);
    const all = await rig.ok<EmailRoutesResult>('routeSheets:email-all');
    expect(all.sent.length).toBeGreaterThan(10);
    const target = path.join(rig.base, 'export');
    mkdirSync(target);
    rig.dialog.next.push(target);
    const result = await rig.ok<ExportAllResult>('routeSheets:export-all');
    expect(result!.drafts).toBeGreaterThan(10);
    const root = path.join(target, result!.folder);
    expect(readdirSync(path.join(root, 'Email drafts'))).toHaveLength(result!.drafts);
    expect(readdirSync(path.join(root, 'Route sheet PDFs'))).toEqual([]);
  });

  it('nothing loaded: a new run refuses what needs a route sheet', async () => {
    const rig = makeRig();
    expect(await rig.ok<RouteSheetsDistributionView>('routeSheets:distribution')).toMatchObject({
      routes: [],
      unsent: [],
      typedPadWaves: [],
    });
    expect(await rig.call('routeSheets:preview', { routeCode: 'CX2' })).toMatchObject({
      reason: 'refused',
      message: 'That route is not in this run.',
    });
    expect(await rig.call('routeSheets:open-draft', { routeCode: 'CX2' })).toMatchObject({
      message: PDF_MISSING,
    });
    expect(await rig.call('routeSheets:email-all')).toEqual({
      ok: false,
      reason: 'refused',
      message: 'No route sheets are ready to email.',
    });
    expect(await rig.ok<number>('routeSheets:accept-suggestions')).toBe(0);
    expect(
      await rig.call('routeSheets:mark-sent', { routeCode: 'CX2', how: 'manual' }),
    ).toMatchObject({
      message: 'That route is not in this run.',
    });
    expect(
      await rig.call('routeSheets:set-wave-pad', { waveTime: '10:20 AM', pad: '1' }),
    ).toMatchObject({
      message: 'That wave time is not in this run.',
    });
  });

  it('sends one and emails all over the shared email account, and refuses when it is not set up', async () => {
    const rig = makeRig();
    await fixtureDay(rig);
    expect(await rig.call('routeSheets:send-one', { routeCode: 'CX2' })).toEqual({
      ok: false,
      reason: 'refused',
      message:
        "Email isn't set up yet. Add the from address and the app password in Settings first.",
    });
    setUpEmail(rig);
    expect((await rig.ok<RouteSheetsStateView>('routeSheets:state')).emailProblem).toBeNull();
    const one = await rig.ok<EmailRoutesResult>('routeSheets:send-one', { routeCode: 'CX2' });
    expect(one).toEqual({ sent: ['CX2'], failed: [], skipped: [] });
    // A mailbox that turns it down: said in plain words, with what to do.
    const cx3 = (await rig.ok<RouteSheetsPreview>('routeSheets:preview', { routeCode: 'CX3' }))
      .recipients[0]!.email;
    rig.mail.refuse.add(cx3);
    expect(await rig.call('routeSheets:send-one', { routeCode: 'CX3' })).toEqual({
      ok: false,
      reason: 'refused',
      message:
        'CX3 was not sent. The email server refused this address. ' +
        'Check the address on the Associates page, or use Open email draft.',
    });
    rig.mail.refuse.clear();
    expect(await rig.call('routeSheets:send-one', { routeCode: 'CX12' })).toEqual({
      ok: false,
      reason: 'refused',
      message: '3 Transporter IDs are listed on this route',
    });
    const all = await rig.ok<EmailRoutesResult>('routeSheets:email-all');
    expect(all.sent.length).toBeGreaterThan(10);
    expect(all.sent).not.toContain('CX2');
    expect(await rig.call('routeSheets:email-all')).toEqual({
      ok: false,
      reason: 'refused',
      message: 'Every route sheet that is ready is already marked as sent.',
    });
    expect((await snapshot(rig)).routeSheets.unsent).toBe(0);
    // One login per batch.
    expect(rig.transports.map((t) => [t.verified, t.closed])).toEqual([
      [1, true],
      [1, true],
      [1, true],
    ]);
    expect(rig.logs.join('\n')).not.toContain('@example.com');
  });

  it('refuses to send in demo mode', async () => {
    const rig = makeRig();
    setUpEmail(rig);
    rig.switchTo(true);
    expect((await bringIn(rig, 'route-sheets', PDF_FILE)).ok).toBe(true);
    // The demo copy keeps its PDF in the demo folder, never beside the real database.
    expect(existsSync(path.join(rig.base, 'data', 'route-sheets', `${RUN_ID}.pdf`))).toBe(false);
    expect(await rig.call('routeSheets:send-one', { routeCode: 'CX2' })).toEqual({
      ok: false,
      reason: 'refused',
      message:
        'Demo mode is on, so no emails are sent. Turn off demo mode in Settings to send them.',
    });
    expect(rig.transports).toHaveLength(0);
    // Demo mode never touches the remembered run.
    expect(rig.settingsFile.getMainOnly().lastRunId).toBeUndefined();
  });

  it('the snapshot carries the counts as plain data', async () => {
    const rig = makeRig();
    await fixtureDay(rig);
    const snap = await snapshot(rig);
    expect(Object.getPrototypeOf(snap.routeSheets)).toBe(Object.prototype);
    expect(structuredClone(snap.routeSheets)).toEqual(snap.routeSheets);
    const view = await rig.ok<RouteSheetsStateView>('routeSheets:state');
    expect(structuredClone(view)).toEqual(view);
    expect(JSON.stringify(view)).not.toContain(rig.base);
  });
});

// ------------------------------------------------------------------------ Email all twins

describe('Route Sheet Distributor’s Email all tests, against the host', () => {
  it('Email all: sends one email per ready route with its PDF page, marks each sent, skips what it cannot send', async () => {
    const rig = makeRig();
    await fixtureDay(rig);
    twist(rig);
    const host = rig.host.routeSheets;
    const dist = host.distribution();
    const readyCode = dist.routes.find(
      (r) => r.state === 'ready' && r.recipients[0]?.email,
    )!.routeCode;
    await expect(host.emailRoutes([readyCode], rig.account)).rejects.toThrow(/isn't set up/);
    expect(rig.transports).toHaveLength(0);

    setUpEmail(rig);
    await padsFromInputs(rig);
    await decideFromInputs(rig);
    const decided = host.distribution();
    // The driver with no email on file, a route that still needs a decision, and a mailbox that
    // turns the email down.
    const noEmail = decided.routes.find(
      (r) => r.state === 'ready' && r.recipients.some((p) => !p.email),
    )!;
    const waiting = decided.routes.find((r) => r.state === 'needs-decision')!;
    const ready = decided.routes.filter((r) => r.state === 'ready').map((r) => r.routeCode);
    const unsent = host.unsentRoutes();
    expect(unsent).not.toContain(noEmail.routeCode);
    expect((await rig.ok<RouteSheetsStateView>('routeSheets:state')).unsent).toBe(unsent.length);
    const bounced = decided.routes.find((r) => r.routeCode === unsent[2])!;
    rig.mail.refuse.add(bounced.recipients[0]!.email);

    const out = await host.emailRoutes(
      [...unsent, noEmail.routeCode, waiting.routeCode],
      rig.account,
    );
    expect(out.failed).toEqual([
      { routeCode: bounced.routeCode, error: 'the email server refused this address' },
    ]);
    expect(out.skipped.map((x) => x.routeCode)).toEqual([noEmail.routeCode, waiting.routeCode]);
    expect(out.skipped[0]!.reason).toBe(
      `No email address on file for ${noEmail.recipients[0]!.name}.`,
    );
    expect([...out.sent].sort()).toEqual(unsent.filter((c) => c !== bounced.routeCode).sort());
    expect(ready).toContain(unsent[0]);
    expect(rig.transports).toHaveLength(1);
    const t = rig.transports[0]!;
    expect(t.verified).toBe(1);
    expect(t.closed).toBe(true);
    expect(t.config).toEqual({
      host: 'smtp.gmail.com',
      port: 587,
      username: 'dispatch@example.com',
      password: 'abcdefghijklmnop',
    });

    const first = decided.routes.find((r) => r.routeCode === unsent[0])!;
    const m = t.sent.find((x) => x.subject.includes(`${first.routeCode} ·`))!;
    expect(m.from).toEqual({ name: 'Dispatch', address: 'dispatch@example.com' });
    expect(m.to).toEqual({ name: first.recipients[0]!.name, address: first.recipients[0]!.email });
    expect(m.bcc).toBe('lead@example.com');
    expect(m.html).toContain(`Hi ${first.recipients[0]!.name.split(' ')[0]},`);
    expect(m.attachments).toHaveLength(1);
    const attachment = m.attachments![0]!;
    expect(attachment.contentType).toBe('application/pdf');
    expect((await PDFDocument.load(attachment.content!)).getPageCount()).toBe(1);

    const saved = host.runs.loadRun(RUN_ID)!;
    expect(saved.sent[first.routeCode]!.how).toBe('emailed');
    expect(saved.sent[first.routeCode]!.to).toEqual([first.recipients[0]!.email]);
    expect(saved.sent[bounced.routeCode]).toBeUndefined();
    expect(host.unsentRoutes()).toEqual([bounced.routeCode]);
    expect(rig.logs.join('\n')).not.toContain('@example.com');
  });

  it('Email all: a rejected login stops the batch before anything is sent', async () => {
    const rig = makeRig();
    await fixtureDay(rig);
    setUpEmail(rig);
    rig.mail.failConnect = true;
    const host = rig.host.routeSheets;
    await expect(host.emailRoutes(host.unsentRoutes(), rig.account)).rejects.toThrow(
      /^Nothing was sent\. The email server turned down the login/,
    );
    const test = await rig.account.sendTest(undefined);
    expect(test.sent).toBe(false);
    expect(test.problem).toMatch(/turned down the login/);
    expect(rig.transports.every((t) => t.sent.length === 0)).toBe(true);
    expect((await rig.ok<RouteSheetsStateView>('routeSheets:state')).run.sent).toEqual({});
    // A failed batch does not block the next one.
    expect(host.sending).toBe(false);
  });
});

// ------------------------------------------------------- old runs and reopening today's run

describe('when the app opens', () => {
  function oldRun(id: string, date: string): StoredRun {
    return {
      id,
      station: 'XXX1',
      date,
      dateLabel: null,
      cycle: 'CYCLE_1',
      pdfFileName: 'old.pdf',
      importedAt: null,
      pageCount: 1,
      warnings: [],
      routesFileName: null,
      wavePads: {},
      createdAt: `${date}T08:00:00.000Z`,
      updatedAt: `${date}T08:00:00.000Z`,
      sheets: [],
      decisions: {},
      sent: {},
    };
  }

  it('reopens the last run only if it is for today, and quietly removes runs older than 30 days', async () => {
    const rig = makeRig('2026-09-01');
    await fixtureDay(rig);
    expect(rig.settingsFile.getMainOnly().lastRunId).toBe(RUN_ID);

    // An older run, with its PDF beside the database.
    const store = new RouteSheetsStore(rig.source.getStore()!.db);
    store.saveRun(oldRun('XXX1_2026-08-01_CYCLE1', '2026-08-01'));
    const pdfs = path.join(rig.base, 'data', 'route-sheets');
    writeFileSync(path.join(pdfs, 'XXX1_2026-08-01_CYCLE1.pdf'), '%PDF-1.4 stand-in');

    // The same day: the run is reopened. Aug 1 is 31 days back, so it goes.
    rig.rebuild();
    expect((await snapshot(rig)).routeSheets).toMatchObject({ runId: RUN_ID, runs: 1 });
    expect(existsSync(path.join(pdfs, 'XXX1_2026-08-01_CYCLE1.pdf'))).toBe(false);
    expect(rig.logs).toContain('route sheets: 1 old runs removed');

    // The next day: a new run, and yesterday's is under History.
    rig.clock.today = '2026-09-02';
    rig.rebuild();
    expect((await snapshot(rig)).routeSheets).toMatchObject({ runId: null, runs: 1 });
    expect((await rig.ok<RouteSheetsRunListing[]>('routeSheets:runs')).map((r) => r.id)).toEqual([
      RUN_ID,
    ]);

    // 30 days later it is still kept; 31 days later it is removed with its PDF.
    rig.clock.today = '2026-10-01';
    rig.rebuild();
    expect((await snapshot(rig)).routeSheets.runs).toBe(1);
    rig.clock.today = '2026-10-02';
    rig.rebuild();
    expect((await snapshot(rig)).routeSheets.runs).toBe(0);
    expect(existsSync(path.join(pdfs, `${RUN_ID}.pdf`))).toBe(false);
  });
});
