import { describe, expect, it } from 'vitest';
import { EMPTY_PERF_SNAPSHOT, type PerfSnapshot } from '../../shared/performance';
import {
  weeklyAllDone,
  weeklyCurrentStep,
  weeklyDoneCount,
  weeklyFacts,
  weeklyStepAction,
  weeklyStepsDone,
} from './weeklySteps';

const brief = (values: Partial<PerfSnapshot> = {}): PerfSnapshot => ({
  ...EMPTY_PERF_SNAPSHOT,
  ...values,
});
// The driver list fact is the Associates list's count, handed in on its own.
const facts = (values: Partial<PerfSnapshot> = {}, dashboardSeen = false, associates = 0) =>
  weeklyFacts(brief(values), dashboardSeen, associates);
const nothing = facts();
const SYNC = {
  at: '2026-10-05T08:00:00Z',
  newFiles: 3,
  rows: 120,
  weeksUpdated: 1,
  missingFolders: [],
  problems: [],
};

describe('the weekly checklist', () => {
  it('starts with nothing ticked, pointing at the driver list', () => {
    const done = weeklyStepsDone(nothing);
    expect(weeklyDoneCount(done)).toBe(0);
    expect(weeklyAllDone(done)).toBe(false);
    expect(weeklyCurrentStep(done)).toBe('perf-roster');
  });

  it('ticks the driver list and the folders once they are there', () => {
    const done = weeklyStepsDone(facts({ foldersChosen: 3 }, false, 61));
    expect(done['perf-roster']).toBe(true);
    expect(done['perf-folders']).toBe(true);
    expect(done['perf-sync']).toBe(false);
    expect(weeklyCurrentStep(done)).toBe('perf-sync');
  });

  it('ticks Sync now after a sync, or once scorecards were brought in by hand', () => {
    expect(weeklyStepsDone(facts({ lastSync: SYNC }))['perf-sync']).toBe(true);
    expect(weeklyStepsDone(facts({ weeks: ['2026-W40'] }))['perf-sync']).toBe(true);
  });

  it('ticks the Dashboard only once it was opened with weeks to show', () => {
    expect(weeklyStepsDone(facts({}, true))['perf-dashboard']).toBe(false);
    expect(weeklyStepsDone(facts({ weeks: ['2026-W40'] }))['perf-dashboard']).toBe(false);
    expect(weeklyStepsDone(facts({ weeks: ['2026-W40'] }, true))['perf-dashboard']).toBe(true);
  });

  it('ticks the reports once they were made, or emailed with email set up', () => {
    const tick = (values: Partial<PerfSnapshot>) => weeklyStepsDone(facts(values))['perf-reports'];
    expect(tick({ emailReady: true })).toBe(false);
    expect(tick({ reportsMade: true })).toBe(true);
    expect(tick({ emailReady: true, reportsEmailed: true })).toBe(true);
    expect(tick({ reportsEmailed: true })).toBe(false);
  });

  it('is all done with every step ticked', () => {
    const done = weeklyStepsDone(
      facts(
        {
          foldersChosen: 10,
          lastSync: SYNC,
          weeks: ['2026-W39', '2026-W40'],
          emailReady: true,
          reportsEmailed: true,
        },
        true,
        61,
      ),
    );
    expect(weeklyDoneCount(done)).toBe(5);
    expect(weeklyAllDone(done)).toBe(true);
    expect(weeklyCurrentStep(done)).toBeNull();
  });
});

describe("what each weekly step's button does", () => {
  it('brings in the driver list and opens the Imports tab for the folders', () => {
    expect(weeklyStepAction('perf-roster', nothing)).toBe('import-associates');
    expect(weeklyStepAction('perf-folders', nothing)).toBe('perf-open-imports');
  });

  it('brings in the scorecards until a folder is chosen, then syncs', () => {
    expect(weeklyStepAction('perf-sync', nothing)).toBe('perf-choose-scorecards');
    expect(weeklyStepAction('perf-sync', { ...nothing, foldersChosen: 2 })).toBe('perf-sync-now');
  });

  it('opens the Dashboard', () => {
    expect(weeklyStepAction('perf-dashboard', nothing)).toBe('open-dashboard');
  });

  it('sets up email first, then opens the Performance tab', () => {
    expect(weeklyStepAction('perf-reports', nothing)).toBe('perf-set-up-email');
    expect(weeklyStepAction('perf-reports', { ...nothing, emailReady: true })).toBe(
      'perf-open-performance',
    );
  });
});
