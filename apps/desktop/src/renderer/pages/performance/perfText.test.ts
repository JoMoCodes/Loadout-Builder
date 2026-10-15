import { describe, expect, it } from 'vitest';
import {
  changesWords,
  checkFileWords,
  effectiveRange,
  emailWords,
  explainWords,
  generateWords,
  importWords,
  lostByWeek,
  lostChartLabel,
  missingWeeksWords,
  pointsText,
  progressWords,
  quickPickOf,
  quickRange,
  passesFilters,
  readFilters,
  syncWords,
  tierTone,
  writeFilters,
} from './perfText';
import type { PerfDriverRow } from '../../../shared/performance';

const WEEKS = ['2026-W31', '2026-W32', '2026-W33', '2026-W34', '2026-W35'];

describe('the week range', () => {
  it('uses every week when nothing is remembered, and falls back for a week no longer held', () => {
    expect(effectiveRange(WEEKS, { from: null, to: null })).toEqual({
      from: '2026-W31',
      to: '2026-W35',
    });
    expect(effectiveRange(WEEKS, { from: '2025-W01', to: '2026-W33' })).toEqual({
      from: '2026-W31',
      to: '2026-W33',
    });
    expect(effectiveRange([], { from: null, to: null })).toBeNull();
  });

  it('turns quick picks into ranges and back', () => {
    expect(quickRange(WEEKS, 1)).toEqual({ from: '2026-W35', to: '2026-W35' });
    expect(quickRange(WEEKS, 4)).toEqual({ from: '2026-W32', to: '2026-W35' });
    expect(quickRange(WEEKS, null)).toEqual({ from: null, to: null });
    expect(quickPickOf(WEEKS, { from: '2026-W32', to: '2026-W35' })).toBe('last-4');
    expect(quickPickOf(WEEKS, { from: '2026-W31', to: '2026-W35' })).toBe('all');
    expect(quickPickOf(WEEKS, { from: '2026-W31', to: '2026-W33' })).toBeNull();
  });
});

describe('the filter chips', () => {
  it('reads and writes the remembered chips; the activity chip always starts on In latest scorecard', () => {
    expect(readFilters(['status:ACTIVE', 'activity:none'])).toEqual({
      status: 'ACTIVE',
      tiers: [],
      activity: 'in-range',
    });
    const filters = { status: 'ALL', tiers: ['Gold', 'Bronze'], activity: 'in-range' };
    expect(writeFilters(filters)).toEqual(['tier:Gold', 'tier:Bronze']);
    expect(readFilters(writeFilters(filters))).toEqual(filters);
    // "Everyone" and "No scorecard" are this visit's only: nothing about them is remembered.
    expect(writeFilters({ ...filters, activity: 'all' })).toEqual(['tier:Gold', 'tier:Bronze']);
    expect(writeFilters({ ...filters, activity: 'none' })).toEqual(['tier:Gold', 'tier:Bronze']);
  });

  it('In latest scorecard keeps only the drivers on the newest scorecard; No scorecard the rest', () => {
    const row = (parts: { activeInRange: boolean; inLatestWeek: boolean }) =>
      ({ status: 'ACTIVE', latestTier: 'Gold', ...parts }) as PerfDriverRow;
    const onNewest = row({ activeInRange: true, inLatestWeek: true });
    const olderWeek = row({ activeInRange: true, inLatestWeek: false });
    const none = row({ activeInRange: false, inLatestWeek: false });
    const chip = (activity: string) => ({ status: 'ALL', tiers: [], activity });
    expect([onNewest, olderWeek, none].map((r) => passesFilters(r, chip('in-range')))).toEqual([
      true,
      false,
      false,
    ]);
    expect([onNewest, olderWeek, none].map((r) => passesFilters(r, chip('none')))).toEqual([
      false,
      false,
      true,
    ]);
    expect([onNewest, olderWeek, none].map((r) => passesFilters(r, chip('all')))).toEqual([
      true,
      true,
      true,
    ]);
  });
});

describe('the words', () => {
  it('says what an import did', () => {
    expect(
      importWords({
        kind: 'scorecards',
        filesRead: 10,
        rows: 647,
        driversAdded: 16,
        weeks: ['2026-W40', '2026-W31'],
        problems: [],
      }),
    ).toBe('Brought in 10 files: 647 rows, 16 new drivers, weeks 2026-W31 to 2026-W40.');
    expect(
      importWords({
        kind: 'dsb',
        filesRead: 0,
        rows: 0,
        driversAdded: 0,
        weeks: [],
        problems: [],
      }),
    ).toBe('Nothing new to bring in for the delivery concessions files.');
  });

  it('says what the check file holds', () => {
    expect(checkFileWords({ fileName: 'check.csv', drivers: 3, weeks: 10, rows: 30 })).toBe(
      'Saved the check file "check.csv": 3 drivers, 10 weeks, 30 rows.',
    );
  });

  it('gives each tier its own colour, and the word is always on the chip', () => {
    expect(['Platinum', 'Gold', 'Silver', 'Bronze', null].map(tierTone)).toEqual([
      'info',
      'warn',
      'neutral',
      'bad',
      'neutral',
    ]);
  });

  it('says what a sync did', () => {
    const base = { at: '2026-10-11T09:05:00Z', missingFolders: [], problems: [] };
    expect(syncWords({ ...base, newFiles: 3, rows: 120, weeksUpdated: 2 })).toBe(
      '3 new files, 120 rows, 2 weeks updated.',
    );
    expect(syncWords({ ...base, newFiles: 0, rows: 0, weeksUpdated: 0 })).toBe(
      'Everything is already up to date.',
    );
    expect(
      syncWords({
        ...base,
        newFiles: 1,
        rows: 4,
        weeksUpdated: 1,
        problems: ['Customer feedback (CDF): a.csv could not be read.'],
      }),
    ).toBe('1 new file, 4 rows, 1 week updated. 1 problem found.');
  });

  it('says what emailing did', () => {
    const one = { transporterId: 'A02V4L9HIELIDL', name: 'Archer Gresham' };
    expect(
      emailWords({
        dryRun: false,
        sent: 12,
        notSent: [{ ...one, reason: 'no address on file' }],
        wouldSend: [],
      }),
    ).toBe('Sent 12, could not send 1: no address on file.');
  });

  it('says what making reports did', () => {
    expect(
      generateWords({
        status: 'written',
        folderName: 'Reports',
        written: 4,
        failed: 0,
        skipped: 0,
      }),
    ).toBe('Made 4 reports in the folder "Reports".');
    expect(
      generateWords({
        status: 'written',
        folderName: 'Reports',
        written: 12,
        failed: 0,
        skipped: 2,
      }),
    ).toBe(
      'Made 12 reports in the folder "Reports". 2 drivers had no scores in these weeks, so no report was made.',
    );
    expect(
      generateWords({
        status: 'written',
        folderName: 'Reports',
        written: 3,
        failed: 1,
        skipped: 1,
      }),
    ).toBe(
      'Made 3 reports in the folder "Reports". 1 driver had no scores in these weeks, so no report was made. 1 report could not be made.',
    );
    expect(generateWords({ status: 'cancelled' })).toBe('');
  });

  it('warns about missing weeks and says what changed', () => {
    expect(missingWeeksWords('dsb', ['2026-W33'])).toBe('No DSB file for 2026-W33.');
    expect(missingWeeksWords('dsb', WEEKS)).toBe(
      'No DSB file for 2026-W31, 2026-W32, 2026-W33 and 2 more weeks.',
    );
    expect(
      changesWords({
        newestWeek: '2026-W40',
        previousWeek: '2026-W39',
        tierUp: 3,
        tierDown: 2,
        newSafetyEvents: 1,
      }),
    ).toBe(
      '2026-W40 compared with 2026-W39: 3 drivers moved up a tier, 2 moved down, 1 new safety event.',
    );
  });
});

describe('explain this score', () => {
  const item = (metric: string, score: number, weight: number) => ({
    metric,
    metricDisplay: metric,
    value: null,
    tier: null,
    score,
    weight,
    counted: true,
    earned: (score * weight) / 100,
    lost: ((100 - score) * weight) / 100,
  });
  const base = {
    transporterId: 'A02V4L9HIELIDL',
    name: 'Archer Gresham',
    week: '2026-W40',
    overallScore: 93.58,
    overallTier: 'Gold',
    totalWeight: 100,
    totalEarned: 93.6,
    totalLost: 6.4,
  };

  it('says which metric lost the most, out of the weights', () => {
    const dcr = item('DCR', 36, 10);
    expect(explainWords({ ...base, items: [dcr], topDrag: dcr })).toBe(
      "Each metric's score counts for its weight. DCR lost the most: 6.4 of 100 points.",
    );
    const full = item('POD', 100, 100);
    expect(explainWords({ ...base, items: [full], topDrag: full })).toBe(
      "Each metric's score counts for its weight. Every metric scored 100, so no points were lost.",
    );
    expect(explainWords({ ...base, items: [], topDrag: null })).toContain('none of them counted');
    expect(pointsText(6.3999999)).toBe('6.4');
    expect(pointsText(100)).toBe('100');
  });

  it('splits each week’s points lost into the top metrics and "Other"', () => {
    const week = (name: string, items: ReturnType<typeof item>[]) => ({
      ...base,
      week: name,
      items,
      topDrag: items[0] ?? null,
      totalLost: items.reduce((sum, one) => sum + one.lost, 0),
    });
    const weeks = [
      week('2026-W39', [item('DCR', 50, 10), item('POD', 90, 10), item('CDF', 80, 10)]),
      week('2026-W40', [item('DCR', 0, 10), item('FICO', 50, 2), item('CED', 50, 1)]),
    ];
    const chart = lostByWeek(weeks, 2);
    // DCR 15, CDF 2, POD 1, FICO 1, CED 0.5: the top two, then the rest as Other.
    expect(chart.series).toEqual(['DCR', 'CDF', 'Other']);
    expect(chart.rows.map((r) => r.parts)).toEqual([
      [5, 2, 1],
      [10, 0, 1.5],
    ]);
    expect(chart.rows.map((r) => r.total)).toEqual([8, 11.5]);
    expect(lostChartLabel(chart)).toBe(
      'Points lost each week. 2026-W39: 8 points lost (DCR 5, CDF 2, Other 1). ' +
        '2026-W40: 11.5 points lost (DCR 10, Other 1.5).',
    );
    // With few enough metrics there is no Other.
    expect(lostByWeek(weeks, 5).series).toEqual(['DCR', 'CDF', 'POD', 'FICO', 'CED']);
    expect(lostChartLabel({ series: [], rows: [] })).toBe('No weeks to show.');
  });
});

describe('counting up', () => {
  it('names the report or email being worked on, then says it is finishing', () => {
    expect(progressWords({ job: 'generate', done: 2, total: 12 })).toBe('Making report 3 of 12...');
    expect(progressWords({ job: 'email', done: 0, total: 12 })).toBe('Emailing 1 of 12...');
    expect(progressWords({ job: 'email', done: 12, total: 12 })).toBe('Finishing the emails...');
  });
});
