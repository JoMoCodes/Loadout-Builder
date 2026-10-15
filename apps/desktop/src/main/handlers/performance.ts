// Weekly performance handlers. The numbers come from @loadout/performance over the saved data
// (main/performance/views.ts); the files, folders, reports and email are main/performance/
// service.ts. A page never names a place on the computer: folders are chosen in the main
// process's own window, and a dropped file or folder becomes a token.

import type { performanceChannels } from '../../shared/channels/performance';
import type { WeekRange } from '../../shared/performance';
import { DEFAULT_REPORT_COLOURS, mergePerformance } from '../../shared/performanceSettings';
import { explainScore, explainScoreByWeek, getSafetyEventsForDriver } from '@loadout/performance';
import { ChannelRefusal } from '../channels';
import {
  complianceView,
  dashboardView,
  driversView,
  importCardsView,
  resolveRange,
  thresholdsView,
} from '../performance/views';
import type { HandlerContext, HandlersFor } from './types';

const WEEK = /^\d{4}-W\d{2}$/;

/** A week range from the page: both ends "YYYY-Www", the first not after the last. */
function checkRange<R extends WeekRange | null>(range: R): R {
  if (range === null) return range;
  if (!WEEK.test(range.from) || !WEEK.test(range.to)) {
    throw new ChannelRefusal('refused', 'Those weeks could not be read. Pick the weeks again.');
  }
  if (range.from > range.to) {
    throw new ChannelRefusal('refused', 'The first week must not be after the last week.');
  }
  return range;
}

const settingsOf = (ctx: HandlerContext) => ctx.services.getSettings().performance;
const dataOf = (ctx: HandlerContext) => ctx.host.perf.data();

export const performanceHandlers: HandlersFor<typeof performanceChannels> = {
  // ---- reading
  'performance:drivers': ({ range }, ctx) =>
    driversView(
      dataOf(ctx),
      checkRange(range),
      new Map(ctx.state.associates.rows.map((a) => [a.transporterId, a.tenure])),
    ),
  'performance:safety-events': ({ transporterId, range, metricType }, ctx) => {
    const r = checkRange(range);
    return getSafetyEventsForDriver(dataOf(ctx), transporterId, r.from, r.to, metricType);
  },
  'performance:thresholds': (_input, ctx) => thresholdsView(dataOf(ctx)),
  'performance:compliance': (_input, ctx) =>
    complianceView(dataOf(ctx), settingsOf(ctx).complianceWindowDays, ctx.today()),
  'performance:import-cards': (_input, ctx) => {
    const service = ctx.services.performance;
    return importCardsView(dataOf(ctx), (kind) => service.cardFolder(kind), service.lastImportAt());
  },
  'performance:dashboard': ({ range }, ctx) =>
    dashboardView(dataOf(ctx), checkRange(range), settingsOf(ctx), ctx.today()),
  'performance:report-html': ({ transporterId, range, colours }, ctx) => {
    void ctx.host.perf;
    const current = settingsOf(ctx);
    return ctx.services.performance.reportHtml(
      transporterId,
      checkRange(range),
      colours,
      (raw) => mergePerformance(current, { colours: raw }).colours,
    );
  },
  'performance:explain-score': ({ transporterId, range }, ctx) => {
    const data = dataOf(ctx);
    const r = resolveRange(data, checkRange(range));
    if (!r) return null;
    const newest = explainScore(data, transporterId, r.from, r.to);
    return newest
      ? { ...newest, weeks: explainScoreByWeek(data, transporterId, r.from, r.to) }
      : null;
  },
  'performance:email-status': (_input, ctx) => ctx.services.performance.emailStatus(),

  // ---- bringing in
  'performance:choose-and-import': ({ kind }, ctx) => {
    void ctx.host.perf;
    return ctx.services.performance.chooseAndImport(kind);
  },
  'performance:import': ({ kind, token }, ctx) => {
    void ctx.host.perf;
    return ctx.services.performance.import(kind, token);
  },
  'performance:dropped': ({ kind, path }, ctx) => ctx.services.performance.dropped(kind, path),
  'performance:forget-folder': ({ kind }, ctx) => {
    ctx.services.performance.forgetFolder(kind);
    return null;
  },
  'performance:sync-now': (_input, ctx) => {
    void ctx.host.perf;
    return ctx.services.performance.syncNow();
  },

  // ---- reports, the check file and email
  'performance:generate': ({ transporterIds, range }, ctx) =>
    ctx.services.performance.generate(transporterIds, checkRange(range)),
  'performance:preview-pdf': ({ transporterId, range }, ctx) =>
    ctx.services.performance.previewPdf(transporterId, checkRange(range)),
  'performance:export-check-file': ({ transporterIds }, ctx) =>
    ctx.services.performance.exportCheckFile(transporterIds),
  'performance:email': ({ transporterIds, range, dryRun }, ctx) =>
    ctx.services.performance.email(transporterIds, checkRange(range), dryRun),
  'performance:show-last-output': ({ what }, ctx) => ctx.services.performance.showLastOutput(what),
  'performance:email-test': ({ to }, ctx) => ctx.services.performance.emailTest(to),
  'performance:set-email-password': ({ password }, ctx) =>
    ctx.services.performance.setEmailPassword(password),
  'performance:reset-colours': (_input, ctx) =>
    ctx.services.setSettings({ performance: { colours: { ...DEFAULT_REPORT_COLOURS } } })
      .performance.colours,

  // ---- the old Weekly Performance App's data
  'performance:old-data-find': (_input, ctx) => ctx.services.oldWpaData.find(),
  'performance:old-data-pick': async (_input, ctx) => ({
    chosen: await ctx.services.oldWpaData.pick(),
  }),
  'performance:old-data-run': ({ from }, ctx) => ctx.services.oldWpaData.run(from),
};
