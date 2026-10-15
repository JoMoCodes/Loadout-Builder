// The weekly checklist on Home, under the first-day one: the five steps of the weekly performance
// routine. Same look and behaviour as the first-day list: the steps tick themselves off, each has
// a button that does it and a "?" that says where to get the file, and it hides itself once every
// step is done. How to use and Home can bring it back.

import { useEffect, useMemo, useRef, useState } from 'react';
import { EMPTY_PERF_SNAPSHOT } from '../../shared/performance';
import { useAppSnapshot } from '../lib/useAppSnapshot';
import type { PageProps } from '../pages/types';
import { ChecklistCard, type CardStep } from './ChecklistCard';
import { runStepAction } from './stepActions';
import {
  WEEKLY_STEP_ORDER,
  weeklyAllDone,
  weeklyFacts,
  weeklyStepAction,
  weeklyStepsDone,
  type WeeklyStepAction,
  type WeeklyStepId,
} from './weeklySteps';
import { WhereToGetDialog } from './whereToGet';

const STEP_WORDS: Record<WeeklyStepId, { title: string; why: string }> = {
  'perf-roster': {
    title: 'Bring in the driver list',
    why: 'On Associates. The reports use the same list, so they know every driver and who has an email address.',
  },
  'perf-folders': {
    title: 'Choose the export folders',
    why: 'Tell the app once where you save each kind of weekly file.',
  },
  'perf-sync': {
    title: 'Sync now',
    why: 'Brings in the new week. Or bring in the scorecards by hand.',
  },
  'perf-dashboard': {
    title: 'Look at the Dashboard',
    why: 'See how the drivers are doing, and who needs a word.',
  },
  'perf-reports': {
    title: 'Make and email the reports',
    why: 'One PDF for each driver, emailed to them if you like.',
  },
};

const BUTTON_WORDS: Record<WeeklyStepAction, string> = {
  'import-associates': 'Import driver list',
  'perf-open-imports': 'Open the Imports tab',
  'perf-sync-now': 'Sync now',
  'perf-choose-scorecards': 'Bring in the scorecards',
  'open-dashboard': 'Open the Dashboard',
  'perf-set-up-email': 'Set up email',
  'perf-open-performance': 'Open the Performance tab',
};

interface WeeklyChecklistProps {
  goTo: PageProps['goTo'];
  help: PageProps['help'];
  dashboardSeen: boolean;
  onHide(): void;
  /** Every step is done: Home keeps the "all done" note up until the page is left. */
  onFinished(): void;
}

export function WeeklyChecklist({
  goTo,
  help,
  dashboardSeen,
  onHide,
  onFinished,
}: WeeklyChecklistProps) {
  const { snapshot } = useAppSnapshot();
  const [note, setNote] = useState<WeeklyStepId | null>(null);

  const facts = useMemo(
    () =>
      snapshot
        ? weeklyFacts(
            snapshot.performance ?? EMPTY_PERF_SNAPSHOT,
            dashboardSeen,
            snapshot.counts.associates,
          )
        : null,
    [snapshot, dashboardSeen],
  );
  const done = useMemo(() => (facts ? weeklyStepsDone(facts) : null), [facts]);
  const finished = done ? weeklyAllDone(done) : false;

  // Put the list away once every step is done (once only, even if React draws this twice).
  const told = useRef(false);
  useEffect(() => {
    if (finished && !told.current) {
      told.current = true;
      onFinished();
    }
  }, [finished, onFinished]);

  function doStep(id: WeeklyStepId) {
    if (!facts) return;
    help.skipNextAutoTour();
    void runStepAction(weeklyStepAction(id, facts), goTo);
  }

  const steps: CardStep[] | null =
    facts && done
      ? WEEKLY_STEP_ORDER.map((id) => ({
          id,
          ...STEP_WORDS[id],
          done: done[id],
          button: BUTTON_WORDS[weeklyStepAction(id, facts)],
          onDo: () => doStep(id),
          onHelp: () => setNote(id),
        }))
      : null;

  return (
    <ChecklistCard
      testId="weekly-checklist"
      partsId="weekly-checklist"
      title="Your weekly performance"
      hint="Once a week, after the new scorecards are out. Each step ticks itself off."
      steps={steps}
      finished={
        <>
          <strong>All five steps are done.</strong> That is the whole weekly routine. Open{' '}
          <button type="button" className="link-button" onClick={() => goTo('how-to-use')}>
            How to use
          </button>{' '}
          any time you need help.
        </>
      }
      foot={
        <button
          type="button"
          className="link-button"
          data-testid="weekly-checklist-hide"
          onClick={onHide}
        >
          Hide this list
        </button>
      }
    >
      {note ? <WhereToGetDialog step={note} onClose={() => setNote(null)} /> : null}
    </ChecklistCard>
  );
}
