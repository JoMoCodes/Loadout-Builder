// The Dashboard's build-your-own parts, worked out over a few made-up scorecards. Names come from
// the made-up people in packages/fixtures.

import { METRIC_DEFINITIONS, emptyPerfData, type PerfData } from '@loadout/performance';
import { describe, expect, it } from 'vitest';
import { CUSTOM_NUMBERS, SCORECARD_METRICS } from '../../shared/dashboardLayout';
import { DEFAULT_PERFORMANCE } from '../../shared/performanceSettings';
import { combine, customResults, numberByWeek, watchRows } from './custom';
import { dashboardView } from './views';

const A = 'A1E3ZUFIX1EXA5';
const B = 'A02V4L9HIELIDL';
const C = 'A0EPR3KZOJDR3R';
/** A made-up driver who is not in the data below. */
const NOT_ON_FILE = 'A8M3J46P8HG6FK';

function driver(transporterId: string, name: string) {
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
  data: PerfData,
  transporterId: string,
  week: string,
  overallScore: number | null,
  packagesDelivered: number | null,
  dcr: number | null = null,
) {
  const id = nextId++;
  data.scorecards.push({
    id,
    transporterId,
    week,
    overallStanding: overallScore === null ? null : overallScore >= 90 ? 'Platinum' : 'Bronze',
    overallScore,
    packagesDelivered,
    sourceFile: null,
  });
  if (dcr !== null) {
    data.metrics.push({
      id,
      scorecardId: id,
      metricName: 'DCR',
      metricValue: null,
      tier: null,
      score: dcr,
      weightApplied: 10,
    });
  }
}

function made(): PerfData {
  const data = emptyPerfData();
  data.drivers.push(
    driver(A, 'Amelia Aaron Blackwell'),
    driver(B, 'Archer Gresham'),
    driver(C, 'Carmen Josie Rutherford'),
  );
  card(data, A, '2026-W38', 80, 900, 60);
  card(data, B, '2026-W38', 100, 1100, 100);
  card(data, A, '2026-W39', 70, 1000, 50);
  card(data, B, '2026-W39', 95, 1200, 90);
  card(data, A, '2026-W40', 60, 800, 40);
  card(data, B, '2026-W40', 98, 1300, 100);
  // On file that week, but with no score.
  card(data, C, '2026-W40', null, null);
  return data;
}

const ALL = { from: '2026-W38', to: '2026-W40' };

describe('the numbers a tile can be built from', () => {
  it('lists the same twelve metrics as the scorecards', () => {
    expect([...SCORECARD_METRICS]).toEqual(METRIC_DEFINITIONS.map((metric) => metric.name));
  });

  it('knows every number the page offers', () => {
    const data = made();
    for (const number of CUSTOM_NUMBERS) {
      expect(numberByWeek(data, number.id), number.id).not.toBeNull();
    }
    expect(numberByWeek(data, 'nonsense')).toBeNull();
  });

  it('leaves out a driver who does not have the number', () => {
    const data = made();
    expect(numberByWeek(data, 'overall')!.get('2026-W40')).toEqual([60, 98]);
    expect(numberByWeek(data, 'packages')!.get('2026-W40')).toEqual([800, 1300]);
    expect(numberByWeek(data, 'metric:DCR')!.get('2026-W39')).toEqual([50, 90]);
    expect(numberByWeek(data, 'metric:FICO')!.size).toBe(0);
  });

  it('averages, adds up, and counts below or above (not on) a number', () => {
    expect(combine([60, 98], 'average', 0)).toBe(79);
    expect(combine([800, 1300], 'total', 0)).toBe(2100);
    expect(combine([60, 80, 98], 'below', 80)).toBe(1);
    expect(combine([60, 80, 98], 'above', 80)).toBe(1);
    expect(combine([], 'average', 0)).toBeNull();
    expect(combine(undefined, 'total', 0)).toBeNull();
  });
});

describe("a person's own tiles", () => {
  it('gives the newest week, the week before, and every week in the range', () => {
    const [average, total, low] = customResults(made(), ALL, [
      { id: 'custom-1', number: 'overall', how: 'average', limit: 0 },
      { id: 'custom-2', number: 'packages', how: 'total', limit: 0 },
      { id: 'custom-3', number: 'metric:DCR', how: 'below', limit: 80 },
    ]);
    expect(average).toEqual({
      id: 'custom-1',
      value: 79,
      before: 82.5,
      drivers: 2,
      series: [
        { week: '2026-W38', value: 90 },
        { week: '2026-W39', value: 82.5 },
        { week: '2026-W40', value: 79 },
      ],
    });
    expect(total!.value).toBe(2100);
    expect(total!.before).toBe(2200);
    expect(low!.value).toBe(1);
    expect(low!.series.map((point) => point.value)).toEqual([1, 1, 1]);
  });

  it('compares the first week of a range with the week before it, outside the range', () => {
    const [one] = customResults(made(), { from: '2026-W40', to: '2026-W40' }, [
      { id: 'custom-1', number: 'overall', how: 'average', limit: 0 },
    ]);
    expect(one!.before).toBe(82.5);
    expect(one!.series).toHaveLength(1);
  });

  it('answers with nothing for a number it does not know, or no weeks', () => {
    const empty = { value: null, before: null, drivers: 0, series: [] };
    expect(
      customResults(made(), ALL, [{ id: 'custom-1', number: 'nonsense', how: 'total', limit: 0 }]),
    ).toEqual([{ id: 'custom-1', ...empty }]);
    expect(
      customResults(emptyPerfData(), null, [
        { id: 'custom-1', number: 'overall', how: 'average', limit: 0 },
      ]),
    ).toEqual([{ id: 'custom-1', ...empty }]);
  });

  it('counts failures of one kind per driver', () => {
    const data = made();
    const pod = {
      transporterId: A,
      week: '2026-W40',
      name: '',
      opportunities: 100,
      success: 90,
      bypass: 0,
      rejects: 5,
      blurryPhoto: 3,
      humanInThePicture: 0,
      noPackageDetected: 2,
      packageInCar: 0,
      packageInHand: 0,
      packageNotClearlyVisible: 0,
      packageTooClose: 0,
      photoTooDark: 0,
      other: 0,
      sourceFile: null,
    };
    data.pod.push(pod, { ...pod, transporterId: B, blurryPhoto: 0, noPackageDetected: 1 });
    const [total, many] = customResults(data, ALL, [
      { id: 'custom-1', number: 'fail:POD', how: 'total', limit: 0 },
      { id: 'custom-2', number: 'fail:POD', how: 'above', limit: 2 },
    ]);
    expect(total!.value).toBe(6);
    expect(total!.drivers).toBe(2);
    expect(many!.value).toBe(1);
  });
});

describe('the watch list', () => {
  it("gives each driver's newest scored week in the range and the one before", () => {
    expect(watchRows(made(), ALL, [B, A])).toEqual([
      {
        transporterId: B,
        name: 'Archer Gresham',
        latestWeek: '2026-W40',
        latestTier: 'Platinum',
        latestScore: 98,
        previousScore: 95,
      },
      {
        transporterId: A,
        name: 'Amelia Aaron Blackwell',
        latestWeek: '2026-W40',
        latestTier: 'Bronze',
        latestScore: 60,
        previousScore: 70,
      },
    ]);
  });

  it('keeps a driver with no score in the weeks, and drops one who is not on file', () => {
    const rows = watchRows(made(), ALL, [C, NOT_ON_FILE, C]);
    expect(rows).toEqual([
      {
        transporterId: C,
        name: 'Carmen Josie Rutherford',
        latestWeek: null,
        latestTier: null,
        latestScore: null,
        previousScore: null,
      },
    ]);
  });
});

describe('the Dashboard with extras asked for', () => {
  it('carries the own tiles and the watch list only when they are asked for', () => {
    const data = made();
    const plain = dashboardView(data, ALL, DEFAULT_PERFORMANCE, '2026-10-11');
    expect(plain.custom).toBeUndefined();
    expect(plain.watch).toBeUndefined();
    const more = dashboardView(data, ALL, DEFAULT_PERFORMANCE, '2026-10-11', {
      custom: [{ id: 'custom-1', number: 'overall', how: 'average', limit: 0 }],
      watch: [A],
    });
    expect(more.custom![0]!.value).toBe(79);
    expect(more.watch![0]!.name).toBe('Amelia Aaron Blackwell');
    // The usual numbers are the same either way.
    expect({ ...more, custom: undefined, watch: undefined }).toEqual(plain);
  });
});
