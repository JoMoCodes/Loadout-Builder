// The first-day checklist on the right of Home. Five steps that tick themselves off as the app
// sees them done, a button on each that does the step, and a "?" that says where to get the file.
// It hides itself once every step is done; How to use can bring it back.

import { CircleCheck, CircleHelp, FlaskConical } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useAppSnapshot } from '../lib/useAppSnapshot';
import type { PageProps } from '../pages/types';
import { Button } from '../ui/button';
import { cn } from '../ui/cn';
import {
  STEP_ORDER,
  allDone,
  checklistFacts,
  currentStep,
  doneCount,
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

  if (!facts || !done) {
    return (
      <aside
        className="checklist card"
        aria-label="Your first day"
        data-testid="first-run-checklist"
      >
        <h2>Your first day</h2>
        <p className="hint">Getting the saved data...</p>
      </aside>
    );
  }

  const count = doneCount(done);
  const current = currentStep(done);
  const percent = Math.round((count / STEP_ORDER.length) * 100);

  function doStep(id: StepId) {
    if (!facts) return;
    help.skipNextAutoTour();
    void runStepAction(stepAction(id, facts), goTo);
  }

  return (
    <aside
      className="checklist card"
      aria-labelledby="checklist-title"
      data-testid="first-run-checklist"
      data-done={finished ? 'true' : 'false'}
    >
      <h2 id="checklist-title">Your first day</h2>
      {finished ? (
        <p data-testid="checklist-finished">
          <strong>All five steps are done.</strong> You are ready for a normal day. Open{' '}
          <button type="button" className="link-button" onClick={() => goTo('how-to-use')}>
            How to use
          </button>{' '}
          any time you need help.
        </p>
      ) : (
        <p className="hint">Do these in order. Each one ticks itself off when it is done.</p>
      )}

      <div className="checklist-progress">
        <span data-testid="checklist-count">
          {count} of {STEP_ORDER.length} done
        </span>
        <div
          className="checklist-bar"
          role="progressbar"
          aria-label="Steps done"
          aria-valuemin={0}
          aria-valuemax={STEP_ORDER.length}
          aria-valuenow={count}
          aria-valuetext={`${count} of ${STEP_ORDER.length} steps done`}
        >
          <span style={{ width: `${percent}%` }} />
        </div>
      </div>

      <ol className="checklist-steps">
        {STEP_ORDER.map((id, index) => {
          const isDone = done[id];
          const isCurrent = id === current;
          const words = STEP_WORDS[id];
          return (
            <li
              key={id}
              className={cn('checklist-step', isCurrent && 'is-current', isDone && 'is-done')}
              data-step={id}
              data-step-done={isDone ? 'true' : 'false'}
              data-step-current={isCurrent ? 'true' : 'false'}
            >
              <span className="checklist-mark" aria-hidden="true">
                {isDone ? <CircleCheck /> : <span>{index + 1}</span>}
              </span>
              <div className="checklist-body">
                <div className="checklist-title-row">
                  <span className="checklist-step-title">
                    {words.title}
                    <span className="sr-only">{isDone ? ' (done)' : ' (not done yet)'}</span>
                  </span>
                  <button
                    type="button"
                    className="checklist-help"
                    aria-label={`Help: ${words.title}`}
                    title="Where to get this file"
                    data-step-help={id}
                    onClick={() => setNote(id)}
                  >
                    <CircleHelp aria-hidden="true" />
                  </button>
                </div>
                <p className="checklist-why">{words.why}</p>
                {isDone ? null : (
                  <Button
                    size="sm"
                    variant={isCurrent ? 'primary' : 'default'}
                    data-step-do={id}
                    onClick={() => doStep(id)}
                  >
                    {BUTTON_WORDS[stepAction(id, facts)]}
                  </Button>
                )}
              </div>
            </li>
          );
        })}
      </ol>

      <div className="checklist-foot">
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
      </div>

      {note ? <WhereToGetDialog step={note} onClose={() => setNote(null)} /> : null}
    </aside>
  );
}
