// "Explain this score": the arithmetic on a hand-built week, and the top item against the old
// app's coaching "top drag" (scripts/parity/wpa/expected/coaching.json) over the made-up data.
// Names and IDs are made-up people from packages/fixtures/manifest.json.

import { describe, expect, it } from 'vitest';
import { emptyPerfData, type MetricEntry, type PerfData, type WeeklyScorecard } from '../models';
import { explainScore, explainScoreByWeek } from './explain';
import { loadFixtureData, readExpectedJson } from './fixtureData';
import { getAllWeeks } from './drivers';

const ARCHER = 'A02V4L9HIELIDL';

function card(id: number, week: string, score: number | null): WeeklyScorecard {
  return {
    id,
    transporterId: ARCHER,
    week,
    overallStanding: score === null ? null : 'Gold',
    overallScore: score,
    packagesDelivered: 800,
    sourceFile: null,
  };
}

function metric(
  id: number,
  scorecardId: number,
  metricName: string,
  score: number | null,
  weight: number | null,
): MetricEntry {
  return {
    id,
    scorecardId,
    metricName,
    metricValue: score === null ? null : String(score),
    tier: score === null ? null : score >= 90 ? 'Platinum' : 'Bronze',
    score,
    weightApplied: weight,
  };
}

function data(extra: Partial<PerfData>): PerfData {
  return {
    ...emptyPerfData(),
    drivers: [
      {
        transporterId: ARCHER,
        name: 'Archer Gresham',
        status: 'ACTIVE',
        position: null,
        qualifications: null,
        idExpiration: null,
        personalPhone: null,
        workPhone: null,
        email: null,
      },
    ],
    ...extra,
  };
}

describe('explaining one week', () => {
  const d = data({
    scorecards: [card(1, '2026-W39', 99), card(2, '2026-W40', 88.5), card(3, '2026-W41', null)],
    metrics: [
      metric(10, 2, 'POD', 90, 10),
      metric(11, 2, 'DCR', 36, 10),
      metric(12, 2, 'FICO', null, 11.6),
      metric(13, 2, 'CDF DPMO', 100, 20),
      metric(14, 2, 'Seatbelt-Off Rate', 80, 0),
      metric(15, 2, 'Speeding Event Rate', 0, 6.4),
      metric(20, 1, 'DCR', 100, 10),
    ],
  });

  it('uses the newest week in the range that has an Overall Score', () => {
    expect(explainScore(d, ARCHER, '2026-W39', '2026-W41')?.week).toBe('2026-W40');
    expect(explainScore(d, ARCHER, '2026-W39', '2026-W39')?.week).toBe('2026-W39');
    expect(explainScore(d, ARCHER, '2026-W41', '2026-W41')).toBeNull();
    expect(explainScore(d, 'A05QUB9XOW4NT1', '2026-W39', '2026-W41')).toBeNull();
  });

  it('works out points earned and lost from score and weight, most lost first', () => {
    const got = explainScore(d, ARCHER, '2026-W31', '2026-W41')!;
    expect(got.name).toBe('Archer Gresham');
    expect(got.overallScore).toBe(88.5);
    expect(got.items.map((item) => item.metric)).toEqual([
      'DCR', // (100 - 36) x 10 / 100 = 6.4
      'Speeding Event Rate', // 100 x 6.4 / 100 = 6.4, saved later, so second
      'POD', // 1
      'CDF DPMO', // 0
      'FICO', // no score: does not count
      'Seatbelt-Off Rate', // weight 0: does not count
    ]);
    const [dcr, speeding, pod, cdf, fico, seatbelt] = got.items;
    expect(dcr).toMatchObject({ metricDisplay: 'Delivery Completion DPMO', counted: true });
    expect(dcr!.lost).toBeCloseTo(6.4, 10);
    expect(dcr!.earned).toBeCloseTo(3.6, 10);
    expect(speeding!.lost).toBeCloseTo(6.4, 10);
    expect(speeding!.earned).toBe(0);
    expect(pod!.lost).toBeCloseTo(1, 10);
    expect(cdf).toMatchObject({ lost: 0, earned: 20 });
    expect(fico).toMatchObject({ counted: false, earned: null, lost: null, weight: 11.6 });
    expect(seatbelt).toMatchObject({ counted: false, earned: null, lost: null });
    expect(got.topDrag?.metric).toBe('DCR');
    expect(got.totalWeight).toBeCloseTo(46.4, 10);
    expect(got.totalLost).toBeCloseTo(13.8, 10);
    expect(got.totalEarned + got.totalLost).toBeCloseTo(got.totalWeight, 10);
  });

  it('has no top item when nothing counts', () => {
    const none = data({
      scorecards: [card(1, '2026-W40', 90)],
      metrics: [metric(1, 1, 'FICO', null, 11.6)],
    });
    const got = explainScore(none, ARCHER, '2026-W40', '2026-W40')!;
    expect(got.topDrag).toBeNull();
    expect(got.items).toHaveLength(1);
    expect(got.totalWeight).toBe(0);
  });
});

describe('explaining every week', () => {
  const d = data({
    scorecards: [card(2, '2026-W40', 88.5), card(1, '2026-W39', 99), card(3, '2026-W41', null)],
    metrics: [
      metric(10, 2, 'DCR', 36, 10),
      metric(11, 2, 'POD', 90, 10),
      metric(20, 1, 'DCR', 100, 10),
      metric(21, 1, 'POD', 50, 10),
    ],
  });

  it('gives each week with an Overall Score, oldest first, with the same points as one week', () => {
    const weeks = explainScoreByWeek(d, ARCHER, '2026-W31', '2026-W41');
    expect(weeks.map((w) => w.week)).toEqual(['2026-W39', '2026-W40']);
    expect(weeks[0]!.items.map((i) => [i.metric, i.lost])).toEqual([
      ['POD', 5],
      ['DCR', 0],
    ]);
    expect(weeks[1]).toEqual(explainScore(d, ARCHER, '2026-W31', '2026-W41'));
    expect(weeks[0]).toEqual(explainScore(d, ARCHER, '2026-W39', '2026-W39'));
  });

  it('keeps to the range, and is empty with no scored week', () => {
    expect(explainScoreByWeek(d, ARCHER, '2026-W40', '2026-W41').map((w) => w.week)).toEqual([
      '2026-W40',
    ]);
    expect(explainScoreByWeek(d, ARCHER, '2026-W41', '2026-W41')).toEqual([]);
    expect(explainScoreByWeek(d, 'A05QUB9XOW4NT1', '2026-W31', '2026-W41')).toEqual([]);
  });
});

describe('over the made-up data', async () => {
  const fixtures = await loadFixtureData();
  const weeks = getAllWeeks(fixtures);
  const from = weeks[0]!;
  const to = weeks[weeks.length - 1]!;
  const { flags } = readExpectedJson<{
    flags: Array<{
      transporterId: string;
      latestWeek: string;
      topDragMetric: string | null;
      topDragScore: number | null;
      topDragWeight: number | null;
      topDragTier: string | null;
    }>;
  }>('coaching.json');

  it('puts the coaching list’s "top drag" first, for every flagged driver', () => {
    expect(flags.length).toBeGreaterThan(10);
    for (const flag of flags) {
      const got = explainScore(fixtures, flag.transporterId, from, to);
      expect(got?.week, flag.transporterId).toBe(flag.latestWeek);
      expect(got?.topDrag?.metric ?? null, flag.transporterId).toBe(flag.topDragMetric);
      expect(got?.topDrag?.score ?? null, flag.transporterId).toBe(flag.topDragScore);
      expect(got?.topDrag?.weight ?? null, flag.transporterId).toBe(flag.topDragWeight);
      expect(got?.topDrag?.tier ?? null, flag.transporterId).toBe(flag.topDragTier);
    }
  });

  it('matches the first few by name too (Archer Gresham: DCR, score 39, weight 10.5)', () => {
    const archer = explainScore(fixtures, ARCHER, from, to)!;
    expect(archer.topDrag).toMatchObject({ metric: 'DCR', score: 39.02, weight: 10.5 });
    expect(archer.topDrag!.lost).toBeCloseTo((10.5 * (100 - 39.02)) / 100, 10);
    // Each metric that counts earns and loses its whole weight between them.
    for (const item of archer.items.filter((one) => one.counted)) {
      expect(item.earned! + item.lost!).toBeCloseTo(item.weight!, 10);
    }
  });

  it('gives one explanation per scored week, the newest matching the single-week one', () => {
    const all = explainScoreByWeek(fixtures, ARCHER, from, to);
    expect(all.length).toBeGreaterThan(1);
    expect(all.at(-1)).toEqual(explainScore(fixtures, ARCHER, from, to));
    const sorted = [...all.map((w) => w.week)].sort();
    expect(all.map((w) => w.week)).toEqual(sorted);
  });
});
