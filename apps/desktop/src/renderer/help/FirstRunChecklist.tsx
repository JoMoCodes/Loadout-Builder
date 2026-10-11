// The first-day checklist on the right of Home. Five steps that tick themselves off as the app
// sees them done, a button on each that does the step, and a "?" that says where to get the file.
// It hides itself once every step is done; How to use can bring it back.

import { FlaskConical } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useAppSnapshot } from '../lib/useAppSnapshot';
import type { PageProps } from '../pages/types';
import { ChecklistCard, type CardStep } from './ChecklistCard';
import {
  STEP_ORDER,
  allDone,
  checklistFacts,
  stepAction,
  stepsDone,
  type StepAction,
  type StepId,
} from './checklist';
import { runStepAction } from './stepActions';
import { WhereToGetDialog } from './whereToGet';

const STEP_WORDS: Record<StepId, { title: string; why: string }> = {
  drivers: {
    title: 'Bring in your driver list',
    why: 'So the app knows who can drive which kind of van.',
  },
  vans: {
    title: 'Bring in your vans',
    why: 'So the app knows which vans you have to give out.',
  },
  sheet: {
    title: "Bring in today's load-out sheet",
    why: 'This is the list of who is working today.',
  },
  'route-data': {
    title: 'Bring over route data',
    why: 'Adds wave times, PADs and route codes to the roster.',
  },
  'assign-print': {
    title: 'Assign vans and print',
    why: 'Gives each driver a van, then makes the sheet you hand out.',
  },
};

const BUTTON_WORDS: Record<StepAction, string> = {
  'import-associates': 'Import driver list',
  'import-vehicles': 'Import vans',
  'import-loadout': 'Import load-out sheet',
  'import-routes': 'Import route data',
  'bring-over': 'Bring over route data',
  'assign-vans': 'Assign vans',
  'open-print': 'Open the Print tab',
};

interface ChecklistProps {
  settings: PageProps['settings'];
  changeSettings: PageProps['changeSettings'];
  goTo: PageProps['goTo'];
  help: PageProps['help'];
  /** Every step is done: Home keeps the "all done" note up until the page is left. */
  onFinished(): void;
}

export function FirstRunChecklist({
  settings,
  changeSettings,
  goTo,
  help,
  onFinished,
}: ChecklistProps) {
  const { snapshot } = useAppSnapshot();
  const [note, setNote] = useState<StepId | null>(null);

  const facts = useMemo(
    () => (snapshot ? checklistFacts(snapshot, help.printed) : null),
    [snapshot, help.printed],
  );
  const done = useMemo(() => (facts ? stepsDone(facts) : null), [facts]);
  const finished = done ? allDone(done) : false;

  // Put the list away once every step is done (once only, even if React draws this twice).
  const told = useRef(false);
  useEffect(() => {
    if (finished && !told.current) {
      told.current = true;
      onFinished();
    }
  }, [finished, onFinished]);

  function doStep(id: StepId) {
    if (!facts) return;
    help.skipNextAutoTour();
    void runStepAction(stepAction(id, facts), goTo);
  }

  const steps: CardStep[] | null =
    facts && done
      ? STEP_ORDER.map((id) => ({
          id,
          ...STEP_WORDS[id],
          done: done[id],
          button: BUTTON_WORDS[stepAction(id, facts)],
          onDo: () => doStep(id),
          onHelp: () => setNote(id),
        }))
      : null;

  return (
    <ChecklistCard
      testId="first-run-checklist"
      partsId="checklist"
      title="Your first day"
      hint="Do these in order. Each one ticks itself off when it is done."
      steps={steps}
      finished={
        <>
          <strong>All five steps are done.</strong> You are ready for a normal day. Open{' '}
          <button type="button" className="link-button" onClick={() => goTo('how-to-use')}>
            How to use
          </button>{' '}
          any time you need help.
        </>
      }
      foot={
        <>
          {settings.demoMode ? null : (
            <button
              type="button"
              className="link-button"
              data-testid="checklist-try-demo"
              onClick={() => void changeSettings({ demoMode: true })}
            >
              <FlaskConical aria-hidden="true" className="inline size-[1em] align-[-0.125em]" /> Try
              it with made-up data
            </button>
          )}
          <button
            type="button"
            className="link-button"
            data-testid="checklist-hide"
            onClick={help.hideChecklist}
          >
            Hide this list
          </button>
        </>
      }
    >
      {note ? <WhereToGetDialog step={note} onClose={() => setNote(null)} /> : null}
    </ChecklistCard>
  );
}
