// What a checklist button does: open the right page (and tab), then press that page's own button.
// Pressing the page's button, rather than doing the import here, means the page asks its usual
// questions (for example before it replaces a roster) and says what happened in its usual place.

import { handTabToPerformance } from '../pages/dashboard/handoff';
import type { PageId } from '../pages/types';
import type { StepAction } from './checklist';
import type { WeeklyStepAction } from './weeklySteps';

interface Target {
  page: PageId;
  /** The Load Out tab to open (the page remembers its tab under this key). */
  loadOutTab?: 'roster' | 'print';
  /** The Scorecards tab to open (handed over the same way the Dashboard does it). */
  scorecardsTab?: 'imports' | 'performance';
  /** The page's own button to press once it is on screen. */
  press?: string;
  /** A part of the page to scroll to once it is on screen. */
  scrollTo?: string;
}

const SCORECARDS = '[data-page="scorecards"]';

export const STEP_TARGETS: Record<StepAction | WeeklyStepAction, Target> = {
  'import-associates': { page: 'associates', press: '[data-testid="import-associates"]' },
  'import-vehicles': { page: 'vehicle-data', press: '[data-testid="import-vehicles"]' },
  'import-loadout': {
    page: 'load-out',
    loadOutTab: 'roster',
    press: '[data-page="load-out"] [data-action="import-sheet"]',
  },
  'import-routes': {
    page: 'load-out',
    loadOutTab: 'roster',
    press: '[data-page="load-out"] [data-action="import-route-data"]',
  },
  'assign-vans': {
    page: 'load-out',
    loadOutTab: 'roster',
    press: '[data-page="load-out"] [data-action="assign-vans"]',
  },
  'open-print': { page: 'load-out', loadOutTab: 'print' },
  'import-route-sheets': {
    page: 'route-sheets',
    press: '[data-page="route-sheets"] [data-testid="route-sheets-bring-in"]',
  },
  'open-route-sheets': { page: 'route-sheets' },
  // The weekly checklist (its driver list step is 'import-associates', above).
  'perf-open-imports': { page: 'scorecards', scorecardsTab: 'imports' },
  'perf-sync-now': {
    page: 'scorecards',
    scorecardsTab: 'imports',
    press: `${SCORECARDS} [data-testid="perf-sync-now"]`,
  },
  'perf-choose-scorecards': {
    page: 'scorecards',
    scorecardsTab: 'imports',
    press: `${SCORECARDS} [data-testid="perf-choose-scorecards"]`,
  },
  'open-dashboard': { page: 'dashboard' },
  'perf-set-up-email': { page: 'settings', scrollTo: '[data-setting="email"]' },
  'perf-open-performance': { page: 'scorecards', scorecardsTab: 'performance' },
};

const LOAD_OUT_TAB_KEY = 'loadout.load-out-tab';

/** Waits for a button to be on screen and ready (up to `ms`), then presses it. */
export function pressWhenReady(selector: string, ms = 4000): Promise<boolean> {
  const until = Date.now() + ms;
  return new Promise((resolve) => {
    const look = () => {
      const button = document.querySelector<HTMLButtonElement>(selector);
      if (button && !button.disabled) {
        button.click();
        resolve(true);
        return;
      }
      if (Date.now() > until) {
        resolve(false);
        return;
      }
      setTimeout(look, 50);
    };
    look();
  });
}

/** Waits for a part of the page to be on screen (up to `ms`), then scrolls it into view. */
function scrollWhenReady(selector: string, ms = 4000): Promise<boolean> {
  const until = Date.now() + ms;
  return new Promise((resolve) => {
    const look = () => {
      const part = document.querySelector<HTMLElement>(selector);
      if (part) {
        part.scrollIntoView({ block: 'start' });
        resolve(true);
        return;
      }
      if (Date.now() > until) {
        resolve(false);
        return;
      }
      setTimeout(look, 50);
    };
    look();
  });
}

/** Opens the page for this step and presses its button. */
export async function runStepAction(
  action: StepAction | WeeklyStepAction,
  goTo: (page: PageId) => void,
) {
  const target = STEP_TARGETS[action];
  if (target.scorecardsTab) handTabToPerformance(target.scorecardsTab);
  if (target.loadOutTab) {
    try {
      localStorage.setItem(LOAD_OUT_TAB_KEY, target.loadOutTab);
    } catch {
      // The page then opens on the tab it was on; the button is still found on the Roster tab.
    }
  }
  goTo(target.page);
  if (target.press) await pressWhenReady(target.press);
  if (target.scrollTo) await scrollWhenReady(target.scrollTo);
}
