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
  /** The Performance tab to open (handed over the same way the Dashboard does it). */
  performanceTab?: 'imports' | 'drivers';
  /** The page's own button to press once it is on screen. */
  press?: string;
  /** A part of the page to scroll to once it is on screen. */
  scrollTo?: string;
}

const PERF = '[data-page="performance"]';

export const STEP_TARGETS: Record<StepAction | WeeklyStepAction, Target> = {
  'import-associates': { page: 'associates', press: '[data-testid="import-associates"]' },
  'import-vehicles': { page: 'vehicle-data', press: '[data-testid="import-vehicles"]' },
  'import-loadout': {
    page: 'load-out',
    loadOutTab: 'roster',
    press: '[data-page="load-out"] [data-action="import-sheet"]',
  },
  'import-routes': { page: 'route-data', press: '[data-testid="import-routes"]' },
  'bring-over': {
    page: 'load-out',
    loadOutTab: 'roster',
    press: '[data-page="load-out"] [data-action="bring-over-route-data"]',
  },
  'assign-vans': {
    page: 'load-out',
    loadOutTab: 'roster',
    press: '[data-page="load-out"] [data-action="assign-vans"]',
  },
  'open-print': { page: 'load-out', loadOutTab: 'print' },
  // The weekly checklist.
  'perf-choose-roster': {
    page: 'performance',
    performanceTab: 'imports',
    press: `${PERF} [data-testid="perf-choose-roster"]`,
  },
  'perf-open-imports': { page: 'performance', performanceTab: 'imports' },
  'perf-sync-now': {
    page: 'performance',
    performanceTab: 'imports',
    press: `${PERF} [data-testid="perf-sync-now"]`,
  },
  'perf-choose-scorecards': {
    page: 'performance',
    performanceTab: 'imports',
    press: `${PERF} [data-testid="perf-choose-scorecards"]`,
  },
  'open-dashboard': { page: 'dashboard' },
  'perf-set-up-email': { page: 'settings', scrollTo: '[data-setting="performance"]' },
  'perf-open-drivers': { page: 'performance', performanceTab: 'drivers' },
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
  if (target.performanceTab) handTabToPerformance(target.performanceTab);
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
