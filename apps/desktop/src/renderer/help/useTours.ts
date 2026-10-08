// When the page tours run. Each page (and each Load Out tab) runs its tour by itself the first
// time it opens, once per person: the names of the tours that have run are kept in the settings.
// "Take the tour" in the Help menu runs it again at any time.

import { useCallback, useEffect, useRef, useState } from 'react';
import type { AppSettings, SettingsPatch } from '../../shared/settings';
import type { PageId } from '../pages/types';
import { runTour, stepsOnScreen, tourIsRunning } from './tourRunner';
import { TOURS, openLoadOutTab, tourNameFor } from './tours';

interface Options {
  page: PageId;
  settings: AppSettings | null;
  changeSettings(patch: SettingsPatch): Promise<void>;
  /** Something else is in the way (the "What's new" window): wait. */
  blocked: boolean;
}

/** Waits until the page has drawn its controls (most need the saved data first). */
function whenDrawn(name: string, ms: number, done: () => void): () => void {
  const tour = TOURS[name];
  if (!tour) return () => {};
  const until = Date.now() + ms;
  let timer = 0;
  const look = () => {
    const shown = stepsOnScreen(tour.steps).filter((step) => step.element).length;
    const wanted = tour.steps.filter((step) => step.element).length;
    // All of them, or as many as there are once the wait is over.
    if (shown >= wanted || (Date.now() > until && shown > 0)) {
      done();
      return;
    }
    if (Date.now() > until) return;
    timer = window.setTimeout(look, 100);
  };
  timer = window.setTimeout(look, 250);
  return () => window.clearTimeout(timer);
}

export function useTours({ page, settings, changeSettings, blocked }: Options) {
  // Which Load Out tab is open, read from the page so the page itself needs no changes.
  const [loadOutTab, setLoadOutTab] = useState<string | null>(null);
  useEffect(() => {
    const frame = document.getElementById('page-frame');
    if (!frame) return;
    const read = () => setLoadOutTab(openLoadOutTab());
    read();
    const watch = new MutationObserver(read);
    watch.observe(frame, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ['aria-selected'],
    });
    return () => watch.disconnect();
  }, [page]);

  const tourName = tourNameFor(page, page === 'load-out' ? loadOutTab : null);

  // The seen list as it is right now, for marking a tour as seen when it ends.
  const seenRef = useRef<string[]>([]);
  useEffect(() => {
    seenRef.current = settings?.toursSeen ?? [];
  }, [settings]);

  const markSeen = useCallback(
    (name: string) => {
      if (seenRef.current.includes(name)) return;
      const next = [...seenRef.current, name];
      seenRef.current = next;
      void changeSettings({ toursSeen: next });
    },
    [changeSettings],
  );

  const takeTour = useCallback(
    (name?: string) => {
      const chosen = name ?? tourName;
      const tour = chosen ? TOURS[chosen] : undefined;
      if (!tour) return;
      runTour(tour, () => markSeen(tour.name));
    },
    [tourName, markSeen],
  );

  // A page the checklist opened is busy doing the step (a file window, a question): no tour.
  const skipPage = useRef<PageId | null>(null);
  const skipNextAutoTour = useCallback(() => {
    skipPage.current = 'home';
  }, []);
  const lastPage = useRef<PageId>(page);
  useEffect(() => {
    if (lastPage.current !== page) {
      // The page the checklist went to is now open: skip its tour this time only.
      if (skipPage.current === 'home') skipPage.current = page;
      else skipPage.current = null;
      lastPage.current = page;
    }
  }, [page]);

  useEffect(() => {
    if (!settings || blocked || !settings.autoTours || !tourName) return;
    if (settings.toursSeen.includes(tourName)) return;
    if (skipPage.current === page) return;
    return whenDrawn(tourName, 3000, () => {
      // Not over a question the page is asking, and not on top of another tour.
      if (tourIsRunning() || document.querySelector('dialog[open]')) return;
      if (skipPage.current === page) return;
      takeTour(tourName);
    });
  }, [settings, blocked, tourName, page, takeTour]);

  return { tourName, takeTour, skipNextAutoTour };
}
