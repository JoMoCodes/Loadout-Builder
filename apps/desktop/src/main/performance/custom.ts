// The Dashboard's build-your-own parts, worked out from the saved data: the person's own tiles
// (a scorecard number, averaged, added up or counted across the drivers) and the watch list.
// Pure, like views.ts: the data and what was asked for come in; nothing is read or written here.

import {
  cdfCategoryRows,
  dsbCategoryRows,
  getAllWeeks,
  podRejectCategoryRows,
  psbCategoryRows,
  type CategoryRow,
  type PerfData,
} from '@loadout/performance';
import type {
  PerfCustomResult,
  PerfCustomSpec,
  PerfWatchRow,
  WeekRange,
} from '../../shared/performance';

/** Each driver's value of one number, week by week: week -> the values that week. */
type ByWeek = Map<string, number[]>;

function push(out: ByWeek, week: string, value: number): void {
  const list = out.get(week);
  if (list) list.push(value);
  else out.set(week, [value]);
}

function failures<T extends { week: string }>(
  rows: readonly T[],
  categories: (row: T) => CategoryRow[],
): ByWeek {
  const out: ByWeek = new Map();
  for (const row of rows) {
    push(
      out,
      row.week,
      categories(row).reduce((sum, [, count]) => sum + count, 0),
    );
  }
  return out;
}

/**
 * One number for every driver who has it, by week. Null when the number is not one the app knows
 * (dashboardLayout.ts, CUSTOM_NUMBERS).
 */
export function numberByWeek(data: PerfData, number: string): ByWeek | null {
  const out: ByWeek = new Map();
  if (number === 'overall') {
    for (const card of data.scorecards) {
      if (card.overallScore !== null) push(out, card.week, card.overallScore);
    }
    return out;
  }
  if (number === 'packages') {
    for (const card of data.scorecards) {
      if (card.packagesDelivered !== null) push(out, card.week, card.packagesDelivered);
    }
    return out;
  }
  if (number.startsWith('metric:')) {
    const metric = number.slice('metric:'.length);
    const weekOf = new Map(data.scorecards.map((card) => [card.id, card.week]));
    for (const entry of data.metrics) {
      if (entry.metricName !== metric || entry.score === null) continue;
      const week = weekOf.get(entry.scorecardId);
      if (week !== undefined) push(out, week, entry.score);
    }
    return out;
  }
  switch (number) {
    case 'fail:POD':
      return failures(data.pod, podRejectCategoryRows);
    case 'fail:CDF':
      return failures(data.cdf, cdfCategoryRows);
    case 'fail:DSB':
      return failures(data.dsb, dsbCategoryRows);
    case 'fail:PSB':
      return failures(data.psb, psbCategoryRows);
    default:
      return null;
  }
}

/** What a tile makes of one week's values. Null when there are none. */
export function combine(
  values: readonly number[] | undefined,
  how: PerfCustomSpec['how'],
  limit: number,
): number | null {
  if (!values || values.length === 0) return null;
  switch (how) {
    case 'average':
      return values.reduce((sum, value) => sum + value, 0) / values.length;
    case 'total':
      return values.reduce((sum, value) => sum + value, 0);
    case 'below':
      return values.filter((value) => value < limit).length;
    case 'above':
      return values.filter((value) => value > limit).length;
  }
}

/**
 * The answers for the person's own tiles: the number in the newest scorecard week of the range,
 * in the scorecard week before it, and for every week in the range. A tile asking for a number
 * the app does not know gets an empty answer.
 */
export function customResults(
  data: PerfData,
  range: WeekRange | null,
  specs: readonly PerfCustomSpec[],
): PerfCustomResult[] {
  const all = getAllWeeks(data);
  const inRange =
    range === null ? [] : all.filter((week) => week >= range.from && week <= range.to);
  const newest = inRange[inRange.length - 1];
  const before = newest === undefined ? undefined : all[all.indexOf(newest) - 1];
  const cache = new Map<string, ByWeek | null>();
  return specs.map((spec) => {
    if (!cache.has(spec.number)) cache.set(spec.number, numberByWeek(data, spec.number));
    const byWeek = cache.get(spec.number);
    const empty: PerfCustomResult = {
      id: spec.id,
      value: null,
      before: null,
      drivers: 0,
      series: [],
    };
    if (!byWeek || newest === undefined) return empty;
    const series: PerfCustomResult['series'] = [];
    for (const week of inRange) {
      const value = combine(byWeek.get(week), spec.how, spec.limit);
      if (value !== null) series.push({ week, value });
    }
    return {
      id: spec.id,
      value: combine(byWeek.get(newest), spec.how, spec.limit),
      before: before === undefined ? null : combine(byWeek.get(before), spec.how, spec.limit),
      drivers: byWeek.get(newest)?.length ?? 0,
      series,
    };
  });
}

/**
 * The watch list: each asked-for driver who is on file, with their newest scored week in the
 * range and the scored week before it. A driver with no scored week in the range is still
 * listed, with no score. In the order asked.
 */
export function watchRows(
  data: PerfData,
  range: WeekRange | null,
  ids: readonly string[],
): PerfWatchRow[] {
  const names = new Map(data.drivers.map((driver) => [driver.transporterId, driver.name]));
  const wanted = new Set(ids);
  const scored = new Map<string, Array<{ week: string; score: number; tier: string | null }>>();
  for (const card of data.scorecards) {
    if (!wanted.has(card.transporterId) || card.overallScore === null) continue;
    const list = scored.get(card.transporterId) ?? [];
    list.push({ week: card.week, score: card.overallScore, tier: card.overallStanding });
    scored.set(card.transporterId, list);
  }
  const rows: PerfWatchRow[] = [];
  for (const id of new Set(ids)) {
    const name = names.get(id);
    if (name === undefined) continue;
    const weeks = (scored.get(id) ?? []).sort((a, b) =>
      a.week < b.week ? -1 : a.week > b.week ? 1 : 0,
    );
    const inRange =
      range === null ? [] : weeks.filter((one) => one.week >= range.from && one.week <= range.to);
    const latest = inRange[inRange.length - 1];
    const previous = latest ? weeks[weeks.indexOf(latest) - 1] : undefined;
    rows.push({
      transporterId: id,
      name,
      latestWeek: latest?.week ?? null,
      latestTier: latest?.tier ?? null,
      latestScore: latest?.score ?? null,
      previousScore: previous?.score ?? null,
    });
  }
  return rows;
}
