// Who needs a coaching conversation in the week range, and why. Ported from CoachingEngine.cs.
//
// A driver is flagged when, in the range:
//   1. their newest scored week is Bronze;
//   2. they dropped a tier from the scored week before;
//   3. their Overall Score went down N weeks running (settings: atRiskDecliningWeeks);
//   4. the same failure category showed up in each of their last K weeks (recurringCategoryWeeks).
// Each flagged driver also gets the one metric costing them the most points that week.

import type { CoachingFlag, MetricEntry, PerfData } from '../models';
import { tierRank } from '../models';
import { compareOrdinal, compareOrdinalIgnoreCase, formatNet, sortedBy } from './dotnet';
import { groupBy } from './drivers';
import { categoryHitsByDriverWeek } from './fleet';

/** The numbers the coaching rules use. Both are at least 2 in use. */
export interface CoachingSettings {
  /** Flag a driver whose score went down this many weeks running. Old default 3. */
  atRiskDecliningWeeks: number;
  /** Flag a failure category seen in each of the driver's last this-many weeks. Old default 3. */
  recurringCategoryWeeks: number;
}

/** The old app's defaults (PdfSettings.cs). */
export const DEFAULT_COACHING_SETTINGS: Readonly<CoachingSettings> = Object.freeze({
  atRiskDecliningWeeks: 3,
  recurringCategoryWeeks: 3,
});

/** A coaching flag with the texts the coaching list shows. */
export interface CoachingFlagView extends CoachingFlag {
  /** The reasons joined with "; ". */
  reasonsDisplay: string;
  /** "93.6" or "-". */
  latestScoreDisplay: string;
  /** "DCR (score 39, weight 10.5)" or "-". */
  topDragDisplay: string;
}

export interface DragMetric {
  metric: string;
  score: number;
  weight: number;
  tier: string | null;
}

/**
 * The metric losing the most weighted points in one week: weight x (100 - score) / 100. Only
 * metrics with a score and a weight above zero count; on a tie the first saved wins. Null when
 * none qualifies.
 */
export function mostDraggingMetric(
  data: PerfData,
  transporterId: string,
  week: string,
): DragMetric | null {
  const card = data.scorecards.find((c) => c.transporterId === transporterId && c.week === week);
  if (!card) return null;
  let best: { entry: MetricEntry; lost: number } | null = null;
  const entries = sortedBy(
    data.metrics.filter((entry) => entry.scorecardId === card.id),
    (a, b) => a.id - b.id,
  );
  for (const entry of entries) {
    if (entry.score === null || entry.weightApplied === null || !(entry.weightApplied > 0))
      continue;
    const lost = (entry.weightApplied * (100 - entry.score)) / 100.0;
    if (best === null || lost > best.lost) best = { entry, lost };
  }
  return best === null
    ? null
    : {
        metric: best.entry.metricName,
        score: best.entry.score as number,
        weight: best.entry.weightApplied as number,
        tier: best.entry.tier,
      };
}

function flagView(flag: CoachingFlag): CoachingFlagView {
  return {
    ...flag,
    reasonsDisplay: flag.reasons.join('; '),
    latestScoreDisplay: flag.latestScore === null ? '-' : formatNet(flag.latestScore, '0.0'),
    topDragDisplay:
      flag.topDragMetric === null
        ? '-'
        : `${flag.topDragMetric} (score ${flag.topDragScore === null ? '' : formatNet(flag.topDragScore, '0')}, weight ${flag.topDragWeight === null ? '' : formatNet(flag.topDragWeight, '0.#')})`,
  };
}

/**
 * The coaching flags for the week range (CoachingEngine.Evaluate). "High" flags first (Bronze or
 * a tier drop), then lowest score first, then by name.
 */
export function evaluateCoaching(
  data: PerfData,
  fromWeek: string,
  toWeek: string,
  settings: CoachingSettings = DEFAULT_COACHING_SETTINGS,
): CoachingFlagView[] {
  const decliningWeeks = Math.max(2, settings.atRiskDecliningWeeks);
  const recurringWeeks = Math.max(2, settings.recurringCategoryWeeks);

  // Scorecards in range for drivers on file, by Transporter ID then week.
  const names = new Map(data.drivers.map((d) => [d.transporterId, d.name]));
  const rows = sortedBy(
    data.scorecards.filter(
      (card) => card.week >= fromWeek && card.week <= toWeek && names.has(card.transporterId),
    ),
    (a, b) => compareOrdinal(a.transporterId, b.transporterId) || compareOrdinal(a.week, b.week),
  );
  const categoryHits = categoryHitsByDriverWeek(data, fromWeek, toWeek);
  const flags: CoachingFlag[] = [];

  for (const [transporterId, ordered] of groupBy(rows, (card) => card.transporterId)) {
    const scored = ordered.filter((card) => card.overallScore !== null);
    if (scored.length === 0) continue;
    const latest = scored[scored.length - 1] as (typeof scored)[number];
    const reasons: string[] = [];
    let severity: CoachingFlag['severity'] = 'Watch';

    // 1. Currently Bronze.
    if (
      latest.overallStanding !== null &&
      compareOrdinalIgnoreCase(latest.overallStanding, 'Bronze') === 0
    ) {
      reasons.push(`Currently Bronze (${latest.week})`);
      severity = 'High';
    }

    // 2. A tier lower than the scored week before.
    if (scored.length >= 2) {
      const prev = scored[scored.length - 2] as (typeof scored)[number];
      const prevRank = tierRank(prev.overallStanding);
      const latestRank = tierRank(latest.overallStanding);
      if (prevRank > 0 && latestRank < prevRank) {
        reasons.push(
          `Dropped from ${prev.overallStanding ?? ''} to ${latest.overallStanding ?? ''}`,
        );
        severity = 'High';
      }
    }

    // 3. Strictly lower each week over the last N scored weeks.
    if (scored.length >= decliningWeeks) {
      const lastN = scored.slice(scored.length - decliningWeeks);
      let strictlyDown = true;
      for (let i = 1; i < lastN.length; i++) {
        if ((lastN[i]?.overallScore as number) >= (lastN[i - 1]?.overallScore as number)) {
          strictlyDown = false;
          break;
        }
      }
      if (strictlyDown) {
        const first = lastN[0]?.overallScore as number;
        const last = lastN[lastN.length - 1]?.overallScore as number;
        reasons.push(
          `Score declined ${decliningWeeks} weeks running (${formatNet(first, '0.0')} -> ${formatNet(last, '0.0')})`,
        );
      }
    }

    // 4. The same failure category in each of the driver's last K weeks with a scorecard.
    const driverWeeks = ordered.map((card) => card.week);
    const byCategory = categoryHits[transporterId];
    if (driverWeeks.length >= recurringWeeks && byCategory) {
      const lastK = driverWeeks.slice(driverWeeks.length - recurringWeeks);
      for (const [key, weeks] of Object.entries(byCategory)) {
        if (lastK.every((week) => weeks.includes(week))) {
          reasons.push(`${key} in ${recurringWeeks} consecutive weeks`);
        }
      }
    }

    if (reasons.length === 0) continue;
    const drag = mostDraggingMetric(data, transporterId, latest.week);
    flags.push({
      transporterId,
      name: names.get(transporterId) as string,
      latestWeek: latest.week,
      latestTier: latest.overallStanding,
      latestScore: latest.overallScore,
      reasons,
      severity,
      topDragMetric: drag?.metric ?? null,
      topDragScore: drag?.score ?? null,
      topDragWeight: drag?.weight ?? null,
      topDragTier: drag?.tier ?? null,
    });
  }

  return sortedBy(flags, (a, b) => {
    const high = Number(b.severity === 'High') - Number(a.severity === 'High');
    if (high !== 0) return high;
    const scoreA = a.latestScore ?? Number.MAX_VALUE;
    const scoreB = b.latestScore ?? Number.MAX_VALUE;
    if (scoreA !== scoreB) return scoreA < scoreB ? -1 : 1;
    return compareOrdinalIgnoreCase(a.name, b.name);
  }).map(flagView);
}
