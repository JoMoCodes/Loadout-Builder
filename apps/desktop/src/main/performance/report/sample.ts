// Page 1 of a made-up report for the live colour preview, with the same made-up driver and
// numbers the old app's preview used (one week in each tier) and the made-up Overall Score
// thresholds, so the chart bands and threshold colours show too.

import {
  thresholdView,
  type DriverReportData,
  type MetricEntry,
  type ScorecardWithMetrics,
} from '@loadout/performance';
import type { ReportColours } from '../../../shared/performanceSettings';
import { buildReportHtml } from './html';

const SAMPLE_ID = 'A047LNAN5VQIQR';

function card(
  id: number,
  week: string,
  tier: string,
  score: number,
  packages: number,
  fico: string,
  dcr: string,
  metricScore: number,
): ScorecardWithMetrics {
  const metric = (n: number, name: string, value: string, weight: number): MetricEntry => ({
    id: n,
    scorecardId: id,
    metricName: name,
    metricValue: value,
    tier,
    score: metricScore,
    weightApplied: weight,
  });
  return {
    id,
    transporterId: SAMPLE_ID,
    week,
    overallStanding: tier,
    overallScore: score,
    packagesDelivered: packages,
    sourceFile: null,
    metrics: [metric(id * 2, 'DCR', dcr, 10), metric(id * 2 + 1, 'FICO', fico, 11.6)],
  };
}

export function sampleReportData(): DriverReportData {
  return {
    transporterId: SAMPLE_ID,
    name: 'Sample Driver',
    fromWeek: '2026-W01',
    toWeek: '2026-W04',
    scorecards: [
      card(1, '2026-W01', 'Platinum', 96.5, 1840, '830', '0', 100),
      card(2, '2026-W02', 'Gold', 91.2, 1755, '800', '850', 90),
      card(3, '2026-W03', 'Silver', 84.8, 1620, '760', '1750', 75),
      card(4, '2026-W04', 'Bronze', 72.1, 1500, '720', '2600', 60),
    ],
    ranks: {},
    pod: [],
    cdf: [],
    dsb: [],
    psb: [],
    dcrEvents: [],
    dcrTotals: [],
  };
}

const SAMPLE_THRESHOLDS = [
  thresholdView({
    metricName: 'Overall Score',
    indicator: 'POSITIVE',
    platinumThreshold: 100,
    goldThreshold: 95,
    silverThreshold: 88,
    bronzeThreshold: 78,
    overallMetricWeight: 0,
    sourceWeek: null,
    importedAt: null,
  }),
];

/** Page 1 of a made-up sample report in these colours, for the live preview. */
export function sampleReportHtml(colours: ReportColours): string {
  return buildReportHtml(
    {
      data: sampleReportData(),
      thresholds: SAMPLE_THRESHOLDS,
      colours,
      psbImportedWeeks: [],
    },
    { firstPageOnly: true },
  );
}
