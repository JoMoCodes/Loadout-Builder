// The route sheets of the open saved data, behind the routeSheets:* handlers: the open run (the
// day's route sheet PDF as read, the choices and the sent marks), History, and sending. Ported from
// the old Route Sheet Distributor's service.js; the rules themselves are pure functions in
// @loadout/route-sheets. Built by the StateHost on the same database as the day's data (the sibling
// of PerfHost), and built again when that is swapped (demo mode on or off).
//
// Nothing from the route data or the driver list is copied into a run: the matcher's input is
// built from the core AppState on every read (docs/RSD-MIGRATION-PLAN.md, section 3, items 1 to 3).
// The original PDF is kept beside the database as route-sheets/<run id>.pdf.

import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import {
  ROUTE_ITINERARIES,
  ROUTE_ROUTES,
  ROUTE_SCHEDULE,
  routeDataLabel,
  type AppState,
  type IsoDate,
  type RouteDataSet,
} from '@loadout/core';
import {
  DEFAULT_ROUTE_SHEET_WORDING,
  DRAFT_ID,
  STATES,
  addMonth,
  associatesFromBook,
  buildRouteEmail,
  distribute,
  extractPages,
  hasRouteDrivers,
  planExportAll,
  pruneDecisions,
  renderEmailHtml,
  renderEmailText,
  routesFromRouteSet,
  runIdFor,
  runLabel,
  safeFileName,
  sendProblem,
  staleRunIds,
  subjectFor,
  unmatchedWaves,
  unsentRoutes,
  wavePadsFromRouteSet,
  waveSortKey,
  type Decision,
  type Distribution,
  type RouteEmail,
  type RouteInput,
  type RouteResult,
  type RouteSheet,
  type RouteSheetWording,
  type SheetWithPad,
} from '@loadout/route-sheets';
import { parseRouteSheetPdf } from '@loadout/route-sheets/pdf-items';
import { RouteSheetsStore, type SentMark, type StoredRun, type Store } from '@loadout/storage';
import type {
  EmailRoutesResult,
  ExportAllResult,
  RouteDataKindInUse,
  RouteSheetsCounts,
  RouteSheetsDistributionView,
  RouteSheetsImportResult,
  RouteSheetsPreview,
  RouteSheetsRunListing,
  RouteSheetsRunView,
  RouteSheetsStateView,
  SentHow,
} from '../../shared/routeSheets';
import { ChannelRefusal } from '../channels';
import type { RouteSheetsRouteData } from '../../shared/settings';
import type { EmailAccount } from '../mail/emailAccount';
import {
  describeConnectProblem,
  describeSendProblem,
  sender,
  type MailMessage,
} from '../mail/mailer';

/** Runs older than this many days are removed when the app opens (section 3, item 8). */
export const KEEP_DAYS = 30;

/** The old app's words when the original PDF is not there. */
export const PDF_MISSING = 'The original route sheet PDF for this run is not available.';

/** A run id is used as a file name: the old app's rule for a run folder's name. */
const SAFE_ID = /^[A-Za-z0-9_.-]+$/;

/** Writes a file, or refuses in plain words when it cannot be written. */
function writeOrRefuse(file: string, content: Uint8Array | string): void {
  try {
    writeFileSync(file, content);
  } catch {
    throw new ChannelRefusal(
      'refused',
      "The app can't write that file. Choose another place and try again.",
    );
  }
}

/** Where the open run's id is remembered between runs of the app (MainOnlySettings.lastRunId). */
export interface LastRunMemory {
  get(): string | null;
  set(id: string | null): void;
}

/** In memory only: demo mode, and the tests that do not care. */
export function memoryLastRun(): LastRunMemory {
  let id: string | null = null;
  return {
    get: () => id,
    set: (next) => {
      id = next;
    },
  };
}

export interface RouteSheetsHostOptions {
  /** The open database. */
  store: Store;
  /** The folder the original PDFs are kept in (route-sheets/ beside the database). */
  pdfFolder: string;
  /** The day's data: the driver list and the route data are read from it on every read. */
  state: AppState;
  today(): IsoDate;
  now?: () => Date;
  /** Demo mode: nothing is emailed. */
  demo: boolean;
  lastRun?: LastRunMemory;
  /** The subject and opening lines of the emails, as set now (AppSettings.routeSheetsEmail). */
  wording?: () => RouteSheetWording;
  /** Which route data to match with, as set now (AppSettings.routeSheetsRouteData). */
  routeDataChoice?: () => RouteSheetsRouteData;
  /** Counts and codes only. */
  log?: (message: string) => void;
}

/** What the file side needs from the app (Services, or a stand-in in the tests). */
export interface RouteSheetsIo {
  tempFolder(): string;
  openFile(file: string): Promise<boolean>;
  chooseFolder(title: string, startIn: string | null): Promise<string | null>;
  chooseSaveFile(options: {
    title: string;
    defaultName: string;
    nearFile: string;
    startIn: 'data' | 'schedule-data';
  }): Promise<string | null>;
  openMailApp(mailto: string): Promise<boolean>;
}

interface RouteSource {
  kind: RouteDataKindInUse;
  set: RouteDataSet;
}

const ORDER: readonly RouteDataKindInUse[] = [
  ROUTE_ROUTES,
  ROUTE_ITINERARIES,
  ROUTE_SCHEDULE,
] as readonly RouteDataKindInUse[];

export class RouteSheetsHost {
  readonly runs: RouteSheetsStore;
  private run: StoredRun;
  /** Emails are going out right now. */
  sending = false;
  private readonly lastRun: LastRunMemory;

  constructor(private readonly options: RouteSheetsHostOptions) {
    this.runs = new RouteSheetsStore(options.store.db, { now: () => this.now() });
    this.lastRun = options.lastRun ?? memoryLastRun();
    try {
      this.removeOldRuns();
    } catch (error) {
      // Old runs are only tidied away; a problem here must never stop the saved data opening.
      this.log(
        `route sheets: old runs not removed (${error instanceof Error ? error.name : 'unknown'})`,
      );
    }
    // Reopen the last run only if it is for today; older runs stay available under History.
    const last = this.lastRun.get();
    const run = last ? this.runs.loadRun(last) : null;
    this.run = run && (run.date ?? '') >= options.today() ? run : this.emptyRun();
  }

  private now(): Date {
    return this.options.now?.() ?? new Date();
  }

  private log(message: string): void {
    this.options.log?.(message);
  }

  /** The email wording as set now; the old app's words when none is given. */
  private wording(): RouteSheetWording {
    return this.options.wording?.() ?? DEFAULT_ROUTE_SHEET_WORDING;
  }

  /** Quietly removes the runs (and their PDFs) older than KEEP_DAYS days. */
  private removeOldRuns(): void {
    const stale = staleRunIds(this.runs.listRuns(), this.options.today(), KEEP_DAYS);
    for (const id of stale) {
      this.runs.deleteRun(id);
      this.removePdf(id);
    }
    if (stale.length > 0) this.log(`route sheets: ${stale.length} old runs removed`);
  }

  private emptyRun(): StoredRun {
    const at = this.now().toISOString();
    return {
      id: DRAFT_ID,
      station: null,
      date: null,
      dateLabel: null,
      cycle: null,
      pdfFileName: null,
      importedAt: null,
      pageCount: 0,
      warnings: [],
      routesFileName: null,
      wavePads: {},
      createdAt: at,
      updatedAt: at,
      sheets: [],
      decisions: {},
      sent: {},
    };
  }

  /** A run is saved once it has a route sheet PDF. */
  private saved(run: StoredRun = this.run): boolean {
    return run.id !== DRAFT_ID && run.pdfFileName !== null;
  }

  private persist(): void {
    if (!this.saved()) return;
    const source = this.routeSource();
    this.run.routesFileName = source ? path.basename(source.set.sourceFile) : null;
    this.run.updatedAt = this.runs.saveRun(this.run);
    this.lastRun.set(this.run.id);
  }

  // ---- the PDF file beside the database -----------------------------------------------------

  private pdfPath(id: string): string | null {
    if (!SAFE_ID.test(id)) return null;
    return path.join(this.options.pdfFolder, `${id}.pdf`);
  }

  private readPdf(id: string = this.run.id): Uint8Array | null {
    const file = this.pdfPath(id);
    if (file === null || !existsSync(file)) return null;
    try {
      return new Uint8Array(readFileSync(file));
    } catch {
      return null;
    }
  }

  private pdfMissing(id: string, hasPdf: boolean): boolean {
    if (!hasPdf) return false;
    const file = this.pdfPath(id);
    return file === null || !existsSync(file);
  }

  private removePdf(id: string): void {
    const file = this.pdfPath(id);
    if (file !== null) rmSync(file, { force: true });
  }

  /** The original PDF, or a refusal in the old app's words. */
  private requirePdf(): Uint8Array {
    const pdf = this.saved() ? this.readPdf() : null;
    if (pdf === null) throw new ChannelRefusal('refused', PDF_MISSING);
    return pdf;
  }

  // ---- the matcher's input, from the app's own data ------------------------------------------

  /**
   * The route data the matcher reads: the file chosen on the page (the roster's by default), when
   * it is loaded and carries Transporter IDs per route code. Otherwise the Routes export if it is
   * loaded, else the Itineraries, else the Weekly Schedule, the same way. Null when none is.
   */
  routeSource(): RouteSource | null {
    const { state } = this.options;
    const choice = this.options.routeDataChoice?.() ?? 'roster';
    const wanted = choice === 'roster' ? state.roster.routeSource : choice;
    const chosen = ORDER.find((kind) => kind === wanted);
    if (chosen) {
      const set = state.routeSet(chosen);
      if (set.rows.length > 0 && (chosen === ROUTE_ROUTES || hasRouteDrivers(set))) {
        return { kind: chosen, set };
      }
    }
    for (const kind of ORDER) {
      const set = state.routeSet(kind);
      if (set.rows.length === 0) continue;
      if (kind === ROUTE_ROUTES || hasRouteDrivers(set)) return { kind, set };
    }
    return null;
  }

  private routes(source = this.routeSource()): RouteInput[] {
    return source ? routesFromRouteSet(source.set) : [];
  }

  /** The wave times on the route sheets, earliest first. */
  private waveTimes(): string[] {
    return [
      ...new Set(this.run.sheets.map((s) => s.waveTime).filter((w): w is string => !!w)),
    ].sort((a, b) => waveSortKey(a).localeCompare(waveSortKey(b)));
  }

  /** The pad for each wave time: the route file's PADs, else the one typed for that wave. */
  wavePads(source = this.routeSource()): Record<string, string> {
    return wavePadsFromRouteSet(this.waveTimes(), source?.set ?? null, this.run.wavePads);
  }

  /** The choices that still fit the route data (a chosen driver who left the route is dropped). */
  private decisions(routes: RouteInput[]): Record<string, Decision> {
    return pruneDecisions(this.run.decisions, routes);
  }

  distribution(): Distribution {
    const source = this.routeSource();
    const routes = this.routes(source);
    return distribute({
      sheets: this.run.sheets,
      routes,
      associates: associatesFromBook(this.options.state.associates),
      decisions: this.decisions(routes),
      wavePads: this.wavePads(source),
    });
  }

  private routeResult(routeCode: string, dist = this.distribution()): RouteResult | null {
    return dist.routes.find((r) => r.routeCode === routeCode) ?? null;
  }

  /** The route sheet page, with the pad for its wave time (shown on the email). */
  private sheet(routeCode: string): SheetWithPad | null {
    const s = this.run.sheets.find((x) => x.routeCode === routeCode);
    if (!s) return null;
    return { ...s, pad: (s.waveTime && this.wavePads()[s.waveTime]) || null };
  }

  // ---- what the page reads -------------------------------------------------------------------

  private runView(): RouteSheetsRunView {
    const run = this.run;
    return {
      id: run.id,
      label: runLabel(run),
      saved: this.saved(),
      station: run.station,
      date: run.date,
      dateLabel: run.dateLabel,
      cycle: run.cycle,
      pdfFileName: run.pdfFileName,
      importedAt: run.importedAt,
      pageCount: run.pageCount,
      warnings: [...run.warnings],
      routesFileName: run.routesFileName,
      sheetCount: run.sheets.length,
      checkFailures: run.sheets.filter((s) => !s.check.ok).map((s) => s.routeCode ?? ''),
      sent: structuredClone(run.sent),
      decisions: structuredClone(this.decisions(this.routes())),
      typedPads: { ...run.wavePads },
      pdfMissing: this.pdfMissing(run.id, this.saved()),
    };
  }

  runList(): RouteSheetsRunListing[] {
    return this.runs.listRuns().map((r) => ({
      id: r.id,
      label: runLabel(r),
      date: r.date,
      updatedAt: r.updatedAt,
      sheets: r.sheets,
      pdfFileName: r.pdfFileName,
      routesFileName: r.routesFileName,
      pdfMissing: this.pdfMissing(r.id, r.pdfFileName !== null),
    }));
  }

  state(account: EmailAccount, oldAppFolder: boolean): RouteSheetsStateView {
    const source = this.routeSource();
    const book = this.options.state.associates;
    const importedAt = book.importedAt ? book.importedAt.toISOString() : null;
    return {
      run: this.runView(),
      runs: this.runList(),
      routeData: source
        ? {
            kind: source.kind,
            label: routeDataLabel(source.set),
            // Only the file's name reaches the page; a stored path may use either slash.
            fileName: path.win32.basename(source.set.sourceFile),
          }
        : null,
      driverList: {
        count: book.rows.length,
        fileName: path.win32.basename(book.sourceFile),
        importedAt,
        refreshDueAt: importedAt ? addMonth(importedAt) : null,
      },
      oldAppFolder,
      emailProblem: account.problem(),
      sending: this.sending,
      unsent: unsentRoutes(this.distribution(), this.run.sent).length,
    };
  }

  distributionView(): RouteSheetsDistributionView {
    const dist = this.distribution();
    return {
      ...dist,
      unsent: unsentRoutes(dist, this.run.sent),
      typedPadWaves: unmatchedWaves(this.waveTimes(), this.routeSource()?.set ?? null),
    };
  }

  /** The numbers the snapshot carries. */
  counts(): RouteSheetsCounts {
    const dist = this.distribution();
    return {
      runId: this.saved() ? this.run.id : null,
      sheets: this.run.sheets.length,
      ready: dist.counts[STATES.READY],
      needsDecision: dist.counts[STATES.NEEDS_DECISION],
      exceptions: dist.counts[STATES.EXCEPTION],
      noSheet: dist.counts[STATES.NO_SHEET],
      skipped: dist.counts[STATES.SKIPPED],
      unsent: unsentRoutes(dist, this.run.sent).length,
      runs: this.runs.listRuns().length,
    };
  }

  preview(routeCode: string): RouteSheetsPreview {
    const sheet = this.sheet(routeCode);
    const route = this.routeResult(routeCode);
    if (!sheet && !route) throw new ChannelRefusal('refused', 'That route is not in this run.');
    if (!sheet) return { routeCode, subject: null, html: null, text: null, recipients: [], route };
    const recipient = route ? route.recipients[0] : undefined;
    const wording = this.wording();
    return {
      routeCode,
      subject: subjectFor(sheet, recipient, wording),
      html: renderEmailHtml(sheet, recipient, wording),
      text: renderEmailText(sheet, recipient, wording),
      recipients: route && route.state === STATES.READY ? route.recipients : [],
      route,
    };
  }

  // ---- bringing in the PDF -------------------------------------------------------------------

  /** Reads a route sheet PDF into the run for its day (the old importFile's 'pdf' branch). */
  async importPdf(bytes: Uint8Array, fileName: string): Promise<RouteSheetsImportResult> {
    let parsed: Awaited<ReturnType<typeof parseRouteSheetPdf>>;
    try {
      parsed = await parseRouteSheetPdf(bytes);
    } catch {
      this.log('route sheets: the PDF could not be read');
      throw new ChannelRefusal('refused', `No route sheets were found in ${fileName}.`);
    }
    const { sheets, pageErrors, pageCount } = parsed;
    if (!sheets.length) {
      throw new ChannelRefusal('refused', `No route sheets were found in ${fileName}.`);
    }
    const codes = sheets.map((s) => s.routeCode);
    const dupes = codes.filter((c, i, a) => a.indexOf(c) !== i);
    const warnings = pageErrors.map((e) => e.message);
    if (dupes.length) {
      warnings.push(
        `Route code(s) ${[...new Set(dupes)].join(', ')} appear on more than one page; only the first page is used.`,
      );
    }
    const unique: RouteSheet[] = sheets.filter(
      (s, i) => sheets.findIndex((x) => x.routeCode === s.routeCode) === i,
    );
    const first = unique[0]!;
    const id = runIdFor(first);
    // The PDF is saved first, so a failure leaves the open run as it was.
    const file = this.pdfPath(id);
    if (file === null) throw new ChannelRefusal('refused', PDF_MISSING);
    try {
      mkdirSync(this.options.pdfFolder, { recursive: true });
      writeFileSync(file, bytes);
    } catch {
      this.log('route sheets: the PDF could not be saved');
      throw new ChannelRefusal(
        'refused',
        "The app can't save the PDF in its data folder. Check there is space and try again.",
      );
    }
    if (this.run.id !== id) {
      // A PDF for a different day or cycle: continue that saved run if there is one.
      this.run = (this.runs.hasRun(id) ? this.runs.loadRun(id) : null) ?? {
        ...this.emptyRun(),
        id,
      };
    }
    const importedAt = this.now().toISOString();
    Object.assign(this.run, {
      station: first.station,
      date: first.date,
      cycle: first.cycle,
      dateLabel: first.dateLabel,
      sheets: unique,
      pdfFileName: fileName,
      importedAt,
      pageCount,
      warnings,
    });
    this.persist();
    const failed = unique.filter((s) => !s.check.ok).length;
    this.log(
      `route sheets: ${unique.length} sheets read from ${pageCount} pages, ${failed} failed the number check, ${warnings.length} notes`,
    );
    return {
      message: `Read ${unique.length} route sheets from ${fileName}${failed ? ` — ${failed} did not pass the number check` : ' — all numbers check out'}.`,
      warnings,
      runId: id,
    };
  }

  // ---- runs ------------------------------------------------------------------------------------

  loadRun(id: string): void {
    const run = this.runs.loadRun(id);
    if (!run) throw new ChannelRefusal('refused', 'That run could not be found.');
    this.run = run;
    this.lastRun.set(id);
  }

  newRun(): void {
    this.run = this.emptyRun();
    this.lastRun.set(null);
  }

  deleteRun(id: string): void {
    if (this.sending) {
      throw new ChannelRefusal(
        'refused',
        'Route sheets are already being sent. Wait for that to finish.',
      );
    }
    if (!this.runs.deleteRun(id)) {
      throw new ChannelRefusal('refused', 'That run could not be found.');
    }
    this.removePdf(id);
    if (this.run.id === id) this.newRun();
  }

  // ---- choices -------------------------------------------------------------------------------

  private requireRoute(routeCode: string): void {
    if (!this.routeResult(routeCode)) {
      throw new ChannelRefusal('refused', 'That route is not in this run.');
    }
  }

  setDecision(routeCode: string, decision: Decision | null): void {
    this.requireRoute(routeCode);
    if (decision) {
      // Only the fields a choice has; anything else a message carried is left out.
      const kept: Decision = {};
      if (decision.recipients) kept.recipients = [...decision.recipients];
      if (decision.skipped) kept.skipped = true;
      if (decision.manual) kept.manual = true;
      if (decision.viaSuggestion) kept.viaSuggestion = true;
      this.run.decisions[routeCode] = { ...kept, at: this.now().toISOString() };
    } else {
      delete this.run.decisions[routeCode];
    }
    if (this.saved())
      this.runs.setDecision(
        this.run.id,
        routeCode,
        decision ? this.run.decisions[routeCode]! : null,
      );
  }

  /** Accept all suggestions. How many were accepted. */
  acceptSuggestions(): number {
    let n = 0;
    for (const r of this.distribution().routes) {
      if (r.state === STATES.NEEDS_DECISION && r.suggestion) {
        this.run.decisions[r.routeCode] = {
          recipients: [r.suggestion],
          viaSuggestion: true,
          at: this.now().toISOString(),
        };
        n++;
      }
    }
    if (this.saved()) this.runs.setDecisions(this.run.id, this.run.decisions);
    return n;
  }

  markSent(routeCode: string, how: SentHow | null): void {
    this.requireRoute(routeCode);
    const mark: SentMark | null = how ? { how, at: this.now().toISOString() } : null;
    if (mark) this.run.sent[routeCode] = mark;
    else delete this.run.sent[routeCode];
    if (this.saved()) this.runs.markSent(this.run.id, routeCode, mark);
  }

  /** Sets (or, with an empty value, clears) the pad typed for a wave time. Answers the pad. */
  setWavePad(waveTime: string, pad: string): string | null {
    const wave = waveTime.trim();
    if (!wave || !this.waveTimes().includes(wave)) {
      throw new ChannelRefusal('refused', 'That wave time is not in this run.');
    }
    if (!unmatchedWaves([wave], this.routeSource()?.set ?? null).length) {
      throw new ChannelRefusal(
        'refused',
        'That wave already gets its pad from the route file on Load Out.',
      );
    }
    const value = pad.replace(/\s+/g, ' ').trim().slice(0, 10);
    const pads = { ...this.run.wavePads };
    if (value) pads[wave] = value;
    else delete pads[wave];
    this.run.wavePads = pads;
    if (this.saved()) this.runs.setWavePads(this.run.id, pads);
    return value || null;
  }

  // ---- the email and the files ---------------------------------------------------------------

  /** Everything needed to send one route sheet (the old emailFor). */
  private async emailFor(routeCode: string, pdf: Uint8Array | null): Promise<RouteEmail> {
    const sheet = this.sheet(routeCode);
    if (!sheet) throw new ChannelRefusal('refused', `${routeCode} has no route sheet page.`);
    const route = this.routeResult(routeCode);
    const recipients = route && route.state === STATES.READY ? route.recipients : [];
    return buildRouteEmail(sheet, recipients, pdf, undefined, this.wording());
  }

  private recipientsOf(routeCode: string): string[] {
    const route = this.routeResult(routeCode);
    const ready = route && route.state === STATES.READY ? route.recipients : [];
    return ready.map((p) => p.email).filter(Boolean);
  }

  async copyEmail(routeCode: string): Promise<{ html: string; text: string; subject: string }> {
    const e = await this.emailFor(routeCode, this.saved() ? this.readPdf() : null);
    return { html: e.html, text: e.text, subject: e.subject };
  }

  async openDraft(routeCode: string, io: RouteSheetsIo): Promise<{ opened: boolean }> {
    const pdf = this.requirePdf();
    const e = await this.emailFor(routeCode, pdf);
    const file = path.join(io.tempFolder(), safeFileName(`${routeCode} route sheet.eml`));
    writeOrRefuse(file, e.eml);
    const opened = await io.openFile(file);
    if (!opened) {
      throw new ChannelRefusal(
        'refused',
        'Windows could not open the email draft. Use Copy for email instead.',
      );
    }
    return { opened };
  }

  async openMailApp(
    routeCode: string,
    io: RouteSheetsIo,
  ): Promise<{ mailto: string; opened: boolean }> {
    const e = await this.emailFor(routeCode, null);
    const to = this.recipientsOf(routeCode).join(',');
    const mailto = `mailto:${encodeURIComponent(to).replace(/%2C/g, ',')}?subject=${encodeURIComponent(e.subject)}`;
    return { mailto, opened: await io.openMailApp(mailto) };
  }

  private async sheetPdf(routeCode: string): Promise<{ bytes: Uint8Array; name: string }> {
    const pdf = this.requirePdf();
    const sheet = this.sheet(routeCode);
    if (!sheet) throw new ChannelRefusal('refused', PDF_MISSING);
    const bytes = await extractPages(pdf, sheet.pageNumbers || [sheet.pageNumber]);
    const name = safeFileName(`${sheet.routeCode} ${sheet.staging || ''} route sheet.pdf`);
    return { bytes, name };
  }

  async savePdfPage(
    routeCode: string,
    io: RouteSheetsIo,
  ): Promise<{ saved: boolean; fileName: string | null }> {
    const { bytes, name } = await this.sheetPdf(routeCode);
    const chosen = await io.chooseSaveFile({
      title: 'Save the route sheet page',
      defaultName: name.replace(/\.pdf$/i, ''),
      nearFile: '',
      startIn: 'data',
    });
    if (chosen === null) return { saved: false, fileName: null };
    const file = path.extname(chosen) ? chosen : `${chosen}.pdf`;
    try {
      writeFileSync(file, bytes);
    } catch {
      throw new ChannelRefusal(
        'refused',
        `${path.basename(file)} is open in another program, or the app can't write there. ` +
          'Close it and try again, or save it somewhere else.',
      );
    }
    return { saved: true, fileName: path.basename(file) };
  }

  async viewOriginalPage(routeCode: string, io: RouteSheetsIo): Promise<{ opened: boolean }> {
    const { bytes } = await this.sheetPdf(routeCode);
    const file = path.join(io.tempFolder(), safeFileName(`${routeCode} original page.pdf`));
    writeOrRefuse(file, bytes);
    return { opened: await io.openFile(file) };
  }

  // ---- sending -------------------------------------------------------------------------------

  /** Routes Email all would send: ready, with an email address, and not already marked sent. */
  unsentRoutes(): string[] {
    return unsentRoutes(this.distribution(), this.run.sent);
  }

  /**
   * Emails each route sheet to its driver(s) over one signed-in connection (the old emailRoutes).
   * Refuses before sending anything if email isn't set up or the login fails. Each success is
   * saved as sent at once.
   */
  async emailRoutes(
    routeCodes: readonly string[],
    account: EmailAccount,
  ): Promise<EmailRoutesResult> {
    if (this.options.demo) {
      throw new ChannelRefusal(
        'refused',
        'Demo mode is on, so no emails are sent. Turn off demo mode in Settings to send them.',
      );
    }
    if (this.sending) {
      throw new ChannelRefusal(
        'refused',
        'Route sheets are already being sent. Wait for that to finish.',
      );
    }
    const problem = account.problem();
    if (problem) {
      throw new ChannelRefusal('refused', `Email isn't set up yet. ${problem}`);
    }
    const pdf = this.saved() ? this.readPdf() : null;

    this.sending = true;
    // Sent marks go to the run the emails came from, even if another run is opened meanwhile.
    const run = this.run;
    const saved = this.saved(run);
    const result: EmailRoutesResult = { sent: [], failed: [], skipped: [] };
    try {
      const settings = account.settings();
      const dist = this.distribution();
      const jobs: Array<{ routeCode: string; to: string[]; message: MailMessage }> = [];
      for (const code of routeCodes) {
        const route = this.routeResult(code, dist);
        const why = sendProblem(route);
        if (why || !route) {
          result.skipped.push({ routeCode: code, reason: why ?? 'That route is not in this run.' });
          continue;
        }
        const e = await buildRouteEmail(
          this.sheet(code)!,
          route.recipients,
          pdf,
          undefined,
          this.wording(),
        );
        const to = route.recipients.map((p) => ({ name: p.name, address: p.email }));
        jobs.push({
          routeCode: code,
          to: to.map((t) => t.address),
          message: {
            from: sender(settings),
            to: to[0]!,
            ...(to.length > 1 ? { moreTo: to.slice(1) } : {}),
            bcc: settings.bccAddress.trim() || undefined,
            subject: e.subject,
            html: e.html,
            text: e.text,
            attachments: e.pdf
              ? [{ filename: e.pdfName, content: e.pdf, contentType: 'application/pdf' }]
              : [],
          },
        });
      }
      if (!jobs.length) return result;

      const { transport } = account.open();
      try {
        try {
          await transport.verify();
        } catch (error) {
          this.log('route sheets email: could not connect, nothing sent');
          throw new ChannelRefusal('refused', `Nothing was sent. ${describeConnectProblem(error)}`);
        }
        for (const job of jobs) {
          try {
            await transport.send(job.message);
          } catch (error) {
            result.failed.push({ routeCode: job.routeCode, error: describeSendProblem(error) });
            continue;
          }
          const mark: SentMark = { how: 'emailed', at: this.now().toISOString(), to: job.to };
          run.sent[job.routeCode] = mark;
          if (saved) this.runs.markSent(run.id, job.routeCode, mark);
          result.sent.push(job.routeCode);
        }
      } finally {
        transport.close();
      }
      return result;
    } finally {
      this.sending = false;
      this.log(
        `route sheets email: ${result.sent.length} sent, ${result.failed.length} failed, ${result.skipped.length} left out`,
      );
    }
  }

  /** Send email for one route (the old sendEmail, without its question). */
  async sendOne(routeCode: string, account: EmailAccount): Promise<EmailRoutesResult> {
    const out = await this.emailRoutes([routeCode], account);
    if (out.skipped.length) throw new ChannelRefusal('refused', out.skipped[0]!.reason);
    if (out.failed.length) {
      const reason = out.failed[0]!.error.replace(/\.$/, '');
      throw new ChannelRefusal(
        'refused',
        `${routeCode} was not sent. ${reason.charAt(0).toUpperCase()}${reason.slice(1)}. ` +
          'Check the address on the Associates page, or use Open email draft.',
      );
    }
    return out;
  }

  /** Email all (the old emailAll, without its question). */
  async emailAll(account: EmailAccount): Promise<EmailRoutesResult> {
    const codes = this.unsentRoutes();
    if (!codes.length) {
      const ready = this.distribution().routes.filter((r) => r.state === STATES.READY);
      const alreadySent = ready.filter((r) => this.run.sent[r.routeCode]).length;
      throw new ChannelRefusal(
        'refused',
        alreadySent
          ? 'Every route sheet that is ready is already marked as sent.'
          : 'No route sheets are ready to email.',
      );
    }
    return this.emailRoutes(codes, account);
  }

  // ---- Export all ----------------------------------------------------------------------------

  /** Writes drafts, single-page PDFs and a summary into a folder inside the one chosen. */
  async exportAll(io: RouteSheetsIo): Promise<ExportAllResult | null> {
    const pdf = this.saved() ? this.readPdf() : null;
    const dir = await io.chooseFolder('Choose where to save the email drafts and PDFs', null);
    if (dir === null) return null;
    const plan = await planExportAll(runLabel(this.run), this.distribution(), (code) =>
      this.emailFor(code, pdf),
    );
    const root = path.join(dir, plan.folder);
    const where = {
      root,
      drafts: path.join(root, plan.draftsFolder),
      pdfs: path.join(root, plan.pdfsFolder),
    };
    try {
      mkdirSync(where.drafts, { recursive: true });
      mkdirSync(where.pdfs, { recursive: true });
      for (const f of plan.files) writeFileSync(path.join(where[f.folder], f.name), f.content);
    } catch {
      this.log('route sheets export: could not write the folder');
      throw new ChannelRefusal(
        'refused',
        "The app can't write in that folder. Choose another folder and try again.",
      );
    }
    this.log(`route sheets export: ${plan.files.length} files, ${plan.written} drafts`);
    await io.openFile(root);
    return { folder: plan.folder, drafts: plan.written };
  }
}
