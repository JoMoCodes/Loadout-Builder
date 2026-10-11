// The weekly checklist on Home: the five steps of the weekly performance routine, ticking
// themselves off as the app sees them done. Pure functions only, so vitest can check them
// (weeklyChecklist.test.ts). The words people read are in WeeklyChecklist.tsx.

import type { PerfSnapshot } from '../../shared/performance';

export type WeeklyStepId =
  'perf-roster' | 'perf-folders' | 'perf-sync' | 'perf-dashboard' | 'perf-reports';

export const WEEKLY_STEP_ORDER: readonly WeeklyStepId[] = [
  'perf-roster',
  'perf-folders',
  'perf-sync',
  'perf-dashboard',
  'perf-reports',
];

/** What the weekly checklist needs to know (counts and yes/no only, never names). */
export interface WeeklyFacts {
  /** Drivers on the weekly driver list. */
  drivers: number;
  /** Kinds of export with a remembered folder (or file). */
  foldersChosen: number;
  /** The app has looked for new files at least once (Sync now, or when it opened). */
  synced: boolean;
  /** Scorecard weeks brought in. */
  weeks: number;
  /** The Dashboard has been opened (kept on this computer, see weeklyMemory.ts). */
  dashboardSeen: boolean;
  emailReady: boolean;
  reportsMade: boolean;
  reportsEmailed: boolean;
}

export function weeklyFacts(perf: PerfSnapshot, dashboardSeen: boolean): WeeklyFacts {
  return {
    drivers: perf.drivers,
    foldersChosen: perf.foldersChosen,
    synced: perf.lastSync !== null,
    weeks: perf.weeks.length,
    dashboardSeen,
    emailReady: perf.emailReady,
    reportsMade: perf.reportsMade,
    reportsEmailed: perf.reportsEmailed,
  };
}

/** Which steps are done. Each step is judged on its own, so they can tick in any order. */
export function weeklyStepsDone(facts: WeeklyFacts): Record<WeeklyStepId, boolean> {
  return {
    'perf-roster': facts.drivers > 0,
    'perf-folders': facts.foldersChosen > 0,
    // Sync now, or the scorecards brought in by hand: either way there are weeks to look at.
    'perf-sync': facts.synced || facts.weeks > 0,
    // Looking at an empty Dashboard does not count.
    'perf-dashboard': facts.dashboardSeen && facts.weeks > 0,
    'perf-reports': (facts.emailReady && facts.reportsEmailed) || facts.reportsMade,
  };
}

export function weeklyDoneCount(done: Record<WeeklyStepId, boolean>): number {
  return WEEKLY_STEP_ORDER.filter((id) => done[id]).length;
}

export function weeklyAllDone(done: Record<WeeklyStepId, boolean>): boolean {
  return weeklyDoneCount(done) === WEEKLY_STEP_ORDER.length;
}

/** The first step not done yet. Null when all are done. */
export function weeklyCurrentStep(done: Record<WeeklyStepId, boolean>): WeeklyStepId | null {
  return WEEKLY_STEP_ORDER.find((id) => !done[id]) ?? null;
}

/** What a weekly step's button does (stepActions.ts says where each one goes). */
export type WeeklyStepAction =
  | 'perf-choose-roster'
  | 'perf-open-imports'
  | 'perf-sync-now'
  | 'perf-choose-scorecards'
  | 'open-dashboard'
  | 'perf-set-up-email'
  | 'perf-open-drivers';

export function weeklyStepAction(id: WeeklyStepId, facts: WeeklyFacts): WeeklyStepAction {
  switch (id) {
    case 'perf-roster':
      return 'perf-choose-roster';
    case 'perf-folders':
      return 'perf-open-imports';
    case 'perf-sync':
      // Sync now only helps once a folder is remembered; before that, bring the scorecards in.
      return facts.foldersChosen > 0 ? 'perf-sync-now' : 'perf-choose-scorecards';
    case 'perf-dashboard':
      return 'open-dashboard';
    case 'perf-reports':
      // Emailing needs the email set up once, in Settings. After that, the Drivers tab does it.
      return facts.emailReady ? 'perf-open-drivers' : 'perf-set-up-email';
  }
}
