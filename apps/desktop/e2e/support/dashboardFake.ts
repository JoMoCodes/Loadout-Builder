// The made-up Dashboard the browser tests drive: the weeks, the numbers, and a way to open the
// page on them. The numbers are worked out by the main process in the app; here they are made
// up. Every name and ID comes from the made-up people in scripts/parity/wpa/expected
// (packages/fixtures).

import { expect, type Page } from '@playwright/test';
import type { DashboardSettings } from '../../src/shared/dashboardLayout';
import type { PerfDashboardView, WeekRange } from '../../src/shared/performance';
import { EMPTY_PERF_SNAPSHOT } from '../../src/shared/performance';
import { DEFAULT_PERFORMANCE } from '../../src/shared/performanceSettings';
import { callsTo, installFakeBridge } from './fakeBridge';

export const WEEKS = [
  '2026-W31',
  '2026-W32',
  '2026-W33',
  '2026-W34',
  '2026-W35',
  '2026-W36',
  '2026-W37',
  '2026-W38',
  '2026-W39',
  '2026-W40',
];

export const TREND: Array<[string, number]> = [
  ['2026-W31', 95.15],
  ['2026-W32', 95.2],
  ['2026-W33', 93.77],
  ['2026-W34', 94.65],
  ['2026-W35', 95.32],
  ['2026-W36', 91.72],
  ['2026-W37', 91.19],
  ['2026-W38', 91.9],
  ['2026-W39', 91.41],
  ['2026-W40', 90.28],
];

function flag(
  transporterId: string,
  name: string,
  latestTier: string,
  latestScore: number,
  severity: 'High' | 'Watch',
  reasons: string[],
  drag: [string, number, number],
) {
  return {
    transporterId,
    name,
    latestWeek: '2026-W40',
    latestTier,
    latestScore,
    reasons,
    severity,
    topDragMetric: drag[0],
    topDragScore: drag[1],
    topDragWeight: drag[2],
    topDragTier: 'Silver',
  };
}

/** A made-up Dashboard for the newest week; the hook below cuts it to the range asked for. */
export const BASE: PerfDashboardView = {
  range: null,
  hasData: true,
  latestWeek: '2026-W40',
  previousWeek: '2026-W39',
  fleetAverage: 90.28,
  fleetAverageBefore: 91.41,
  activeDrivers: 61,
  tiers: [
    { tier: 'Platinum', count: 28 },
    { tier: 'Gold', count: 14 },
    { tier: 'Silver', count: 11 },
    { tier: 'Bronze', count: 8 },
  ],
  tiersBefore: [
    { tier: 'Platinum', count: 31 },
    { tier: 'Gold', count: 13 },
    { tier: 'Silver', count: 10 },
    { tier: 'Bronze', count: 7 },
  ],
  tierMoves: [
    { tier: 'Platinum', into: 1, outOf: 4 },
    { tier: 'Gold', into: 3, outOf: 2 },
    { tier: 'Silver', into: 2, outOf: 1 },
    { tier: 'Bronze', into: 2, outOf: 1 },
  ],
  packagesDelivered: 12480,
  packagesDeliveredBefore: 12168,
  driversWithSafetyEvents: 7,
  // In the order the rules found them, with a Watch among the High ones: the page sorts.
  coaching: [
    flag(
      'A02V4L9HIELIDL',
      'Archer Gresham',
      'Gold',
      93.58,
      'High',
      ['Dropped from Platinum to Gold', 'Score declined 3 weeks running (100.0 -> 93.6)'],
      ['DCR', 39.02, 10.5],
    ),
    flag(
      'A0EPR3KZOJDR3R',
      'Carmen Josie Rutherford',
      'Platinum',
      95.07,
      'Watch',
      ['Score declined 3 weeks running (98.2 -> 95.1)'],
      ['CDF DPMO', 41.55, 7.4],
    ),
    flag(
      'A05QUB9XOW4NT1',
      'Desmond Marisol Penrose',
      'Bronze',
      76.36,
      'High',
      ['Currently Bronze (2026-W40)', 'Dropped from Platinum to Bronze'],
      ['Speeding Event Rate', 0, 11.6],
    ),
    flag(
      'A1VWFCFWNQJ1VP',
      'Cleo Silas Jessup',
      'Platinum',
      97,
      'Watch',
      ['POD: Blurry Photo in 3 consecutive weeks'],
      ['POD', 0, 3],
    ),
    flag(
      'A1E3ZUFIX1EXA5',
      'Amelia Aaron Blackwell',
      'Bronze',
      32.71,
      'High',
      [
        'Currently Bronze (2026-W40)',
        'Score declined 3 weeks running (89.9 -> 32.7)',
        'POD: Package Too Close in 3 consecutive weeks',
      ],
      ['Speeding Event Rate', 0, 11.6],
    ),
  ],
  compliance: [
    {
      transporterId: 'AZWNQ7IBIAKIN',
      name: 'Tabitha Luther Chesterfield',
      status: 'ACTIVE',
      qualifications: 'EDV',
      expiresOn: '2026-10-20',
      daysRemaining: 9,
      severity: 'Expiring soon',
      isAlert: true,
      statusDisplay: 'Expires in 9 day(s)',
    },
    {
      transporterId: 'A5QUGQSG9YPHDA',
      name: 'Cecil Julian Radcliffe',
      status: 'ACTIVE',
      qualifications: 'CDV, EDV',
      expiresOn: '2026-08-22',
      daysRemaining: -49,
      severity: 'Expired',
      isAlert: true,
      statusDisplay: 'Expired 49 day(s) ago',
    },
    {
      transporterId: 'AZ0G28A1GHVQZ',
      name: 'Felicia Wendell Thorne',
      status: 'ACTIVE',
      qualifications: 'EDV',
      expiresOn: '2027-11-27',
      daysRemaining: 412,
      severity: 'OK',
      isAlert: false,
      statusDisplay: 'Valid (412 day(s) left)',
    },
    {
      transporterId: 'A2FR62CAJH6D17',
      name: 'Gabriel Amelia Wakefield',
      status: 'ACTIVE',
      qualifications: 'CDV, EDV',
      expiresOn: '2026-09-19',
      daysRemaining: -21,
      severity: 'Expired',
      isAlert: true,
      statusDisplay: 'Expired 21 day(s) ago',
    },
  ],
  topImproved: [
    {
      transporterId: 'A7BE7C3Y1TNPJS',
      name: 'Luther Flora Vance',
      firstWeek: '2026-W31',
      lastWeek: '2026-W40',
      firstScore: 67.37,
      lastScore: 88,
      delta: 20.63,
    },
    {
      transporterId: 'A2868K9OBI67DE',
      name: 'Fabian Delia Colbrook',
      firstWeek: '2026-W31',
      lastWeek: '2026-W38',
      firstScore: 81.05,
      lastScore: 100,
      delta: 18.95,
    },
  ],
  topDeclined: [
    {
      transporterId: 'A8M3J46P8HG6FK',
      name: 'Emmett Ines Huxley',
      firstWeek: '2026-W34',
      lastWeek: '2026-W40',
      firstScore: 100,
      lastScore: 52.31,
      delta: -47.69,
    },
    {
      transporterId: 'A1E3ZUFIX1EXA5',
      name: 'Amelia Aaron Blackwell',
      firstWeek: '2026-W36',
      lastWeek: '2026-W40',
      firstScore: 78.95,
      lastScore: 32.71,
      delta: -46.24,
    },
  ],
  trend: [],
  categories: [
    {
      source: 'CDF',
      category: 'Delivered to Wrong Address',
      count: 298,
      firstHalf: 120,
      secondHalf: 178,
    },
    { source: 'POD', category: 'No Package Detected', count: 270, firstHalf: 150, secondHalf: 120 },
    { source: 'POD', category: 'Photo Too Dark', count: 270, firstHalf: 135, secondHalf: 135 },
    { source: 'POD', category: 'Package Too Close', count: 265, firstHalf: 100, secondHalf: 165 },
    { source: 'POD', category: 'Human In The Picture', count: 0, firstHalf: 0, secondHalf: 0 },
  ],
  rules: { atRiskDecliningWeeks: 3, recurringCategoryWeeks: 3, complianceWindowDays: 30, topN: 5 },
};

/** Most tests look at the newest week alone; "nothing chosen" (every week) has its own test. */
export const NEWEST_WEEK = { from: '2026-W40', to: '2026-W40' };

export interface Open {
  weekRange?: { from: string | null; to: string | null };
  hasData?: boolean;
  theme?: string;
  /** The Dashboard's layouts and watch list (the usual layout when left out). */
  dashboard?: DashboardSettings | null;
}

export async function openDashboard(
  page: Page,
  { weekRange, hasData = true, theme = 'dark', dashboard }: Open = {},
) {
  await installFakeBridge(page, {
    settings: {
      theme: theme as never,
      performance: { ...DEFAULT_PERFORMANCE, weekRange: weekRange ?? NEWEST_WEEK },
      ...(dashboard !== undefined ? { dashboard: dashboard as DashboardSettings } : {}),
    },
    snapshot: {
      performance: { ...EMPTY_PERF_SNAPSHOT, hasData, weeks: hasData ? WEEKS : [], drivers: 61 },
    },
  });
  // The answer is in place before the page first asks. It follows the range it is asked for:
  // the trend has one point per week, and with one week nobody can move.
  await page.addInitScript(
    ({ base, trend }) => {
      localStorage.setItem('loadout.page', 'dashboard');
      window.__fake!.hooks['performance:dashboard'] = (input) => {
        const asked = input as {
          range: { from: string; to: string } | null;
          custom?: Array<{ id: string; how: string; limit: number }>;
          watch?: string[];
        };
        const range = asked.range;
        const inRange = trend.filter(
          ([week]) => !range || (week >= range.from && week <= range.to),
        );
        const oneWeek = inRange.length < 2;
        return {
          ok: true,
          value: {
            ...base,
            range,
            trend: inRange.map(([week, avg]) => ({ week, avg })),
            topImproved: oneWeek ? [] : base.topImproved,
            topDeclined: oneWeek ? [] : base.topDeclined,
            // A person's own tile: made-up numbers that follow what was asked for.
            ...(asked.custom
              ? {
                  custom: asked.custom.map((spec) => ({
                    id: spec.id,
                    value: spec.how === 'below' || spec.how === 'above' ? spec.limit / 10 : 84.25,
                    before: spec.how === 'below' || spec.how === 'above' ? 4 : 86.5,
                    drivers: 61,
                    series: inRange.map(([week, avg]) => ({ week, value: avg - 6 })),
                  })),
                }
              : {}),
            // The watch list: whoever was asked for, named from the made-up people above.
            ...(asked.watch
              ? {
                  watch: asked.watch.map((id) => {
                    const known = [...base.coaching, ...base.topImproved, ...base.topDeclined].find(
                      (one) => one.transporterId === id,
                    );
                    return {
                      transporterId: id,
                      name: known?.name ?? 'Luther Flora Vance',
                      latestWeek: '2026-W40',
                      latestTier: 'Gold',
                      latestScore: 88,
                      previousScore: 90.5,
                    };
                  }),
                }
              : {}),
          },
        };
      };
    },
    { base: BASE, trend: TREND },
  );
  await page.goto('/');
  await expect(page.locator('[data-page="dashboard"]')).toBeVisible();
}

export const body = (page: Page) => page.getByTestId('dashboard-body');
export const ready = async (page: Page) => {
  await expect(body(page)).toBeVisible();
  await expect(page.locator('[data-page="dashboard"]')).not.toHaveAttribute('aria-busy', 'true');
};
export const lastRange = async (page: Page) => {
  const calls = (await callsTo(page, 'performance:dashboard')) as Array<{ range: WeekRange }>;
  return calls[calls.length - 1]?.range;
};
