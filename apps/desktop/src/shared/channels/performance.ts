// Weekly performance: bringing in the exports, the Drivers / Reports / Directory / Imports tabs,
// the PDF reports, emailing them, and the Dashboard. The reading, the numbers and the files all
// happen in the main process; a page only sees rows, counts and words. A page never names a
// place on the computer: folders are chosen in the main process's own window and remembered
// there, and a dropped file or folder becomes a token (the same way as `files:dropped`).

import type { OldDataFind, OldDataResult } from '../oldData';
import { OLD_DATA_SOURCES } from '../oldData';
import type {
  CheckFileOutcome,
  EmailOutcome,
  EmailStatus,
  GenerateOutcome,
  PerfComplianceRow,
  PerfDashboardView,
  PerfDirectoryRow,
  PerfDriversView,
  PerfImportCard,
  PerfImportSummary,
  PerfProgress,
  PerfScoreExplanation,
  PerfThresholdRow,
  SafetyEventView,
  SyncSummary,
} from '../performance';
import { PERF_KINDS, PERF_OUTPUTS } from '../performance';
import type { ReportColours } from '../performanceSettings';
import {
  anyObject,
  arrayOf,
  boolean,
  filled,
  nothing,
  nullable,
  oneOf,
  optional,
  shape,
  text,
} from './check';
import { as, defineCommand, defineEvent, defineQuery } from './define';

/**
 * What the page hands the bridge for a file or folder dropped on the Imports tab. The preload
 * turns it into its place on the computer and sends `{ kind, path }`; the page never sees it.
 */
export interface PerfDropFromPage {
  /** The card it was dropped on, or null when dropped on the tab (sorted by file name). */
  kind: (typeof PERF_KINDS)[number] | null;
  file: File;
}

const week = filled(8);
const range = shape({ from: week, to: week });
const transporterId = filled(20);
const ids = arrayOf(transporterId, 2000);
const kind = oneOf(PERF_KINDS);

/** Where an import reads from: the remembered folder (or file), or a dropped one's token. */
const source = shape({ kind, token: optional(filled(300)) });

export const performanceChannels = [
  // ---- reading -------------------------------------------------------------------------

  /** The Drivers tab: one row per driver for the week range (null: every week). */
  defineQuery('performance:drivers', {
    input: shape({ range: nullable(range) }),
    result: as<PerfDriversView>(),
  }),
  /** One driver's safety events in the range (one kind, or all that count when null). */
  defineQuery('performance:safety-events', {
    input: shape({ transporterId, range, metricType: nullable(filled(60)) }),
    result: as<SafetyEventView[]>(),
  }),
  /** The Directory tab: everyone on the driver list with how to reach them. */
  defineQuery('performance:directory', { input: nothing, result: as<PerfDirectoryRow[]>() }),
  /** The thresholds table. */
  defineQuery('performance:thresholds', { input: nothing, result: as<PerfThresholdRow[]>() }),
  /** The ID-expiry list, worked out for today with the window from Settings. */
  defineQuery('performance:compliance', { input: nothing, result: as<PerfComplianceRow[]>() }),
  /** The Imports tab: one card per kind of export. */
  defineQuery('performance:import-cards', { input: nothing, result: as<PerfImportCard[]>() }),
  /** The Dashboard for the week range. */
  defineQuery('performance:dashboard', {
    input: shape({ range: nullable(range) }),
    result: as<PerfDashboardView>(),
  }),
  /**
   * A driver's report as the page shows it (the same HTML the PDF is made from). With no driver,
   * a sample report in the given colours, for the live preview on the Reports tab.
   */
  defineQuery('performance:report-html', {
    input: shape({
      transporterId: nullable(transporterId),
      range: nullable(range),
      colours: optional(anyObject),
    }),
    result: as<{ html: string }>(),
  }),
  /**
   * "Explain this score": the driver's newest scored week in the range (null: every week), each
   * metric's tier, score, weight and the points it earned and lost. Null when no scored week.
   */
  defineQuery('performance:explain-score', {
    input: shape({ transporterId, range: nullable(range) }),
    result: as<PerfScoreExplanation | null>(),
  }),
  /** Whether emailing is set up (the password itself never crosses). */
  defineQuery('performance:email-status', { input: nothing, result: as<EmailStatus>() }),

  // ---- bringing in ------------------------------------------------------------------------

  /**
   * Opens the folder window (a file window for the driver list and thresholds), remembers the
   * choice for this kind, and brings it in. Answers null when the window was closed.
   */
  defineCommand('performance:choose-and-import', {
    input: shape({ kind }),
    result: as<PerfImportSummary | null>(),
  }),
  /** Brings in this kind again from its remembered folder, or a dropped file or folder. */
  defineCommand('performance:import', { input: source, result: as<PerfImportSummary>() }),
  /**
   * A file or folder dropped on the Imports tab (kind null: dropped on the tab, sort by name).
   * The page sends the file; the preload sends its place. Answers a token per kind found.
   */
  defineCommand('performance:dropped', {
    input: shape({ kind: nullable(kind), path: filled(1000) }),
    result: as<Array<{ kind: (typeof PERF_KINDS)[number]; token: string; files: number }>>(),
    quiet: true,
  }),
  /** Forgets the remembered folder for this kind (auto-import skips it). */
  defineCommand('performance:forget-folder', { input: shape({ kind }), result: as<null>() }),
  /** Brings in every new or changed file from the remembered folders. */
  defineCommand('performance:sync-now', { input: nothing, result: as<SyncSummary>() }),

  // ---- reports, the check file and email ---------------------------------------------------

  /** Writes one PDF per driver into a folder the person chooses (the main process asks). */
  defineCommand('performance:generate', {
    input: shape({ transporterIds: ids, range }),
    result: as<GenerateOutcome>(),
    quiet: true,
  }),
  /** Writes one driver's report to a temporary PDF and opens it. */
  defineCommand('performance:preview-pdf', {
    input: shape({ transporterId, range }),
    result: as<{ opened: boolean }>(),
    quiet: true,
  }),
  /** The check file (the old verification CSV) for these drivers; asks where to save it. */
  defineCommand('performance:export-check-file', {
    input: shape({ transporterIds: ids }),
    result: as<CheckFileOutcome>(),
    quiet: true,
  }),
  /** Emails each driver their report, over one connection. A dry run sends nothing. */
  defineCommand('performance:email', {
    input: shape({ transporterIds: ids, range, dryRun: boolean }),
    result: as<EmailOutcome>(),
    quiet: true,
  }),
  /**
   * "Show in folder": opens the folder the reports were last made in, or shows the check file
   * last saved, this run. The page never names the place; it is remembered here.
   */
  defineCommand('performance:show-last-output', {
    input: shape({ what: oneOf(PERF_OUTPUTS) }),
    result: as<{ opened: boolean }>(),
    quiet: true,
  }),
  /** Main process to page: how far making or emailing the reports has got. */
  defineEvent('performance:progress', { payload: as<PerfProgress>() }),
  /** Sends one test email to the from address (or the address given). */
  defineCommand('performance:email-test', {
    input: shape({ to: optional(text(200)) }),
    result: as<{ sent: boolean; problem: string | null }>(),
    quiet: true,
  }),
  /** Keeps the email app password, sealed by the computer. Empty forgets it. */
  defineCommand('performance:set-email-password', {
    input: shape({ password: text(200) }),
    result: as<EmailStatus>(),
    quiet: true,
  }),
  /** Puts the report colours back to the old app's defaults. */
  defineCommand('performance:reset-colours', {
    input: nothing,
    result: as<ReportColours>(),
    quiet: true,
  }),

  // ---- the old Weekly Performance App's data -----------------------------------------------

  /** Looks for the old app's data file in its usual place, and whether this app has any yet. */
  defineQuery('performance:old-data-find', { input: nothing, result: as<OldDataFind>() }),
  /** Opens the file window (only `.db` files) to choose the old app's file. */
  defineCommand('performance:old-data-pick', {
    input: nothing,
    result: as<{ chosen: boolean }>(),
    quiet: true,
  }),
  /** Copies the old app's data in. Never writes over weekly data this app already has. */
  defineCommand('performance:old-data-run', {
    input: shape({ from: oneOf(OLD_DATA_SOURCES) }),
    result: as<OldDataResult>(),
  }),
] as const;
