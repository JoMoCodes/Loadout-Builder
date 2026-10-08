// Puts each dispatch time into a PAD. The mapping is made by hand, never worked out by the app:
// it changes with the day's plan. Ported from the old app's PAD window.

import { PAD_CHOICES } from '@loadout/core';
import { useState } from 'react';
import { Button } from '../../ui/button';
import { ConfirmDialog, Modal } from '../dataPages/Modal';
import { plural } from '../dataPages/format';
import { NO_TIME } from './routeRows';

interface PadDialogProps {
  sourceLabel: string;
  dayLabel: string;
  /** Each distinct dispatch time with how many drivers have it. */
  times: ReadonlyArray<readonly [string, number]>;
  /** The PADs already chosen, by dispatch time. */
  current: ReadonlyMap<string, number>;
  /** The chosen PADs (times left on "None" are left out), or null if closed without saving. */
  onDone: (chosen: Record<string, number> | null) => void;
}

export function PadDialog({ sourceLabel, dayLabel, times, current, onDone }: PadDialogProps) {
  const [chosen, setChosen] = useState<Record<string, number>>(() =>
    Object.fromEntries(times.map(([time]) => [time, current.get(time) ?? 0])),
  );
  const [askingToLeave, setAskingToLeave] = useState(false);

  const missing = times.filter(([time]) => !chosen[time]).map(([time]) => time || NO_TIME);
  const result = () =>
    Object.fromEntries(Object.entries(chosen).filter(([, pad]) => pad)) as Record<string, number>;

  function save() {
    if (missing.length > 0) setAskingToLeave(true);
    else onDone(result());
  }

  return (
    <>
      <Modal
        name="assign-pads"
        title={`Assign PADs - ${sourceLabel}`}
        lead={
          <>
            <strong className="text-fg">
              {plural(times.length, 'dispatch time')} in this export
            </strong>
            <br />
            {sourceLabel} - {dayLabel}. Put each time into a PAD.
          </>
        }
        confirmLabel="Save"
        onConfirm={save}
        onCancel={() => onDone(null)}
        wide
        extraButtons={
          <Button
            type="button"
            data-action="clear-all"
            onClick={() => setChosen(Object.fromEntries(times.map(([time]) => [time, 0])))}
          >
            Clear all
          </Button>
        }
      >
        <div className="flex flex-col gap-2">
          {times.map(([time, count]) => (
            <fieldset
              key={time}
              data-time={time}
              className="m-0 flex flex-wrap items-center gap-x-4 gap-y-1 border-0 p-0"
            >
              <legend className="sr-only">{time || NO_TIME}</legend>
              <span className="w-40 font-semibold">{time || NO_TIME}</span>
              <span className="w-24 text-sm text-muted">{plural(count, 'driver')}</span>
              {[...PAD_CHOICES, 0].map((pad) => (
                <label key={pad} className="flex items-center gap-1.5 text-sm">
                  <input
                    type="radio"
                    name={`pad-${time}`}
                    checked={(chosen[time] ?? 0) === pad}
                    onChange={() => setChosen((now) => ({ ...now, [time]: pad }))}
                    data-testid={`pad-${time || 'none'}-${pad || 'none'}`}
                  />
                  {pad ? `PAD ${pad}` : 'None'}
                </label>
              ))}
            </fieldset>
          ))}
        </div>
      </Modal>
      {askingToLeave ? (
        <ConfirmDialog
          title="Leave times unassigned?"
          body={`No PAD chosen for: ${missing.join(', ')}.\n\nThose drivers stay unassigned until you come back to this. Save anyway?`}
          onDone={(yes) => {
            setAskingToLeave(false);
            if (yes) onDone(result());
          }}
        />
      ) : null}
    </>
  );
}
