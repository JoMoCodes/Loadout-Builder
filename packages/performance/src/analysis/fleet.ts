// Numbers across the whole team, ported from FleetRepository.cs: each driver's score trend, the
// failure categories added up, which categories each driver hit in which weeks, and the team
// summary (average score per week, tiers, movers, worst categories).

import {
  cdfCategoryRows,
  classify,
  dsbCategoryRows,
  podRejectCategoryRows,
  psbCategoryRows,
  slope,
  tierRank,
  DECLINING,
  IMPROVING,
  type CategoryRow,
  type DriverMovement,
  type DriverTrend,
  type FailureCategoryRollup,
  type FleetSummary,
  type PerfData,
  type TierCount,
} from '../models';
import { compareOrdinal, formatNet, sortedBy, sqliteAverage } from './dotnet';
import { groupBy, rowsInRange, scoreDeltaDisplay } from './drivers';

/**
 * Every driver's Overall Score movement over the week range (ComputeTrends): the change between
 * their two newest scored weeks (score and tier), and the least-squares slope across the range,
 * read as Improving, Declining or Flat. Keyed by Transporter ID; drivers with no scorecards in
 * the range are absent (treat them as flat).
 */
export function computeTrends(
  data: PerfData,
  fromWeek: string,
  toWeek: string,
): Record<string, DriverTrend> {
  const rows = sortedBy(
    data.scorecards.filter((card) => card.week >= fromWeek && card.week <= toWeek),
    (a, b) => compareOrdinal(a.transporterId, b.transporterId) || compareOrdinal(a.week, b.week),
  );
  const result: Record<string, DriverTrend> = {};
  for (const [transporterId, cards] of groupBy(rows, (card) => card.transporterId)) {
    const scored = cards.filter((card) => card.overallScore !== null);
    const s = slope(scored.map((card) => card.overallScore as number));
    const trend: DriverTrend = {
      scoreDelta: null,
      tierDelta: null,
      slope: s,
      trendDirection: classify(s),
    };
    if (scored.length >= 2) {
      const cur = scored[scored.length - 1] as (typeof scored)[number];
      const prev = scored[scored.length - 2] as (typeof scored)[number];
      trend.scoreDelta = (cur.overallScore as number) - (prev.overallScore as number);
      trend.tierDelta = tierRank(cur.overallStanding) - tierRank(prev.overallStanding);
    }
    result[transporterId] = trend;
  }
  return result;
}

/** A failure category total with its "SOURCE: Category" label. */
export interface CategoryRollupRow extends FailureCategoryRollup {
  /** "POD: Blurry Photo". */
  sourceCategory: string;
}

interface CategoryRowsOfWeek {
  transporterId: string;
  week: string;
  categories: CategoryRow[];
}

interface CategorySource {
  source: 'POD' | 'CDF' | 'DSB' | 'PSB';
  rows: CategoryRowsOfWeek[];
}

function withCategories<T extends { transporterId: string; week: string }>(
  rows: readonly T[],
  categories: (row: T) => CategoryRow[],
): CategoryRowsOfWeek[] {
  return rows.map((row) => ({
    transporterId: row.transporterId,
    week: row.week,
    categories: categories(row),
  }));
}

function categorySources(data: PerfData): CategorySource[] {
  return [
    { source: 'POD', rows: withCategories(data.pod, podRejectCategoryRows) },
    { source: 'CDF', rows: withCategories(data.cdf, cdfCategoryRows) },
    { source: 'DSB', rows: withCategories(data.dsb, dsbCategoryRows) },
    { source: 'PSB', rows: withCategories(data.psb, psbCategoryRows) },
  ];
}

/**
 * Every POD (9), CDF (6), DSB (6) and PSB (7) failure category added up over the week range
 * (CategoryRollup), for the whole team or one driver. In source order, each source's categories
 * in their usual order, zeros included. A source with no rows in the range adds no lines.
 */
export function categoryRollup(
  data: PerfData,
  fromWeek: string,
  toWeek: string,
  transporterId: string | null = null,
): CategoryRollupRow[] {
  const rollup: CategoryRollupRow[] = [];
  for (const source of categorySources(data)) {
    const totals = new Map<string, number>();
    for (const row of rowsInRange(source.rows, fromWeek, toWeek)) {
      if (transporterId !== null && row.transporterId !== transporterId) continue;
      for (const [label, count] of row.categories) {
        totals.set(label, (totals.get(label) ?? 0) + count);
      }
    }
    for (const [category, count] of totals) {
      rollup.push({
        source: source.source,
        category,
        count,
        sourceCategory: `${source.source}: ${category}`,
      });
    }
  }
  return rollup;
}

/**
 * For every driver, the weeks in the range in which each failure category was above zero
 * (CategoryHitsByDriverWeek), keyed "SOURCE: Category". Weeks are oldest first. Categories are
 * in the order the old code first met them (POD, CDF, DSB, PSB; oldest week first), which is
 * the order the coaching reasons list them in.
 */
export function categoryHitsByDriverWeek(
  data: PerfData,
  fromWeek: string,
  toWeek: string,
): Record<string, Record<string, string[]>> {
  const hits = new Map<string, Map<string, Set<string>>>();
  for (const source of categorySources(data)) {
    for (const row of rowsInRange(source.rows, fromWeek, toWeek)) {
      for (const [label, count] of row.categories) {
        if (count <= 0) continue;
        let byCategory = hits.get(row.transporterId);
        if (!byCategory) hits.set(row.transporterId, (byCategory = new Map()));
        const key = `${source.source}: ${label}`;
        let weeks = byCategory.get(key);
        if (!weeks) byCategory.set(key, (weeks = new Set()));
        weeks.add(row.week);
      }
    }
  }
  const result: Record<string, Record<string, string[]>> = {};
  for (const [transporterId, byCategory] of hits) {
    const inner: Record<string, string[]> = {};
    for (const [key, weeks] of byCategory) inner[key] = [...weeks].sort(compareOrdinal);
    result[transporterId] = inner;
  }
  return result;
}

/** A mover with the texts the dashboard shows. */
export interface DriverMovementView extends DriverMovement {
  /** "+20.6" or "-47.7". */
  deltaDisplay: string;
  /** "67.4 -> 88.0". */
  moveDisplay: string;
}

/** The team summary for a range, with `hasData` (false when the range has no scorecards). */
export interface FleetSummaryView extends FleetSummary {
  hasData: boolean;
  topImproved: DriverMovementView[];
  topDeclined: DriverMovementView[];
  worstCategories: CategoryRollupRow[];
}

function movementView(movement: DriverMovement): DriverMovementView {
  return {
    ...movement,
    deltaDisplay: scoreDeltaDisplay(movement.delta),
    moveDisplay: `${formatNet(movement.firstScore, '0.0')} -> ${formatNet(movement.lastScore, '0.0')}`,
  };
}

/**
 * Everything the team view needs for the week range (BuildSummary): the team's average Overall
 * Score per week, the newest week's tier counts and number of drivers, how many drivers are
 * improving or declining, the `topN` most improved and most declined drivers (first against
 * last scored week in the range), and the `topN` worst failure categories.
 */
export function buildFleetSummary(
  data: PerfData,
  fromWeek: string,
  toWeek: string,
  topN: number,
): FleetSummaryView {
  const summary: FleetSummaryView = {
    fromWeek,
    toWeek,
    latestWeek: '',
    activeDrivers: 0,
    latestFleetAvg: null,
    improvingCount: 0,
    decliningCount: 0,
    avgTrend: [],
    latestTierDistribution: [],
    topImproved: [],
    topDeclined: [],
    worstCategories: [],
    hasData: false,
  };

  const cards = rowsInRange(data.scorecards, fromWeek, toWeek);
  if (cards.length === 0) return summary;
  const weeks = [...new Set(cards.map((card) => card.week))];
  const latestWeek = weeks[weeks.length - 1] as string;
  summary.latestWeek = latestWeek;
  summary.hasData = true;

  // SELECT Week, AVG(OverallScore) ... GROUP BY Week ORDER BY Week
  for (const [week, weekCards] of groupBy(
    cards.filter((card) => card.overallScore !== null),
    (card) => card.week,
  )) {
    summary.avgTrend.push({
      week,
      avg: sqliteAverage(weekCards.map((card) => card.overallScore as number)) as number,
    });
  }
  if (summary.avgTrend.length > 0) {
    summary.latestFleetAvg = (summary.avgTrend[summary.avgTrend.length - 1] as { avg: number }).avg;
  }

  // GROUP BY OverallStanding (text order), then best tier first.
  const latestCards = cards.filter((card) => card.week === latestWeek);
  const tiers = groupBy(
    latestCards.filter((card) => card.overallStanding !== null && card.overallStanding !== ''),
    (card) => card.overallStanding as string,
  );
  const distribution: TierCount[] = [...tiers.keys()]
    .sort(compareOrdinal)
    .map((tier) => ({ tier, count: (tiers.get(tier) as unknown[]).length }));
  summary.latestTierDistribution = sortedBy(
    distribution,
    (a, b) => tierRank(b.tier) - tierRank(a.tier),
  );
  summary.activeDrivers = latestCards.length;

  // Movers: first against last scored week in the range, for drivers on file.
  const names = new Map(data.drivers.map((d) => [d.transporterId, d.name]));
  const scoreRows = sortedBy(
    cards.filter((card) => card.overallScore !== null && names.has(card.transporterId)),
    (a, b) => compareOrdinal(a.transporterId, b.transporterId) || compareOrdinal(a.week, b.week),
  );
  const movements: DriverMovement[] = [];
  for (const [transporterId, rows] of groupBy(scoreRows, (card) => card.transporterId)) {
    if (rows.length < 2) continue;
    const first = rows[0] as (typeof rows)[number];
    const last = rows[rows.length - 1] as (typeof rows)[number];
    const firstScore = first.overallScore as number;
    const lastScore = last.overallScore as number;
    movements.push({
      transporterId,
      name: names.get(transporterId) as string,
      firstWeek: first.week,
      lastWeek: last.week,
      firstScore,
      lastScore,
      delta: lastScore - firstScore,
    });
  }
  summary.topImproved = sortedBy(
    movements.filter((m) => m.delta > 0),
    (a, b) => b.delta - a.delta,
  )
    .slice(0, Math.max(0, topN))
    .map(movementView);
  summary.topDeclined = sortedBy(
    movements.filter((m) => m.delta < 0),
    (a, b) => a.delta - b.delta,
  )
    .slice(0, Math.max(0, topN))
    .map(movementView);

  const trends = Object.values(computeTrends(data, fromWeek, toWeek));
  summary.improvingCount = trends.filter((t) => t.trendDirection === IMPROVING).length;
  summary.decliningCount = trends.filter((t) => t.trendDirection === DECLINING).length;

  summary.worstCategories = sortedBy(
    categoryRollup(data, fromWeek, toWeek).filter((c) => c.count > 0),
    (a, b) => b.count - a.count,
  ).slice(0, Math.max(0, topN));

  return summary;
}
