// The thresholds as the app lists them, ported from ThresholdRepository.GetAll and the display
// texts on MetricThreshold (Models.cs).

import { metricNameDisplay, OVERALL_SCORE, type MetricThreshold, type PerfData } from '../models';
import { formatNet, sortedBy } from './dotnet';

/** A threshold row with the texts the thresholds table and report legend show. */
export interface ThresholdView extends MetricThreshold {
  /** "Delivery Completion DPMO" for the stored "DCR"; otherwise the name. */
  metricNameDisplay: string;
  /** "≤100", "≤0.03", or "—" when there is no cut-off. */
  platinumDisplay: string;
  goldDisplay: string;
  silverDisplay: string;
  bronzeDisplay: string;
  /** "11.6%" or "—". */
  weightDisplay: string;
  /** "Higher is Better", "Lower is Better" or "". */
  directionDisplay: string;
}

const SAFETY_ORDER = [
  'Speeding Event Rate',
  'Seatbelt-Off Rate',
  'Distractions Rate',
  'Sign/Signal Violations Rate',
  'Following Distance Rate',
];
const QUALITY_ORDER = ['CDF DPMO', 'CED', 'DCR', 'DSB', 'POD', 'PSB'];

function displayOrder(metricName: string): number {
  if (metricName === OVERALL_SCORE) return 0;
  const safety = SAFETY_ORDER.indexOf(metricName);
  if (safety >= 0) return 100 + safety;
  const quality = QUALITY_ORDER.indexOf(metricName);
  if (quality >= 0) return 200 + quality;
  return 999;
}

/**
 * Amazon gives each cut-off as the top of its tier ("≤ X" whichever way is better). The "≤" is
 * only shown when the row says which way is better.
 */
function cutOff(threshold: Pick<MetricThreshold, 'indicator'>, value: number | null): string {
  if (value === null) return '—';
  const prefix = threshold.indicator === null || threshold.indicator === '' ? '' : '≤';
  return `${prefix}${formatNet(value, '0.##')}`;
}

/** One threshold row with its display texts. */
export function thresholdView(threshold: MetricThreshold): ThresholdView {
  const weight = threshold.overallMetricWeight;
  return {
    ...threshold,
    metricNameDisplay: metricNameDisplay(threshold.metricName),
    platinumDisplay: cutOff(threshold, threshold.platinumThreshold),
    goldDisplay: cutOff(threshold, threshold.goldThreshold),
    silverDisplay: cutOff(threshold, threshold.silverThreshold),
    bronzeDisplay: cutOff(threshold, threshold.bronzeThreshold),
    weightDisplay: weight === null ? '—' : `${formatNet(weight, '0.#')}%`,
    directionDisplay:
      threshold.indicator === 'POSITIVE'
        ? 'Higher is Better'
        : threshold.indicator === 'NEGATIVE'
          ? 'Lower is Better'
          : '',
  };
}

/** Every threshold row (ThresholdRepository.GetAll): Overall Score, then safety, then quality. */
export function getThresholds(data: PerfData): ThresholdView[] {
  return sortedBy(
    data.thresholds,
    (a, b) => displayOrder(a.metricName) - displayOrder(b.metricName),
  ).map(thresholdView);
}
