// Two small things the weekly checklist remembers: whether it was put away, and whether the
// Dashboard has been opened. For the real data they are kept in the settings file
// (`weeklyChecklistHidden`, `dashboardSeenOnce`), so they stay after the app closes. In demo mode
// nothing is kept: they last until demo mode is switched off, or the app closes.
//
// Earlier test builds of 2.1.0 kept them in the window's own storage; what was there is carried
// over to the settings file once, then forgotten.

import { useCallback, useEffect, useRef, useState } from 'react';
import type { AppSettings, SettingsPatch } from '../../shared/settings';
import type { PageId } from '../pages/types';

/** Where the test builds kept them (real data only), carried over once. */
const OLD_HIDDEN_KEY = 'loadout.weekly-checklist.hidden.real';
const OLD_DASHBOARD_KEY = 'loadout.weekly-checklist.dashboard-seen.real';

function takeOld(key: string): boolean {
  try {
    const was = window.localStorage.getItem(key) === 'yes';
    window.localStorage.removeItem(key);
    return was;
  } catch {
    return false;
  }
}

export interface WeeklyMemory {
  hidden: boolean;
  dashboardSeen: boolean;
  setHidden(hidden: boolean): void;
}

/** The two flags for the data on screen. Opening the Dashboard notes it as seen. */
export function useWeeklyMemory({
  settings,
  changeSettings,
  page,
}: {
  settings: AppSettings | null;
  changeSettings(patch: SettingsPatch): Promise<void>;
  page: PageId;
}): WeeklyMemory {
  const demo = settings?.demoMode ?? false;
  // Demo mode's own pair, for this run only. A fresh demo run starts them again.
  const [demoRun, setDemoRun] = useState({ demo, hidden: false, seen: false });
  if (demoRun.demo !== demo) setDemoRun({ demo, hidden: false, seen: false });
  // The checklist's "Look at the Dashboard" step, in demo mode.
  if (demo && page === 'dashboard' && settings && !demoRun.seen) {
    setDemoRun({ ...demoRun, seen: true });
  }

  // Carry over what an older build kept in the window's storage, once.
  const carried = useRef(false);
  useEffect(() => {
    if (!settings || carried.current) return;
    carried.current = true;
    const patch: SettingsPatch = {};
    if (takeOld(OLD_HIDDEN_KEY) && !settings.weeklyChecklistHidden) {
      patch.weeklyChecklistHidden = true;
    }
    if (takeOld(OLD_DASHBOARD_KEY) && !settings.dashboardSeenOnce) patch.dashboardSeenOnce = true;
    if (Object.keys(patch).length > 0) void changeSettings(patch);
  }, [settings, changeSettings]);

  // The checklist's "Look at the Dashboard" step, with the real data: kept in the settings file.
  const seenSaved = settings?.dashboardSeenOnce ?? false;
  const ready = settings !== null;
  useEffect(() => {
    if (page === 'dashboard' && ready && !demo && !seenSaved) {
      void changeSettings({ dashboardSeenOnce: true });
    }
  }, [page, demo, seenSaved, ready, changeSettings]);

  const setHidden = useCallback(
    (hidden: boolean) => {
      if (demo) setDemoRun((now) => ({ ...now, hidden }));
      else void changeSettings({ weeklyChecklistHidden: hidden });
    },
    [demo, changeSettings],
  );

  return demo
    ? { hidden: demoRun.hidden, dashboardSeen: demoRun.seen, setHidden }
    : {
        hidden: settings?.weeklyChecklistHidden ?? false,
        dashboardSeen: seenSaved,
        setHidden,
      };
}
