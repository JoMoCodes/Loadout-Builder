// A made-up snapshot for the Reports tab preview when there is no driver to show: the sample
// driver and week numbers the design was built with (one driver, seven weeks, a fleet of 42).
// Nothing here comes from real data; the name is the report preview's "Sample Driver".

import type { SnapshotModel, SnapshotTier } from '@loadout/performance';
import { DEFAULT_CUT_OFFS, snapshotMetricWords, tipPayoff } from '@loadout/performance';

const SAMPLE_ID = 'A047LNAN5VQIQR';

const WEEKS: Array<[number, number, SnapshotTier, number, number]> = [
  // week, score, tier, rank, packages
  [35, 86.2, 'Silver', 24, 915],
  [36, 88.9, 'Gold', 18, 1120],
  [37, 93.1, 'Gold', 11, 1004],
  [38, 95.8, 'Platinum', 4, 1180],
  [39, 94.0, 'Gold', 7, 801],
  [40, 87.4, 'Silver', 16, 1066],
  [41, 91.3, 'Gold', 9, 1042],
];

/** Everyone's score in week 41 (made up), best first; the sample driver is 9th. */
const FIELD_WEEK = [
  100, 99.1, 97.6, 96.4, 95.3, 94.2, 93.0, 92.1, 91.3, 90.6, 89.9, 89.2, 88.7, 88.1, 87.6, 87.4,
  86.9, 86.1, 85.4, 84.8, 84.0, 83.3, 82.7, 82.0, 81.2, 80.5, 79.8, 79.0, 78.3, 77.5, 76.8, 76.0,
  75.2, 74.3, 73.5, 72.6, 71.8, 70.9, 69.7, 68.5, 67.2, 65.9,
];
/** Everyone's seven-week average (made up), best first; the sample driver is 7th. */
const FIELD_AVG = [
  97.8, 97.1, 96.4, 95.9, 94.6, 93.2, 91.0, 90.4, 90.1, 89.7, 89.2, 88.8, 88.3, 87.9, 87.5, 87.1,
  86.6, 86.0, 85.7, 85.2, 84.8, 84.1, 83.6, 83.0, 82.4, 81.9, 81.1, 80.6, 80.0, 79.3, 78.7, 78.1,
  77.4, 76.6, 75.9, 75.0, 74.2, 73.3, 72.1, 70.8, 69.5, 67.9,
];

const T = (text: string): SnapshotTier[] =>
  [...text].map((c) => ({ P: 'Platinum', G: 'Gold', S: 'Silver', B: 'Bronze' })[c] as SnapshotTier);

const average = (values: number[]) =>
  Math.round((values.reduce((a, b) => a + b, 0) / values.length) * 10) / 10;

function metric(
  key: string,
  weight: number,
  tiers: SnapshotTier[],
  latestScore: number,
  events: Array<number | null>,
  latestValue: string,
) {
  const words = snapshotMetricWords(key);
  const scoreOf: Record<SnapshotTier, number> = { Platinum: 100, Gold: 70, Silver: 40, Bronze: 0 };
  return {
    key,
    name: words.name,
    group: words.group,
    tiers,
    lostByWeek: tiers.map((t, i) =>
      i === tiers.length - 1
        ? (weight * (100 - latestScore)) / 100
        : (weight * (100 - scoreOf[t])) / 100,
    ),
    eventsByWeek: events,
    latestTier: tiers[tiers.length - 1] as SnapshotTier,
    latestScore,
    latestWeight: weight,
    latestValue,
    latestEvents: events[events.length - 1] ?? null,
    earned: (weight * latestScore) / 100,
    max: weight,
  };
}

const zeros = [0, 0, 0, 0, 0, 0, 0];

/** The sample snapshot: a Gold week, two complaints and five rejected photos to work on. */
export function sampleSnapshotModel(): SnapshotModel {
  const weeks = WEEKS.map(([number, score, tier, rank, packages]) => ({
    week: `2026-W${number}`,
    number,
    score,
    tier,
    rank: { rank, total: 42 },
    packages,
  }));
  const latest = weeks[weeks.length - 1]!;
  const metrics = [
    metric('Speeding Event Rate', 11.6, T('GPPPPPP'), 100, [1, 0, 0, 0, 0, 0, 0], '0.0'),
    metric('Seatbelt-Off Rate', 11.6, T('PPPPPPP'), 100, zeros, '0.0'),
    metric('Distractions Rate', 11.6, T('PPPPPPP'), 100, zeros, '0.0'),
    metric('Sign/Signal Violations Rate', 11.6, T('PPPPPPP'), 100, zeros, '0.0'),
    metric('Following Distance Rate', 11.6, T('PPPSPPP'), 100, [0, 0, 0, 1, 0, 0, 0], '0.0'),
    metric('CDF DPMO', 7.4, T('BSGPGBB'), 0, [3, 2, 1, 0, 1, 2, 2], '1919'),
    metric('CED', 10.5, T('PPPPPPP'), 100, zeros, '0'),
    metric('DCR', 10.5, T('SGPPPPP'), 100, [2, 1, 0, 0, 0, 0, 0], '0'),
    metric('DSB', 10.5, T('PPPPPGP'), 100, [0, 0, 0, 0, 0, 1, 0], '0'),
    metric('POD', 3.2, T('SGPPGSS'), 59.4, [9, 4, 0, 0, 3, 6, 5], '99.5%'),
  ];
  const cdf = snapshotMetricWords('CDF DPMO');
  const pod = snapshotMetricWords('POD');
  return {
    transporterId: SAMPLE_ID,
    name: 'Sample Driver',
    cutOffs: DEFAULT_CUT_OFFS,
    weeks,
    latest,
    metrics,
    receipt: {
      rows: [
        { label: 'Safety × 5 (0 events)', earned: 58, max: 58 },
        { label: 'Escalations (0)', earned: 10.5, max: 10.5 },
        { label: 'Delivery Completion (0)', earned: 10.5, max: 10.5 },
        { label: 'Concessions (0)', earned: 10.5, max: 10.5 },
        { label: 'Photos (5 rejected)', earned: 1.9, max: 3.2 },
        { label: 'Feedback (2 complaints)', earned: 0, max: 7.4 },
      ],
      total: 91.3,
      tier: 'Gold',
      toPlatinum: 3.7,
    },
    fleetWeek: {
      scores: FIELD_WEEK,
      meIndex: 8,
      average: average(FIELD_WEEK),
      packages: { mine: 1042, first: 1180, second: 1133 },
    },
    tip: {
      metric: 'CDF DPMO',
      name: cdf.name,
      tip: cdf.tip,
      payoff: tipPayoff(cdf, 2, 7.4, 3.7),
      lost: 7.4,
    },
    average: {
      score: 91.0,
      tier: 'Gold',
      weeksScored: 7,
      minWeeks: 4,
      rank: { rank: 7, total: 42 },
      averageOfRanks: 12.7,
    },
    fleetAverage: {
      scores: FIELD_AVG,
      meIndex: 6,
      average: average(FIELD_AVG),
      packages: { mine: 7128, first: 7842, second: 7615 },
    },
    focus: [
      {
        metric: 'CDF DPMO',
        name: cdf.name,
        averageTier: 'Bronze',
        facts: [
          '1.6 complaints a week on average (11 over 7 weeks)',
          'Bronze in 3 of 7 weeks, Platinum in 1',
        ],
        tip: cdf.tip,
        lost: 30.1,
      },
      {
        metric: 'POD',
        name: pod.name,
        averageTier: 'Silver',
        facts: [
          '3.9 photos rejected a week on average (27 over 7 weeks)',
          'Below Platinum in 5 of 7 weeks',
        ],
        tip: pod.tip,
        lost: 9.9,
      },
    ],
  };
}
