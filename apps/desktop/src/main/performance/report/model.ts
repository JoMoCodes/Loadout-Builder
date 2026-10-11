// Turns the driver's report data into what the pages draw: one column per scorecard week,
// with the POD, CDF and DSB rows filled in with zeros for weeks that have none (the old
// report's FillMissingWeeks), the PSB columns that know whether a file was brought in that
// week, and DCR tiers worked out from the thresholds when the scorecard had none.

import {
  fillMissingWeeks,
  parseMetricValue,
  thresholdTierFor,
  type CdfWeekEntry,
  type DcrWeekTotals,
  type DriverReportData,
  type DsbWeekEntry,
  type MetricEntry,
  type PodReportEntry,
  type PsbWeekEntry,
  type ScorecardWithMetrics,
  type ThresholdView,
  type DcrReportEvent,
  type WeekRank,
} from '@loadout/performance';

/** One column of the PSB page: the week, the driver's row (if any) and whether a file was read. */
export interface PsbColumn {
  week: string;
  entry: PsbWeekEntry | null;
  hasFile: boolean;
}

export interface ReportModel {
  name: string;
  transporterId: string;
  /** The weeks the driver has a scorecard in, oldest first: one column each. */
  weeks: string[];
  scorecards: ScorecardWithMetrics[];
  /** Per week, the first metric entry of each name (tiers filled in for DCR). */
  metrics: Map<string, Map<string, MetricEntry>>;
  ranks: Record<string, WeekRank>;
  pod: PodReportEntry[];
  cdf: CdfWeekEntry[];
  dsb: DsbWeekEntry[];
  psb: PsbColumn[];
  dcrEvents: DcrReportEvent[];
  dcrTotals: DcrWeekTotals[];
  thresholds: ThresholdView[];
}

function emptyPod(transporterId: string, name: string, week: string): PodReportEntry {
  return {
    transporterId,
    week,
    name,
    opportunities: 0,
    success: 0,
    bypass: 0,
    rejects: 0,
    blurryPhoto: 0,
    humanInThePicture: 0,
    noPackageDetected: 0,
    packageInCar: 0,
    packageInHand: 0,
    packageNotClearlyVisible: 0,
    packageTooClose: 0,
    photoTooDark: 0,
    other: 0,
    sourceFile: null,
    acceptanceRate: null,
  };
}

function emptyCdf(transporterId: string, name: string, week: string): CdfWeekEntry {
  return {
    transporterId,
    week,
    name,
    mishandled: 0,
    unprofessional: 0,
    didNotFollowInstructions: 0,
    wrongAddress: 0,
    neverReceived: 0,
    wrongItem: 0,
    sourceFile: null,
  };
}

function emptyDsb(transporterId: string, name: string, week: string): DsbWeekEntry {
  return {
    transporterId,
    week,
    name,
    simultaneousDeliveries: 0,
    deliveredOver50m: 0,
    incorrectScanAttended: 0,
    incorrectScanUnattended: 0,
    noPodOnDelivery: 0,
    scannedNotDeliveredNotReturned: 0,
    sourceFile: null,
  };
}

/**
 * The DCR entry with a tier worked out from the DCR threshold when the scorecard gave none
 * (the old DeriveMissingDcrTiers). The scorecard's own tier always wins.
 */
function withDcrTier(entry: MetricEntry, dcr: ThresholdView | undefined): MetricEntry {
  if (!dcr || entry.metricName !== 'DCR') return entry;
  if (entry.tier !== null && entry.tier.trim() !== '') return entry;
  const value = parseMetricValue(entry.metricValue);
  if (value === null) return entry;
  return { ...entry, tier: thresholdTierFor(dcr, value) };
}

export function buildModel(
  data: DriverReportData,
  thresholds: readonly ThresholdView[],
  psbImportedWeeks: readonly string[],
): ReportModel {
  const { transporterId, name } = data;
  const weeks = data.scorecards.map((card) => card.week);
  const dcr = thresholds.find((t) => t.metricName === 'DCR');

  const metrics = new Map<string, Map<string, MetricEntry>>();
  for (const card of data.scorecards) {
    const byName = new Map<string, MetricEntry>();
    for (const entry of card.metrics) {
      if (!byName.has(entry.metricName)) byName.set(entry.metricName, withDcrTier(entry, dcr));
    }
    metrics.set(card.week, byName);
  }

  const imported = new Set(psbImportedWeeks.map((w) => w.toUpperCase()));
  const psbByWeek = new Map<string, PsbWeekEntry>();
  for (const entry of data.psb) {
    const key = entry.week.toUpperCase();
    if (!psbByWeek.has(key)) psbByWeek.set(key, entry);
  }

  return {
    name,
    transporterId,
    weeks,
    scorecards: data.scorecards,
    metrics,
    ranks: data.ranks,
    pod: fillMissingWeeks(data.pod, weeks, (w) => emptyPod(transporterId, name, w)),
    cdf: fillMissingWeeks(data.cdf, weeks, (w) => emptyCdf(transporterId, name, w)),
    dsb: fillMissingWeeks(data.dsb, weeks, (w) => emptyDsb(transporterId, name, w)),
    psb: weeks.map((week) => ({
      week,
      entry: psbByWeek.get(week.toUpperCase()) ?? null,
      hasFile: imported.has(week.toUpperCase()),
    })),
    dcrEvents: data.dcrEvents,
    dcrTotals: data.dcrTotals,
    thresholds: [...thresholds],
  };
}
