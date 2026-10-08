// What a checklist button does: open the right page (and tab), then press that page's own button.
// Pressing the page's button, rather than doing the import here, means the page asks its usual
// questions (for example before it replaces a roster) and says what happened in its usual place.

import type { PageId } from '../pages/types';
import type { StepAction } from './checklist';

interface Target {
  page: PageId;
  /** The Load Out tab to open (the page remembers its tab under this key). */
  loadOutTab?: 'roster' | 'print';
  /** The page's own button to press once it is on screen. */
  press?: string;
}

export const STEP_TARGETS: Record<StepAction, Target> = {
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

/** Opens the page for this step and presses its button. */
export async function runStepAction(action: StepAction, goTo: (page: PageId) => void) {
  const target = STEP_TARGETS[action];
  if (target.loadOutTab) {
    try {
      localStorage.setItem(LOAD_OUT_TAB_KEY, target.loadOutTab);
    } catch {
      // The page then opens on the tab it was on; the button is still found on the Roster tab.
    }
  }
  goTo(target.page);
  if (target.press) await pressWhenReady(target.press);
}
