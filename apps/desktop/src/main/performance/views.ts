// The answers to the weekly performance queries, worked out from the saved data with the rules in
// @loadout/performance and put in the plain shapes the pages get (src/shared/performance.ts).
// Pure: the data, the rule numbers and "today" come in; nothing is read or written here.

import {
  buildDriverGrid,
  buildFleetSummary,
  categoryRollup,
  computeSafetyCounts,
  evaluateCoaching,
  evaluateCompliance,
  getAllWeeks,
  getPsbImportedWeeks,
  getThresholds,
  tierRank,
  type ComplianceAlert,
  type DriverAverages,
  type DriverGridRow,
  type PerfData,
  type TierCount,
} from '@loadout/performance';
import type {
  PerfComplianceRow,
  PerfDashboardView,
  PerfDriverRow,
  PerfDriversView,
  PerfImportCard,
  PerfKind,
  PerfThresholdRow,
  WeekRange,
} from '../../shared/performance';
import { PERF_KINDS } from '../../shared/performance';
import type { PerformanceSettings } from '../../shared/performanceSettings';

/** The range asked for, or every scorecard week (first to last) when none was. Null: no weeks. */
export function resolveRange(data: PerfData, range: WeekRange | null): WeekRange | null {
  if (range !== null) return range;
  const weeks = getAllWeeks(data);
  const first = weeks[0];
  const last = weeks[weeks.length - 1];
  return first !== undefined && last !== undefined ? { from: first, to: last } : null;
}

/** Scorecard weeks inside the range, oldest first. */
function weeksIn(data: PerfData, range: WeekRange): string[] {
  return getAllWeeks(data).filter((week) => week >= range.from && week <= range.to);
}

/** The newest scorecard week in the range, and the scorecard week before it (in any range). */
function newestTwo(data: PerfData, range: WeekRange | null): [string | null, string | null] {
  if (range === null) return [null, null];
  const inRange = weeksIn(data, range);
  const newest = inRange[inRange.length - 1] ?? null;
  if (newest === null) return [null, null];
  const all = getAllWeeks(data);
  const before = all[all.indexOf(newest) - 1] ?? null;
  return [newest, before];
}

/** Each driver's tier in one week. */
function tiersByDriver(data: PerfData, week: string | null): Map<string, string> {
  const out = new Map<string, string>();
  if (week === null) return out;
  for (const card of data.scorecards) {
    if (card.week === week && card.overallStanding) {
      out.set(card.transporterId, card.overallStanding);
    }
  }
  return out;
}

const AVERAGE_KEYS = [
  'score',
  'rank',
  'packages',
  'cdf',
  'dsb',
  'dcr',
  'pod',
  'psb',
  'ced',
] as const satisfies readonly (keyof DriverAverages)[];

const DISPLAY_FIELD: Record<keyof DriverAverages, keyof DriverGridRow> = {
  score: 'avgScoreDisplay',
  rank: 'avgRankDisplay',
  packages: 'avgPackagesDisplay',
  cdf: 'avgCdfDisplay',
  dsb: 'avgDsbDisplay',
  dcr: 'avgDcrDisplay',
  pod: 'avgPodDisplay',
  psb: 'avgPsbDisplay',
  ced: 'avgCedDisplay',
};

function driverRow(
  row: DriverGridRow,
  activeIds: Set<string>,
  latestIds: Set<string>,
): PerfDriverRow {
  const averages: DriverAverages = {
    score: row.avgScore,
    rank: row.avgRank,
    packages: row.avgPackages,
    cdf: row.avgCdf,
    dsb: row.avgDsb,
    dcr: row.avgDcr,
    pod: row.avgPod,
    psb: row.avgPsb,
    ced: row.avgCed,
  };
  const averagesDisplay = {} as Record<keyof DriverAverages, string>;
  for (const key of AVERAGE_KEYS) averagesDisplay[key] = String(row[DISPLAY_FIELD[key]]);
  return {
    transporterId: row.transporterId,
    name: row.name,
    status: row.effectiveStatus,
    latestWeek: row.latestWeek,
    latestTier: row.latestTier,
    latestScore: row.latestScore,
    latestRankDisplay: row.latestRankDisplay,
    latestRank: row.latestRank,
    latestPackages: row.latestPackages,
    averages,
    averagesDisplay,
    trend: {
      scoreDelta: row.scoreDelta,
      tierDelta: row.tierDelta,
      slope: row.trendSlope,
      trendDirection: row.trendDirection,
    },
    safety: {
      total: row.safetyTotal,
      speeding: row.safetySpeeding,
      signSignal: row.safetySignSignal,
      distraction: row.safetyDistraction,
      followingDistance: row.safetyFollowingDistance,
      seatbelt: row.safetySeatbelt,
    },
    hasEmail: (row.email ?? '').trim() !== '',
    activeInRange: activeIds.has(row.transporterId),
    inLatestWeek: latestIds.has(row.transporterId),
  };
}

/** Tier moves between two weeks, among drivers with a tier in both. */
function tierChanges(data: PerfData, newest: string | null, before: string | null) {
  const now = tiersByDriver(data, newest);
  const then = tiersByDriver(data, before);
  const moves: Array<{ id: string; from: string; to: string }> = [];
  for (const [id, tier] of now) {
    const old = then.get(id);
    if (old !== undefined && old !== tier) moves.push({ id, from: old, to: tier });
  }
  return moves;
}

export function driversView(data: PerfData, asked: WeekRange | null): PerfDriversView {
  const range = resolveRange(data, asked);
  const grid = buildDriverGrid(data, range?.from ?? null, range?.to ?? null);
  const activeIds = new Set(
    range === null
      ? []
      : data.scorecards
          .filter((card) => card.week >= range.from && card.week <= range.to)
          .map((card) => card.transporterId),
  );
  const [newestWeek, previousWeek] = newestTwo(data, range);
  // The drivers on the newest scorecard: the "In latest scorecard" chip. A driver whose last
  // scorecard is an older week in the range is in the weeks but not in the latest scorecard.
  const latestIds = new Set(
    data.scorecards.filter((card) => card.week === newestWeek).map((card) => card.transporterId),
  );
  const moves = tierChanges(data, newestWeek, previousWeek);
  const names = new Map(data.drivers.map((d) => [d.transporterId, d.name]));
  const nameOf = (id: string) => names.get(id) ?? '';
  const byName = (a: { name: string }, b: { name: string }) =>
    a.name < b.name ? -1 : a.name > b.name ? 1 : 0;
  const safetyThisWeek =
    newestWeek === null ? {} : computeSafetyCounts(data, newestWeek, newestWeek);
  const newSafetyEvents = Object.values(safetyThisWeek).reduce(
    (sum, counts) => sum + counts.total,
    0,
  );
  return {
    range,
    rows: grid.map((row) => driverRow(row, activeIds, latestIds)),
    changes: {
      newestWeek,
      previousWeek,
      tierUp: moves.filter((m) => tierRank(m.to) > tierRank(m.from)).length,
      tierDown: moves.filter((m) => tierRank(m.to) < tierRank(m.from)).length,
      newSafetyEvents,
      tierMoves: moves
        .filter((m) => tierRank(m.to) !== tierRank(m.from))
        .map((m) => ({ transporterId: m.id, name: nameOf(m.id), from: m.from, to: m.to }))
        .sort(byName),
      safetyDrivers: Object.entries(safetyThisWeek)
        .filter(([, counts]) => counts.total > 0)
        .map(([id, counts]) => ({ transporterId: id, name: nameOf(id), count: counts.total }))
        .sort((a, b) => b.count - a.count || byName(a, b)),
    },
  };
}

export function thresholdsView(data: PerfData): PerfThresholdRow[] {
  return getThresholds(data).map((t) => ({
    metricName: t.metricName,
    metricNameDisplay: t.metricNameDisplay,
    direction:
      t.indicator === 'POSITIVE'
        ? 'Higher is better'
        : t.indicator === 'NEGATIVE'
          ? 'Lower is better'
          : '',
    platinum: t.platinumDisplay,
    gold: t.goldDisplay,
    silver: t.silverDisplay,
    bronze: t.bronzeDisplay,
    weight: t.weightDisplay,
    sourceWeek: t.sourceWeek ?? '',
  }));
}

function complianceRow(alert: ComplianceAlert): PerfComplianceRow {
  return {
    transporterId: alert.transporterId,
    name: alert.name,
    status: alert.status,
    qualifications: alert.qualifications ?? '',
    expiresOn: alert.expiresOn,
    daysRemaining: alert.daysRemaining,
    severity: alert.severity,
    isAlert: alert.isAlert,
    statusDisplay: alert.statusDisplay,
  };
}

/** Every driver's ID expiry, most urgent first, worked out for `asOf` ("YYYY-MM-DD"). */
export function complianceView(
  data: PerfData,
  windowDays: number,
  asOf: string,
): PerfComplianceRow[] {
  return evaluateCompliance(data.drivers, windowDays, asOf).map(complianceRow);
}

/** Tier counts, Platinum first, with every one of the four tiers listed (zero when none). */
function withAllTiers(counts: readonly TierCount[]): TierCount[] {
  const out = ['Platinum', 'Gold', 'Silver', 'Bronze'].map((tier) => ({
    tier,
    count: counts.find((c) => c.tier === tier)?.count ?? 0,
  }));
  for (const c of counts) if (!out.some((o) => o.tier === c.tier)) out.push({ ...c });
  return out;
}

function packagesIn(data: PerfData, week: string | null): number {
  if (week === null) return 0;
  return data.scorecards
    .filter((card) => card.week === week)
    .reduce((sum, card) => sum + (card.packagesDelivered ?? 0), 0);
}

export function dashboardView(
  data: PerfData,
  asked: WeekRange | null,
  settings: PerformanceSettings,
  asOf: string,
): PerfDashboardView {
  const rules = {
    atRiskDecliningWeeks: settings.atRiskDecliningWeeks,
    recurringCategoryWeeks: settings.recurringCategoryWeeks,
    complianceWindowDays: settings.complianceWindowDays,
    topN: settings.topN,
  };
  const compliance = complianceView(data, settings.complianceWindowDays, asOf).filter(
    (row) => row.isAlert,
  );
  const range = resolveRange(data, asked);
  const inRange = range === null ? [] : weeksIn(data, range);
  if (range === null || inRange.length === 0) {
    return {
      range,
      hasData: false,
      latestWeek: null,
      previousWeek: null,
      fleetAverage: null,
      fleetAverageBefore: null,
      activeDrivers: 0,
      tiers: withAllTiers([]),
      tiersBefore: withAllTiers([]),
      tierMoves: withAllTiers([]).map((t) => ({ tier: t.tier, into: 0, outOf: 0 })),
      packagesDelivered: 0,
      packagesDeliveredBefore: null,
      driversWithSafetyEvents: 0,
      coaching: [],
      compliance,
      topImproved: [],
      topDeclined: [],
      trend: [],
      categories: [],
      rules,
    };
  }

  const summary = buildFleetSummary(data, range.from, range.to, settings.topN);
  const [latestWeek, previousWeek] = newestTwo(data, range);
  const before =
    previousWeek === null ? null : buildFleetSummary(data, previousWeek, previousWeek, 0);

  const tiers = withAllTiers(summary.latestTierDistribution);
  const tiersBefore = withAllTiers(before?.latestTierDistribution ?? []);
  const moves = tierChanges(data, latestWeek, previousWeek);
  const tierMoves = tiers.map((t) => ({
    tier: t.tier,
    into: moves.filter((m) => m.to === t.tier).length,
    outOf: moves.filter((m) => m.from === t.tier).length,
  }));

  const safety = computeSafetyCounts(data, range.from, range.to);

  // Each failure category over the whole range, and in the first and second half of its weeks.
  const mid = Math.floor(inRange.length / 2);
  const firstWeeks = inRange.slice(0, mid);
  const secondWeeks = inRange.slice(mid);
  const key = (c: { source: string; category: string }) => `${c.source}\u0000${c.category}`;
  const countsOf = (weeks: string[]): Map<string, number> => {
    const first = weeks[0];
    const last = weeks[weeks.length - 1];
    if (first === undefined || last === undefined) return new Map();
    return new Map(categoryRollup(data, first, last).map((c) => [key(c), c.count]));
  };
  const firstCounts = countsOf(firstWeeks);
  const secondCounts = countsOf(secondWeeks);

  return {
    range,
    hasData: summary.hasData,
    latestWeek,
    previousWeek,
    fleetAverage: summary.latestFleetAvg,
    fleetAverageBefore: before?.latestFleetAvg ?? null,
    activeDrivers: summary.activeDrivers,
    tiers,
    tiersBefore,
    tierMoves,
    packagesDelivered: packagesIn(data, latestWeek),
    packagesDeliveredBefore: previousWeek === null ? null : packagesIn(data, previousWeek),
    driversWithSafetyEvents: Object.values(safety).filter((s) => s.total > 0).length,
    coaching: evaluateCoaching(data, range.from, range.to, {
      atRiskDecliningWeeks: settings.atRiskDecliningWeeks,
      recurringCategoryWeeks: settings.recurringCategoryWeeks,
    }),
    compliance,
    topImproved: summary.topImproved,
    topDeclined: summary.topDeclined,
    trend: summary.avgTrend,
    categories: categoryRollup(data, range.from, range.to).map((c) => ({
      source: c.source,
      category: c.category,
      count: c.count,
      firstHalf: firstCounts.get(key(c)) ?? 0,
      secondHalf: secondCounts.get(key(c)) ?? 0,
    })),
    rules,
  };
}

/** The table each kind's rows are in, for its newest week and the weeks it is missing. */
function weeksOfKind(data: PerfData, kind: PerfKind): string[] | null {
  const weeks = (rows: ReadonlyArray<{ week: string }>) => [...new Set(rows.map((r) => r.week))];
  switch (kind) {
    case 'scorecards':
      return getAllWeeks(data);
    case 'pod':
      return weeks(data.pod);
    case 'cdf':
      return weeks(data.cdf);
    case 'dsb':
      return weeks(data.dsb);
    case 'psb':
      return getPsbImportedWeeks(data, '0000-W00', '9999-W99');
    case 'dcr':
      return weeks(data.dcrEvents);
    case 'dcr-totals':
      return weeks(data.dcrTotals);
    case 'safety':
      return weeks(data.safetyEvents);
    default:
      return null;
  }
}

export interface CardFolder {
  folderName: string | null;
  folderMissing: boolean;
}

/** One card per kind of export, in the usual order. */
export function importCardsView(
  data: PerfData,
  folders: (kind: PerfKind) => CardFolder,
  lastImportAt: (kind: PerfKind) => string | null,
): PerfImportCard[] {
  const scorecardWeeks = getAllWeeks(data);
  return PERF_KINDS.map((kind) => {
    const kindWeeks = weeksOfKind(data, kind);
    let newestWeek: string | null = null;
    let missingWeeks: string[] = [];
    if (kind === 'thresholds') {
      newestWeek =
        data.thresholds
          .map((t) => t.sourceWeek)
          .filter((w): w is string => !!w)
          .sort()
          .pop() ?? null;
    } else if (kindWeeks !== null) {
      newestWeek = [...kindWeeks].sort().pop() ?? null;
      const have = new Set(kindWeeks);
      missingWeeks = kind === 'scorecards' ? [] : scorecardWeeks.filter((w) => !have.has(w));
    }
    return { kind, ...folders(kind), lastImportAt: lastImportAt(kind), newestWeek, missingWeeks };
  });
}
