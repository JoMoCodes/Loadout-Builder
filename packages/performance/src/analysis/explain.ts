// "Explain this score": for one driver's newest scored week in a range, each metric's tier, score
// and weight, and how many of the score's points it earned and lost. The arithmetic is the old
// app's (CoachingEngine.MostDraggingMetric): a metric counts for its weight, so it earns
// score x weight / 100 points and loses (100 - score) x weight / 100. The metric that loses the
// most is the coaching list's "top drag".

import type { MetricEntry, PerfData } from '../models';
import { metricNameDisplay } from '../models';
import { compareOrdinal, sortedBy } from './dotnet';

/** One metric's part in the score. */
export interface ScoreExplainItem {
  /** The stored name ("DCR"). */
  metric: string;
  /** The name as the app shows it ("Delivery Completion DPMO"). */
  metricDisplay: string;
  /** The value as the scorecard gave it ("99.2%"), or null. */
  value: string | null;
  tier: string | null;
  /** 0 to 100, or null when the scorecard gave none. */
  score: number | null;
  /** The weight applied that week, or null when Amazon gave none. */
  weight: number | null;
  /** True when it has a score and a weight above zero, so it counts toward the score. */
  counted: boolean;
  /** score x weight / 100, or null when it does not count. */
  earned: number | null;
  /** (100 - score) x weight / 100, or null when it does not count. */
  lost: number | null;
}

/** One driver's score, metric by metric. */
export interface ScoreExplanation {
  transporterId: string;
  name: string;
  /** The week explained: the driver's newest week in the range with an Overall Score. */
  week: string;
  overallScore: number | null;
  overallTier: string | null;
  /**
   * The metrics that count, the most points lost first (on a tie, the first saved first), then
   * the ones that do not count, in the order they were saved.
   */
  items: ScoreExplainItem[];
  /** The weights of the metrics that count, added up (normally 100). */
  totalWeight: number;
  /** The points earned and lost, added up over the metrics that count. */
  totalEarned: number;
  totalLost: number;
  /** The metric losing the most points (the coaching "top drag"), or null when none counts. */
  topDrag: ScoreExplainItem | null;
}

function itemOf(entry: MetricEntry): ScoreExplainItem {
  const counted = entry.score !== null && entry.weightApplied !== null && entry.weightApplied > 0;
  const score = entry.score;
  const weight = entry.weightApplied;
  return {
    metric: entry.metricName,
    metricDisplay: metricNameDisplay(entry.metricName),
    value: entry.metricValue,
    tier: entry.tier,
    score,
    weight,
    counted,
    earned: counted ? ((weight as number) * (score as number)) / 100.0 : null,
    lost: counted ? ((weight as number) * (100 - (score as number))) / 100.0 : null,
  };
}

/** The driver's scorecards in the range that have an Overall Score, oldest first. */
function scoredCards(data: PerfData, transporterId: string, fromWeek: string, toWeek: string) {
  return sortedBy(
    data.scorecards.filter(
      (card) =>
        card.transporterId === transporterId &&
        card.week >= fromWeek &&
        card.week <= toWeek &&
        card.overallScore !== null,
    ),
    (a, b) => compareOrdinal(a.week, b.week),
  );
}

/** One scorecard, metric by metric. */
function explainCard(
  data: PerfData,
  transporterId: string,
  name: string,
  card: PerfData['scorecards'][number],
): ScoreExplanation {
  const entries = sortedBy(
    data.metrics.filter((entry) => entry.scorecardId === card.id),
    (a, b) => a.id - b.id,
  );
  const all = entries.map(itemOf);
  const counted = all.filter((item) => item.counted);
  // Array sort is stable, so a tie keeps the saved order (the first saved wins, as in the old app).
  const ranked = sortedBy(counted, (a, b) => (b.lost as number) - (a.lost as number));
  const items = [...ranked, ...all.filter((item) => !item.counted)];
  return {
    transporterId,
    name,
    week: card.week,
    overallScore: card.overallScore,
    overallTier: card.overallStanding,
    items,
    totalWeight: counted.reduce((sum, item) => sum + (item.weight as number), 0),
    totalEarned: counted.reduce((sum, item) => sum + (item.earned as number), 0),
    totalLost: counted.reduce((sum, item) => sum + (item.lost as number), 0),
    topDrag: ranked[0] ?? null,
  };
}

const nameOf = (data: PerfData, transporterId: string) =>
  data.drivers.find((d) => d.transporterId === transporterId)?.name ?? '';

/**
 * Explains one driver's score for the newest week in the range that has an Overall Score (the
 * same week the coaching list looks at). Null when the driver has no such week in the range.
 */
export function explainScore(
  data: PerfData,
  transporterId: string,
  fromWeek: string,
  toWeek: string,
): ScoreExplanation | null {
  const cards = scoredCards(data, transporterId, fromWeek, toWeek);
  const card = cards[cards.length - 1];
  if (!card) return null;
  return explainCard(data, transporterId, nameOf(data, transporterId), card);
}

/**
 * The same explanation for every week in the range that has an Overall Score, oldest first, so
 * the points each metric lost can be followed week by week. Empty when there is no such week.
 */
export function explainScoreByWeek(
  data: PerfData,
  transporterId: string,
  fromWeek: string,
  toWeek: string,
): ScoreExplanation[] {
  const name = nameOf(data, transporterId);
  return scoredCards(data, transporterId, fromWeek, toWeek).map((card) =>
    explainCard(data, transporterId, name, card),
  );
}
