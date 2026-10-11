// The weekly performance side of the main process, behind the performance:* handlers: choosing
// and remembering the export folders, bringing files in, Sync now, the reports, the check file,
// email, and the email app password. Everything that needs Electron or the computer is handed in
// (`PerfServiceDeps`), so the handler tests run it with stand-ins.
//
// Folders and the password are kept here (in the main-only part of the settings file) and never
// reach a page: a page sees a folder's last part only, and whether a password is saved.

import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import {
  getDriverReport,
  getPsbImportedWeeks,
  getThresholds,
  buildVerificationExport,
  type PerfData,
} from '@loadout/performance';
import type { IsoDate } from '@loadout/core';
import type {
  CheckFileOutcome,
  EmailOutcome,
  EmailStatus,
  GenerateOutcome,
  PerfImportSummary,
  PerfKind,
  PerfOutput,
  PerfProgress,
  SyncSummary,
  WeekRange,
} from '../../shared/performance';
import { PERF_KIND_WORDS, SINGLE_FILE_KINDS } from '../../shared/performance';
import { fillTemplate, type PerformanceSettings } from '../../shared/performanceSettings';
import { ChannelRefusal } from '../channels';
import type { MainOnlySettings } from '../settingsFile';
import { filesAt, runSync } from './autoImport';
import { takeDrop, useDrop, type PerfDrops } from './drops';
import {
  describeConnectProblem,
  describeSendProblem,
  sender,
  setupProblem,
  smtpConfig,
  type MailTransport,
  type TransportFactory,
} from './mailer';
import type { PerfHost, PerfStatus } from './perfHost';
import { LEDGER_SOURCE, importExportFiles, type ExportFile } from './readExports';
import type { ReportInput } from './report';
import { reportFileName } from './report';
import { resolveRange, type CardFolder } from './views';

/** The computer's safe storage for the app password (Electron's safeStorage). */
export interface Sealer {
  isEncryptionAvailable(): boolean;
  encryptString(plain: string): Buffer;
  decryptString(sealed: Buffer): string;
}

/** The report maker (./report). */
export interface ReportMaker {
  buildReportHtml(input: ReportInput): string;
  sampleReportHtml(colours: PerformanceSettings['colours']): string;
  printHtmlToPdf(html: string, outFile: string): Promise<void>;
  /** Many reports in one hidden window, one after another. Each result says if it was written. */
  printHtmlBatch?(
    items: ReadonlyArray<{ html: string; outFile: string }>,
    onProgress?: (done: number, total: number) => void,
  ): Promise<Array<{ ok: boolean }>>;
}

export interface PerfDialogs {
  /** The folder window. The chosen folder, or null. */
  chooseFolder(title: string, startIn: string | null): Promise<string | null>;
  /** The file window, for one kind of file. The chosen file, or null. */
  chooseFile(
    title: string,
    filters: Array<{ name: string; extensions: string[] }>,
    startIn: string | null,
  ): Promise<string | null>;
  /** The save window. The chosen file, or null. */
  chooseSaveFile(
    title: string,
    defaultName: string,
    filters: Array<{ name: string; extensions: string[] }>,
  ): Promise<string | null>;
}

/** "Show in folder": the computer's own file browser (Electron's shell). */
export interface PerfFolderOpener {
  /** Opens the folder holding the file, with the file picked out. Whether it worked. */
  showFile(file: string): boolean | Promise<boolean>;
  /** Opens a folder. Whether it worked. */
  openFolder(folder: string): Promise<boolean>;
}

/** Progress is sent at most this often, apart from the first and the last count. */
const PROGRESS_EVERY_MS = 100;

export interface PerfServiceDeps {
  /** The weekly data of the open saved data (refuses "no-data" when it did not open). */
  host(): PerfHost;
  performance(): PerformanceSettings;
  demo(): boolean;
  mainOnly(): MainOnlySettings;
  updateMainOnly(change: (current: MainOnlySettings) => MainOnlySettings): void;
  dialogs: PerfDialogs;
  sealer: Sealer;
  transport: TransportFactory;
  report: ReportMaker;
  openFile(file: string): Promise<boolean>;
  folders: PerfFolderOpener;
  /** Sends how far making or emailing the reports has got (performance:progress). */
  progress?(progress: PerfProgress): void;
  tempFolder(): string;
  today(): IsoDate;
  now?: () => Date;
  /** Counts and codes only. */
  log(message: string): void;
}

const WINDOW_TITLES: Record<PerfKind, string> = {
  roster: 'Choose the driver list (AssociateData.csv)',
  thresholds: 'Choose the thresholds file',
  scorecards: 'Choose the folder with the weekly scorecards',
  pod: 'Choose the folder with the POD report PDFs',
  cdf: 'Choose the folder with the customer feedback files',
  dsb: 'Choose the folder with the delivery concessions files',
  psb: 'Choose the folder with the pickup failures files',
  dcr: 'Choose the folder with the returned-package files',
  'dcr-totals': 'Choose the folder with the DCR weekly totals',
  safety: 'Choose the folder with the safety files',
};

function stamp(date: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return (
    `${date.getFullYear()}${p(date.getMonth() + 1)}${p(date.getDate())}_` +
    `${p(date.getHours())}${p(date.getMinutes())}${p(date.getSeconds())}`
  );
}

/** The old app's SafeFileName: characters Windows does not allow become "_". */
function safeFileName(name: string): string {
  return [...(name || 'driver')]
    .map((ch) => (ch.charCodeAt(0) < 32 || '<>:"/\\|?*'.includes(ch) ? '_' : ch))
    .join('');
}

export class PerfService {
  readonly drops: PerfDrops = new Map();
  private lastSync: SyncSummary | null = null;
  private busy = false;
  /** Where the reports and the check file were last written this run (never shown to a page). */
  private lastOutput: Record<PerfOutput, string | null> = { reports: null, 'check-file': null };

  constructor(private readonly deps: PerfServiceDeps) {}

  private now(): Date {
    return this.deps.now?.() ?? new Date();
  }

  /**
   * Counts a job up for the page: the first and last counts always go, the ones between at most
   * every PROGRESS_EVERY_MS. Counts only, never who.
   */
  private counter(job: PerfProgress['job'], total: number): (done: number) => void {
    let sentAt = -Infinity;
    let sentDone = -1;
    return (done) => {
      if (!this.deps.progress || done === sentDone) return;
      const at = this.now().getTime();
      if (done !== 0 && done !== total && at - sentAt < PROGRESS_EVERY_MS) return;
      sentAt = at;
      sentDone = done;
      this.deps.progress({ job, done, total });
    };
  }

  // ---- what the snapshot carries --------------------------------------------------------

  status(): PerfStatus {
    const kept = this.deps.mainOnly();
    const demo = this.deps.demo();
    return {
      foldersChosen: demo ? 0 : Object.keys(kept.performanceFolders).length,
      lastSync: this.lastSync,
      emailReady: this.emailReady(),
      reportsMade: kept.performanceFlags.reportsMade,
      reportsEmailed: kept.performanceFlags.reportsEmailed,
    };
  }

  // ---- folders -----------------------------------------------------------------------------

  /** A card's folder: its last part only, and whether it is there now. Hidden in demo mode. */
  cardFolder(kind: PerfKind): CardFolder {
    const place = this.deps.demo() ? undefined : this.deps.mainOnly().performanceFolders[kind];
    if (!place) return { folderName: null, folderMissing: false };
    return { folderName: path.basename(place), folderMissing: filesAt(kind, place) === null };
  }

  /** When each kind was last brought in, from the record of imported files. */
  lastImportAt(): (kind: PerfKind) => string | null {
    const latest = new Map<string, string>();
    for (const entry of this.deps.host().store.ledgerList()) {
      const seen = latest.get(entry.source);
      if (!seen || entry.importedAtUtc > seen) latest.set(entry.source, entry.importedAtUtc);
    }
    return (kind) => {
      const value = latest.get(LEDGER_SOURCE[kind]);
      if (!value) return null;
      const time = new Date(value);
      return Number.isNaN(time.getTime()) ? null : time.toISOString();
    };
  }

  forgetFolder(kind: PerfKind): void {
    this.deps.updateMainOnly((kept) => {
      const folders = { ...kept.performanceFolders };
      delete folders[kind];
      return { ...kept, performanceFolders: folders };
    });
  }

  private async exclusive<T>(work: () => Promise<T>): Promise<T> {
    if (this.busy) {
      throw new ChannelRefusal(
        'refused',
        'The app is already bringing in files. Try again in a moment.',
      );
    }
    this.busy = true;
    try {
      return await work();
    } finally {
      this.busy = false;
    }
  }

  private async importFiles(kind: PerfKind, files: ExportFile[]): Promise<PerfImportSummary> {
    const host = this.deps.host();
    const { summary } = await importExportFiles(host, kind, files);
    this.deps.log(
      `performance import (${kind}): ${files.length} files, ${summary.filesRead} read, ` +
        `${summary.rows} rows, ${summary.problems.length} problems`,
    );
    return summary;
  }

  /** Opens the folder (or file) window, remembers the choice, and brings it in. */
  async chooseAndImport(kind: PerfKind): Promise<PerfImportSummary | null> {
    const remembered = this.deps.demo() ? undefined : this.deps.mainOnly().performanceFolders[kind];
    const single = SINGLE_FILE_KINDS.includes(kind);
    const startIn = remembered ? (single ? path.dirname(remembered) : remembered) : null;
    const chosen = single
      ? await this.deps.dialogs.chooseFile(
          WINDOW_TITLES[kind],
          [{ name: PERF_KIND_WORDS[kind].title, extensions: ['csv'] }],
          startIn !== null && existsSync(startIn) ? startIn : null,
        )
      : await this.deps.dialogs.chooseFolder(
          WINDOW_TITLES[kind],
          startIn !== null && existsSync(startIn) ? startIn : null,
        );
    if (chosen === null) return null;
    const files = filesAt(kind, chosen);
    if (files === null) {
      throw new ChannelRefusal('refused', 'That could not be opened. Choose it again.');
    }
    if (single && !PERF_KIND_WORDS[kind].endings.includes(path.extname(chosen).toLowerCase())) {
      const words = PERF_KIND_WORDS[kind];
      throw new ChannelRefusal(
        'refused',
        `That file doesn't look like ${words.the}. It should end in ${words.endings[0]}.`,
      );
    }
    // In demo mode the choice is used once and not remembered, so the real setup is untouched.
    if (!this.deps.demo()) {
      this.deps.updateMainOnly((kept) => ({
        ...kept,
        performanceFolders: { ...kept.performanceFolders, [kind]: chosen },
      }));
    }
    if (files.length === 0) {
      throw new ChannelRefusal(
        'refused',
        `There are no files for ${PERF_KIND_WORDS[kind].the} in that folder.`,
      );
    }
    return this.exclusive(() => this.importFiles(kind, files));
  }

  /** Brings this kind in again from its remembered place, or from a dropped token. */
  async import(kind: PerfKind, token: string | undefined): Promise<PerfImportSummary> {
    if (token !== undefined) {
      const files = useDrop(this.drops, kind, token);
      return this.exclusive(() => this.importFiles(kind, files));
    }
    const place = this.deps.demo() ? undefined : this.deps.mainOnly().performanceFolders[kind];
    if (!place) {
      throw new ChannelRefusal(
        'refused',
        `Choose where ${PERF_KIND_WORDS[kind].the} are kept first.`,
      );
    }
    const files = filesAt(kind, place);
    if (files === null) {
      throw new ChannelRefusal(
        'refused',
        `The folder for ${PERF_KIND_WORDS[kind].the} is not there now. If it is on a USB stick, ` +
          'plug it in, or choose the folder again.',
      );
    }
    if (files.length === 0) {
      throw new ChannelRefusal(
        'refused',
        `There are no files for ${PERF_KIND_WORDS[kind].the} in that folder.`,
      );
    }
    return this.exclusive(() => this.importFiles(kind, files));
  }

  dropped(kind: PerfKind | null, place: string) {
    return takeDrop(this.drops, kind, place);
  }

  /** Brings in every new or changed file from the remembered places (Sync now, auto-import). */
  async syncNow(): Promise<SyncSummary> {
    if (this.deps.demo()) {
      throw new ChannelRefusal(
        'refused',
        'Demo mode is on. Turn it off to bring in new files from your folders.',
      );
    }
    return this.exclusive(async () => {
      const summary = await runSync(
        this.deps.host(),
        this.deps.mainOnly().performanceFolders,
        this.now(),
      );
      this.lastSync = summary;
      this.deps.log(
        `sync: ${summary.newFiles} new files, ${summary.rows} rows, ${summary.weeksUpdated} weeks, ` +
          `${summary.missingFolders.length} folders missing, ${summary.problems.length} problems`,
      );
      return summary;
    });
  }

  /** Whether auto-import should run when the app opens. */
  shouldAutoImport(settings: PerformanceSettings): boolean {
    return (
      settings.autoImportOnStartup &&
      !this.deps.demo() &&
      Object.keys(this.deps.mainOnly().performanceFolders).length > 0
    );
  }

  // ---- reports -------------------------------------------------------------------------------

  private reportInput(data: PerfData, transporterId: string, range: WeekRange): ReportInput | null {
    const report = getDriverReport(data, transporterId, range.from, range.to);
    if (report === null || report.scorecards.length === 0) return null;
    return {
      data: report,
      thresholds: getThresholds(data),
      colours: this.deps.performance().colours,
      psbImportedWeeks: getPsbImportedWeeks(data, range.from, range.to),
    };
  }

  private markFlag(flag: 'reportsMade' | 'reportsEmailed'): void {
    if (this.deps.demo() || this.deps.mainOnly().performanceFlags[flag]) return;
    this.deps.updateMainOnly((kept) => ({
      ...kept,
      performanceFlags: { ...kept.performanceFlags, [flag]: true },
    }));
  }

  reportHtml(
    transporterId: string | null,
    range: WeekRange | null,
    colours: Record<string, unknown> | undefined,
    mergeColours: (raw: unknown) => PerformanceSettings['colours'],
  ): { html: string } {
    if (transporterId === null) {
      return { html: this.deps.report.sampleReportHtml(mergeColours(colours)) };
    }
    const data = this.deps.host().data();
    const resolved = resolveRange(data, range);
    const driver = data.drivers.find((d) => d.transporterId === transporterId);
    if (!driver) {
      throw new ChannelRefusal('refused', 'That driver is not on the driver list any more.');
    }
    const input = resolved === null ? null : this.reportInput(data, transporterId, resolved);
    if (input === null) {
      throw new ChannelRefusal('refused', `${driver.name} has no scores in these weeks.`);
    }
    if (colours !== undefined) input.colours = mergeColours(colours);
    return { html: this.deps.report.buildReportHtml(input) };
  }

  async generate(ids: readonly string[], range: WeekRange): Promise<GenerateOutcome> {
    const data = this.deps.host().data();
    const jobs = ids
      .map((id) => ({ id, input: this.reportInput(data, id, range) }))
      .filter((job): job is { id: string; input: ReportInput } => job.input !== null);
    if (jobs.length === 0) return { status: 'nothing' };
    const folder = await this.deps.dialogs.chooseFolder('Where should the reports be saved?', null);
    if (folder === null) return { status: 'cancelled' };
    const items = jobs.map(({ input }) => ({
      html: this.deps.report.buildReportHtml(input),
      outFile: path.join(
        folder,
        reportFileName(input.data.name, input.data.transporterId, range.from, range.to),
      ),
    }));
    const results = await this.printAll(items, 'generate');
    const written = results.filter(Boolean).length;
    const failed = items.length - written;
    const skipped = ids.length - jobs.length;
    this.deps.log(`reports: ${written} written, ${failed} failed, ${skipped} with no scores`);
    if (written > 0) {
      this.markFlag('reportsMade');
      this.lastOutput.reports = folder;
    }
    return { status: 'written', folderName: path.basename(folder), written, failed, skipped };
  }

  /**
   * Prints reports to PDF files: in one hidden window when the report maker can (the batch
   * printer), else one by one. Whether each file was written, in order.
   */
  private async printAll(
    items: ReadonlyArray<{ html: string; outFile: string }>,
    job: PerfProgress['job'],
  ): Promise<boolean[]> {
    if (items.length === 0) return [];
    const count = this.counter(job, items.length);
    count(0);
    if (this.deps.report.printHtmlBatch) {
      try {
        const results = await this.deps.report.printHtmlBatch(items, (done) => count(done));
        return items.map((_item, index) => results[index]?.ok === true);
      } catch {
        return items.map(() => false);
      } finally {
        count(items.length);
      }
    }
    const out: boolean[] = [];
    for (const item of items) {
      try {
        await this.deps.report.printHtmlToPdf(item.html, item.outFile);
        out.push(true);
      } catch {
        out.push(false);
      }
      count(out.length);
    }
    return out;
  }

  /** "Show in folder" for what was last written this run. Refuses in plain words if nothing was. */
  async showLastOutput(what: PerfOutput): Promise<{ opened: boolean }> {
    const place = this.lastOutput[what];
    if (place === null) {
      throw new ChannelRefusal(
        'refused',
        what === 'reports'
          ? 'No reports have been made since the app was opened, so there is no folder to show.'
          : 'No check file has been saved since the app was opened, so there is no folder to show.',
      );
    }
    if (!existsSync(place)) {
      throw new ChannelRefusal(
        'refused',
        what === 'reports'
          ? 'That folder is not there now. It may have been moved, or be on a USB stick that is unplugged.'
          : 'That file is not there now. It may have been moved or deleted.',
      );
    }
    let opened: boolean;
    try {
      opened =
        what === 'reports'
          ? await this.deps.folders.openFolder(place)
          : await this.deps.folders.showFile(place);
    } catch {
      opened = false;
    }
    this.deps.log(`show in folder (${what}): ${opened ? 'opened' : 'did not open'}`);
    return { opened };
  }

  private reportsTemp(...parts: string[]): string {
    const folder = path.join(this.deps.tempFolder(), 'Loadout Builder reports', ...parts);
    mkdirSync(folder, { recursive: true });
    return folder;
  }

  async previewPdf(transporterId: string, range: WeekRange): Promise<{ opened: boolean }> {
    const data = this.deps.host().data();
    const driver = data.drivers.find((d) => d.transporterId === transporterId);
    if (!driver) {
      throw new ChannelRefusal('refused', 'That driver is not on the driver list any more.');
    }
    const input = this.reportInput(data, transporterId, range);
    if (input === null) {
      throw new ChannelRefusal('refused', `${driver.name} has no scores in these weeks.`);
    }
    const file = path.join(
      this.reportsTemp(),
      reportFileName(driver.name, transporterId, range.from, range.to),
    );
    try {
      await this.deps.report.printHtmlToPdf(this.deps.report.buildReportHtml(input), file);
    } catch {
      this.deps.log('preview: the report could not be made');
      throw new ChannelRefusal('refused', 'The report could not be made. Try again.');
    }
    return { opened: await this.deps.openFile(file) };
  }

  // ---- the check file ------------------------------------------------------------------------

  async exportCheckFile(ids: readonly string[]): Promise<CheckFileOutcome> {
    const data = this.deps.host().data();
    if (ids.length === 0) {
      throw new ChannelRefusal('refused', 'Pick at least one driver first.');
    }
    const prefix =
      ids.length === 1
        ? safeFileName(data.drivers.find((d) => d.transporterId === ids[0])?.name ?? 'driver')
        : `${ids.length}_drivers`;
    const chosen = await this.deps.dialogs.chooseSaveFile(
      'Save the check file',
      `WeeklyPerformance_export_${prefix}_${stamp(this.now())}.csv`,
      [{ name: 'CSV files', extensions: ['csv'] }],
    );
    if (chosen === null) return { status: 'cancelled' };
    const file = path.extname(chosen) ? chosen : `${chosen}.csv`;
    const result = buildVerificationExport(data, ids);
    try {
      writeFileSync(file, result.csv, 'utf8');
    } catch {
      throw new ChannelRefusal(
        'refused',
        `${path.basename(file)} is open in another program, or the app can't write there. ` +
          'Close it and try again, or save it somewhere else.',
      );
    }
    this.deps.log(`check file: ${result.rowsWritten} rows`);
    this.lastOutput['check-file'] = file;
    return {
      status: 'written',
      fileName: path.basename(file),
      drivers: result.driversExported,
      weeks: result.weeksExported,
      rows: result.rowsWritten,
    };
  }

  // ---- email ------------------------------------------------------------------------------

  /** The saved app password, unsealed, or null (none saved, or sealed on another computer). */
  private password(): string | null {
    const sealed = this.deps.mainOnly().emailPasswordSealed;
    if (!sealed) return null;
    try {
      if (!this.deps.sealer.isEncryptionAvailable()) return null;
      const plain = this.deps.sealer.decryptString(Buffer.from(sealed, 'base64'));
      return plain === '' ? null : plain;
    } catch {
      return null;
    }
  }

  emailStatus(): EmailStatus {
    let canSeal: boolean;
    try {
      canSeal = this.deps.sealer.isEncryptionAvailable();
    } catch {
      canSeal = false;
    }
    return { passwordSaved: this.password() !== null, canSeal };
  }

  private emailReady(): boolean {
    return setupProblem(this.deps.performance().email, this.password()) === null;
  }

  setEmailPassword(password: string): EmailStatus {
    if (password === '') {
      this.deps.updateMainOnly((kept) => ({ ...kept, emailPasswordSealed: null }));
      return this.emailStatus();
    }
    if (!this.emailStatus().canSeal) {
      throw new ChannelRefusal(
        'refused',
        "This computer can't keep the password safe, so it was not saved.",
      );
    }
    // Gmail shows the app password in groups of four; the spaces are not part of it.
    const sealed = this.deps.sealer.encryptString(password.replace(/\s+/g, '')).toString('base64');
    this.deps.updateMainOnly((kept) => ({ ...kept, emailPasswordSealed: sealed }));
    this.deps.log('email: app password saved');
    return this.emailStatus();
  }

  private openTransport(): { transport: MailTransport; settings: PerformanceSettings['email'] } {
    const settings = this.deps.performance().email;
    const password = this.password();
    const problem = setupProblem(settings, password);
    if (problem !== null || password === null) {
      throw new ChannelRefusal('refused', problem ?? 'Add the app password in Settings first.');
    }
    return { transport: this.deps.transport(smtpConfig(settings, password)), settings };
  }

  async emailTest(to: string | undefined): Promise<{ sent: boolean; problem: string | null }> {
    const { transport, settings } = this.openTransport();
    const address = to?.trim() || settings.fromAddress.trim();
    try {
      await transport.verify();
    } catch (error) {
      transport.close();
      this.deps.log('email test: could not connect');
      return { sent: false, problem: describeConnectProblem(error) };
    }
    try {
      await transport.send({
        from: sender(settings),
        to: { name: '', address },
        subject: 'Test email from Loadout Builder',
        text:
          'This is a test message to check that the email settings work.\n\n' +
          'If you got it, the app can send the weekly reports from this account.',
      });
      this.deps.log('email test: sent');
      return { sent: true, problem: null };
    } catch (error) {
      this.deps.log('email test: not sent');
      const reason = describeSendProblem(error);
      return { sent: false, problem: `The test email was not sent: ${reason}.` };
    } finally {
      transport.close();
    }
  }

  async email(ids: readonly string[], range: WeekRange, dryRun: boolean): Promise<EmailOutcome> {
    const data = this.deps.host().data();
    const outcome: EmailOutcome = { dryRun, sent: 0, notSent: [], wouldSend: [] };
    const settings = this.deps.performance().email;
    const recipients: Array<{ id: string; name: string; to: string; input: ReportInput }> = [];
    for (const id of ids) {
      const driver = data.drivers.find((d) => d.transporterId === id);
      if (!driver) {
        outcome.notSent.push({ transporterId: id, name: '', reason: 'not on the driver list' });
        continue;
      }
      const to = (driver.email ?? '').trim();
      if (to === '') {
        outcome.notSent.push({
          transporterId: id,
          name: driver.name,
          reason: 'no address on file',
        });
        continue;
      }
      const input = this.reportInput(data, id, range);
      if (input === null) {
        outcome.notSent.push({
          transporterId: id,
          name: driver.name,
          reason: 'no scores in these weeks',
        });
        continue;
      }
      recipients.push({ id, name: driver.name, to, input });
    }
    const fill = (template: string, name: string) =>
      fillTemplate(template, { name, from: range.from, to: range.to });

    if (dryRun) {
      outcome.wouldSend = recipients.map((r) => ({
        transporterId: r.id,
        name: r.name,
        to: r.to,
        subject: fill(settings.subjectTemplate, r.name),
      }));
      return outcome;
    }
    if (this.deps.demo()) {
      throw new ChannelRefusal(
        'refused',
        'Demo mode is on, so no emails are sent. Use the dry run to see who would get what.',
      );
    }
    const { transport } = this.openTransport();
    if (recipients.length === 0) {
      transport.close();
      return outcome;
    }
    try {
      await transport.verify();
    } catch (error) {
      transport.close();
      this.deps.log('email: could not connect, nothing sent');
      throw new ChannelRefusal('refused', `Nothing was sent. ${describeConnectProblem(error)}`);
    }
    const folder = this.reportsTemp('email');
    const items = recipients.map((r) => ({
      html: this.deps.report.buildReportHtml(r.input),
      outFile: path.join(folder, reportFileName(r.name, r.id, range.from, range.to)),
    }));
    try {
      const printed = await this.printAll(items, 'generate');
      const count = this.counter('email', recipients.length);
      count(0);
      for (const [index, r] of recipients.entries()) {
        if (index > 0) count(index);
        const file = items[index]!.outFile;
        if (!printed[index]) {
          outcome.notSent.push({
            transporterId: r.id,
            name: r.name,
            reason: 'could not make the report',
          });
          continue;
        }
        try {
          await transport.send({
            from: sender(settings),
            to: { name: r.name, address: r.to },
            bcc: settings.bccAddress.trim() || undefined,
            subject: fill(settings.subjectTemplate, r.name),
            text: fill(settings.bodyTemplate, r.name),
            attachments: [{ filename: path.basename(file), path: file }],
          });
          outcome.sent++;
        } catch (error) {
          outcome.notSent.push({
            transporterId: r.id,
            name: r.name,
            reason: describeSendProblem(error),
          });
        }
      }
      count(recipients.length);
    } finally {
      transport.close();
      for (const item of items) rmSync(item.outFile, { force: true });
    }
    this.deps.log(`email: ${outcome.sent} sent, ${outcome.notSent.length} not sent`);
    if (outcome.sent > 0) this.markFlag('reportsEmailed');
    return outcome;
  }
}
