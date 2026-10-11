// The twelve scorecard metrics and their exact column headers, the threshold names, the safety
// metric types, and the small rules that hang off the records. Ported from Models.cs.

import type {
  CdfWeekEntry,
  DcrEventEntry,
  DriverRecord,
  DsbWeekEntry,
  MetricThreshold,
  PodWeekEntry,
  PsbWeekEntry,
  SafetyEventEntry,
} from './types';

export type MetricDirection = 'Lower is Better' | 'Higher is Better';

/** Where one metric lives in the weekly scorecard file: the exact header text of each column. */
export interface MetricColumns {
  name: string;
  valueCol: string;
  tierCol: string;
  scoreCol: string;
  weightCol: string;
  direction: MetricDirection;
}

function metric(
  name: string,
  valueCol: string,
  tierCol: string,
  scoreCol: string,
  weightCol: string,
  direction: MetricDirection,
): MetricColumns {
  return Object.freeze({ name, valueCol, tierCol, scoreCol, weightCol, direction });
}

/**
 * The 12 metrics, in the old app's order, with the scorecard file's exact header text. If Amazon
 * renames a column, fix it here. (The sign/signal headers really do have a space after the slash.)
 */
export const METRIC_DEFINITIONS: readonly MetricColumns[] = Object.freeze([
  metric(
    'FICO',
    'FICO Metric',
    'FICO Tier',
    'FICO Score',
    'FICO Metric Weight Applied',
    'Higher is Better',
  ),
  metric(
    'Speeding Event Rate',
    'Speeding Event Rate (per trip)',
    'Speeding Event Rate Tier',
    'Speeding Event Rate Score',
    'Speeding Event Rate Weight Applied',
    'Lower is Better',
  ),
  metric(
    'Seatbelt-Off Rate',
    'Seatbelt-Off Rate (per trip)',
    'Seatbelt-Off Rate Tier',
    'Seatbelt-Off Rate Score',
    'Seatbelt-Off Rate Weight Applied',
    'Lower is Better',
  ),
  metric(
    'Distractions Rate',
    'Distractions Rate (per trip)',
    'Distractions Rate Tier',
    'Distractions Rate Score',
    'Distractions Rate Weight Applied',
    'Lower is Better',
  ),
  metric(
    'Sign/Signal Violations Rate',
    'Sign/ Signal Violations Rate (per trip)',
    'Sign/ Signal Violations Rate Tier',
    'Sign/ Signal Violations Rate Score',
    'Sign/ Signal Violations Rate Weight Applied',
    'Lower is Better',
  ),
  metric(
    'Following Distance Rate',
    'Following Distance Rate (per trip)',
    'Following Distance Rate Tier',
    'Following Distance Rate Score',
    'Following Distance Rate Weight Applied',
    'Lower is Better',
  ),
  metric(
    'CDF DPMO',
    'CDF DPMO',
    'CDF DPMO Tier',
    'CDF DPMO Score',
    'CDF DPMO Weight Applied',
    'Lower is Better',
  ),
  metric('CED', 'CED', 'CED Tier', 'CED Score', 'CED Weight Applied', 'Lower is Better'),
  metric(
    'DCR',
    'Delivery Completion DPMO',
    'Delivery Completion DPMO Tier',
    'Delivery Completion DPMO Score',
    'Delivery Completion DPMO Weight Applied',
    'Lower is Better',
  ),
  metric(
    'DSB',
    'DSB',
    'DSB DPMO Tier',
    'DSB DPMO Score',
    'DSB DPMO Weight Applied',
    'Lower is Better',
  ),
  metric('POD', 'POD', 'POD Tier', 'POD Score', 'POD Weight Applied', 'Higher is Better'),
  metric('PSB', 'PSB', 'PSB Tier', 'PSB Score', 'PSB Weight Applied', 'Lower is Better'),
]);

/** The old `MetricDefinitions.All`. */
export const MetricDefinitions = Object.freeze({ All: METRIC_DEFINITIONS });

export const OVERALL_SCORE = 'Overall Score';

const THRESHOLD_NAMES: ReadonlyMap<string, string | null> = new Map([
  ['Overall Score', OVERALL_SCORE],
  ['Safe Driving Metric (FICO)', null], // skipped on purpose
  ['Seatbelt-Off Rate', 'Seatbelt-Off Rate'],
  ['Speeding Event Rate', 'Speeding Event Rate'],
  ['Distractions Rate', 'Distractions Rate'],
  ['Following Distance Rate', 'Following Distance Rate'],
  ['Sign/Signal Violations Rate', 'Sign/Signal Violations Rate'],
  ['Customer Delivery Feedback (CDF DPMO) (CDF)', 'CDF DPMO'],
  ['Customer Escalations Defect (CED)', 'CED'],
  ['Delivery Completion Rate (DCR)', 'DCR'], // older header (a rate, higher is better)
  ['Delivery Completion DPMO (DC_DPMO)', 'DCR'], // current header (DPMO, lower is better)
  ['Delivery Success Behaviors (DSB)', 'DSB'],
  ['POD Acceptance Rate (POD)', 'POD'],
  ['Pickup Success Behaviors (PSB)', 'PSB'],
]);

/**
 * The thresholds file's long metric name (trimmed) -> the short name the scorecards use.
 * Null for rows to skip: FICO on purpose, and any name it does not know.
 */
export function normalizeThresholdMetricName(rawName: string | null | undefined): string | null {
  return THRESHOLD_NAMES.get((rawName ?? '').trim()) ?? null;
}

/** "Overall", "Safety" or "Quality": how the report's legend groups a metric. */
export function thresholdCategoryOf(normalizedName: string): 'Overall' | 'Safety' | 'Quality' {
  switch (normalizedName) {
    case OVERALL_SCORE:
      return 'Overall';
    case 'Speeding Event Rate':
    case 'Seatbelt-Off Rate':
    case 'Distractions Rate':
    case 'Following Distance Rate':
    case 'Sign/Signal Violations Rate':
      return 'Safety';
    default:
      return 'Quality';
  }
}

/** The old `ThresholdMetricNames`. */
export const ThresholdMetricNames = Object.freeze({
  OverallScore: OVERALL_SCORE,
  normalize: normalizeThresholdMetricName,
  categoryOf: thresholdCategoryOf,
});

/** The five safety "Metric Type" values, matched to the grid columns. */
export const SafetyMetricTypes = Object.freeze({
  Speeding: 'Speeding',
  SignSignal: 'Sign Signal',
  Distraction: 'Distraction',
  FollowingDistance: 'Following Distance',
  Seatbelt: 'Seatbelt',
  All: Object.freeze(['Speeding', 'Sign Signal', 'Distraction', 'Following Distance', 'Seatbelt']),
});

/** A blank status means the driver has left: "OFFBOARDED". Otherwise the status, trimmed, upper case. */
export function effectiveStatus(driver: Pick<DriverRecord, 'status'>): string {
  const status = driver.status;
  return status === null || status.trim() === '' ? 'OFFBOARDED' : status.trim().toUpperCase();
}

/** Does this safety event count toward the grid totals? (Program Impact is not blank or "None".) */
export function isSafetyEventCounted(event: Pick<SafetyEventEntry, 'programImpact'>): boolean {
  const impact = event.programImpact;
  return impact !== null && impact.trim() !== '' && impact.trim().toLowerCase() !== 'none';
}

/** Does this safety event have a web link to its video? */
export function hasVideoLink(event: Pick<SafetyEventEntry, 'videoLink'>): boolean {
  const link = event.videoLink;
  return link !== null && link.trim() !== '' && link.trim().toLowerCase().startsWith('http');
}

/** Does this returned package count against the driver's delivery completion? (Impact DCR is "Y".) */
export function impactsDcr(event: Pick<DcrEventEntry, 'impactDcr'>): boolean {
  return event.impactDcr.toLowerCase() === 'y';
}

/** (Success + Bypass) / Opportunities as a percentage; null when there were no opportunities. */
export function podAcceptanceRate(
  entry: Pick<PodWeekEntry, 'opportunities' | 'success' | 'bypass'>,
): number | null {
  return entry.opportunities > 0
    ? ((entry.success + entry.bypass) * 100.0) / entry.opportunities
    : null;
}

export type CategoryRow = readonly [label: string, count: number];

/** The 9 POD reject categories, labelled as in the report. */
export function podRejectCategoryRows(entry: PodWeekEntry): CategoryRow[] {
  return [
    ['Blurry Photo', entry.blurryPhoto],
    ['Human In The Picture', entry.humanInThePicture],
    ['No Package Detected', entry.noPackageDetected],
    ['Package In Car', entry.packageInCar],
    ['Package In Hand', entry.packageInHand],
    ['Package Not Clearly Visible', entry.packageNotClearlyVisible],
    ['Package Too Close', entry.packageTooClose],
    ['Photo Too Dark', entry.photoTooDark],
    ['Other', entry.other],
  ];
}

/** The 6 CDF categories, labelled with the file's own header text. */
export function cdfCategoryRows(entry: CdfWeekEntry): CategoryRow[] {
  return [
    ['DA Mishandled Package', entry.mishandled],
    ['DA was Unprofessional', entry.unprofessional],
    ['DA did not follow my delivery instructions', entry.didNotFollowInstructions],
    ['Delivered to Wrong Address', entry.wrongAddress],
    ['Never Received Delivery', entry.neverReceived],
    ['Received Wrong Item', entry.wrongItem],
  ];
}

/** The 6 DSB categories, labelled with the file's own header text. */
export function dsbCategoryRows(entry: DsbWeekEntry): CategoryRow[] {
  return [
    ['Simultaneous Deliveries', entry.simultaneousDeliveries],
    ['Delivered > 50 m', entry.deliveredOver50m],
    ['Incorrect Scan Usage - Attended Delivery', entry.incorrectScanAttended],
    ['Incorrect Scan Usage - Unattended Delivery', entry.incorrectScanUnattended],
    ['No POD on Delivery', entry.noPodOnDelivery],
    ['Scanned - Not Delivered - Not Returned', entry.scannedNotDeliveredNotReturned],
  ];
}

/** The 7 PSB categories, labelled with the file's own header text. */
export function psbCategoryRows(entry: PsbWeekEntry): CategoryRow[] {
  return [
    ['Early Arrivals', entry.earlyArrivals],
    ['Late Arrivals', entry.lateArrivals],
    ['Geo Location', entry.geoLocation],
    ['Not Attempted', entry.notAttempted],
    ['Contact Compliance', entry.contactCompliance],
    ['Out of Return Label', entry.outOfReturnLabel],
    ['Picked up, Not Returned', entry.pickedUpNotReturned],
  ];
}

/** The name shown for a threshold row: the stored "DCR" reads as Amazon's current wording. */
export function metricNameDisplay(metricName: string): string {
  return metricName === 'DCR' ? 'Delivery Completion DPMO' : metricName;
}

/**
 * The tier a raw value falls in, from a lower-is-better threshold row. Thresholds are the
 * inclusive upper bound of each tier; anything past Bronze is still Bronze. Null when the row
 * is not lower-is-better or has no cut-offs.
 */
export function thresholdTierFor(
  threshold: Pick<
    MetricThreshold,
    'indicator' | 'platinumThreshold' | 'goldThreshold' | 'silverThreshold' | 'bronzeThreshold'
  >,
  value: number,
): string | null {
  if (threshold.indicator !== 'NEGATIVE') return null;
  const {
    platinumThreshold: p,
    goldThreshold: g,
    silverThreshold: s,
    bronzeThreshold: b,
  } = threshold;
  if (p === null && g === null && s === null && b === null) return null;
  if (p !== null && value <= p) return 'Platinum';
  if (g !== null && value <= g) return 'Gold';
  if (s !== null && value <= s) return 'Silver';
  return 'Bronze';
}
