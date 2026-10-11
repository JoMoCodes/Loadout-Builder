// The weekly performance channels, driven through the real handlers on a temporary database with
// stand-ins for the folder window, the computer's safe storage, the email server and the PDF
// printer. Uses only the made-up files in packages/fixtures/performance, and checks numbers
// against what the old app's own code produced from them (scripts/parity/wpa/expected).

import Database from 'better-sqlite3';
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  utimesSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import type {
  EmailOutcome,
  GenerateOutcome,
  PerfDashboardView,
  PerfDriversView,
  PerfImportCard,
  PerfImportSummary,
  PerfKind,
  PerfProgress,
  PerfScoreExplanation,
  SyncSummary,
} from '../shared/performance';
import { PERF_KINDS } from '../shared/performance';
import { mergeSettings, type AppSettings } from '../shared/settings';
import type { AppSnapshot } from '../shared/snapshot';
import { StateHost } from './appState';
import type { ChannelEnv, ChannelEvent, IpcLike } from './channels';
import { DataSource } from './dataSource';
import { registerAllChannels } from './handlers';
import type { HandlerContext, Services } from './handlers';
import type { MailMessage, MailTransport, SmtpConfig } from './performance/mailer';
import { OldWpaData } from './performance/oldWpaData';
import { buildReportHtml, sampleReportHtml } from './performance/report';
import { PerfService } from './performance/service';
import { SettingsFile } from './settingsFile';

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, '..', '..', '..', '..');
const fixtures = path.join(repo, 'packages', 'fixtures');
const perfFixtures = path.join(fixtures, 'performance');
const expectedDir = path.join(repo, 'scripts', 'parity', 'wpa', 'expected');
const expected = <T>(name: string): T =>
  JSON.parse(readFileSync(path.join(expectedDir, name), 'utf8')) as T;

const COMPLIANCE = expected<{
  asOf: string;
  windowDays: number;
  alerts: Array<{ isAlert: boolean }>;
}>('compliance.json');
// The day the old app's ID-expiry list was worked out for, so the counts can be compared.
const TODAY = COMPLIANCE.asOf;
const OWN = 'file:///app/index.html';
const good: ChannelEvent = { senderFrame: { url: OWN, parent: null } };

/** The folder (or the one file) each kind's fixtures are in. */
function fixturePlace(kind: PerfKind, root = perfFixtures): string {
  const folder = path.join(root, kind);
  if (kind === 'roster' || kind === 'thresholds') {
    const name = readdirSync(folder).find((n) => n.endsWith('.csv'));
    return path.join(folder, name as string);
  }
  return folder;
}

interface FakeTransport extends MailTransport {
  config: SmtpConfig;
  sent: MailMessage[];
  closed: boolean;
  verified: number;
}

interface Rig {
  host: StateHost;
  source: DataSource;
  service: PerfService;
  call: (name: string, input?: unknown) => Promise<{ ok: boolean; [key: string]: unknown }>;
  ok: <T>(name: string, input?: unknown) => Promise<T>;
  logs: string[];
  changes: () => number;
  /** What the next folder / file / save window answers, and where each window started. */
  dialog: { next: Array<string | null>; asked: Array<{ title: string; start: string | null }> };
  sealer: { available: boolean };
  transports: FakeTransport[];
  mail: { refuse: Set<string>; failConnect: boolean };
  printed: string[];
  /** The size of each batch printed in one window (when the rig has the batch printer). */
  batches: number[];
  print: { fail: boolean };
  opened: string[];
  /** What "Show in folder" opened: ['folder', place] or ['file', place]. */
  shown: Array<[string, string]>;
  /** Every performance:progress the main process sent. */
  progress: PerfProgress[];
  settings: () => AppSettings;
  setSettings: (patch: unknown) => AppSettings;
  settingsPath: string;
  oldWpaFile: { path: string };
  switchTo: (demo: boolean) => void;
}

let folder: string;
const rigs: Rig[] = [];

function makeRig(options: { settingsJson?: unknown; batch?: boolean } = {}): Rig {
  const base = mkdtempSync(path.join(folder, 'rig-'));
  const settingsPath = path.join(base, 'settings.json');
  if (options.settingsJson !== undefined) {
    writeFileSync(settingsPath, JSON.stringify(options.settingsJson));
  }
  const file = new SettingsFile(settingsPath);
  let settings = file.load();

  const source = new DataSource({
    dataFolder: path.join(base, 'data'),
    fixtureDb: path.join(fixtures, 'v1', 'loadout.db'),
    tempFolder: base,
  });
  const logs: string[] = [];
  const host = new StateHost(source, () => TODAY, {
    demoPerformanceFolder: perfFixtures,
    log: (line) => logs.push(line),
  });
  source.open(false);
  host.rebuild();

  const dialog = {
    next: [] as Array<string | null>,
    asked: [] as Array<{ title: string; start: string | null }>,
  };
  const nextDialog = async () => (dialog.next.length > 0 ? (dialog.next.shift() ?? null) : null);
  const ask = (title: string, start: string | null) => {
    dialog.asked.push({ title, start });
    return nextDialog();
  };
  const sealer = { available: true };
  const transports: FakeTransport[] = [];
  const mail = { refuse: new Set<string>(), failConnect: false };
  const printed: string[] = [];
  const print = { fail: false };
  const opened: string[] = [];
  const shown: Array<[string, string]> = [];
  const progress: PerfProgress[] = [];
  const batches: number[] = [];
  const oldWpaFile = { path: path.join(base, 'no-such-app.db') };

  const service = new PerfService({
    host: () => host.perf,
    performance: () => settings.performance,
    demo: () => settings.demoMode,
    mainOnly: () => file.getMainOnly(),
    updateMainOnly: (change) => void file.updateMainOnly(change),
    dialogs: {
      chooseFolder: (title, startIn) => ask(title, startIn),
      chooseFile: (title, _filters, startIn) => ask(title, startIn),
      // The save window starts with a file name, kept here as "start".
      chooseSaveFile: (title, defaultName) => ask(title, defaultName),
    },
    sealer: {
      isEncryptionAvailable: () => sealer.available,
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
          if (mail.failConnect) throw Object.assign(new Error('auth'), { code: 'EAUTH' });
        },
        send: async (message) => {
          if (mail.refuse.has(message.to.address)) {
            throw Object.assign(new Error('refused'), { code: 'EENVELOPE', responseCode: 550 });
          }
          expect(existsSync(message.attachments?.[0]?.path ?? base)).toBe(true);
          transport.sent.push(message);
        },
        close: () => {
          transport.closed = true;
        },
      };
      transports.push(transport);
      return transport;
    },
    report: {
      buildReportHtml,
      sampleReportHtml,
      printHtmlToPdf: async (html, outFile) => {
        if (print.fail) throw new Error('print failed');
        mkdirSync(path.dirname(outFile), { recursive: true });
        writeFileSync(outFile, `%PDF-1.4 stand-in\n${html.length}\n`);
        printed.push(outFile);
      },
      ...(options.batch
        ? {
            printHtmlBatch: async (
              items: ReadonlyArray<{ html: string; outFile: string }>,
              onProgress?: (done: number, total: number) => void,
            ) => {
              batches.push(items.length);
              return items.map((item, index) => {
                writeFileSync(item.outFile, `%PDF-1.4 stand-in\n${item.html.length}\n`);
                printed.push(item.outFile);
                onProgress?.(index + 1, items.length);
                return { ok: true };
              });
            },
          }
        : {}),
    },
    openFile: async (opened_) => {
      opened.push(opened_);
      return true;
    },
    folders: {
      showFile: (file) => {
        shown.push(['file', file]);
        return true;
      },
      openFolder: async (place) => {
        shown.push(['folder', place]);
        return true;
      },
    },
    progress: (one) => progress.push(one),
    tempFolder: () => base,
    today: () => TODAY,
    log: (line) => logs.push(line),
  });
  host.perfStatus = () => service.status();

  const oldWpaData = new OldWpaData({
    usualFile: () => oldWpaFile.path,
    store: () => (settings.demoMode ? null : source.getStore()),
    demo: () => settings.demoMode,
    pickFile: nextDialog,
    perfEmpty: () => host.perf.store.isPerfEmpty(),
    reload: () => host.perf.invalidate(),
  });

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
    performance: service,
    oldWpaData,
  } as unknown as Services;

  const handlers = new Map<string, (event: ChannelEvent, input: unknown) => unknown>();
  const ipc: IpcLike = {
    handle: (name, listener) => void handlers.set(name, listener),
    on: (name, listener) => void handlers.set(name, listener),
  };
  let changes = 0;
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
  const call = async (name: string, input?: unknown) => {
    const handler = handlers.get(name);
    if (!handler) throw new Error(`no handler for ${name}`);
    return (await handler(good, input)) as { ok: boolean; [key: string]: unknown };
  };
  const rig: Rig = {
    host,
    source,
    service,
    call,
    ok: async <T>(name: string, input?: unknown) => {
      const reply = await call(name, input);
      expect(reply.ok, `${name}: ${JSON.stringify(reply)}`).toBe(true);
      return reply.value as T;
    },
    logs,
    changes: () => changes,
    dialog,
    sealer,
    transports,
    mail,
    printed,
    batches,
    print,
    opened,
    shown,
    progress,
    settings: () => settings,
    setSettings,
    settingsPath,
    oldWpaFile,
    switchTo: (demo) => void setSettings({ demoMode: demo }),
  };
  rigs.push(rig);
  return rig;
}

async function snapshot(rig: Rig): Promise<AppSnapshot> {
  return rig.ok<AppSnapshot>('state:snapshot');
}

/** Brings in every kind from the fixture folders through the folder window, in the usual order. */
async function importAll(
  rig: Rig,
  root = perfFixtures,
): Promise<Record<PerfKind, PerfImportSummary>> {
  const out = {} as Record<PerfKind, PerfImportSummary>;
  for (const kind of PERF_KINDS) {
    rig.dialog.next.push(fixturePlace(kind, root));
    const summary = await rig.ok<PerfImportSummary | null>('performance:choose-and-import', {
      kind,
    });
    expect(summary).not.toBeNull();
    out[kind] = summary as PerfImportSummary;
  }
  return out;
}

beforeAll(() => {
  folder = mkdtempSync(path.join(tmpdir(), 'loadout-perf-test-'));
});

afterEach(() => {
  while (rigs.length > 1) rigs.pop()?.source.close();
});

afterAll(() => {
  for (const rig of rigs) rig.source.close();
  rmSync(folder, { recursive: true, force: true });
});

const IMPORT_RESULTS = expected<
  Array<{
    importer: string;
    filesProcessed: number;
    rowsImported: number;
    otherCounts: Record<string, unknown>;
  }>
>('import-results.json');
const importerOf: Record<PerfKind, string> = {
  roster: 'AssociateImporter',
  thresholds: 'ThresholdImporter',
  scorecards: 'ScorecardImporter',
  pod: 'PodImporter',
  cdf: 'CdfImporter',
  dsb: 'DsbImporter',
  psb: 'PsbImporter',
  dcr: 'DcrImporter',
  'dcr-totals': 'DcrTotalsImporter',
  safety: 'SafetyImporter',
};

describe('with every fixture brought in', () => {
  let rig: Rig;
  let imports: Record<PerfKind, PerfImportSummary>;

  beforeAll(async () => {
    rig = makeRig();
    imports = await importAll(rig);
  }, 60_000);

  it('brought in each kind with the old app’s counts, and no problems', () => {
    for (const kind of PERF_KINDS) {
      const old = IMPORT_RESULTS.find((r) => r.importer === importerOf[kind])!;
      expect(imports[kind].problems, kind).toEqual([]);
      expect(imports[kind].filesRead, kind).toBe(old.filesProcessed);
      expect(imports[kind].rows, kind).toBe(old.rowsImported);
    }
    expect(imports.roster.driversAdded).toBe(76);
    // The driver list also counts the updated, active and inactive drivers, as the old app did.
    const roster = IMPORT_RESULTS.find((r) => r.importer === 'AssociateImporter')!.otherCounts;
    expect(imports.roster.roster).toEqual({
      updated: roster.DriversUpdated,
      active: roster.ActiveCount,
      inactive: roster.InactiveCount,
    });
    expect(imports.scorecards.driversAdded).toBe(16);
    expect(imports.scorecards.weeks).toEqual(expected<string[]>('weeks.json'));
  });

  it('never logs a file or folder name', () => {
    const all = rig.logs.join('\n');
    expect(all).toContain('performance import (scorecards): 10 files, 10 read, 647 rows');
    expect(all).not.toMatch(/DSP_|Quality_|Safety_Dashboard|AssociateData|POD-Details|fixtures/);
  });

  it('remembers each folder and shows the page only its last part', async () => {
    const cards = await rig.ok<PerfImportCard[]>('performance:import-cards');
    expect(cards.map((c) => c.kind)).toEqual([...PERF_KINDS]);
    const scorecards = cards.find((c) => c.kind === 'scorecards')!;
    expect(scorecards).toMatchObject({
      folderName: 'scorecards',
      folderMissing: false,
      newestWeek: '2026-W40',
      missingWeeks: [],
    });
    expect(cards.find((c) => c.kind === 'roster')!.folderName).toBe('AssociateData.csv');
    expect(cards.find((c) => c.kind === 'thresholds')!.newestWeek).toBe('2026-W32');
    // The PSB fixtures are for older weeks, so every scorecard week is missing its PSB file.
    expect(cards.find((c) => c.kind === 'psb')!.missingWeeks).toEqual(
      expected<string[]>('weeks.json'),
    );
    expect(cards.find((c) => c.kind === 'cdf')!.missingWeeks).toEqual([]);
    for (const card of cards) {
      expect(card.lastImportAt, card.kind).toMatch(/^\d{4}-\d\d-\d\dT/);
      expect(JSON.stringify(card)).not.toContain(perfFixtures);
    }
  });

  it('answers the Drivers tab with the old grid’s numbers', async () => {
    const view = await rig.ok<PerfDriversView>('performance:drivers', { range: null });
    expect(view.range).toEqual({ from: '2026-W31', to: '2026-W40' });
    expect(view.rows).toHaveLength(92);
    const old = expected<Array<Record<string, unknown>>>('drivers.json');
    const averages = expected<Record<string, Record<string, number | null>>>('averages.json');
    const safety = expected<Record<string, { total: number }>>('safety-counts.json');
    for (const row of view.rows) {
      const was = old.find((o) => o.transporterId === row.transporterId)!;
      expect(row.latestRankDisplay, row.transporterId).toBe(was.latestRankDisplay);
      expect(row.status).toBe(was.effectiveStatus);
      expect(row.safety.total).toBe(safety[row.transporterId]?.total ?? 0);
      const avg = averages[row.transporterId];
      if (avg) expect(row.averages).toEqual(avg);
      else expect(row.averagesDisplay.score).toBe('-');
    }
    expect(Object.keys(averages).length).toBeGreaterThan(50);
    expect(view.rows.filter((r) => r.activeInRange).length).toBeGreaterThan(60);
    expect(view.changes.newestWeek).toBe('2026-W40');
    expect(view.changes.previousWeek).toBe('2026-W39');
    expect(view.changes.tierUp + view.changes.tierDown).toBeGreaterThan(0);
  });

  it('lists who moved tier and who had new safety events, by name, matching the counts', async () => {
    const view = await rig.ok<PerfDriversView>('performance:drivers', { range: null });
    const { changes } = view;
    const moves = changes.tierMoves!;
    expect(moves.length).toBe(changes.tierUp + changes.tierDown);
    const rank = (tier: string) => ['Bronze', 'Silver', 'Gold', 'Platinum'].indexOf(tier);
    expect(moves.filter((m) => rank(m.to) > rank(m.from)).length).toBe(changes.tierUp);
    const names = new Map(view.rows.map((r) => [r.transporterId, r.name]));
    for (const move of moves) {
      expect(move.name).toBe(names.get(move.transporterId));
      expect(move.from).not.toBe(move.to);
    }
    const safety = changes.safetyDrivers!;
    expect(safety.reduce((sum, one) => sum + one.count, 0)).toBe(changes.newSafetyEvents);
    expect(safety.every((one) => one.count > 0 && one.name !== '')).toBe(true);
    const counts = safety.map((one) => one.count);
    expect(counts).toEqual([...counts].sort((a, b) => b - a));
  });

  it('works out "what changed" between the two newest weeks of the range', async () => {
    const view = await rig.ok<PerfDriversView>('performance:drivers', {
      range: { from: '2026-W31', to: '2026-W35' },
    });
    expect(view.changes).toMatchObject({ newestWeek: '2026-W35', previousWeek: '2026-W34' });
    expect(view.rows.find((r) => r.latestWeek !== null)).toBeTruthy();
  });

  it('refuses a back-to-front week range in plain words', async () => {
    expect(
      await rig.call('performance:drivers', { range: { from: '2026-W40', to: '2026-W31' } }),
    ).toEqual({
      ok: false,
      reason: 'refused',
      message: 'The first week must not be after the last week.',
    });
  });

  it('lists a driver’s safety events that count, newest first', async () => {
    const view = await rig.ok<PerfDriversView>('performance:drivers', { range: null });
    const withEvents = view.rows.find((r) => r.safety.total > 1)!;
    const events = await rig.ok<Array<{ week: string; programImpact: string }>>(
      'performance:safety-events',
      { transporterId: withEvents.transporterId, range: view.range, metricType: null },
    );
    expect(events).toHaveLength(withEvents.safety.total);
    expect(events.every((e) => e.programImpact !== 'None')).toBe(true);
    expect([...events].sort((a, b) => (a.week < b.week ? 1 : -1))[0]!.week).toBe(events[0]!.week);
  });

  it('explains a driver’s score metric by metric, with the coaching list’s top drag first', async () => {
    const coaching = expected<{
      flags: Array<{ transporterId: string; latestWeek: string; topDragMetric: string | null }>;
    }>('coaching.json').flags;
    for (const flag of coaching.slice(0, 5)) {
      const why = await rig.ok<PerfScoreExplanation | null>('performance:explain-score', {
        transporterId: flag.transporterId,
        range: null,
      });
      expect(why?.week, flag.transporterId).toBe(flag.latestWeek);
      expect(why?.topDrag?.metric ?? null, flag.transporterId).toBe(flag.topDragMetric);
      expect(why?.items[0]?.metric ?? null).toBe(flag.topDragMetric);
      const lost = why!.items.filter((i) => i.counted).map((i) => i.lost!);
      expect(lost).toEqual([...lost].sort((a, b) => b - a));
      // Every scored week too, oldest first, the newest being the week explained.
      const weeks = why!.weeks!;
      expect(weeks.length).toBeGreaterThan(0);
      expect(weeks.map((w) => w.week)).toEqual([...weeks.map((w) => w.week)].sort());
      const newest: Partial<PerfScoreExplanation> = { ...why! };
      delete newest.weeks;
      expect(weeks.at(-1)).toEqual(newest);
    }
    // A range with no scorecard for the driver answers null; an odd range is refused.
    const first = coaching[0]!.transporterId;
    expect(
      await rig.ok('performance:explain-score', {
        transporterId: first,
        range: { from: '2026-W01', to: '2026-W02' },
      }),
    ).toBeNull();
    expect(
      await rig.call('performance:explain-score', {
        transporterId: first,
        range: { from: '2026-W40', to: '2026-W31' },
      }),
    ).toMatchObject({ ok: false, reason: 'refused' });
  });

  it('answers the Directory, the thresholds and the ID-expiry list', async () => {
    const directory = await rig.ok<Array<{ name: string; email: string }>>('performance:directory');
    expect(directory).toHaveLength(92);
    expect(directory.filter((d) => d.email !== '').length).toBeGreaterThan(50);

    const thresholds = await rig.ok<Array<Record<string, string>>>('performance:thresholds');
    const old = expected<Array<Record<string, unknown>>>('thresholds.json');
    expect(thresholds).toHaveLength(old.length);
    expect(thresholds[0]).toMatchObject({
      metricName: 'Overall Score',
      direction: 'Higher is better',
      platinum: old[0]!.platinumDisplay,
      bronze: old[0]!.bronzeDisplay,
      sourceWeek: '2026-W32',
    });

    const compliance =
      await rig.ok<Array<{ isAlert: boolean; statusDisplay: string }>>('performance:compliance');
    expect(compliance).toHaveLength(COMPLIANCE.alerts.length);
    expect(compliance.filter((c) => c.isAlert)).toHaveLength(
      COMPLIANCE.alerts.filter((a) => a.isAlert).length,
    );
  });

  it('fills every field of the Dashboard, matching the old fleet summary', async () => {
    const view = await rig.ok<PerfDashboardView>('performance:dashboard', { range: null });
    const fleet = expected<{
      latestFleetAvg: number;
      activeDrivers: number;
      latestTierDistribution: Array<{ tier: string; count: number }>;
      avgTrend: Array<{ week: string; avg: number }>;
      topImproved: Array<{ transporterId: string }>;
      topDeclined: Array<{ transporterId: string }>;
    }>('fleet-summary.json');
    expect(view.hasData).toBe(true);
    expect(view.latestWeek).toBe('2026-W40');
    expect(view.previousWeek).toBe('2026-W39');
    expect(view.fleetAverage).toBe(fleet.latestFleetAvg);
    expect(view.fleetAverageBefore).toBe(fleet.avgTrend.find((t) => t.week === '2026-W39')!.avg);
    expect(view.activeDrivers).toBe(fleet.activeDrivers);
    expect(view.tiers).toEqual(fleet.latestTierDistribution);
    expect(view.tiersBefore.reduce((n, t) => n + t.count, 0)).toBeGreaterThan(0);
    expect(view.tierMoves.map((m) => m.tier)).toEqual(['Platinum', 'Gold', 'Silver', 'Bronze']);
    const into = view.tierMoves.reduce((n, m) => n + m.into, 0);
    expect(into).toBe(view.tierMoves.reduce((n, m) => n + m.outOf, 0));
    expect(view.packagesDelivered).toBeGreaterThan(0);
    expect(view.packagesDeliveredBefore).toBeGreaterThan(0);
    expect(view.driversWithSafetyEvents).toBe(
      Object.values(expected<Record<string, { total: number }>>('safety-counts.json')).filter(
        (s) => s.total > 0,
      ).length,
    );
    expect(view.coaching).toHaveLength(
      expected<{ flags: unknown[] }>('coaching.json').flags.length,
    );
    expect(view.compliance).toHaveLength(COMPLIANCE.alerts.filter((a) => a.isAlert).length);
    expect(view.topImproved.map((m) => m.transporterId)).toEqual(
      fleet.topImproved.map((m) => m.transporterId),
    );
    expect(view.topDeclined.map((m) => m.transporterId)).toEqual(
      fleet.topDeclined.map((m) => m.transporterId),
    );
    expect(view.trend).toEqual(fleet.avgTrend);
    expect(view.categories.length).toBeGreaterThan(0);
    for (const c of view.categories) expect(c.firstHalf + c.secondHalf).toBe(c.count);
    expect(view.rules).toEqual({
      atRiskDecliningWeeks: 3,
      recurringCategoryWeeks: 3,
      complianceWindowDays: 30,
      topN: 5,
    });
  });

  it('uses the rule numbers from Settings', async () => {
    rig.setSettings({ performance: { topN: 2 } });
    const view = await rig.ok<PerfDashboardView>('performance:dashboard', { range: null });
    expect(view.topImproved).toHaveLength(2);
    expect(view.rules.topN).toBe(2);
    rig.setSettings({ performance: { topN: 5 } });
  });

  it('says the newest week alone has no week before it inside the range, but still compares', async () => {
    const view = await rig.ok<PerfDashboardView>('performance:dashboard', {
      range: { from: '2026-W40', to: '2026-W40' },
    });
    expect(view.trend).toHaveLength(1);
    expect(view.previousWeek).toBe('2026-W39');
    expect(view.categories.every((c) => c.firstHalf === 0)).toBe(true);
  });

  it('puts the brief in the snapshot, as plain data', async () => {
    const snap = await snapshot(rig);
    expect(snap.performance).toMatchObject({
      hasData: true,
      drivers: 92,
      thresholds: true,
      foldersChosen: 10,
      emailReady: false,
      reportsMade: false,
    });
    expect(snap.performance.weeks).toEqual(expected<string[]>('weeks.json'));
    expect(snap.performance.withEmail).toBeGreaterThan(50);
    expect(structuredClone(snap.performance)).toEqual(snap.performance);
  });

  it('gives the report HTML for a driver, and a sample in the colours asked for', async () => {
    const view = await rig.ok<PerfDriversView>('performance:drivers', { range: null });
    const id = view.rows.find((r) => r.latestScore !== null)!.transporterId;
    const report = await rig.ok<{ html: string }>('performance:report-html', {
      transporterId: id,
      range: null,
      colours: undefined,
    });
    expect(report.html).toMatch(/<html/i);
    const sample = await rig.ok<{ html: string }>('performance:report-html', {
      transporterId: null,
      range: null,
      colours: { goldBackground: '#123456', bogus: 'x' },
    });
    expect(sample.html).toMatch(/<html/i);
    const scoreless = view.rows.find((r) => r.latestScore === null && r.latestWeek === null);
    if (scoreless) {
      const none = await rig.call('performance:report-html', {
        transporterId: scoreless.transporterId,
        range: null,
      });
      expect(none).toMatchObject({ ok: false, reason: 'refused' });
    }
  });

  it('writes one PDF per driver into the chosen folder', async () => {
    const view = await rig.ok<PerfDriversView>('performance:drivers', { range: null });
    const ids = view.rows
      .filter((r) => r.activeInRange)
      .slice(0, 3)
      .map((r) => r.transporterId);
    const out = mkdtempSync(path.join(folder, 'reports-'));
    rig.dialog.next.push(out);
    const done = await rig.ok<GenerateOutcome>('performance:generate', {
      transporterIds: ids,
      range: view.range,
    });
    expect(done).toEqual({
      status: 'written',
      folderName: path.basename(out),
      written: 3,
      failed: 0,
      skipped: 0,
    });
    const files = readdirSync(out);
    expect(files).toHaveLength(3);
    expect(files.every((f) => f.endsWith('_2026-W31_to_2026-W40.pdf'))).toBe(true);
    expect((await snapshot(rig)).performance.reportsMade).toBe(true);

    // Closing the window writes nothing; a failed print is counted.
    rig.dialog.next.push(null);
    expect(
      await rig.ok('performance:generate', { transporterIds: ids, range: view.range }),
    ).toEqual({ status: 'cancelled' });
    rig.print.fail = true;
    rig.dialog.next.push(out);
    expect(
      await rig.ok('performance:generate', { transporterIds: ids.slice(0, 1), range: view.range }),
    ).toMatchObject({ status: 'written', written: 0, failed: 1 });
    rig.print.fail = false;
    // A driver with no scorecard in the weeks is skipped, as the old app did, and counted.
    const noScores = view.rows.filter((r) => !r.activeInRange).map((r) => r.transporterId);
    expect(noScores.length).toBeGreaterThan(1);
    rig.dialog.next.push(out);
    expect(
      await rig.ok('performance:generate', {
        transporterIds: [ids[0]!, ...noScores.slice(0, 2)],
        range: view.range,
      }),
    ).toMatchObject({ status: 'written', written: 1, failed: 0, skipped: 2 });
    expect(await rig.ok('performance:generate', { transporterIds: [], range: view.range })).toEqual(
      {
        status: 'nothing',
      },
    );
  });

  it('previews one report as a temporary PDF and opens it', async () => {
    const view = await rig.ok<PerfDriversView>('performance:drivers', { range: null });
    const id = view.rows.find((r) => r.activeInRange)!.transporterId;
    expect(
      await rig.ok('performance:preview-pdf', { transporterId: id, range: view.range }),
    ).toEqual({ opened: true });
    expect(existsSync(rig.opened.at(-1)!)).toBe(true);
  });

  it('writes the check file exactly as the old app did (UTF-8 with BOM, CRLF)', async () => {
    const view = await rig.ok<PerfDriversView>('performance:drivers', { range: null });
    const target = path.join(folder, 'check');
    rig.dialog.next.push(target);
    const done = await rig.ok<{ status: string; fileName: string; rows: number }>(
      'performance:export-check-file',
      { transporterIds: view.rows.map((r) => r.transporterId) },
    );
    expect(done).toEqual({
      status: 'written',
      fileName: 'check.csv',
      drivers: view.rows.filter((r) => r.latestWeek !== null).length,
      weeks: 10,
      rows: 647,
    });
    // The name offered has the date and time in it.
    expect(rig.dialog.asked.at(-1)!.start).toMatch(
      /^WeeklyPerformance_export_92_drivers_\d{8}_\d{6}\.csv$/,
    );
    const written = readFileSync(`${target}.csv`);
    const old = readFileSync(path.join(expectedDir, 'verification.csv'), 'utf8');
    expect(written.equals(Buffer.from(old.replace(/\n/g, '\r\n'), 'utf8'))).toBe(true);
    expect([...written.subarray(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
    rig.dialog.next.push(null);
    expect(
      await rig.ok('performance:export-check-file', {
        transporterIds: [view.rows[0]!.transporterId],
      }),
    ).toEqual({ status: 'cancelled' });
  });

  it('a dry run lists who would get what, and says who has no address', async () => {
    const view = await rig.ok<PerfDriversView>('performance:drivers', { range: null });
    const withEmail = view.rows.filter((r) => r.hasEmail && r.activeInRange).slice(0, 2);
    const without = view.rows.find((r) => !r.hasEmail && r.activeInRange)!;
    const out = await rig.ok<EmailOutcome>('performance:email', {
      transporterIds: [...withEmail.map((r) => r.transporterId), without.transporterId],
      range: view.range,
      dryRun: true,
    });
    expect(out.dryRun).toBe(true);
    expect(out.sent).toBe(0);
    expect(out.wouldSend).toHaveLength(2);
    expect(out.wouldSend[0]!.subject).toBe('Your Weekly Performance Report (2026-W31 – 2026-W40)');
    expect(out.notSent).toEqual([
      { transporterId: without.transporterId, name: without.name, reason: 'no address on file' },
    ]);
    expect(rig.transports).toHaveLength(0);
  });

  it('refuses to send before the from address and password are set', async () => {
    const view = await rig.ok<PerfDriversView>('performance:drivers', { range: null });
    expect(
      await rig.call('performance:email', {
        transporterIds: [view.rows[0]!.transporterId],
        range: view.range,
        dryRun: false,
      }),
    ).toEqual({
      ok: false,
      reason: 'refused',
      message: 'Add the from address and the app password in Settings first.',
    });
    expect(await rig.call('performance:email-test', {})).toMatchObject({ ok: false });
  });

  it('keeps the app password sealed, never in plain text, and sends over one connection', async () => {
    expect(await rig.ok('performance:email-status')).toEqual({
      passwordSaved: false,
      canSeal: true,
    });
    expect(
      await rig.ok('performance:set-email-password', { password: 'abcd efgh ijkl mnop' }),
    ).toEqual({ passwordSaved: true, canSeal: true });
    const onDisk = readFileSync(rig.settingsPath, 'utf8');
    expect(onDisk).not.toContain('abcdefghijklmnop');
    expect(onDisk).toContain('emailPasswordSealed');
    rig.setSettings({
      performance: {
        email: {
          fromAddress: 'dispatch@example.com',
          fromName: 'Dispatch',
          bccAddress: 'lead@example.com',
        },
      },
    });
    expect((await snapshot(rig)).performance.emailReady).toBe(true);

    const view = await rig.ok<PerfDriversView>('performance:drivers', { range: null });
    const withEmail = view.rows.filter((r) => r.hasEmail && r.activeInRange).slice(0, 3);
    const without = view.rows.find((r) => !r.hasEmail && r.activeInRange)!;
    const directory =
      await rig.ok<Array<{ transporterId: string; email: string }>>('performance:directory');
    const refused = directory.find((d) => d.transporterId === withEmail[2]!.transporterId)!.email;
    rig.mail.refuse.add(refused);

    const out = await rig.ok<EmailOutcome>('performance:email', {
      transporterIds: [...withEmail.map((r) => r.transporterId), without.transporterId],
      range: view.range,
      dryRun: false,
    });
    expect(out.sent).toBe(2);
    expect(out.notSent).toEqual([
      { transporterId: without.transporterId, name: without.name, reason: 'no address on file' },
      {
        transporterId: withEmail[2]!.transporterId,
        name: withEmail[2]!.name,
        reason: 'the email server refused this address',
      },
    ]);
    // One connection for the whole batch, logged in with the unsealed password, then closed.
    expect(rig.transports).toHaveLength(1);
    const transport = rig.transports[0]!;
    expect(transport.config).toEqual({
      host: 'smtp.gmail.com',
      port: 587,
      username: 'dispatch@example.com',
      password: 'abcdefghijklmnop',
    });
    expect(transport.closed).toBe(true);
    expect(transport.sent).toHaveLength(2);
    const first = transport.sent[0]!;
    expect(first.from).toEqual({ name: 'Dispatch', address: 'dispatch@example.com' });
    expect(first.bcc).toBe('lead@example.com');
    expect(first.text).toContain(`Hi ${withEmail[0]!.name},`);
    expect(first.attachments?.[0]?.filename).toMatch(/\.pdf$/);
    // The temporary PDFs are gone afterwards.
    expect(existsSync(first.attachments![0]!.path)).toBe(false);
    expect((await snapshot(rig)).performance.reportsEmailed).toBe(true);
    // Nobody's address or name went to the log.
    expect(rig.logs.join('\n')).not.toContain('@example.com');
    expect(rig.logs.join('\n')).toContain('email: 2 sent, 2 not sent');
    // It counted up while it worked: the reports, then the emails, each ending on the total.
    const emailing = rig.progress.filter((p) => p.job === 'email');
    expect(emailing[0]).toEqual({ job: 'email', done: 0, total: 3 });
    expect(emailing.at(-1)).toEqual({ job: 'email', done: 3, total: 3 });
    const dones = emailing.map((p) => p.done);
    expect(dones).toEqual([...dones].sort((a, b) => a - b));
    expect(rig.progress.filter((p) => p.job === 'generate').at(-1)).toEqual({
      job: 'generate',
      done: 3,
      total: 3,
    });
  });

  it('a login the server turns down sends nothing and says why in plain words', async () => {
    rig.mail.failConnect = true;
    const view = await rig.ok<PerfDriversView>('performance:drivers', { range: null });
    const reply = await rig.call('performance:email', {
      transporterIds: view.rows.filter((r) => r.hasEmail).map((r) => r.transporterId),
      range: view.range,
      dryRun: false,
    });
    expect(reply).toMatchObject({ ok: false, reason: 'refused' });
    expect(String(reply.message)).toMatch(
      /^Nothing was sent\. The email server turned down the login/,
    );
    const test = await rig.ok<{ sent: boolean; problem: string }>('performance:email-test', {});
    expect(test.sent).toBe(false);
    expect(test.problem).toMatch(/app password/);
    rig.mail.failConnect = false;
    expect(await rig.ok('performance:email-test', { to: 'me@example.com' })).toEqual({
      sent: true,
      problem: null,
    });
    expect(rig.transports.at(-1)!.sent[0]!.to.address).toBe('me@example.com');
  });

  it('refuses to save the password when the computer cannot seal it, and forgets it on empty', async () => {
    rig.sealer.available = false;
    expect(await rig.call('performance:set-email-password', { password: 'x' })).toEqual({
      ok: false,
      reason: 'refused',
      message: "This computer can't keep the password safe, so it was not saved.",
    });
    rig.sealer.available = true;
    expect(await rig.ok('performance:set-email-password', { password: '' })).toEqual({
      passwordSaved: false,
      canSeal: true,
    });
    expect(readFileSync(rig.settingsPath, 'utf8')).toContain('"emailPasswordSealed": null');
  });

  it('puts the report colours back to the old app’s', async () => {
    rig.setSettings({ performance: { colours: { goldBackground: '#000000' } } });
    const colours = await rig.ok<{ goldBackground: string }>('performance:reset-colours');
    expect(colours.goldBackground).toBe('#E9DE63');
    expect(rig.settings().performance.colours.goldBackground).toBe('#E9DE63');
  });
});

describe('the settings file', () => {
  it('keeps the folders and password next to the settings, and never gives them to the page', async () => {
    const rig = makeRig({
      settingsJson: {
        theme: 'light',
        performanceFolders: {
          scorecards: path.join(perfFixtures, 'scorecards'),
          pod: 'relative/no',
        },
        emailPasswordSealed: Buffer.from('sealed:terces').toString('base64'),
        performanceFlags: { reportsMade: true },
      },
    });
    const got = await rig.ok<Record<string, unknown>>('settings:get');
    expect(got.theme).toBe('light');
    for (const key of ['performanceFolders', 'emailPasswordSealed', 'performanceFlags']) {
      expect(got, key).not.toHaveProperty(key);
    }
    expect(JSON.stringify(got)).not.toContain('fixtures');
    // Changing a setting keeps the main-only part of the file.
    rig.setSettings({ fontScale: 1.2 });
    const onDisk = JSON.parse(readFileSync(rig.settingsPath, 'utf8')) as Record<string, unknown>;
    expect(onDisk.fontScale).toBe(1.2);
    expect(onDisk.performanceFolders).toEqual({
      scorecards: path.join(perfFixtures, 'scorecards'),
    });
    expect(onDisk.performanceFlags).toEqual({ reportsMade: true, reportsEmailed: false });
    expect(await rig.ok('performance:email-status')).toEqual({
      passwordSaved: true,
      canSeal: true,
    });
    expect((await snapshot(rig)).performance).toMatchObject({
      foldersChosen: 1,
      reportsMade: true,
    });
  });

  it('forgets a folder', async () => {
    const rig = makeRig({
      settingsJson: { performanceFolders: { cdf: path.join(perfFixtures, 'cdf') } },
    });
    await rig.ok('performance:forget-folder', { kind: 'cdf' });
    const cards = await rig.ok<PerfImportCard[]>('performance:import-cards');
    expect(cards.find((c) => c.kind === 'cdf')!.folderName).toBeNull();
    expect((await snapshot(rig)).performance.foldersChosen).toBe(0);
  });
});

describe('bringing files in', () => {
  it('starts the window in the usual place the first time, then where it was last time', async () => {
    const rig = makeRig();
    for (const kind of ['cdf', 'roster'] as const) {
      rig.dialog.next.push(fixturePlace(kind), null);
      await rig.ok('performance:choose-and-import', { kind });
      await rig.ok('performance:choose-and-import', { kind });
    }
    // No place yet means the Downloads folder (main.ts); the driver list starts in its folder.
    expect(rig.dialog.asked.map((a) => a.start)).toEqual([
      null,
      fixturePlace('cdf'),
      null,
      path.dirname(fixturePlace('roster')),
    ]);
  });

  it('does not start a second import while one is running', async () => {
    const rig = makeRig({
      settingsJson: { performanceFolders: { cdf: path.join(perfFixtures, 'cdf') } },
    });
    const running = rig.call('performance:sync-now');
    expect(await rig.call('performance:import', { kind: 'cdf' })).toEqual({
      ok: false,
      reason: 'refused',
      message: 'The app is already bringing in files. Try again in a moment.',
    });
    expect(await running).toMatchObject({ ok: true });
  });

  it('closing the folder window brings in nothing', async () => {
    const rig = makeRig();
    rig.dialog.next.push(null);
    expect(await rig.ok('performance:choose-and-import', { kind: 'scorecards' })).toBeNull();
    expect((await snapshot(rig)).performance.foldersChosen).toBe(0);
  });

  it('brings a kind in again from its remembered folder, and says so when none is chosen', async () => {
    const rig = makeRig();
    expect(await rig.call('performance:import', { kind: 'cdf' })).toEqual({
      ok: false,
      reason: 'refused',
      message: 'Choose where the customer feedback files are kept first.',
    });
    rig.dialog.next.push(fixturePlace('cdf'));
    await rig.ok('performance:choose-and-import', { kind: 'cdf' });
    const again = await rig.ok<PerfImportSummary>('performance:import', { kind: 'cdf' });
    expect(again).toMatchObject({ kind: 'cdf', filesRead: 10, rows: 318, problems: [] });
  });

  it('says a missing folder is missing (an unplugged USB stick), on the card and in Sync now', async () => {
    const copy = mkdtempSync(path.join(folder, 'usb-'));
    cpSync(path.join(perfFixtures, 'dsb'), path.join(copy, 'dsb'), { recursive: true });
    const rig = makeRig();
    rig.dialog.next.push(path.join(copy, 'dsb'));
    await rig.ok('performance:choose-and-import', { kind: 'dsb' });
    rmSync(path.join(copy, 'dsb'), { recursive: true });
    const card = (await rig.ok<PerfImportCard[]>('performance:import-cards')).find(
      (c) => c.kind === 'dsb',
    )!;
    expect(card).toMatchObject({ folderName: 'dsb', folderMissing: true });
    const sync = await rig.ok<SyncSummary>('performance:sync-now');
    expect(sync).toMatchObject({ newFiles: 0, missingFolders: ['dsb'], problems: [] });
    const again = await rig.call('performance:import', { kind: 'dsb' });
    expect(again).toMatchObject({ ok: false, reason: 'refused' });
    expect(String(again.message)).toContain('USB stick');
  });

  it('reports a broken file by name and row, and an unreadable PDF, without stopping', async () => {
    const mixed = mkdtempSync(path.join(folder, 'broken-'));
    writeFileSync(
      path.join(mixed, 'DSP_Customer_Delivery_Feedback_negative_XXX1_nodate.csv'),
      'a,b\n1,2\n',
    );
    cpSync(
      path.join(perfFixtures, 'cdf', 'DSP_Customer_Delivery_Feedback_negative_XXX1_2026-W31.csv'),
      path.join(mixed, 'DSP_Customer_Delivery_Feedback_negative_XXX1_2026-W31.csv'),
    );
    const rig = makeRig();
    rig.dialog.next.push(mixed);
    const summary = await rig.ok<PerfImportSummary>('performance:choose-and-import', {
      kind: 'cdf',
    });
    expect(summary.filesRead).toBe(1);
    expect(summary.problems).toHaveLength(1);
    expect(summary.problems[0]).toContain(
      'DSP_Customer_Delivery_Feedback_negative_XXX1_nodate.csv',
    );

    const pdfs = mkdtempSync(path.join(folder, 'pdfs-'));
    writeFileSync(path.join(pdfs, 'US-XXXX-XXX1-Week31-2026NA-DA-POD-Details.pdf'), 'not a pdf');
    rig.dialog.next.push(pdfs);
    const pod = await rig.ok<PerfImportSummary>('performance:choose-and-import', { kind: 'pod' });
    expect(pod.filesRead).toBe(0);
    expect(pod.problems[0]).toMatch(/could not be opened/);
  });
});

describe('making reports in one window', () => {
  it('hands the whole batch to the batch printer when there is one', async () => {
    const rig = makeRig({ batch: true });
    for (const kind of ['roster', 'scorecards'] as const) {
      rig.dialog.next.push(fixturePlace(kind));
      await rig.ok('performance:choose-and-import', { kind });
    }
    const view = await rig.ok<PerfDriversView>('performance:drivers', { range: null });
    const ids = view.rows.filter((r) => r.activeInRange).map((r) => r.transporterId);
    const out = mkdtempSync(path.join(folder, 'batch-'));
    rig.dialog.next.push(out);
    const done = await rig.ok<GenerateOutcome>('performance:generate', {
      transporterIds: ids,
      range: view.range,
    });
    expect(done).toMatchObject({ status: 'written', written: ids.length, failed: 0 });
    expect(rig.batches).toEqual([ids.length]);
    expect(readdirSync(out)).toHaveLength(ids.length);
  });
});

describe('counting up and showing the folder', () => {
  async function smallRig(batch: boolean) {
    const rig = makeRig({ batch });
    for (const kind of ['roster', 'scorecards'] as const) {
      rig.dialog.next.push(fixturePlace(kind));
      await rig.ok('performance:choose-and-import', { kind });
    }
    const view = await rig.ok<PerfDriversView>('performance:drivers', { range: null });
    return { rig, view, ids: view.rows.filter((r) => r.activeInRange).map((r) => r.transporterId) };
  }

  for (const batch of [true, false]) {
    it(`counts up while making reports, not too often, ending on the total (${batch ? 'one window' : 'one by one'})`, async () => {
      const { rig, view, ids } = await smallRig(batch);
      expect(ids.length).toBeGreaterThan(20);
      rig.dialog.next.push(mkdtempSync(path.join(folder, 'count-')));
      await rig.ok('performance:generate', { transporterIds: ids, range: view.range });
      const sent = rig.progress;
      expect(sent.every((p) => p.job === 'generate' && p.total === ids.length)).toBe(true);
      expect(sent[0]!.done).toBe(0);
      expect(sent.at(-1)!.done).toBe(ids.length);
      for (let i = 1; i < sent.length; i++)
        expect(sent[i]!.done).toBeGreaterThan(sent[i - 1]!.done);
      // The stand-in printer is instant, so the counts in between are held back.
      expect(sent.length).toBeLessThan(ids.length);
    });
  }

  it('shows the folder the reports went to and the check file, and says so when nothing was written', async () => {
    const { rig, view, ids } = await smallRig(true);
    expect(await rig.call('performance:show-last-output', { what: 'reports' })).toEqual({
      ok: false,
      reason: 'refused',
      message: 'No reports have been made since the app was opened, so there is no folder to show.',
    });
    expect(await rig.call('performance:show-last-output', { what: 'check-file' })).toMatchObject({
      ok: false,
      reason: 'refused',
    });
    expect(await rig.call('performance:show-last-output', { what: 'somewhere' })).toMatchObject({
      ok: false,
      reason: 'bad-input',
    });

    const out = mkdtempSync(path.join(folder, 'shown-'));
    rig.dialog.next.push(out);
    await rig.ok('performance:generate', { transporterIds: ids.slice(0, 2), range: view.range });
    expect(await rig.ok('performance:show-last-output', { what: 'reports' })).toEqual({
      opened: true,
    });
    expect(rig.shown).toEqual([['folder', out]]);

    const target = path.join(out, 'check');
    rig.dialog.next.push(target);
    await rig.ok('performance:export-check-file', { transporterIds: ids.slice(0, 2) });
    expect(await rig.ok('performance:show-last-output', { what: 'check-file' })).toEqual({
      opened: true,
    });
    expect(rig.shown.at(-1)).toEqual(['file', `${target}.csv`]);
    // Quiet: showing a folder is not a change to the data.
    const before = rig.changes();
    await rig.ok('performance:show-last-output', { what: 'reports' });
    expect(rig.changes()).toBe(before);
    // A file that was moved since is said in plain words.
    rmSync(`${target}.csv`);
    expect(await rig.call('performance:show-last-output', { what: 'check-file' })).toEqual({
      ok: false,
      reason: 'refused',
      message: 'That file is not there now. It may have been moved or deleted.',
    });
    expect(rig.logs.join('\n')).not.toContain(out);
  });
});

describe('dropping a file or a folder', () => {
  it('sorts a folder that mixes kinds by file name, and reads each token once', async () => {
    const mixed = mkdtempSync(path.join(folder, 'mixed-'));
    cpSync(fixturePlace('roster'), path.join(mixed, 'AssociateData.csv'));
    for (const name of readdirSync(path.join(perfFixtures, 'scorecards')).slice(0, 2)) {
      cpSync(path.join(perfFixtures, 'scorecards', name), path.join(mixed, name));
    }
    writeFileSync(path.join(mixed, 'notes.txt'), 'nothing');
    const rig = makeRig();
    const tokens = await rig.ok<Array<{ kind: PerfKind; token: string; files: number }>>(
      'performance:dropped',
      { kind: null, path: mixed },
    );
    expect(tokens.map((t) => [t.kind, t.files])).toEqual([
      ['roster', 1],
      ['scorecards', 2],
    ]);
    for (const t of tokens) {
      expect(t.token).toMatch(new RegExp(`^dropped-[0-9a-f-]+/${path.basename(mixed)}$`));
      expect(t.token).not.toContain(folder);
    }
    // Dropping changes nothing by itself.
    expect(rig.changes()).toBe(0);
    expect((await snapshot(rig)).performance.drivers).toBe(0);

    const scorecards = tokens.find((t) => t.kind === 'scorecards')!;
    expect(
      await rig.call('performance:import', { kind: 'roster', token: scorecards.token }),
    ).toEqual({ ok: false, reason: 'not-allowed' });
    // A token used for the wrong kind is gone too: drop again.
    const again = await rig.ok<Array<{ kind: PerfKind; token: string }>>('performance:dropped', {
      kind: 'scorecards',
      path: mixed,
    });
    const done = await rig.ok<PerfImportSummary>('performance:import', {
      kind: 'scorecards',
      token: again[0]!.token,
    });
    expect(done.filesRead).toBe(2);
    expect(done.weeks).toEqual(['2026-W31', '2026-W32']);
    expect(
      await rig.call('performance:import', { kind: 'scorecards', token: again[0]!.token }),
    ).toEqual({ ok: false, reason: 'not-allowed' });
    const roster = tokens.find((t) => t.kind === 'roster')!;
    expect(
      await rig.ok('performance:import', { kind: 'roster', token: roster.token }),
    ).toMatchObject({
      filesRead: 1,
      rows: 76,
    });
    expect(rig.logs.join('\n')).not.toContain(path.basename(mixed));
  });

  it('takes one dropped file, and refuses a wrong one in plain words', async () => {
    const rig = makeRig();
    const file = path.join(perfFixtures, 'dcr', readdirSync(path.join(perfFixtures, 'dcr'))[0]!);
    const one = await rig.ok<Array<{ kind: PerfKind; files: number }>>('performance:dropped', {
      kind: null,
      path: file,
    });
    expect(one).toMatchObject([{ kind: 'dcr', files: 1 }]);
    expect(await rig.call('performance:dropped', { kind: 'pod', path: file })).toEqual({
      ok: false,
      reason: 'refused',
      message: "That file doesn't look like the POD reports. It should end in .pdf.",
    });
    const odd = path.join(mkdtempSync(path.join(folder, 'odd-')), 'holiday.csv');
    writeFileSync(odd, 'x');
    expect(await rig.call('performance:dropped', { kind: null, path: odd })).toEqual({
      ok: false,
      reason: 'refused',
      message:
        "The app couldn't tell which export that file is from its name. Drop it on its card instead.",
    });
    expect(
      await rig.call('performance:dropped', { kind: 'cdf', path: path.join(folder, 'gone.csv') }),
    ).toMatchObject({ ok: false, reason: 'refused' });
    expect(rig.logs.join('\n')).not.toContain('holiday');
  });
});

describe('Sync now', () => {
  it('brings in new files once, then nothing, then only a file that changed', async () => {
    const copy = mkdtempSync(path.join(folder, 'sync-'));
    for (const kind of ['roster', 'scorecards', 'cdf', 'psb'] as const) {
      cpSync(path.join(perfFixtures, kind), path.join(copy, kind), { recursive: true });
    }
    const rig = makeRig({
      settingsJson: {
        performanceFolders: {
          roster: fixturePlace('roster', copy),
          scorecards: path.join(copy, 'scorecards'),
          cdf: path.join(copy, 'cdf'),
          psb: path.join(copy, 'psb'),
        },
      },
    });
    const first = await rig.ok<SyncSummary>('performance:sync-now');
    expect(first).toMatchObject({ newFiles: 31, missingFolders: [], problems: [] });
    // Ten scorecard weeks, the same ten CDF weeks, and ten older PSB weeks.
    expect(first.weeksUpdated).toBe(20);
    expect((await snapshot(rig)).performance).toMatchObject({ drivers: 92, lastSync: first });

    const second = await rig.ok<SyncSummary>('performance:sync-now');
    expect(second).toMatchObject({ newFiles: 0, weeksUpdated: 0 });

    const touched = path.join(
      copy,
      'cdf',
      'DSP_Customer_Delivery_Feedback_negative_XXX1_2026-W35.csv',
    );
    const later = new Date(Date.now() + 60_000);
    utimesSync(touched, later, later);
    const third = await rig.ok<SyncSummary>('performance:sync-now');
    expect(third).toMatchObject({ newFiles: 1, weeksUpdated: 1 });
    expect(rig.logs.join('\n')).toContain('sync: 1 new files');
    expect(rig.logs.join('\n')).not.toContain('Feedback');
  }, 30_000);

  it('tries a file that failed again next time, and says which kind each problem is about', async () => {
    const copy = mkdtempSync(path.join(folder, 'retry-'));
    const good = 'DSP_Customer_Delivery_Feedback_negative_XXX1_2026-W31.csv';
    cpSync(path.join(perfFixtures, 'cdf', good), path.join(copy, good));
    writeFileSync(
      path.join(copy, 'DSP_Customer_Delivery_Feedback_negative_XXX1_nodate.csv'),
      'a,b\n1,2\n',
    );
    const rig = makeRig({ settingsJson: { performanceFolders: { cdf: copy } } });
    const first = await rig.ok<SyncSummary>('performance:sync-now');
    expect(first).toMatchObject({ newFiles: 1, weeksUpdated: 1 });
    expect(first.rows).toBeGreaterThan(0);
    expect(first.problems).toHaveLength(1);
    expect(first.problems[0]).toMatch(/^Customer feedback \(CDF\): .*nodate\.csv/);
    // The good file is not read again; the one that failed is.
    const second = await rig.ok<SyncSummary>('performance:sync-now');
    expect(second).toMatchObject({ newFiles: 0, rows: 0 });
    expect(second.problems).toEqual(first.problems);
  });

  it('runs on startup only when it is on, a folder is remembered and demo mode is off', async () => {
    const none = makeRig();
    expect(none.settings().performance.autoImportOnStartup).toBe(true);
    expect(none.service.shouldAutoImport(none.settings().performance)).toBe(false);
    const rig = makeRig({
      settingsJson: { performanceFolders: { cdf: path.join(perfFixtures, 'cdf') } },
    });
    expect(rig.service.shouldAutoImport(rig.settings().performance)).toBe(true);
    rig.setSettings({ performance: { autoImportOnStartup: false } });
    expect(rig.service.shouldAutoImport(rig.settings().performance)).toBe(false);
    rig.setSettings({ performance: { autoImportOnStartup: true } });
    rig.switchTo(true);
    expect(rig.service.shouldAutoImport(rig.settings().performance)).toBe(false);
    await rig.host.perfLoading;
  });

  it('does not bring in files from the folders in demo mode', async () => {
    const rig = makeRig({
      settingsJson: { performanceFolders: { cdf: path.join(perfFixtures, 'cdf') } },
    });
    rig.switchTo(true);
    expect(await rig.call('performance:sync-now')).toMatchObject({ ok: false, reason: 'refused' });
    await rig.host.perfLoading;
  });
});

describe('demo mode', () => {
  it('loads the made-up weekly performance data after it opens, and the real data is untouched', async () => {
    const rig = makeRig();
    let announced = 0;
    // The rig's host announces nothing by itself; watch the loading finish instead.
    rig.switchTo(true);
    expect((await snapshot(rig)).performance.hasData).toBe(false);
    await rig.host.perfLoading.then(() => announced++);
    expect(announced).toBe(1);
    const demo = await snapshot(rig);
    expect(demo.performance).toMatchObject({ hasData: true, drivers: 92, thresholds: true });
    expect(demo.performance.weeks).toHaveLength(10);
    const dash = await rig.ok<PerfDashboardView>('performance:dashboard', { range: null });
    expect(dash.fleetAverage).toBe(
      expected<{ latestFleetAvg: number }>('fleet-summary.json').latestFleetAvg,
    );
    // Demo mode never shows or uses the real folders.
    expect((await snapshot(rig)).performance.foldersChosen).toBe(0);

    rig.switchTo(false);
    expect((await snapshot(rig)).performance.hasData).toBe(false);
  }, 30_000);

  it('refuses to send real emails in demo mode, but a dry run works', async () => {
    const rig = makeRig();
    rig.switchTo(true);
    await rig.host.perfLoading;
    const view = await rig.ok<PerfDriversView>('performance:drivers', { range: null });
    const ids = view.rows
      .filter((r) => r.hasEmail && r.activeInRange)
      .slice(0, 1)
      .map((r) => r.transporterId);
    expect(
      (
        await rig.ok<EmailOutcome>('performance:email', {
          transporterIds: ids,
          range: view.range,
          dryRun: true,
        })
      ).wouldSend,
    ).toHaveLength(1);
    expect(
      await rig.call('performance:email', {
        transporterIds: ids,
        range: view.range,
        dryRun: false,
      }),
    ).toMatchObject({ ok: false, reason: 'refused' });
  }, 30_000);
});

describe('the old Weekly Performance App’s data', () => {
  /** An old app.db with the drivers and scorecards the old app stored from the fixtures. */
  function buildOldDb(file: string): number {
    const table = (name: string) =>
      expected<{ columns: string[]; rows: Array<Record<string, unknown>> }>(`tables/${name}.json`);
    const db = new Database(file);
    db.exec(`
      CREATE TABLE Drivers (TransporterId TEXT PRIMARY KEY, Name TEXT NOT NULL, Status TEXT,
        Position TEXT, Qualifications TEXT, IdExpiration TEXT, PersonalPhone TEXT, WorkPhone TEXT,
        Email TEXT);
      CREATE TABLE WeeklyScorecards (Id INTEGER PRIMARY KEY AUTOINCREMENT,
        TransporterId TEXT NOT NULL, Week TEXT NOT NULL, OverallStanding TEXT, OverallScore REAL,
        PackagesDelivered INTEGER, SourceFile TEXT, UNIQUE (TransporterId, Week));
    `);
    let rows = 0;
    // One transaction: row by row, each insert waits for the disk, which is very slow on Windows.
    db.exec('BEGIN');
    for (const name of ['Drivers', 'WeeklyScorecards']) {
      const { columns, rows: list } = table(name);
      const insert = db.prepare(
        `INSERT INTO ${name} (${columns.join(', ')}) VALUES (${columns.map((c) => `@${c}`).join(', ')})`,
      );
      for (const row of list) {
        insert.run(Object.fromEntries(columns.map((c) => [c, row[c] ?? null])));
        rows++;
      }
    }
    db.exec('COMMIT');
    db.close();
    return rows;
  }

  it('finds it, brings it over once, and the weekly data shows', async () => {
    const rig = makeRig();
    expect(await rig.ok('performance:old-data-find')).toEqual({
      found: false,
      empty: true,
      demo: false,
    });
    expect(await rig.call('performance:old-data-run', { from: 'usual' })).toMatchObject({
      ok: false,
      reason: 'refused',
    });
    rig.oldWpaFile.path = path.join(folder, `old-${Date.now()}.db`);
    buildOldDb(rig.oldWpaFile.path);
    expect(await rig.ok('performance:old-data-find')).toEqual({
      found: true,
      empty: true,
      demo: false,
    });
    const result = await rig.ok<{
      status: string;
      counts: Array<{ table: string; imported: number }>;
    }>('performance:old-data-run', { from: 'usual' });
    expect(result.status).toBe('imported');
    expect(result.counts.find((c) => c.table === 'perf_drivers')!.imported).toBe(92);
    expect(result.counts.find((c) => c.table === 'perf_weekly_scorecards')!.imported).toBe(647);
    const snap = await snapshot(rig);
    expect(snap.performance).toMatchObject({ hasData: true, drivers: 92 });
    expect(snap.performance.weeks).toHaveLength(10);
    // A second time skips: weekly data is never written over.
    expect(await rig.ok('performance:old-data-find')).toMatchObject({ empty: false });
    expect(
      (await rig.ok<{ status: string }>('performance:old-data-run', { from: 'usual' })).status,
    ).toBe('skipped');
  });

  it('reads only a chosen .db file, and refuses in demo mode', async () => {
    const rig = makeRig();
    rig.dialog.next.push(path.join(folder, 'photo.png'));
    expect(await rig.ok('performance:old-data-pick')).toEqual({ chosen: false });
    expect(await rig.call('performance:old-data-run', { from: 'chosen' })).toEqual({
      ok: false,
      reason: 'not-allowed',
    });
    rig.switchTo(true);
    expect(await rig.call('performance:old-data-run', { from: 'usual' })).toMatchObject({
      ok: false,
      reason: 'refused',
      message: 'Demo mode is on. Turn it off first, then bring over your weekly performance data.',
    });
    await rig.host.perfLoading;
  });
});

describe('with no saved data open', () => {
  it('every weekly performance query says so', async () => {
    const rig = makeRig();
    rig.source.close();
    rig.host.rebuild();
    expect(await rig.call('performance:drivers', { range: null })).toEqual({
      ok: false,
      reason: 'no-data',
    });
    expect(await rig.call('performance:sync-now')).toEqual({ ok: false, reason: 'no-data' });
  });
});
