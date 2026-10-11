// Small hand-built cases for the analysis functions: no data, one week, ties, and the .NET
// number formats. Names and IDs are made-up people from packages/fixtures/manifest.json.

import { describe, expect, it } from 'vitest';
import { buildVerificationExport, csvField } from '../export';
import {
  emptyPerfData,
  type DriverRecord,
  type MetricEntry,
  type PerfData,
  type SafetyEventEntry,
  type WeeklyScorecard,
} from '../models';
import { compareNoCase, compareOrdinalIgnoreCase, linqAverage, sqliteAverage } from './dotnet';
import {
  buildDriverGrid,
  buildFleetSummary,
  categoryHitsByDriverWeek,
  categoryRollup,
  computeAverages,
  computeSafetyCounts,
  computeTrends,
  evaluateCoaching,
  evaluateCompliance,
  fillMissingWeeks,
  formatNet,
  formatNetRoundTrip,
  getAllWeeks,
  getAllWithLatest,
  getDriverReport,
  getRanksForDriver,
  getSafetyEventsForDriver,
  getThresholds,
  mostDraggingMetric,
} from './index';

const ARCHER = 'A02V4L9HIELIDL';
const DESMOND = 'A05QUB9XOW4NT1';
const CARMEN = 'A0EPR3KZOJDR3R';

function driver(
  transporterId: string,
  name: string,
  extra: Partial<DriverRecord> = {},
): DriverRecord {
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
    ...extra,
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
    sourceFile: `scorecard_${week}.csv`,
  };
}

function data(parts: Partial<PerfData>): PerfData {
  return { ...emptyPerfData(), ...parts };
}

describe('no data at all', () => {
  const empty = emptyPerfData();

  it('gives empty results, not errors', () => {
    expect(getAllWeeks(empty)).toEqual([]);
    expect(getAllWithLatest(empty)).toEqual([]);
    expect(getThresholds(empty)).toEqual([]);
    expect(computeAverages(empty, '2026-W31', '2026-W40')).toEqual({});
    expect(computeSafetyCounts(empty, '2026-W31', '2026-W40')).toEqual({});
    expect(computeTrends(empty, '2026-W31', '2026-W40')).toEqual({});
    expect(categoryRollup(empty, '2026-W31', '2026-W40')).toEqual([]);
    expect(categoryHitsByDriverWeek(empty, '2026-W31', '2026-W40')).toEqual({});
    expect(evaluateCoaching(empty, '2026-W31', '2026-W40')).toEqual([]);
    expect(evaluateCompliance([], 30, '2026-10-10')).toEqual([]);
    expect(getDriverReport(empty, ARCHER, '2026-W31', '2026-W40')).toBeNull();
    expect(buildDriverGrid(empty, '2026-W31', '2026-W40')).toEqual([]);
  });

  it('gives a fleet summary that says it has no data', () => {
    expect(buildFleetSummary(empty, '2026-W31', '2026-W40', 5)).toEqual({
      fromWeek: '2026-W31',
      toWeek: '2026-W40',
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
    });
  });

  it('writes just the header row in the verification file', () => {
    const result = buildVerificationExport(empty, [ARCHER]);
    expect(result.rowsWritten).toBe(0);
    expect(result.csv.startsWith('﻿Source File,Transporter ID,Delivery Associate,Week,')).toBe(
      true,
    );
    expect(result.csv.endsWith('PSB Weight Applied\r\n')).toBe(true);
  });
});

describe('a driver with one week', () => {
  const one = data({
    drivers: [driver(ARCHER, 'Archer Gresham')],
    scorecards: [card(ARCHER, '2026-W31', 98.39, 'Platinum', 771)],
  });

  it('has averages from that week and a flat trend with no change', () => {
    expect(computeAverages(one, '2026-W31', '2026-W40')).toEqual({
      [ARCHER]: {
        score: 98.39,
        rank: 1,
        packages: 771,
        cdf: null,
        dsb: null,
        dcr: null,
        pod: null,
        psb: null,
        ced: null,
      },
    });
    expect(computeTrends(one, '2026-W31', '2026-W40')).toEqual({
      [ARCHER]: { scoreDelta: null, tierDelta: null, slope: null, trendDirection: 'Flat' },
    });
  });

  it('is not a mover and is not flagged for a Platinum week', () => {
    const summary = buildFleetSummary(one, '2026-W31', '2026-W40', 5);
    expect(summary.topImproved).toEqual([]);
    expect(summary.activeDrivers).toBe(1);
    expect(summary.latestFleetAvg).toBe(98.39);
    expect(evaluateCoaching(one, '2026-W31', '2026-W40')).toEqual([]);
  });

  it('shows rank 1 of 1 in the grid', () => {
    const [row] = buildDriverGrid(one, '2026-W31', '2026-W31');
    expect(row).toMatchObject({
      latestRank: 1,
      latestRankTotal: 1,
      latestRankDisplay: '1 / 1',
      avgScoreDisplay: '98.4',
      avgPackagesDisplay: '771',
      scoreDeltaDisplay: '-',
      safetyTotalDisplay: '',
    });
  });

  it('leaves the range columns empty for a back-to-front range', () => {
    const [row] = buildDriverGrid(one, '2026-W40', '2026-W31');
    expect(row?.avgScore).toBeNull();
    expect(row?.avgScoreDisplay).toBe('-');
  });
});

describe('ties in rank', () => {
  // Same score: more packages first; same packages too: Transporter ID order.
  const tied = data({
    drivers: [
      driver(CARMEN, 'Carmen Josie Rutherford'),
      driver(DESMOND, 'Desmond Marisol Penrose'),
      driver(ARCHER, 'Archer Gresham'),
    ],
    scorecards: [
      card(CARMEN, '2026-W31', 95, 'Gold', 100),
      card(DESMOND, '2026-W31', 95, 'Gold', 100),
      card(ARCHER, '2026-W31', 95, 'Gold', 120),
      card(ARCHER, '2026-W32', 90, 'Gold', null),
      card(DESMOND, '2026-W32', 90, 'Gold', 0),
      card(CARMEN, '2026-W32', null, null, 500),
    ],
  });

  it('breaks a tie on packages, then on Transporter ID; no score means no rank', () => {
    expect(getRanksForDriver(tied, ARCHER, ['2026-W31', '2026-W32'])).toEqual({
      '2026-W31': { rank: 1, total: 3 },
      '2026-W32': { rank: 1, total: 2 },
    });
    // Desmond's ID sorts before Carmen's ("A05..." < "A0E..."), so he wins their tie.
    expect(getRanksForDriver(tied, DESMOND, ['2026-W31', '2026-W32'])).toEqual({
      '2026-W31': { rank: 2, total: 3 },
      '2026-W32': { rank: 2, total: 2 },
    });
    expect(getRanksForDriver(tied, CARMEN, ['2026-W31', '2026-W32'])).toEqual({
      '2026-W31': { rank: 3, total: 3 },
    });
  });

  it('uses the same ranks for the grid and the averages', () => {
    const latest = getAllWithLatest(tied);
    expect(latest.map((d) => [d.name, d.latestRank, d.latestRankTotal])).toEqual([
      ['Archer Gresham', 1, 2],
      ['Carmen Josie Rutherford', null, null],
      ['Desmond Marisol Penrose', 2, 2],
    ]);
    const averages = computeAverages(tied, '2026-W31', '2026-W32');
    expect(averages[ARCHER]?.rank).toBe(1);
    expect(averages[DESMOND]?.rank).toBe(2);
    expect(averages[CARMEN]?.rank).toBe(3);
  });

  it('keeps Transporter ID order for equal movers', () => {
    const movers = data({
      drivers: tied.drivers,
      scorecards: [
        card(DESMOND, '2026-W31', 80),
        card(DESMOND, '2026-W32', 90),
        card(ARCHER, '2026-W31', 70),
        card(ARCHER, '2026-W32', 80),
      ],
    });
    const summary = buildFleetSummary(movers, '2026-W31', '2026-W32', 5);
    expect(
      summary.topImproved.map((m) => [m.transporterId, m.deltaDisplay, m.moveDisplay]),
    ).toEqual([
      [ARCHER, '+10.0', '70.0 -> 80.0'],
      [DESMOND, '+10.0', '80.0 -> 90.0'],
    ]);
  });
});

describe('coaching rules', () => {
  const metric = (
    id: number,
    scorecardId: number,
    metricName: string,
    score: number,
    weight: number,
  ): MetricEntry => ({
    id,
    scorecardId,
    metricName,
    metricValue: '0',
    tier: 'Bronze',
    score,
    weightApplied: weight,
  });

  it('picks the first saved metric when two lose the same points', () => {
    const c = card(ARCHER, '2026-W31', 70, 'Bronze');
    const d = data({
      drivers: [driver(ARCHER, 'Archer Gresham')],
      scorecards: [c],
      metrics: [
        metric(2, c.id, 'Seatbelt-Off Rate', 0, 11.6),
        metric(1, c.id, 'Speeding Event Rate', 0, 11.6),
        metric(3, c.id, 'POD', 50, 3.2),
      ],
    });
    expect(mostDraggingMetric(d, ARCHER, '2026-W31')).toEqual({
      metric: 'Speeding Event Rate',
      score: 0,
      weight: 11.6,
      tier: 'Bronze',
    });
    const [flag] = evaluateCoaching(d, '2026-W31', '2026-W31');
    expect(flag?.reasonsDisplay).toBe('Currently Bronze (2026-W31)');
    expect(flag?.topDragDisplay).toBe('Speeding Event Rate (score 0, weight 11.6)');
  });

  it('follows the settings for the declining run (at least 2)', () => {
    const d = data({
      drivers: [driver(ARCHER, 'Archer Gresham')],
      scorecards: [
        card(ARCHER, '2026-W31', 99, 'Platinum'),
        card(ARCHER, '2026-W32', 98.25, 'Platinum'),
      ],
    });
    expect(evaluateCoaching(d, '2026-W31', '2026-W32')).toEqual([]);
    const [flag] = evaluateCoaching(d, '2026-W31', '2026-W32', {
      atRiskDecliningWeeks: 1,
      recurringCategoryWeeks: 3,
    });
    expect(flag?.reasons).toEqual(['Score declined 2 weeks running (99.0 -> 98.3)']);
    expect(flag?.severity).toBe('Watch');
    expect(flag?.topDragDisplay).toBe('-');
  });
});

describe('safety events', () => {
  const event = (
    id: number,
    week: string,
    programImpact: string | null,
    metricType: string,
    eventDate: string | null,
  ): SafetyEventEntry => ({
    id,
    transporterId: ARCHER,
    week,
    name: 'Archer Gresham',
    eventDate,
    programImpact,
    metricType,
    metricSubtype: null,
    source: 'Netradyne',
    videoLink: null,
    reviewDetails: null,
    sourceFile: null,
  });
  const d = data({
    safetyEvents: [
      event(1, '2026-W31', 'Scorecard', 'Speeding', '2026-07-28'),
      event(2, '2026-W31', ' NONE ', 'Speeding', '2026-07-29'),
      event(3, '2026-W32', '', 'Seatbelt', '2026-08-03'),
      event(4, '2026-W32', 'Scorecard, ORCAS', ' sign signal ', null),
      event(5, '2026-W32', 'Scorecard', 'Hard Braking', '2026-08-04'),
      event(6, '2026-W33', 'Scorecard', 'Speeding', '2026-08-10'),
    ],
  });

  it('counts only events whose Program Impact is not None or blank', () => {
    expect(computeSafetyCounts(d, '2026-W31', '2026-W32')).toEqual({
      [ARCHER]: {
        total: 3,
        speeding: 1,
        signSignal: 1,
        distraction: 0,
        followingDistance: 0,
        seatbelt: 0,
      },
    });
  });

  it('lists them newest first, and narrows by the exact metric type', () => {
    expect(getSafetyEventsForDriver(d, ARCHER, '2026-W31', '2026-W33').map((e) => e.id)).toEqual([
      6, 5, 4, 1,
    ]);
    expect(
      getSafetyEventsForDriver(d, ARCHER, '2026-W31', '2026-W33', 'Speeding').map((e) => e.id),
    ).toEqual([6, 1]);
    expect(getSafetyEventsForDriver(d, ARCHER, '2026-W31', '2026-W33', 'Sign Signal')).toEqual([]);
  });
});

describe('ID expiry', () => {
  it('sorts expired, expiring, valid, then unknown, and words each one', () => {
    const alerts = evaluateCompliance(
      [
        driver(ARCHER, 'Archer Gresham', { idExpiration: '2031-03-24' }),
        driver(DESMOND, 'Desmond Marisol Penrose', { idExpiration: 'soon', status: null }),
        driver(CARMEN, 'Carmen Josie Rutherford', { idExpiration: '10/20/2026' }),
      ],
      30,
      '2026-10-10',
    );
    expect(alerts.map((a) => [a.name, a.severity, a.statusDisplay, a.expiresOnDisplay])).toEqual([
      ['Carmen Josie Rutherford', 'Expiring soon', 'Expires in 10 day(s)', '2026-10-20'],
      ['Archer Gresham', 'OK', 'Valid (1626 day(s) left)', '2031-03-24'],
      ['Desmond Marisol Penrose', 'Unknown', 'Unknown / unparseable', 'soon'],
    ]);
    expect(alerts[2]?.status).toBe('OFFBOARDED');
    expect(alerts[2]?.sortKey).toBe(2147483647);
    expect(alerts.map((a) => a.isAlert)).toEqual([true, false, false]);
  });

  it('counts a date yesterday as expired 1 day ago', () => {
    const [alert] = evaluateCompliance(
      [driver(ARCHER, 'Archer Gresham', { idExpiration: '2026-10-09' })],
      30,
      '2026-10-10',
    );
    expect(alert?.statusDisplay).toBe('Expired 1 day(s) ago');
    expect(alert?.daysRemaining).toBe(-1);
  });
});

describe('report helpers', () => {
  it('fills every week with a real or an empty entry', () => {
    const filled = fillMissingWeeks(
      [{ week: '2026-W32', count: 4 }],
      ['2026-W31', '2026-W32', '2026-W33'],
      (week) => ({ week, count: 0 }),
    );
    expect(filled).toEqual([
      { week: '2026-W31', count: 0 },
      { week: '2026-W32', count: 4 },
      { week: '2026-W33', count: 0 },
    ]);
  });
});

describe('.NET rules', () => {
  it('formats numbers like the old app', () => {
    expect(formatNet(93.58, '0.0')).toBe('93.6');
    expect(formatNet(100, '0.0')).toBe('100.0');
    expect(formatNet(0.05, '0.0')).toBe('0.1');
    expect(formatNet(2.675, '0.00')).toBe('2.68'); // .NET rounds the 15-digit text, half up
    expect(formatNet(1.005, '0.##')).toBe('1.01');
    expect(formatNet(0.03, '0.##')).toBe('0.03');
    expect(formatNet(95, '0.##')).toBe('95');
    expect(formatNet(39.02, '0')).toBe('39');
    expect(formatNet(41.55, '0')).toBe('42');
    expect(formatNet(10.5, '0.#')).toBe('10.5');
    expect(formatNet(11.64, '0.#')).toBe('11.6');
    expect(formatNet(9.96, '0.#')).toBe('10');
    expect(formatNet(-47.69, '0.0')).toBe('-47.7');
    expect(formatNet(0.004, '0.0')).toBe('0.0');
    expect(formatNet(-0.04, '0.0')).toBe('-0.0');
  });

  it('writes numbers the way double.ToString() does', () => {
    expect(formatNetRoundTrip(98.39)).toBe('98.39');
    expect(formatNetRoundTrip(100)).toBe('100');
    expect(formatNetRoundTrip(0.0001)).toBe('0.0001');
    expect(formatNetRoundTrip(0.00001)).toBe('1E-05');
    expect(formatNetRoundTrip(1.5e15)).toBe('1.5E+15');
    expect(formatNetRoundTrip(123456789012345)).toBe('123456789012345');
    expect(formatNetRoundTrip(-2.5)).toBe('-2.5');
  });

  it('compares text like .NET and SQLite', () => {
    expect(compareOrdinalIgnoreCase('archer', 'ARCHER')).toBe(0);
    expect(compareNoCase('archer', 'ARCHER')).toBe(0);
    // "_" sits between upper and lower case letters, so the two rules disagree.
    expect(compareOrdinalIgnoreCase('a_', 'aa')).toBeGreaterThan(0);
    expect(compareNoCase('a_', 'aa')).toBeLessThan(0);
  });

  it('averages like SQLite AVG (corrected sum)', () => {
    expect(sqliteAverage([])).toBeNull();
    // A plain sum gives 0.6000000000000001; SQLite's corrected sum gives 0.6.
    expect(sqliteAverage([0.1, 0.2, 0.3])).toBe(0.6 / 3);
    expect(linqAverage([0.1, 0.2, 0.3])).toBe(0.6000000000000001 / 3);
  });

  it('quotes CSV fields only when the old writer did', () => {
    expect(csvField('Archer Gresham')).toBe('Archer Gresham');
    expect(csvField('Standard Parcel , EDV')).toBe('"Standard Parcel , EDV"');
    expect(csvField(' x')).toBe('" x"');
    expect(csvField('say "hi"')).toBe('"say ""hi"""');
    expect(csvField('')).toBe('');
  });
});
