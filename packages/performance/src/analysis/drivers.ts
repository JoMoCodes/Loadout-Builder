// The per-driver reads and the grid numbers, ported from DriverRepository.cs. Every function
// takes the saved data as plain lists (PerfData) and changes nothing.
//
// Where the old code asked SQLite, the comments say which query this replaces and what in it
// matters: weeks compare as plain text ("2026-W07" < "2026-W10"), rows come back in the order
// the query saw them (which decides how sums of decimals add up), and names sort with
// SQLite's NOCASE.

import {
  effectiveStatus,
  impactsDcr,
  parseNetNumber,
  podAcceptanceRate,
  SafetyMetricTypes,
  type CdfWeekEntry,
  type DcrEventEntry,
  type DcrWeekTotals,
  type Driver,
  type DriverAverages,
  type DriverSafety,
  type DriverTrend,
  type DsbWeekEntry,
  type MetricEntry,
  type PerfData,
  type PodWeekEntry,
  type PsbWeekEntry,
  type SafetyEventEntry,
  type WeeklyScorecard,
} from '../models';
import {
  compareNoCase,
  compareOrdinal,
  compareOrdinalIgnoreCase,
  formatNet,
  linqAverage,
  sortedBy,
  sqliteLower,
  sqliteTrim,
} from './dotnet';

// ---- shared helpers ---------------------------------------------------------------------------

/** `Week >= from AND Week <= to`, compared as plain text like the old SQL. */
export function weekInRange(week: string, fromWeek: string, toWeek: string): boolean {
  return week >= fromWeek && week <= toWeek;
}

/**
 * Rows in a week range in the order SQLite's week index gives them: by week, then in the order
 * they were saved. (The old range queries all used the week index.)
 */
export function rowsInRange<T extends { week: string }>(
  rows: readonly T[],
  fromWeek: string,
  toWeek: string,
): T[] {
  return sortedBy(
    rows.filter((row) => weekInRange(row.week, fromWeek, toWeek)),
    (a, b) => compareOrdinal(a.week, b.week),
  );
}

/** One driver's rows in a week range, `ORDER BY Week`. */
function driverRowsInRange<T extends { transporterId: string; week: string }>(
  rows: readonly T[],
  transporterId: string,
  fromWeek: string,
  toWeek: string,
): T[] {
  return sortedBy(
    rows.filter(
      (row) => row.transporterId === transporterId && weekInRange(row.week, fromWeek, toWeek),
    ),
    (a, b) => compareOrdinal(a.week, b.week),
  );
}

/** How the old code ranked a week: score high to low, then packages, then Transporter ID. */
function compareForRank(
  a: Pick<WeeklyScorecard, 'overallScore' | 'packagesDelivered' | 'transporterId'>,
  b: Pick<WeeklyScorecard, 'overallScore' | 'packagesDelivered' | 'transporterId'>,
): number {
  const scoreA = a.overallScore as number;
  const scoreB = b.overallScore as number;
  if (scoreA !== scoreB) return scoreB > scoreA ? 1 : -1;
  const packagesA = a.packagesDelivered ?? 0;
  const packagesB = b.packagesDelivered ?? 0;
  if (packagesA !== packagesB) return packagesB - packagesA;
  return compareOrdinal(a.transporterId, b.transporterId);
}

/** Group rows by a key, keeping the order keys were first seen (LINQ's GroupBy). */
export function groupBy<T>(rows: readonly T[], key: (row: T) => string): Map<string, T[]> {
  const groups = new Map<string, T[]>();
  for (const row of rows) {
    const k = key(row);
    const list = groups.get(k);
    if (list) list.push(row);
    else groups.set(k, [row]);
  }
  return groups;
}

// ---- weeks and drivers -------------------------------------------------------------------------

/** Every week with a scorecard, oldest first (`SELECT DISTINCT Week ... ORDER BY Week`). */
export function getAllWeeks(data: PerfData): string[] {
  return [...new Set(data.scorecards.map((card) => card.week))].sort(compareOrdinal);
}

/**
 * Every driver with their newest scorecard and their rank in that week (GetAllWithLatest).
 * Sorted by name the way SQLite's NOCASE sorts (only A-Z ignore case).
 *
 * The rank counts every driver with a score that week: score high to low, then packages
 * (blank counts as 0), then Transporter ID. A newest scorecard with no score has no rank.
 */
export function getAllWithLatest(data: PerfData): Driver[] {
  // Newest scorecard per driver (ORDER BY Week DESC LIMIT 1; one card per driver and week).
  const latest = new Map<string, WeeklyScorecard>();
  for (const card of data.scorecards) {
    const seen = latest.get(card.transporterId);
    if (!seen || card.week > seen.week) latest.set(card.transporterId, card);
  }

  // ROW_NUMBER() / COUNT(*) OVER (PARTITION BY Week) among cards with a score.
  const rankById = new Map<number, { rank: number; total: number }>();
  const latestWeeks = new Set([...latest.values()].map((card) => card.week));
  const byWeek = groupBy(
    data.scorecards.filter((card) => card.overallScore !== null && latestWeeks.has(card.week)),
    (card) => card.week,
  );
  for (const cards of byWeek.values()) {
    const ordered = sortedBy(cards, compareForRank);
    ordered.forEach((card, index) =>
      rankById.set(card.id, { rank: index + 1, total: ordered.length }),
    );
  }

  const rows = data.drivers.map((d): Driver => {
    const card = latest.get(d.transporterId);
    const rank = card ? rankById.get(card.id) : undefined;
    return {
      transporterId: d.transporterId,
      name: d.name,
      status: d.status,
      position: d.position,
      qualifications: d.qualifications,
      idExpiration: d.idExpiration,
      personalPhone: d.personalPhone,
      workPhone: d.workPhone,
      email: d.email,
      latestWeek: card?.week ?? null,
      latestTier: card?.overallStanding ?? null,
      latestScore: card?.overallScore ?? null,
      latestPackages: card?.packagesDelivered ?? null,
      latestRank: rank?.rank ?? null,
      latestRankTotal: rank?.total ?? null,
    };
  });
  return sortedBy(rows, (a, b) => compareNoCase(a.name, b.name));
}

/** A driver as the Drivers grid shows them: the numbers plus the texts the cells display. */
export interface DriverGridRow extends Driver {
  isSelected: boolean;
  /** "Rank / Total" in the newest week, or "" with no rank. */
  latestRankDisplay: string;
  /** Status, upper case; blank means "OFFBOARDED". */
  effectiveStatus: string;

  avgScore: number | null;
  avgRank: number | null;
  avgPackages: number | null;
  avgCdf: number | null;
  avgDsb: number | null;
  avgDcr: number | null;
  avgPod: number | null;
  avgPsb: number | null;
  avgCed: number | null;
  /** "-" when there is nothing to average. */
  avgScoreDisplay: string;
  avgRankDisplay: string;
  avgPackagesDisplay: string;
  avgCdfDisplay: string;
  avgDsbDisplay: string;
  avgDcrDisplay: string;
  avgPodDisplay: string;
  avgPsbDisplay: string;
  avgCedDisplay: string;

  scoreDelta: number | null;
  trendSlope: number | null;
  tierDelta: number | null;
  trendDirection: DriverTrend['trendDirection'];
  /** "+1.5", "-2.0" or "-". */
  scoreDeltaDisplay: string;

  safetyTotal: number;
  safetySpeeding: number;
  safetySignSignal: number;
  safetyDistraction: number;
  safetyFollowingDistance: number;
  safetySeatbelt: number;
  /** The count, or "" for zero. */
  safetyTotalDisplay: string;
  safetySpeedingDisplay: string;
  safetySignSignalDisplay: string;
  safetyDistractionDisplay: string;
  safetyFollowingDistanceDisplay: string;
  safetySeatbeltDisplay: string;
}

export const EMPTY_AVERAGES: DriverAverages = Object.freeze({
  score: null,
  rank: null,
  packages: null,
  cdf: null,
  dsb: null,
  dcr: null,
  pod: null,
  psb: null,
  ced: null,
});

export const EMPTY_TREND: DriverTrend = Object.freeze({
  scoreDelta: null,
  tierDelta: null,
  slope: null,
  trendDirection: 'Flat',
});

export const EMPTY_SAFETY: DriverSafety = Object.freeze({
  total: 0,
  speeding: 0,
  signSignal: 0,
  distraction: 0,
  followingDistance: 0,
  seatbelt: 0,
});

function dash(value: number | null, format: string): string {
  return value === null ? '-' : formatNet(value, format);
}

function safetyText(n: number): string {
  return n > 0 ? String(n) : '';
}

/** "+1.5" for a rise (or no change), "-2.0" for a fall, "-" for none. */
export function scoreDeltaDisplay(value: number | null): string {
  if (value === null) return '-';
  return value >= 0 ? `+${formatNet(value, '0.0')}` : formatNet(value, '0.0');
}

/**
 * One grid row: the driver plus their averages, trend and safety counts for the week range
 * (each left out means "nothing in the range", shown as "-" or a blank cell).
 */
export function driverGridRow(
  driver: Driver,
  averages: DriverAverages = EMPTY_AVERAGES,
  trend: DriverTrend = EMPTY_TREND,
  safety: DriverSafety = EMPTY_SAFETY,
): DriverGridRow {
  return {
    ...driver,
    isSelected: false,
    latestRankDisplay:
      driver.latestRank !== null ? `${driver.latestRank} / ${driver.latestRankTotal ?? ''}` : '',
    effectiveStatus: effectiveStatus(driver),

    avgScore: averages.score,
    avgRank: averages.rank,
    avgPackages: averages.packages,
    avgCdf: averages.cdf,
    avgDsb: averages.dsb,
    avgDcr: averages.dcr,
    avgPod: averages.pod,
    avgPsb: averages.psb,
    avgCed: averages.ced,
    avgScoreDisplay: dash(averages.score, '0.0'),
    avgRankDisplay: dash(averages.rank, '0.0'),
    avgPackagesDisplay: dash(averages.packages, '0'),
    avgCdfDisplay: dash(averages.cdf, '0.#'),
    avgDsbDisplay: dash(averages.dsb, '0.#'),
    avgDcrDisplay: dash(averages.dcr, '0.#'),
    avgPodDisplay: averages.pod === null ? '-' : `${formatNet(averages.pod, '0.0')}%`,
    avgPsbDisplay: dash(averages.psb, '0.#'),
    avgCedDisplay: dash(averages.ced, '0.#'),

    scoreDelta: trend.scoreDelta,
    trendSlope: trend.slope,
    tierDelta: trend.tierDelta,
    trendDirection: trend.trendDirection ?? 'Flat',
    scoreDeltaDisplay: scoreDeltaDisplay(trend.scoreDelta),

    safetyTotal: safety.total,
    safetySpeeding: safety.speeding,
    safetySignSignal: safety.signSignal,
    safetyDistraction: safety.distraction,
    safetyFollowingDistance: safety.followingDistance,
    safetySeatbelt: safety.seatbelt,
    safetyTotalDisplay: safetyText(safety.total),
    safetySpeedingDisplay: safetyText(safety.speeding),
    safetySignSignalDisplay: safetyText(safety.signSignal),
    safetyDistractionDisplay: safetyText(safety.distraction),
    safetyFollowingDistanceDisplay: safetyText(safety.followingDistance),
    safetySeatbeltDisplay: safetyText(safety.seatbelt),
  };
}

// ---- one driver's rows --------------------------------------------------------------------------

/** A driver's scorecards in the range, oldest first (GetScorecardsForDriver). */
export function getScorecardsForDriver(
  data: PerfData,
  transporterId: string,
  fromWeek: string,
  toWeek: string,
): WeeklyScorecard[] {
  return driverRowsInRange(data.scorecards, transporterId, fromWeek, toWeek);
}

/**
 * The metrics of some scorecards (GetMetricsForScorecards), by scorecard id and then in the
 * order they were saved, as SQLite's scorecard index returned them.
 */
export function getMetricsForScorecards(
  data: PerfData,
  scorecardIds: Iterable<number>,
): MetricEntry[] {
  const ids = new Set(scorecardIds);
  return sortedBy(
    data.metrics.filter((metric) => ids.has(metric.scorecardId)),
    (a, b) => a.scorecardId - b.scorecardId,
  );
}

export interface WeekRank {
  /** 1 = best. */
  rank: number;
  /** How many drivers had a score that week. */
  total: number;
}

/**
 * The driver's rank in each of the given weeks (GetRanksForDriver), keyed by week, oldest
 * first. Ranked among every driver with a score that week: score high to low, then packages
 * (blank = 0), then Transporter ID. A week the driver has no score in is left out.
 */
export function getRanksForDriver(
  data: PerfData,
  transporterId: string,
  weeks: Iterable<string>,
): Record<string, WeekRank> {
  const wanted = new Set(weeks);
  const result: Record<string, WeekRank> = {};
  if (wanted.size === 0) return result;
  const byWeek = groupBy(
    data.scorecards.filter((card) => wanted.has(card.week) && card.overallScore !== null),
    (card) => card.week,
  );
  for (const week of [...byWeek.keys()].sort(compareOrdinal)) {
    const ordered = sortedBy(byWeek.get(week) as WeeklyScorecard[], compareForRank);
    const index = ordered.findIndex((card) => card.transporterId === transporterId);
    if (index >= 0) result[week] = { rank: index + 1, total: ordered.length };
  }
  return result;
}

/** A POD row with its acceptance rate ((Success + Bypass) / Opportunities, null with none). */
export interface PodReportEntry extends PodWeekEntry {
  acceptanceRate: number | null;
}

/** A returned package with whether it counts against delivery completion (Impact DCR "Y"). */
export interface DcrReportEvent extends DcrEventEntry {
  impactsDcr: boolean;
}

/** A driver's POD rows in the range, oldest first, each with its acceptance rate. */
export function getPodEntriesForDriver(
  data: PerfData,
  transporterId: string,
  fromWeek: string,
  toWeek: string,
): PodReportEntry[] {
  return driverRowsInRange(data.pod, transporterId, fromWeek, toWeek).map((entry) => ({
    ...entry,
    acceptanceRate: podAcceptanceRate(entry),
  }));
}

/** A driver's negative feedback (CDF) rows in the range, oldest first. */
export function getCdfEntriesForDriver(
  data: PerfData,
  transporterId: string,
  fromWeek: string,
  toWeek: string,
): CdfWeekEntry[] {
  return driverRowsInRange(data.cdf, transporterId, fromWeek, toWeek);
}

/** A driver's DSB rows in the range, oldest first. */
export function getDsbEntriesForDriver(
  data: PerfData,
  transporterId: string,
  fromWeek: string,
  toWeek: string,
): DsbWeekEntry[] {
  return driverRowsInRange(data.dsb, transporterId, fromWeek, toWeek);
}

/** A driver's pickup failure (PSB) rows in the range, oldest first. */
export function getPsbEntriesForDriver(
  data: PerfData,
  transporterId: string,
  fromWeek: string,
  toWeek: string,
): PsbWeekEntry[] {
  return driverRowsInRange(data.psb, transporterId, fromWeek, toWeek);
}

/**
 * Weeks in the range that had a PSB file read, even one with no failures (GetPsbImportedWeeks).
 * Oldest first. The report tells "no file that week" from "no failures that week" with it.
 */
export function getPsbImportedWeeks(data: PerfData, fromWeek: string, toWeek: string): string[] {
  return [
    ...new Set(
      data.psbImportedWeeks
        .map((entry) => entry.week)
        .filter((week) => weekInRange(week, fromWeek, toWeek)),
    ),
  ].sort(compareOrdinal);
}

/**
 * A driver's returned packages in the range (GetDcrEventsForDriver): both the ones that count
 * and the ones that do not, by week, then planned delivery date, then the order saved.
 */
export function getDcrEventsForDriver(
  data: PerfData,
  transporterId: string,
  fromWeek: string,
  toWeek: string,
): DcrReportEvent[] {
  return sortedBy(
    data.dcrEvents.filter(
      (event) => event.transporterId === transporterId && weekInRange(event.week, fromWeek, toWeek),
    ),
    (a, b) =>
      compareOrdinal(a.week, b.week) ||
      compareOrdinal(a.plannedDeliveryDate, b.plannedDeliveryDate) ||
      a.id - b.id,
  ).map((event) => ({ ...event, impactsDcr: impactsDcr(event) }));
}

/** A driver's delivery completion totals in the range, oldest first. */
export function getDcrTotalsForDriver(
  data: PerfData,
  transporterId: string,
  fromWeek: string,
  toWeek: string,
): DcrWeekTotals[] {
  return driverRowsInRange(data.dcrTotals, transporterId, fromWeek, toWeek);
}

/** A scorecard with its metrics (sorted by metric name). */
export interface ScorecardWithMetrics extends WeeklyScorecard {
  metrics: MetricEntry[];
}

/** Everything one driver's report (and the report preview) shows for a week range. */
export interface DriverReportData {
  transporterId: string;
  name: string;
  fromWeek: string;
  toWeek: string;
  /** Oldest first. */
  scorecards: ScorecardWithMetrics[];
  /** Rank per week (see getRanksForDriver); weeks with no score are absent. */
  ranks: Record<string, WeekRank>;
  pod: PodReportEntry[];
  cdf: CdfWeekEntry[];
  dsb: DsbWeekEntry[];
  psb: PsbWeekEntry[];
  /** By week, then tracking ID, then the order saved. */
  dcrEvents: DcrReportEvent[];
  dcrTotals: DcrWeekTotals[];
}

/**
 * One driver's report data for a week range: their scorecards with metrics, weekly ranks, and
 * the POD, CDF, DSB, PSB, returned-package and delivery-completion rows. Null when the driver
 * is not on file.
 *
 * `rankWeeks` are the weeks to rank; by default every week with a scorecard (as the check
 * files were made). The old PDF ranked only the weeks the driver had a scorecard in the range,
 * which gives the same numbers for those weeks.
 */
export function getDriverReport(
  data: PerfData,
  transporterId: string,
  fromWeek: string,
  toWeek: string,
  rankWeeks: Iterable<string> = getAllWeeks(data),
): DriverReportData | null {
  const driver = data.drivers.find((d) => d.transporterId === transporterId);
  if (!driver) return null;
  const scorecards = getScorecardsForDriver(data, transporterId, fromWeek, toWeek);
  const metrics = groupBy(
    getMetricsForScorecards(
      data,
      scorecards.map((card) => card.id),
    ),
    (metric) => String(metric.scorecardId),
  );
  return {
    transporterId,
    name: driver.name,
    fromWeek,
    toWeek,
    scorecards: scorecards.map((card) => ({
      ...card,
      metrics: sortedBy(metrics.get(String(card.id)) ?? [], (a, b) =>
        compareOrdinal(a.metricName, b.metricName),
      ),
    })),
    ranks: getRanksForDriver(data, transporterId, rankWeeks),
    pod: getPodEntriesForDriver(data, transporterId, fromWeek, toWeek),
    cdf: getCdfEntriesForDriver(data, transporterId, fromWeek, toWeek),
    dsb: getDsbEntriesForDriver(data, transporterId, fromWeek, toWeek),
    psb: getPsbEntriesForDriver(data, transporterId, fromWeek, toWeek),
    dcrEvents: sortedBy(
      getDcrEventsForDriver(data, transporterId, fromWeek, toWeek),
      (a, b) =>
        compareOrdinal(a.week, b.week) || compareOrdinal(a.trackingId, b.trackingId) || a.id - b.id,
    ),
    dcrTotals: getDcrTotalsForDriver(data, transporterId, fromWeek, toWeek),
  };
}

/**
 * A list with one entry per week: the real entry where there is one, `makeEmpty(week)`
 * elsewhere (the old report's FillMissingWeeks), so every week gets a column.
 */
export function fillMissingWeeks<T extends { week: string }>(
  existing: readonly T[],
  weeks: readonly string[],
  makeEmpty: (week: string) => T,
): T[] {
  const byWeek = new Map(existing.map((entry) => [entry.week, entry]));
  return weeks.map((week) => byWeek.get(week) ?? makeEmpty(week));
}

// ---- averages, safety counts ------------------------------------------------------------------

// The metrics whose values feed the grid's Average columns.
const AVERAGE_METRICS: Readonly<Record<string, keyof DriverAverages>> = {
  'CDF DPMO': 'cdf',
  DSB: 'dsb',
  DCR: 'dcr',
  POD: 'pod',
  PSB: 'psb',
  CED: 'ced',
};

/** A stored metric value as a number: "%" signs dropped, blank or not a number -> null. */
export function parseMetricValue(text: string | null): number | null {
  if (text === null || text.trim() === '') return null;
  return parseNetNumber(text.replace(/%/g, '').trim());
}

/**
 * Every driver's averages over the week range (ComputeAverages): Overall Score, weekly rank,
 * packages, and the CDF, DSB, DCR, POD, PSB and CED values. Each leaves out weeks with no value,
 * and is null when nothing is left. Keyed by Transporter ID; drivers with no scorecards in the
 * range are absent.
 *
 * Values are added up oldest week first (the order the old query read them), so the results
 * match the old app to the last digit.
 */
export function computeAverages(
  data: PerfData,
  fromWeek: string,
  toWeek: string,
): Record<string, DriverAverages> {
  const cards = rowsInRange(data.scorecards, fromWeek, toWeek);

  // Rank inside each week, among drivers with a score.
  const ranksByDriver = new Map<string, number[]>();
  for (const week of groupBy(
    cards.filter((card) => card.overallScore !== null),
    (card) => card.week,
  ).values()) {
    sortedBy(week, compareForRank).forEach((card, index) => {
      const list = ranksByDriver.get(card.transporterId);
      if (list) list.push(index + 1);
      else ranksByDriver.set(card.transporterId, [index + 1]);
    });
  }

  // Metric values per driver and metric, in the order of the scorecards above.
  const cardById = new Map(cards.map((card) => [card.id, card]));
  const metricsByCard = groupBy(
    data.metrics.filter(
      (metric) => cardById.has(metric.scorecardId) && metric.metricName in AVERAGE_METRICS,
    ),
    (metric) => String(metric.scorecardId),
  );
  const valuesByDriver = new Map<string, Map<string, number[]>>();
  for (const card of cards) {
    for (const metric of metricsByCard.get(String(card.id)) ?? []) {
      const value = parseMetricValue(metric.metricValue);
      if (value === null) continue;
      let perMetric = valuesByDriver.get(card.transporterId);
      if (!perMetric) valuesByDriver.set(card.transporterId, (perMetric = new Map()));
      const list = perMetric.get(metric.metricName);
      if (list) list.push(value);
      else perMetric.set(metric.metricName, [value]);
    }
  }

  const result: Record<string, DriverAverages> = {};
  for (const [transporterId, driverCards] of groupBy(cards, (card) => card.transporterId)) {
    const avg: DriverAverages = { ...EMPTY_AVERAGES };
    const scores = driverCards.flatMap((card) =>
      card.overallScore === null ? [] : [card.overallScore],
    );
    if (scores.length > 0) avg.score = linqAverage(scores);
    const packages = driverCards.flatMap((card) =>
      card.packagesDelivered === null ? [] : [card.packagesDelivered],
    );
    if (packages.length > 0) avg.packages = linqAverage(packages);
    const ranks = ranksByDriver.get(transporterId);
    if (ranks && ranks.length > 0) avg.rank = linqAverage(ranks);
    const perMetric = valuesByDriver.get(transporterId);
    if (perMetric) {
      for (const [metricName, key] of Object.entries(AVERAGE_METRICS)) {
        const list = perMetric.get(metricName);
        avg[key] = list && list.length > 0 ? linqAverage(list) : null;
      }
    }
    result[transporterId] = avg;
  }
  return result;
}

/**
 * Does this event count for the safety columns? The old SQL: Program Impact is not null, not
 * blank after TRIM, and not "none" after LOWER(TRIM(...)) (SQLite trims spaces only and lowers
 * A-Z only).
 */
function countedBySql(event: Pick<SafetyEventEntry, 'programImpact'>): boolean {
  const impact = event.programImpact;
  if (impact === null) return false;
  const trimmed = sqliteTrim(impact);
  return trimmed !== '' && sqliteLower(trimmed) !== 'none';
}

/**
 * Every driver's safety event counts over the week range (ComputeSafetyCounts), leaving out
 * events whose Program Impact is "None" or blank: one count per metric type and the total. An
 * event with a metric type the grid has no column for still adds to the total. Keyed by
 * Transporter ID; drivers with no counted events are absent.
 */
export function computeSafetyCounts(
  data: PerfData,
  fromWeek: string,
  toWeek: string,
): Record<string, DriverSafety> {
  const result: Record<string, DriverSafety> = {};
  const columns: Array<[string, keyof DriverSafety]> = [
    [SafetyMetricTypes.Speeding, 'speeding'],
    [SafetyMetricTypes.SignSignal, 'signSignal'],
    [SafetyMetricTypes.Distraction, 'distraction'],
    [SafetyMetricTypes.FollowingDistance, 'followingDistance'],
    [SafetyMetricTypes.Seatbelt, 'seatbelt'],
  ];
  for (const event of rowsInRange(data.safetyEvents, fromWeek, toWeek)) {
    if (!countedBySql(event)) continue;
    const counts = (result[event.transporterId] ??= { ...EMPTY_SAFETY });
    counts.total++;
    const metric = (event.metricType ?? '').trim();
    const column = columns.find(([type]) => compareOrdinalIgnoreCase(metric, type) === 0);
    if (column) counts[column[1]]++;
  }
  return result;
}

/**
 * One driver's counted safety events in the week range, newest first (by week, then date,
 * then the order saved, all newest first), for the safety details list. `metricType` narrows
 * it to one metric type; like the old query it must match the stored text exactly (same case,
 * no extra spaces). Leave it out for every metric type.
 */
export function getSafetyEventsForDriver(
  data: PerfData,
  transporterId: string,
  fromWeek: string,
  toWeek: string,
  metricType: string | null = null,
): SafetyEventEntry[] {
  const rows = data.safetyEvents.filter(
    (event) =>
      event.transporterId === transporterId &&
      weekInRange(event.week, fromWeek, toWeek) &&
      countedBySql(event) &&
      (metricType === null || event.metricType === metricType),
  );
  // ORDER BY Week DESC, EventDate DESC, Id DESC (a missing date sorts last when newest first).
  return sortedBy(rows, (a, b) => {
    const week = compareOrdinal(b.week, a.week);
    if (week !== 0) return week;
    if (a.eventDate !== b.eventDate) {
      if (a.eventDate === null) return 1;
      if (b.eventDate === null) return -1;
      return compareOrdinal(b.eventDate, a.eventDate);
    }
    return b.id - a.id;
  });
}
