// The numbers behind a driver's two-page Weekly Snapshot (the short, phone-sized summary that
// rides along in the report email). Page 1 is the latest week; Page 2 is that week and the six
// before it. Everything here is plain data worked out from the saved weekly data; the pictures
// are drawn from it in the desktop app (main/performance/snapshot).
//
// The rules, in words:
//   - The latest week is the driver's newest scorecard in the range. The seven weeks are the
//     seven newest fleet weeks ending there; a week the driver has no scorecard in stays empty.
//   - The weekly rank is the one the Drivers tab shows (score, then packages).
//   - The seven-week rank orders every driver by their average Overall Score over those weeks.
//     Only drivers scored in at least four of them are ranked; ties go to more packages.
//   - A metric earns weight x score / 100 points; the five safety rates add up to one row.
//   - "Try this next" is the metric losing the most points this week; "Needs Improvement" lists
//     the metrics that lost the most over the seven weeks (up to three).

import {
  cdfCategoryRows,
  dsbCategoryRows,
  impactsDcr,
  isSafetyEventCounted,
  OVERALL_SCORE,
  psbCategoryRows,
  type MetricEntry,
  type MetricThreshold,
  type PerfData,
  type WeeklyScorecard,
} from '../models';
import { mostDraggingMetric } from './coaching';
import { compareOrdinal, linqAverage, sortedBy } from './dotnet';
import { getAllWeeks, getRanksForDriver, groupBy, type WeekRank } from './drivers';

export type SnapshotTier = 'Platinum' | 'Gold' | 'Silver' | 'Bronze';
export const SNAPSHOT_TIERS: readonly SnapshotTier[] = ['Platinum', 'Gold', 'Silver', 'Bronze'];

/** The lowest Overall Score of each tier (Bronze is everything below Silver). */
export interface SnapshotCutOffs {
  platinum: number;
  gold: number;
  silver: number;
  /** True when the cut-offs came from the imported thresholds, false for the usual 95 / 88 / 78. */
  fromThresholds: boolean;
}

/** The cut-offs the design assumed, used when no Overall Score thresholds were brought in. */
export const DEFAULT_CUT_OFFS: SnapshotCutOffs = Object.freeze({
  platinum: 95,
  gold: 88,
  silver: 78,
  fromThresholds: false,
});

/**
 * Amazon's thresholds file gives each cut-off as the top of its tier, so Platinum starts at the
 * Gold threshold, Gold at the Silver one and Silver at the Bronze one (as the report's chart
 * bands read them). Anything missing or out of order falls back to the design's numbers.
 */
export function cutOffsFrom(thresholds: readonly MetricThreshold[]): SnapshotCutOffs {
  const overall = thresholds.find((t) => t.metricName === OVERALL_SCORE);
  if (!overall) return DEFAULT_CUT_OFFS;
  const { goldThreshold: platinum, silverThreshold: gold, bronzeThreshold: silver } = overall;
  if (
    platinum === null ||
    gold === null ||
    silver === null ||
    !(platinum > gold && gold > silver && silver > 0 && platinum <= 100)
  ) {
    return DEFAULT_CUT_OFFS;
  }
  return { platinum, gold, silver, fromThresholds: true };
}

/** The tier an Overall Score lands in. */
export function tierForScore(score: number, cutOffs: SnapshotCutOffs): SnapshotTier {
  if (score >= cutOffs.platinum) return 'Platinum';
  if (score >= cutOffs.gold) return 'Gold';
  if (score >= cutOffs.silver) return 'Silver';
  return 'Bronze';
}

/** A scorecard tier text as one of the four tiers, or null for anything else. */
export function asTier(text: string | null | undefined): SnapshotTier | null {
  const t = (text ?? '').trim().toLowerCase();
  return t === 'platinum'
    ? 'Platinum'
    : t === 'gold'
      ? 'Gold'
      : t === 'silver'
        ? 'Silver'
        : t === 'bronze'
          ? 'Bronze'
          : null;
}

/** Points a tier is worth when tiers are averaged (Page 2's "Average Gold" pills). */
const TIER_POINTS: Record<SnapshotTier, number> = {
  Platinum: 100,
  Gold: 80,
  Silver: 60,
  Bronze: 25,
};

/** The average tier over some weeks: tiers become points, the mean maps back to a tier. */
export function averageTier(tiers: ReadonlyArray<SnapshotTier | null>): SnapshotTier | null {
  const known = tiers.filter((t): t is SnapshotTier => t !== null);
  if (known.length === 0) return null;
  const mean = linqAverage(known.map((t) => TIER_POINTS[t]));
  return mean >= 95 ? 'Platinum' : mean >= 80 ? 'Gold' : mean >= 60 ? 'Silver' : 'Bronze';
}

// ---- metrics in plain words ------------------------------------------------------------------

export type SnapshotGroup = 'Safety' | 'Customer' | 'Delivery';

interface MetricWords {
  /** The stored metric name. */
  key: string;
  /** The plain name a driver reads. */
  name: string;
  group: SnapshotGroup;
  /** "2 complaints" / "5 rejected" (one and many). */
  one: string;
  many: string;
  /** How the receipt row labels the count: "Photos (5 rejected)" uses the short form. */
  short: string;
  /** What to do about it, in plain words. */
  tip: string;
}

/** The metrics the snapshot shows, in the order the receipt and dot grid list them. */
export const SNAPSHOT_METRICS: readonly MetricWords[] = Object.freeze([
  {
    key: 'Speeding Event Rate',
    name: 'Speeding',
    group: 'Safety',
    one: 'speeding event',
    many: 'speeding events',
    short: 'events',
    tip: 'Keep to the limit even on an empty road. Slow down before the sign, not after it.',
  },
  {
    key: 'Seatbelt-Off Rate',
    name: 'Seatbelt',
    group: 'Safety',
    one: 'seatbelt event',
    many: 'seatbelt events',
    short: 'events',
    tip: 'Buckle up before the van moves, every time, even for a short hop between houses.',
  },
  {
    key: 'Distractions Rate',
    name: 'Distraction',
    group: 'Safety',
    one: 'distraction event',
    many: 'distraction events',
    short: 'events',
    tip: 'Set up the next stop while parked. The phone stays in its mount until the van has stopped.',
  },
  {
    key: 'Sign/Signal Violations Rate',
    name: 'Signs & signals',
    group: 'Safety',
    one: 'sign or signal event',
    many: 'sign or signal events',
    short: 'events',
    tip: 'Come to a full stop at every stop sign and wait out every yellow light.',
  },
  {
    key: 'Following Distance Rate',
    name: 'Following distance',
    group: 'Safety',
    one: 'following distance event',
    many: 'following distance events',
    short: 'events',
    tip: 'Leave at least three seconds to the vehicle ahead, and more in rain or heavy traffic.',
  },
  {
    key: 'CDF DPMO',
    name: 'Feedback',
    group: 'Customer',
    one: 'complaint',
    many: 'complaints',
    short: 'complaints',
    tip: 'Read the customer note on the stop screen before you step out, and double-check the house number when the map pin looks off.',
  },
  {
    key: 'CED',
    name: 'Escalations',
    group: 'Customer',
    one: 'escalation',
    many: 'escalations',
    short: '',
    tip: 'Follow the delivery note to the letter and stay patient at the door. If a stop feels off, call dispatch before the customer does.',
  },
  {
    key: 'DCR',
    name: 'Delivery Completion',
    group: 'Delivery',
    one: 'package brought back',
    many: 'packages brought back',
    short: '',
    tip: 'Before you bring a package back, try the customer note, a call or text, and a safe spot. Bring it back only when there is truly no way to deliver it.',
  },
  {
    key: 'DSB',
    name: 'Concessions',
    group: 'Delivery',
    one: 'concession',
    many: 'concessions',
    short: '',
    tip: 'Scan each package at the door it belongs to, one stop at a time. Never scan early or from the van.',
  },
  {
    key: 'POD',
    name: 'Photos',
    group: 'Delivery',
    one: 'photo rejected',
    many: 'photos rejected',
    short: 'rejected',
    tip: 'Take one step back so the package and the door or porch are both in the frame, then hold still for a second.',
  },
  {
    key: 'PSB',
    name: 'Pickups',
    group: 'Delivery',
    one: 'pickup failure',
    many: 'pickup failures',
    short: 'failed',
    tip: 'Arrive inside the pickup window, scan every package you collect, and bring every pickup back to the station the same day.',
  },
  {
    key: 'FICO',
    name: 'Safe driving',
    group: 'Safety',
    one: 'point lost',
    many: 'points lost',
    short: '',
    tip: 'Smooth starts and stops, and plenty of room to the vehicle ahead.',
  },
]);

const WORDS_BY_KEY = new Map(SNAPSHOT_METRICS.map((m) => [m.key, m]));

/** The five safety rates, which the receipt adds up into one row. */
const SAFETY_RATES: ReadonlySet<string> = new Set(
  SNAPSHOT_METRICS.filter((m) => m.group === 'Safety' && m.key !== 'FICO').map((m) => m.key),
);

/** The safety file's "Metric Type" for each safety rate (counted events per week). */
const SAFETY_EVENT_TYPE: Readonly<Record<string, string>> = {
  'Speeding Event Rate': 'Speeding',
  'Seatbelt-Off Rate': 'Seatbelt',
  'Distractions Rate': 'Distraction',
  'Sign/Signal Violations Rate': 'Sign Signal',
  'Following Distance Rate': 'Following Distance',
};

/** The plain words for a stored metric name (unknown names keep their name). */
export function snapshotMetricWords(metricName: string): MetricWords {
  return (
    WORDS_BY_KEY.get(metricName) ?? {
      key: metricName,
      name: metricName,
      group: 'Delivery',
      one: 'event',
      many: 'events',
      short: '',
      tip: 'Ask dispatch what counts here and how to keep it clean.',
    }
  );
}

// ---- the model -------------------------------------------------------------------------------

export interface SnapshotWeek {
  week: string;
  /** The week number ("2026-W41" is 41). */
  number: number;
  /** Null when the driver had no scorecard (or no score) that week. */
  score: number | null;
  tier: SnapshotTier | null;
  rank: WeekRank | null;
  packages: number | null;
}

export interface SnapshotMetric {
  key: string;
  name: string;
  group: SnapshotGroup;
  /** One per week in `weeks`; null where the driver had no tier that week. */
  tiers: Array<SnapshotTier | null>;
  /** Weighted points lost per week (weight x (100 - score) / 100); null where it did not count. */
  lostByWeek: Array<number | null>;
  /** Counted events per week (complaints, rejects, ...); null where the app has no count. */
  eventsByWeek: Array<number | null>;
  /** The latest week. */
  latestTier: SnapshotTier | null;
  latestScore: number | null;
  latestWeight: number | null;
  latestValue: string | null;
  latestEvents: number | null;
  /** Points earned and the most it could earn in the latest week; null when it did not count. */
  earned: number | null;
  max: number | null;
}

/** One line of the points receipt. */
export interface ReceiptRow {
  /** "Safety × 5 (0 events)", "Photos (5 rejected)". */
  label: string;
  earned: number;
  max: number;
}

export interface Receipt {
  rows: ReceiptRow[];
  /** The scorecard's Overall Score and tier. */
  total: number;
  tier: SnapshotTier | null;
  /** Points to the Platinum cut-off, or null when already there. */
  toPlatinum: number | null;
}

/** Everyone's scores as anonymous dots, with the driver's own picked out. */
export interface FleetStrip {
  /** Best first. */
  scores: number[];
  /** Where the driver sits in `scores`, or null when they are not among them. */
  meIndex: number | null;
  average: number | null;
}

export interface SnapshotTip {
  metric: string;
  name: string;
  tip: string;
  /** "Clear the 2 complaints and you're Platinum (+7.4 points)." */
  payoff: string;
  /** Points this metric lost in the latest week. */
  lost: number;
}

export interface FocusItem {
  metric: string;
  name: string;
  averageTier: SnapshotTier | null;
  facts: string[];
  tip: string;
  /** Points lost over the weeks, added up. */
  lost: number;
}

export interface SevenWeekRank {
  rank: number;
  total: number;
}

export interface SnapshotModel {
  transporterId: string;
  name: string;
  cutOffs: SnapshotCutOffs;
  /** Oldest first; the last is the latest week. Up to seven. */
  weeks: SnapshotWeek[];
  latest: SnapshotWeek;
  /** Metrics that counted (weight above zero) in the latest week, in display order. */
  metrics: SnapshotMetric[];
  receipt: Receipt;
  /** Everyone's Overall Score in the latest week. */
  fleetWeek: FleetStrip;
  /** The metric to work on this week, or null when nothing lost points. */
  tip: SnapshotTip | null;
  average: {
    score: number | null;
    tier: SnapshotTier | null;
    /** Weeks (of the seven) the driver had a score in. */
    weeksScored: number;
    /** Scored weeks needed to be ranked. */
    minWeeks: number;
    rank: SevenWeekRank | null;
    /** The plain average of the driver's weekly ranks (not shown in the chosen design). */
    averageOfRanks: number | null;
  };
  /** Everyone's seven-week average (drivers with enough scored weeks). */
  fleetAverage: FleetStrip;
  /** The metrics that lost the most points over the weeks, worst first (up to three). */
  focus: FocusItem[];
}

export interface SnapshotOptions {
  /** How many weeks Page 2 covers. Default 7. */
  weekCount?: number;
  /** Scored weeks a driver needs to be in the seven-week ranking. Default 4. */
  minWeeksRanked?: number;
}

const round1 = (n: number) => Math.round(n * 10) / 10;

/** "2026-W41" -> 41. */
export function weekNumber(week: string): number {
  const match = /W(\d{1,2})$/.exec(week);
  return match ? Number(match[1]) : 0;
}

/** The seven fleet weeks ending at `toWeek` (fewer when the data has fewer). */
export function snapshotWeeks(data: PerfData, toWeek: string, count = 7): string[] {
  const all = getAllWeeks(data).filter((week) => week <= toWeek);
  return all.slice(Math.max(0, all.length - count));
}

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

/** Everyone's score in one week, best first, with the driver's place. */
export function fleetWeekStrip(data: PerfData, week: string, transporterId: string): FleetStrip {
  const ordered = sortedBy(
    data.scorecards.filter((card) => card.week === week && card.overallScore !== null),
    compareForRank,
  );
  const scores = ordered.map((card) => card.overallScore as number);
  const index = ordered.findIndex((card) => card.transporterId === transporterId);
  return {
    scores,
    meIndex: index >= 0 ? index : null,
    average: scores.length > 0 ? round1(linqAverage(scores)) : null,
  };
}

export interface SevenWeekStanding {
  transporterId: string;
  average: number;
  weeksScored: number;
  packages: number;
  rank: number;
}

/**
 * Every driver's average Overall Score over the weeks, best first, ranked. Only drivers with a
 * score in at least `minWeeks` of them are in; ties go to more packages, then Transporter ID.
 */
export function rankBySevenWeekAverage(
  data: PerfData,
  weeks: readonly string[],
  minWeeks = 4,
): SevenWeekStanding[] {
  const wanted = new Set(weeks);
  const byDriver = groupBy(
    sortedBy(
      data.scorecards.filter((card) => wanted.has(card.week) && card.overallScore !== null),
      (a, b) => compareOrdinal(a.week, b.week),
    ),
    (card) => card.transporterId,
  );
  const standings: Omit<SevenWeekStanding, 'rank'>[] = [];
  for (const [transporterId, cards] of byDriver) {
    if (cards.length < minWeeks) continue;
    standings.push({
      transporterId,
      average: linqAverage(cards.map((card) => card.overallScore as number)),
      weeksScored: cards.length,
      packages: cards.reduce((sum, card) => sum + (card.packagesDelivered ?? 0), 0),
    });
  }
  return sortedBy(standings, (a, b) => {
    if (a.average !== b.average) return b.average > a.average ? 1 : -1;
    if (a.packages !== b.packages) return b.packages - a.packages;
    return compareOrdinal(a.transporterId, b.transporterId);
  }).map((one, index) => ({ ...one, rank: index + 1 }));
}

/** The points receipt for one week's metric entries. */
export function pointsReceipt(
  metrics: readonly SnapshotMetric[],
  total: number,
  tier: SnapshotTier | null,
  cutOffs: SnapshotCutOffs,
): Receipt {
  const rows: ReceiptRow[] = [];
  const safety = metrics.filter((m) => SAFETY_RATES.has(m.key) && m.earned !== null);
  if (safety.length > 0) {
    const events = safety.map((m) => m.latestEvents);
    const known = events.every((n) => n !== null);
    const count = known ? events.reduce((sum, n) => sum + (n as number), 0) : null;
    rows.push({
      label: `Safety × ${safety.length}${count === null ? '' : ` (${count} ${count === 1 ? 'event' : 'events'})`}`,
      earned: safety.reduce((sum, m) => sum + (m.earned as number), 0),
      max: safety.reduce((sum, m) => sum + (m.max as number), 0),
    });
  }
  // The other rows in the receipt's own order: escalations, completion, concessions, photos,
  // feedback, then anything else that counted.
  const order = ['CED', 'DCR', 'DSB', 'POD', 'CDF DPMO'];
  const rest = metrics.filter((m) => !SAFETY_RATES.has(m.key) && m.earned !== null);
  const ordered = sortedBy(rest, (a, b) => {
    const ia = order.indexOf(a.key);
    const ib = order.indexOf(b.key);
    return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
  });
  for (const m of ordered) {
    const words = snapshotMetricWords(m.key);
    const count =
      m.latestEvents === null ? '' : ` (${m.latestEvents}${words.short ? ` ${words.short}` : ''})`;
    rows.push({ label: `${words.name}${count}`, earned: m.earned as number, max: m.max as number });
  }
  return {
    rows,
    total,
    tier,
    toPlatinum: total >= cutOffs.platinum ? null : round1(cutOffs.platinum - total),
  };
}

/** The driver's counted events per metric per week, from the detail files the app has. */
function eventCounts(
  data: PerfData,
  transporterId: string,
  weeks: readonly string[],
): Map<string, Array<number | null>> {
  const counts = new Map<string, Array<number | null>>();
  const set = (key: string, index: number, value: number) => {
    const list = counts.get(key) ?? weeks.map(() => null);
    list[index] = (list[index] ?? 0) + value;
    counts.set(key, list);
  };
  const sumRows = (rows: ReadonlyArray<readonly [string, number]>) =>
    rows.reduce((sum, [, n]) => sum + n, 0);
  weeks.forEach((week, index) => {
    const mine = <T extends { transporterId: string; week: string }>(rows: readonly T[]) =>
      rows.filter((row) => row.transporterId === transporterId && row.week === week);
    // A detail file brought in for the week means a driver missing from it had none.
    const weekHas = <T extends { week: string }>(rows: readonly T[]) =>
      rows.some((row) => row.week === week);
    if (weekHas(data.cdf)) {
      set('CDF DPMO', index, 0);
      for (const row of mine(data.cdf)) set('CDF DPMO', index, sumRows(cdfCategoryRows(row)));
    }
    if (weekHas(data.pod)) {
      set('POD', index, 0);
      for (const row of mine(data.pod)) set('POD', index, row.rejects);
    }
    if (weekHas(data.dsb)) {
      set('DSB', index, 0);
      for (const row of mine(data.dsb)) set('DSB', index, sumRows(dsbCategoryRows(row)));
    }
    if (data.psbImportedWeeks.some((w) => w.week === week) || weekHas(data.psb)) {
      set('PSB', index, 0);
      for (const row of mine(data.psb)) set('PSB', index, sumRows(psbCategoryRows(row)));
    }
    if (weekHas(data.dcrEvents) || weekHas(data.dcrTotals)) {
      set('DCR', index, 0);
      for (const row of mine(data.dcrEvents)) if (impactsDcr(row)) set('DCR', index, 1);
    }
    if (weekHas(data.safetyEvents)) {
      for (const key of Object.keys(SAFETY_EVENT_TYPE)) set(key, index, 0);
      for (const row of mine(data.safetyEvents)) {
        if (!isSafetyEventCounted(row)) continue;
        const key = Object.keys(SAFETY_EVENT_TYPE).find(
          (k) => SAFETY_EVENT_TYPE[k] === (row.metricType ?? '').trim(),
        );
        if (key) set(key, index, 1);
      }
    }
  });
  return counts;
}

/** A metric value that is a plain count ("0", "2"), or null. */
function countIn(value: string | null): number | null {
  if (value === null) return null;
  const text = value.trim().replace(/,/g, '');
  return /^\d+$/.test(text) ? Number(text) : null;
}

function plural(n: number, words: MetricWords): string {
  return `${n} ${n === 1 ? words.one : words.many}`;
}

/** "Clear the 2 complaints and you're Platinum (+7.4 points)." */
export function tipPayoff(
  words: MetricWords,
  events: number | null,
  lost: number,
  toPlatinum: number | null,
): string {
  const fix =
    events !== null && events > 0
      ? `Clear the ${plural(events, words)}`
      : `Get ${words.name === words.key ? words.key : words.name.toLowerCase()} back to Platinum`;
  const points = `+${lost.toFixed(1)} points`;
  if (toPlatinum !== null && lost + 1e-9 >= toPlatinum) {
    return `${fix} and you're Platinum (${points}).`;
  }
  return `${fix} and you gain ${points}.`;
}

/**
 * The snapshot for one driver: the newest scorecard at or before `toWeek` (and at or after
 * `fromWeek`) is the latest week. Null when the driver is not on file or has no scorecard in
 * the range.
 */
export function buildSnapshotModel(
  data: PerfData,
  transporterId: string,
  fromWeek: string,
  toWeek: string,
  options: SnapshotOptions = {},
): SnapshotModel | null {
  const driver = data.drivers.find((d) => d.transporterId === transporterId);
  if (!driver) return null;
  const weekCount = options.weekCount ?? 7;
  const own = sortedBy(
    data.scorecards.filter(
      (card) =>
        card.transporterId === transporterId &&
        card.week >= fromWeek &&
        card.week <= toWeek &&
        card.overallScore !== null,
    ),
    (a, b) => compareOrdinal(a.week, b.week),
  );
  const latestCard = own[own.length - 1];
  if (!latestCard) return null;

  const cutOffs = cutOffsFrom(data.thresholds);
  const weekNames = snapshotWeeks(data, latestCard.week, weekCount);
  const minWeeks = Math.min(options.minWeeksRanked ?? 4, weekNames.length);
  const ranks = getRanksForDriver(data, transporterId, weekNames);
  const cardsByWeek = new Map(
    data.scorecards
      .filter((card) => card.transporterId === transporterId)
      .map((card) => [card.week, card] as const),
  );
  const weeks: SnapshotWeek[] = weekNames.map((week) => {
    const card = cardsByWeek.get(week);
    const score = card?.overallScore ?? null;
    return {
      week,
      number: weekNumber(week),
      score,
      tier: card
        ? (asTier(card.overallStanding) ?? (score === null ? null : tierForScore(score, cutOffs)))
        : null,
      rank: ranks[week] ?? null,
      packages: card?.packagesDelivered ?? null,
    };
  });
  const latest = weeks[weeks.length - 1] as SnapshotWeek;
  const latestIndex = weeks.length - 1;

  // The metrics, week by week.
  const cardIds = new Map(weeks.map((w, i) => [cardsByWeek.get(w.week)?.id ?? -1, i] as const));
  const entriesByWeek: Array<Map<string, MetricEntry>> = weeks.map(() => new Map());
  for (const entry of sortedBy(
    data.metrics.filter((entry) => cardIds.has(entry.scorecardId)),
    (a, b) => a.id - b.id,
  )) {
    const index = cardIds.get(entry.scorecardId) as number;
    const map = entriesByWeek[index] as Map<string, MetricEntry>;
    if (!map.has(entry.metricName)) map.set(entry.metricName, entry);
  }
  const events = eventCounts(data, transporterId, weekNames);
  const latestEntries = entriesByWeek[latestIndex] as Map<string, MetricEntry>;
  const counted = (entry: MetricEntry | undefined) =>
    !!entry && entry.score !== null && entry.weightApplied !== null && entry.weightApplied > 0;
  const keys = [
    ...SNAPSHOT_METRICS.map((m) => m.key).filter((key) => counted(latestEntries.get(key))),
    ...[...latestEntries.keys()].filter(
      (key) => !WORDS_BY_KEY.has(key) && counted(latestEntries.get(key)),
    ),
  ];
  const metrics: SnapshotMetric[] = keys.map((key) => {
    const words = snapshotMetricWords(key);
    const latestEntry = latestEntries.get(key) as MetricEntry;
    const eventsRow = events.get(key);
    const byWeek = weeks.map((_, i) => (entriesByWeek[i] as Map<string, MetricEntry>).get(key));
    const latestEvents =
      eventsRow?.[latestIndex] ?? countIn(key === 'CED' ? latestEntry.metricValue : null);
    return {
      key,
      name: words.name,
      group: words.group,
      tiers: byWeek.map((entry) => asTier(entry?.tier)),
      lostByWeek: byWeek.map((entry) =>
        counted(entry)
          ? ((entry as MetricEntry).weightApplied as number) *
            ((100 - ((entry as MetricEntry).score as number)) / 100)
          : null,
      ),
      eventsByWeek: weeks.map(
        (_, i) =>
          eventsRow?.[i] ?? (key === 'CED' ? countIn(byWeek[i]?.metricValue ?? null) : null),
      ),
      latestTier: asTier(latestEntry.tier),
      latestScore: latestEntry.score,
      latestWeight: latestEntry.weightApplied,
      latestValue: latestEntry.metricValue,
      latestEvents,
      earned: ((latestEntry.weightApplied as number) * (latestEntry.score as number)) / 100,
      max: latestEntry.weightApplied as number,
    };
  });

  const total = latestCard.overallScore as number;
  const receipt = pointsReceipt(metrics, total, latest.tier, cutOffs);

  // "Try this next": the metric losing the most points this week.
  const drag = mostDraggingMetric(data, transporterId, latest.week);
  let tip: SnapshotTip | null = null;
  if (drag) {
    const lost = (drag.weight * (100 - drag.score)) / 100;
    if (lost > 0.05) {
      const words = snapshotMetricWords(drag.metric);
      const metric = metrics.find((m) => m.key === drag.metric);
      tip = {
        metric: drag.metric,
        name: words.name,
        tip: words.tip,
        payoff: tipPayoff(words, metric?.latestEvents ?? null, round1(lost), receipt.toPlatinum),
        lost: round1(lost),
      };
    }
  }

  // Page 2: the average, the seven-week rank and everyone's averages.
  const scored = weeks.filter((w) => w.score !== null);
  const standings = rankBySevenWeekAverage(data, weekNames, minWeeks);
  const mine = standings.find((s) => s.transporterId === transporterId);
  const averageScore = scored.length > 0 ? linqAverage(scored.map((w) => w.score as number)) : null;
  const myRanks = weeks.map((w) => w.rank?.rank).filter((r): r is number => r !== undefined);
  const fleetAverage: FleetStrip = {
    scores: standings.map((s) => round1(s.average)),
    meIndex: mine ? standings.indexOf(mine) : null,
    average: standings.length > 0 ? round1(linqAverage(standings.map((s) => s.average))) : null,
  };

  // "Needs Improvement": the metrics that lost the most over the weeks.
  const weeksWithCard = weeks.filter((w) => w.score !== null).length;
  const focus: FocusItem[] = sortedBy(
    metrics
      .map((m) => ({
        m,
        lost: m.lostByWeek.reduce<number>((sum, n) => sum + (n ?? 0), 0),
      }))
      .filter((x) => x.lost > 0.05),
    (a, b) => b.lost - a.lost,
  )
    .slice(0, 3)
    .map(({ m, lost }) => {
      const words = snapshotMetricWords(m.key);
      const facts: string[] = [];
      const known = m.eventsByWeek.filter((n): n is number => n !== null);
      if (known.length > 0) {
        const sum = known.reduce((a, b) => a + b, 0);
        facts.push(
          `${(sum / known.length).toFixed(1)} ${words.many} a week on average (${sum} over ${known.length} ${known.length === 1 ? 'week' : 'weeks'})`,
        );
      }
      const bronze = m.tiers.filter((t) => t === 'Bronze').length;
      const platinum = m.tiers.filter((t) => t === 'Platinum').length;
      const below = m.tiers.filter((t) => t !== null && t !== 'Platinum').length;
      facts.push(
        bronze > 0
          ? `Bronze in ${bronze} of ${weeksWithCard} weeks, Platinum in ${platinum}`
          : below > 0
            ? `Below Platinum in ${below} of ${weeksWithCard} weeks`
            : `Platinum in all ${weeksWithCard} weeks, but a few points short of a perfect score`,
      );
      return {
        metric: m.key,
        name: words.name,
        averageTier: averageTier(m.tiers),
        facts,
        tip: words.tip,
        lost: round1(lost),
      };
    });

  return {
    transporterId,
    name: driver.name,
    cutOffs,
    weeks,
    latest,
    metrics,
    receipt,
    fleetWeek: fleetWeekStrip(data, latest.week, transporterId),
    tip,
    average: {
      score: averageScore === null ? null : round1(averageScore),
      tier: averageScore === null ? null : tierForScore(round1(averageScore), cutOffs),
      weeksScored: scored.length,
      minWeeks,
      rank: mine ? { rank: mine.rank, total: standings.length } : null,
      averageOfRanks: myRanks.length > 0 ? round1(linqAverage(myRanks)) : null,
    },
    fleetAverage,
    focus,
  };
}
