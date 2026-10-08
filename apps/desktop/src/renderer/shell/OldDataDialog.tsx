import { useCallback, useEffect, useRef, useState } from 'react';
import { describeCounts, joinWords } from '../../shared/oldData';
import type { OldDataFind, OldDataSource } from '../../shared/oldData';
import { call, explain } from '../lib/channels';
import { Button } from '../ui/button';

interface OldDataDialogProps {
  /** Asked at start-up (saying "Not now" is remembered) or from Settings. */
  how: 'start' | 'settings';
  onClose(): void;
}

type Step =
  | { name: 'looking' }
  | { name: 'offer' }
  | { name: 'not-found' }
  | { name: 'not-empty' }
  | { name: 'demo' }
  | { name: 'working' }
  | { name: 'done'; summary: string }
  | { name: 'problem'; message: string };

/** What to show first, from what the app found. */
export function firstStep(find: OldDataFind): Step {
  if (find.demo) return { name: 'demo' };
  if (!find.empty) return { name: 'not-empty' };
  return find.found ? { name: 'offer' } : { name: 'not-found' };
}

/**
 * "We found your old roster data. Bring it over?" A native dialog, so Tab stays inside it and Esc
 * closes it (the same as Not now). The page never sees where the old file is.
 */
export function OldDataDialog({ how, onClose }: OldDataDialogProps) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [step, setStep] = useState<Step>({ name: 'looking' });

  useEffect(() => {
    const element = dialog.current;
    if (element && !element.open) element.showModal();
  }, []);

  useEffect(() => {
    let cancelled = false;
    void call('migration:find').then((reply) => {
      if (cancelled) return;
      if (reply.ok && reply.value) setStep(firstStep(reply.value));
      else
        setStep({ name: 'problem', message: 'The old data could not be looked for. Try again.' });
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const close = useCallback(() => {
    dialog.current?.close();
  }, []);

  const run = useCallback(async (from: OldDataSource) => {
    setStep({ name: 'working' });
    const reply = await call('migration:run', { from });
    if (!reply.ok) {
      setStep({ name: 'problem', message: explain(reply) });
      return;
    }
    if (reply.value.status === 'skipped') {
      setStep({ name: 'not-empty' });
      return;
    }
    const phrases = describeCounts(reply.value.counts);
    setStep({
      name: 'done',
      summary:
        phrases.length > 0
          ? `Brought over ${joinWords(phrases)}.`
          : 'That file had no roster data in it, so nothing was brought over.',
    });
  }, []);

  const choose = useCallback(async () => {
    const picked = await call('migration:pick');
    if (!picked.ok) {
      setStep({ name: 'problem', message: explain(picked) });
      return;
    }
    if (picked.value.chosen) await run('chosen');
  }, [run]);

  let body;
  let buttons;
  switch (step.name) {
    case 'looking':
      body = <p>Looking for your old roster data...</p>;
      buttons = null;
      break;
    case 'offer':
      body = (
        <>
          <p>
            This copies your drivers, vans and other saved things from the old Loadout Builder into
            this one. The old file is not changed.
          </p>
        </>
      );
      buttons = (
        <>
          <Button
            variant="primary"
            autoFocus
            onClick={() => void run('usual')}
            data-action="old-data-yes"
          >
            Yes
          </Button>
          <Button onClick={close} data-action="old-data-not-now">
            Not now
          </Button>
          <Button onClick={() => void choose()} data-action="old-data-choose">
            Choose a different file
          </Button>
        </>
      );
      break;
    case 'not-found':
      body = (
        <p>
          We could not find your old roster data in its usual place. If you still have the old app,
          choose its data file. It is called <strong>loadout.db</strong>.
        </p>
      );
      buttons = (
        <>
          <Button
            variant="primary"
            autoFocus
            onClick={() => void choose()}
            data-action="old-data-choose"
          >
            Choose the file
          </Button>
          <Button onClick={close} data-action="old-data-close">
            Close
          </Button>
        </>
      );
      break;
    case 'not-empty':
      body = (
        <p>
          This app already has saved data, so nothing was brought over. Old data can only be brought
          into an app that has nothing saved yet. Your saved data was not changed.
        </p>
      );
      buttons = (
        <Button variant="primary" autoFocus onClick={close} data-action="old-data-close">
          Got it
        </Button>
      );
      break;
    case 'demo':
      body = (
        <p>
          Demo mode is on, so this app is showing made-up data. Turn demo mode off first, then bring
          over your old data.
        </p>
      );
      buttons = (
        <Button variant="primary" autoFocus onClick={close} data-action="old-data-close">
          Got it
        </Button>
      );
      break;
    case 'working':
      body = <p role="status">Bringing your data over...</p>;
      buttons = null;
      break;
    case 'done':
      body = (
        <p role="status" data-testid="old-data-summary">
          {step.summary}
        </p>
      );
      buttons = (
        <Button variant="primary" autoFocus onClick={close} data-action="old-data-close">
          Got it
        </Button>
      );
      break;
    case 'problem':
      body = (
        <p role="alert" className="problem">
          {step.message}
        </p>
      );
      buttons = (
        <>
          <Button onClick={() => void choose()} data-action="old-data-choose">
            Choose a different file
          </Button>
          <Button variant="primary" autoFocus onClick={close} data-action="old-data-close">
            Close
          </Button>
        </>
      );
      break;
  }

  return (
    <dialog
      ref={dialog}
      className="whats-new old-data"
      aria-labelledby="old-data-title"
      onClose={onClose}
      data-dialog="old-data"
      data-how={how}
    >
      <h2 id="old-data-title">
        {step.name === 'offer'
          ? 'We found your old roster data. Bring it over?'
          : 'Old roster data'}
      </h2>
      {body}
      {buttons ? <div className="dialog-buttons">{buttons}</div> : null}
    </dialog>
  );
}
