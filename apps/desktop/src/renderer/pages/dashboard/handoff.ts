// What the Dashboard hands to the Performance page when it sends the person there: which driver
// to show, or which tab to open. Kept for this run of the window only (sessionStorage), and read
// once by the Performance page, which then removes it.
//
//   loadout.performance.driver  a Transporter ID: open the Drivers tab on this driver's row
//   loadout.performance.tab     a tab id ('imports'): open this tab

export const PERF_DRIVER_KEY = 'loadout.performance.driver';
export const PERF_TAB_KEY = 'loadout.performance.tab';

function put(key: string, value: string): void {
  try {
    window.sessionStorage.setItem(key, value);
  } catch {
    // Storage can be switched off; the page then simply opens as it was.
  }
}

/** Asks the Performance page to show this driver when it opens next. */
export function handDriverToPerformance(transporterId: string): void {
  put(PERF_DRIVER_KEY, transporterId);
  put(PERF_TAB_KEY, 'drivers');
}

/** Asks the Performance page to open this tab when it opens next. */
export function handTabToPerformance(tab: 'imports' | 'drivers'): void {
  put(PERF_TAB_KEY, tab);
}

export interface PerformanceHandoff {
  driver: string | null;
  tab: string | null;
}

/** For the Performance page: what the Dashboard left, without removing it, or nulls. */
export function peekPerformanceHandoff(): PerformanceHandoff {
  try {
    return {
      driver: window.sessionStorage.getItem(PERF_DRIVER_KEY),
      tab: window.sessionStorage.getItem(PERF_TAB_KEY),
    };
  } catch {
    return { driver: null, tab: null };
  }
}

/** Removes what the Dashboard left, once the Performance page has it. */
export function clearPerformanceHandoff(): void {
  try {
    window.sessionStorage.removeItem(PERF_DRIVER_KEY);
    window.sessionStorage.removeItem(PERF_TAB_KEY);
  } catch {
    // Nothing to remove when storage is switched off.
  }
}

/**
 * For the Performance page: takes what the Dashboard left (and removes it), or nulls.
 * Exported here so the key names live in one place. (The page itself peeks first and clears in
 * an effect, so React's double start-up in development does not lose it.)
 */
export function takePerformanceHandoff(): PerformanceHandoff {
  const found = peekPerformanceHandoff();
  clearPerformanceHandoff();
  return found;
}
