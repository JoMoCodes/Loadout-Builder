// The look of a checklist card on Home: a title, "2 of 5 done" with a bar, the numbered steps
// (each with its reason, a "?" and a button that does it), and a row of links at the foot.
// The first-day checklist and the weekly checklist both use it, so they look and behave the same.

import { CircleCheck, CircleHelp } from 'lucide-react';
import type { ReactNode } from 'react';
import { Button } from '../ui/button';
import { cn } from '../ui/cn';

export interface CardStep {
  id: string;
  title: string;
  why: string;
  done: boolean;
  /** The words on the step's button. */
  button: string;
  onDo(): void;
  onHelp(): void;
}

interface ChecklistCardProps {
  /** Becomes the card's `data-testid`, and the start of its parts' ids ("weekly-checklist"). */
  testId: string;
  /** Start of the count's and the finished note's `data-testid` ("checklist", "weekly-checklist"). */
  partsId: string;
  title: string;
  hint: string;
  steps: CardStep[] | null;
  /** Shown in place of the hint once every step is done. */
  finished: ReactNode;
  foot: ReactNode;
  /** What the "?" says, when it is open. */
  children?: ReactNode;
}

export function ChecklistCard({
  testId,
  partsId,
  title,
  hint,
  steps,
  finished,
  foot,
  children,
}: ChecklistCardProps) {
  const titleId = `${testId}-title`;
  if (!steps) {
    return (
      <aside className="checklist card" aria-label={title} data-testid={testId}>
        <h2>{title}</h2>
        <p className="hint">Getting the saved data...</p>
      </aside>
    );
  }

  const count = steps.filter((step) => step.done).length;
  const allDone = count === steps.length;
  const current = steps.find((step) => !step.done)?.id ?? null;
  const percent = Math.round((count / steps.length) * 100);

  return (
    <aside
      className="checklist card"
      aria-labelledby={titleId}
      data-testid={testId}
      data-done={allDone ? 'true' : 'false'}
    >
      <h2 id={titleId}>{title}</h2>
      {allDone ? (
        <p data-testid={`${partsId}-finished`}>{finished}</p>
      ) : (
        <p className="hint">{hint}</p>
      )}

      <div className="checklist-progress">
        <span data-testid={`${partsId}-count`}>
          {count} of {steps.length} done
        </span>
        <div
          className="checklist-bar"
          role="progressbar"
          aria-label="Steps done"
          aria-valuemin={0}
          aria-valuemax={steps.length}
          aria-valuenow={count}
          aria-valuetext={`${count} of ${steps.length} steps done`}
        >
          <span style={{ width: `${percent}%` }} />
        </div>
      </div>

      <ol className="checklist-steps">
        {steps.map((step, index) => {
          const isCurrent = step.id === current;
          return (
            <li
              key={step.id}
              className={cn('checklist-step', isCurrent && 'is-current', step.done && 'is-done')}
              data-step={step.id}
              data-step-done={step.done ? 'true' : 'false'}
              data-step-current={isCurrent ? 'true' : 'false'}
            >
              <span className="checklist-mark" aria-hidden="true">
                {step.done ? <CircleCheck /> : <span>{index + 1}</span>}
              </span>
              <div className="checklist-body">
                <div className="checklist-title-row">
                  <span className="checklist-step-title">
                    {step.title}
                    <span className="sr-only">{step.done ? ' (done)' : ' (not done yet)'}</span>
                  </span>
                  <button
                    type="button"
                    className="checklist-help"
                    aria-label={`Help: ${step.title}`}
                    title="Where to get this file"
                    data-step-help={step.id}
                    onClick={step.onHelp}
                  >
                    <CircleHelp aria-hidden="true" />
                  </button>
                </div>
                <p className="checklist-why">{step.why}</p>
                {step.done ? null : (
                  <Button
                    size="sm"
                    variant={isCurrent ? 'primary' : 'default'}
                    data-step-do={step.id}
                    onClick={step.onDo}
                  >
                    {step.button}
                  </Button>
                )}
              </div>
            </li>
          );
        })}
      </ol>

      <div className="checklist-foot">{foot}</div>

      {children}
    </aside>
  );
}
