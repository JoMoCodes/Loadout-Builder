// The Weekly Snapshot's numbers: the seven-week rank, the points receipt, the tier cut-offs and
// the words, on small hand-built cases and on the made-up fixture files. Names and IDs are the
// made-up people from packages/fixtures/manifest.json.

import { beforeAll, describe, expect, it } from 'vitest';
import {
  emptyPerfData,
  type DriverRecord,
  type MetricEntry,
  type PerfData,
  type WeeklyScorecard,
} from '../models';
import { loadFixtureData } from './fixtureData';
import {
  averageTier,
  buildSnapshotModel,
  cutOffsFrom,
  DEFAULT_CUT_OFFS,
  fleetWeekStrip,
  pointsReceipt,
  rankBySevenWeekAverage,
  snapshotWeeks,
  tierForScore,
  tipPayoff,
  snapshotMetricWords,
  type SnapshotMetric,
} from './snapshot';

const ARCHER = 'A02V4L9HIELIDL';
const DESMOND = 'A05QUB9XOW4NT1';
const CARMEN = 'A0EPR3KZOJDR3R';
const BARRETT = 'A7CUH5Y0VWYL2V';

function driver(transporterId: string, name: string): DriverRecord {
  return {
    transporterId,
    name,
    status: 'ACTIVE',
    position: null,
    qualifications: null,
    idExpiration: null,
    personalPhone: null,
    workPhone: null,
    email: null,
  };
}

let nextId = 1;
function card(
  transporterId: string,
  week: string,
  overallScore: number | null,
  overallStanding: string | null = 'Gold',
  packagesDelivered: number | null = 100,
): WeeklyScorecard {
  return {
    id: nextId++,
    transporterId,
    week,
    overallStanding,
    overallScore,
    packagesDelivered,
    sourceFile: null,
  };
}

function metric(
  scorecardId: number,
  metricName: string,
  score: number,
  weightApplied: number,
  tier = score === 100 ? 'Platinum' : 'Silver',
  metricValue = '0',
): MetricEntry {
  return { id: nextId++, scorecardId, metricName, metricValue, tier, score, weightApplied };
}

const data = (parts: Partial<PerfData>): PerfData => ({ ...emptyPerfData(), ...parts });

describe('tier cut-offs', () => {
  it('read the Overall Score thresholds as the top of each tier, like the report chart', () => {
    const cutOffs = cutOffsFrom([
      {
        metricName: 'Overall Score',
        indicator: 'POSITIVE',
        platinumThreshold: 100,
        goldThreshold: 96,
        silverThreshold: 90,
        bronzeThreshold: 80,
        overallMetricWeight: 0,
        sourceWeek: null,
        importedAt: null,
      },
    ]);
    expect(cutOffs).toEqual({ platinum: 96, gold: 90, silver: 80, fromThresholds: true });
    expect(tierForScore(96, cutOffs)).toBe('Platinum');
    expect(tierForScore(95.9, cutOffs)).toBe('Gold');
    expect(tierForScore(89.9, cutOffs)).toBe('Silver');
    expect(tierForScore(10, cutOffs)).toBe('Bronze');
  });

  it('fall back to 95 / 88 / 78 when the thresholds are missing or odd', () => {
    expect(cutOffsFrom([])).toBe(DEFAULT_CUT_OFFS);
    expect(
      cutOffsFrom([
        {
          metricName: 'Overall Score',
          indicator: 'POSITIVE',
          platinumThreshold: 100,
          goldThreshold: 50,
          silverThreshold: 88,
          bronzeThreshold: 78,
          overallMetricWeight: 0,
          sourceWeek: null,
          importedAt: null,
        },
      ]),
    ).toBe(DEFAULT_CUT_OFFS);
  });

  it('average tiers as points (100 / 80 / 60 / 25) and map the mean back', () => {
    expect(averageTier(['Platinum', 'Platinum', 'Gold'])).toBe('Gold'); // 93.3
    expect(averageTier(['Platinum', 'Platinum', 'Platinum', 'Platinum', 'Gold'])).toBe('Platinum'); // 96
    // 25+60+80+100+80+25+25 = 395 / 7 = 56.4: Bronze, as the design's sample showed.
    expect(averageTier(['Bronze', 'Silver', 'Gold', 'Platinum', 'Gold', 'Bronze', 'Bronze'])).toBe(
      'Bronze',
    );
    expect(averageTier(['Silver', 'Gold', 'Platinum', 'Gold', 'Silver'])).toBe('Silver'); // 76
    expect(averageTier(['Bronze', null, 'Bronze'])).toBe('Bronze');
    expect(averageTier([null, null])).toBeNull();
  });
});

describe('the seven-week rank', () => {
  const weeks = [
    '2026-W35',
    '2026-W36',
    '2026-W37',
    '2026-W38',
    '2026-W39',
    '2026-W40',
    '2026-W41',
  ];
  const perf = data({
    drivers: [
      driver(ARCHER, 'Archer Gresham'),
      driver(DESMOND, 'Desmond Marisol Penrose'),
      driver(CARMEN, 'Carmen Josie Rutherford'),
    ],
    scorecards: [
      // Archer: 7 weeks at 90, 700 packages.
      ...weeks.map((w) => card(ARCHER, w, 90, 'Gold', 100)),
      // Desmond: the same average over 4 weeks, more packages, so he wins the tie.
      ...weeks.slice(3).map((w) => card(DESMOND, w, 90, 'Gold', 200)),
      // Carmen: only 3 scored weeks (one week with no score), so she is not ranked.
      card(CARMEN, '2026-W39', 100, 'Platinum'),
      card(CARMEN, '2026-W40', 100, 'Platinum'),
      card(CARMEN, '2026-W41', 100, 'Platinum'),
      card(CARMEN, '2026-W38', null, null),
    ],
  });

  it('ranks drivers scored in at least four of the weeks by average, ties to more packages', () => {
    const standings = rankBySevenWeekAverage(perf, weeks);
    expect(standings.map((s) => [s.transporterId, s.rank, s.weeksScored, s.packages])).toEqual([
      [DESMOND, 1, 4, 800],
      [ARCHER, 2, 7, 700],
    ]);
    // With the bar lowered to three weeks, Carmen's 100 average leads.
    expect(rankBySevenWeekAverage(perf, weeks, 3)[0]?.transporterId).toBe(CARMEN);
  });

  it('takes the seven fleet weeks ending at the latest week', () => {
    expect(snapshotWeeks(perf, '2026-W41')).toEqual(weeks);
    expect(snapshotWeeks(perf, '2026-W37')).toEqual(weeks.slice(0, 3));
    expect(snapshotWeeks(perf, '2026-W41', 3)).toEqual(weeks.slice(4));
  });

  it('puts the driver among everyone’s scores this week, best first', () => {
    const strip = fleetWeekStrip(perf, '2026-W41', ARCHER);
    expect(strip.scores).toEqual([100, 90, 90]);
    // Desmond's 200 packages put him ahead of Archer's 100 at the same score.
    expect(strip.meIndex).toBe(2);
    expect(strip.average).toBe(93.3);
    // The packages behind the tie-break: Archer's own, Carmen's at rank 1, Desmond's at rank 2.
    expect(strip.packages).toEqual({ mine: 100, first: 100, second: 200 });
    expect(fleetWeekStrip(perf, '2026-W30', ARCHER)).toEqual({
      scores: [],
      meIndex: null,
      average: null,
      packages: { mine: null, first: null, second: null },
    });
    expect(fleetWeekStrip(perf, '2026-W41', 'A0IHV8Z401XHI9').packages).toEqual({
      mine: null,
      first: 100,
      second: 200,
    });
  });

  it('builds the model: an unranked driver, averages of ranks, empty weeks', () => {
    const model = buildSnapshotModel(perf, CARMEN, '2026-W30', '2026-W41');
    expect(model).not.toBeNull();
    expect(model!.weeks.map((w) => w.score)).toEqual([null, null, null, null, 100, 100, 100]);
    expect(model!.weeks.map((w) => w.tier)).toEqual([
      null,
      null,
      null,
      null,
      'Platinum',
      'Platinum',
      'Platinum',
    ]);
    expect(model!.average).toEqual({
      score: 100,
      tier: 'Platinum',
      weeksScored: 3,
      minWeeks: 4,
      rank: null,
      averageOfRanks: 1,
    });
    expect(model!.fleetAverage.meIndex).toBeNull();
    // Her three weeks' packages against the ranked drivers' seven-week totals.
    expect(model!.fleetAverage.packages).toEqual({ mine: 300, first: 800, second: 700 });
    expect(model!.fleetWeek.packages).toEqual({ mine: 100, first: 100, second: 200 });
    expect(model!.latest.rank).toEqual({ rank: 1, total: 3 });
    // No metrics saved: nothing to work on, nothing in the receipt but the total.
    expect(model!.tip).toBeNull();
    expect(model!.focus).toEqual([]);
    expect(model!.receipt).toEqual({ rows: [], total: 100, tier: 'Platinum', toPlatinum: null });
    expect(buildSnapshotModel(perf, 'A0IHV8Z401XHI9', '2026-W30', '2026-W41')).toBeNull();
    expect(buildSnapshotModel(perf, CARMEN, '2026-W30', '2026-W37')).toBeNull();
  });
});

describe('the points receipt', () => {
  it('earns weight x score / 100 per metric and adds the five safety rates into one row', () => {
    const c = card(ARCHER, '2026-W41', 91.3, 'Gold', 1042);
    const safety = [
      'Speeding Event Rate',
      'Seatbelt-Off Rate',
      'Distractions Rate',
      'Sign/Signal Violations Rate',
      'Following Distance Rate',
    ];
    const perf = data({
      drivers: [driver(ARCHER, 'Archer Gresham')],
      scorecards: [c],
      metrics: [
        ...safety.map((name) => metric(c.id, name, 100, 11.6, 'Platinum', '0.0')),
        metric(c.id, 'CDF DPMO', 0, 7.4, 'Bronze', '1919'),
        metric(c.id, 'CED', 100, 10.5, 'Platinum', '0'),
        metric(c.id, 'DCR', 100, 10.5, 'Platinum', '0'),
        metric(c.id, 'DSB', 100, 10.5, 'Platinum', '0'),
        metric(c.id, 'POD', 59.4, 3.2, 'Silver', '99.5%'),
        metric(c.id, 'PSB', 100, 0, 'Platinum', '0'), // weight 0: does not count
      ],
      cdf: [
        {
          transporterId: ARCHER,
          week: '2026-W41',
          name: 'Archer Gresham',
          mishandled: 0,
          unprofessional: 0,
          didNotFollowInstructions: 1,
          wrongAddress: 1,
          neverReceived: 0,
          wrongItem: 0,
          sourceFile: null,
        },
      ],
      pod: [
        {
          transporterId: ARCHER,
          week: '2026-W41',
          name: 'Archer Gresham',
          opportunities: 1000,
          success: 995,
          bypass: 0,
          rejects: 5,
          blurryPhoto: 2,
          humanInThePicture: 0,
          noPackageDetected: 0,
          packageInCar: 0,
          packageInHand: 0,
          packageNotClearlyVisible: 0,
          packageTooClose: 3,
          photoTooDark: 0,
          other: 0,
          sourceFile: null,
        },
      ],
    });
    const model = buildSnapshotModel(perf, ARCHER, '2026-W41', '2026-W41')!;
    expect(model.metrics.map((m) => m.key)).not.toContain('PSB');
    const rows = model.receipt.rows.map((r) => [r.label, r.earned.toFixed(1), r.max.toFixed(1)]);
    expect(rows).toEqual([
      ['Safety × 5', '58.0', '58.0'], // no safety file this week, so no event count
      ['Escalations (0)', '10.5', '10.5'],
      ['Delivery Completion', '10.5', '10.5'], // no returned-package file this week
      ['Concessions', '10.5', '10.5'],
      ['Photos (5 rejected)', '1.9', '3.2'],
      ['Feedback (2 complaints)', '0.0', '7.4'],
    ]);
    expect(model.receipt.total).toBe(91.3);
    expect(model.receipt.tier).toBe('Gold');
    expect(model.receipt.toPlatinum).toBe(3.7);
    // Feedback lost the most (7.4 of the 8.7 lost), and clearing it alone reaches Platinum.
    expect(model.tip).toEqual({
      metric: 'CDF DPMO',
      name: 'Feedback',
      tip: snapshotMetricWords('CDF DPMO').tip,
      payoff: "Clear the 2 complaints and you're Platinum (+7.4 points).",
      lost: 7.4,
    });
    expect(model.focus.map((f) => [f.name, f.averageTier, f.lost])).toEqual([
      ['Feedback', 'Bronze', 7.4],
      ['Photos', 'Silver', 1.3],
    ]);
    expect(model.focus[0]!.facts).toEqual([
      '2.0 complaints a week on average (2 over 1 week)',
      'Bronze in 1 of 1 weeks, Platinum in 0',
    ]);
  });

  it('leaves "To Platinum" out at Platinum and words a payoff that falls short', () => {
    const metrics: SnapshotMetric[] = [];
    const receipt = pointsReceipt(metrics, 97.2, 'Platinum', DEFAULT_CUT_OFFS);
    expect(receipt).toEqual({ rows: [], total: 97.2, tier: 'Platinum', toPlatinum: null });
    expect(tipPayoff(snapshotMetricWords('POD'), 5, 1.3, 3.7)).toBe(
      'Clear the 5 photos rejected and you gain +1.3 points.',
    );
    expect(tipPayoff(snapshotMetricWords('POD'), null, 1.3, 1.0)).toBe(
      "Get photos back to Platinum and you're Platinum (+1.3 points).",
    );
    expect(tipPayoff(snapshotMetricWords('Speeding Event Rate'), 1, 11.6, 18.6)).toBe(
      'Clear the 1 speeding event and you gain +11.6 points.',
    );
  });
});

describe('with the made-up fixture files', () => {
  let perf: PerfData;
  beforeAll(async () => {
    perf = await loadFixtureData();
  });

  it('matches the Drivers tab’s rank and the thresholds file’s cut-offs', () => {
    const model = buildSnapshotModel(perf, ARCHER, '2026-W31', '2026-W40')!;
    expect(model.cutOffs).toEqual({ platinum: 95, gold: 88, silver: 78, fromThresholds: true });
    expect(model.weeks.map((w) => w.week)).toEqual([
      '2026-W34',
      '2026-W35',
      '2026-W36',
      '2026-W37',
      '2026-W38',
      '2026-W39',
      '2026-W40',
    ]);
    expect(model.latest).toMatchObject({
      score: 93.58,
      tier: 'Gold',
      rank: { rank: 32, total: 61 },
    });
    expect(model.fleetWeek.scores).toHaveLength(61);
    expect(model.fleetWeek.meIndex).toBe(31);
    expect(model.average).toMatchObject({ score: 98.4, tier: 'Platinum', weeksScored: 7 });
    expect(model.average.rank).toEqual({ rank: 5, total: 67 });
    expect(model.receipt.rows.map((r) => r.label)).toEqual([
      'Safety × 5 (0 events)',
      'Escalations (0)',
      'Delivery Completion (2)',
      'Concessions (0)',
      'Photos (0 rejected)',
      'Feedback (0 complaints)',
    ]);
    expect(model.tip?.payoff).toBe(
      "Clear the 2 packages brought back and you're Platinum (+6.4 points).",
    );
  });

  it('a week the driver was scored in an earlier week only uses that week as the latest', () => {
    const model = buildSnapshotModel(perf, DESMOND, '2026-W31', '2026-W37')!;
    expect(model.latest.week).toBe('2026-W37');
    expect(model.weeks).toHaveLength(7);
    expect(model.weeks[0]!.week).toBe('2026-W31');
  });

  it('lists up to three metrics to improve, worst first, with their average tier', () => {
    const model = buildSnapshotModel(perf, BARRETT, '2026-W31', '2026-W40')!;
    expect(model.focus.map((f) => [f.name, f.averageTier])).toEqual([
      ['Delivery Completion', 'Bronze'],
      ['Feedback', 'Bronze'],
      ['Concessions', 'Silver'],
    ]);
    expect(model.focus[1]!.facts[0]).toBe('2.7 complaints a week on average (19 over 7 weeks)');
    expect(model.metrics.find((m) => m.key === 'DSB')!.tiers.map((t) => t?.[0])).toEqual([
      'B',
      'P',
      'P',
      'B',
      'P',
      'P',
      'B',
    ]);
  });
});
