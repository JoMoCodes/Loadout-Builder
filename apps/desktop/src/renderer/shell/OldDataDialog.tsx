import { useCallback, useEffect, useRef, useState } from 'react';
import { describeCounts, joinWords } from '../../shared/oldData';
import type { OldDataCount, OldDataFind, OldDataSource } from '../../shared/oldData';
import { call, explain } from '../lib/channels';
import { Button } from '../ui/button';

interface OldDataDialogProps {
  /** Asked at start-up (saying "Not now" is remembered) or from Settings. */
  how: 'start' | 'settings';
  /** Which old app: the old Loadout Builder (the default) or the old Weekly Performance App. */
  about?: OldApp;
  onClose(): void;
}

export type OldApp = 'roster' | 'performance';

// How each kind of weekly performance row is named to a person. Bookkeeping tables (which files
// were read, which weeks had a PSB file) are left out on purpose: they are not "things".
const PERF_WORDS: ReadonlyArray<readonly [table: string, one: string, many: string]> = [
  ['associates', 'driver', 'drivers'],
  ['perf_weekly_scorecards', 'weekly scorecard', 'weekly scorecards'],
  ['perf_metric_entries', 'metric value', 'metric values'],
  ['perf_metric_thresholds', 'threshold', 'thresholds'],
  ['perf_pod_week_entries', 'week of POD numbers', 'weeks of POD numbers'],
  ['perf_cdf_week_entries', 'week of CDF numbers', 'weeks of CDF numbers'],
  ['perf_dsb_week_entries', 'week of DSB numbers', 'weeks of DSB numbers'],
  ['perf_psb_week_entries', 'week of PSB numbers', 'weeks of PSB numbers'],
  ['perf_dcr_events', 'returned package', 'returned packages'],
  ['perf_dcr_week_totals', 'week of DCR totals', 'weeks of DCR totals'],
  ['perf_safety_events', 'safety event', 'safety events'],
];

/** "650 weekly scorecards, 41 safety events": one phrase per kind that came over. */
export function describePerfCounts(counts: readonly OldDataCount[]): string[] {
  const byTable = new Map(counts.map((count) => [count.table, count.imported]));
  return PERF_WORDS.flatMap(([table, one, many]) => {
    const imported = byTable.get(table) ?? 0;
    return imported > 0 ? [`${imported} ${imported === 1 ? one : many}`] : [];
  });
}

/** The channels and words for each old app. The channels take and answer the same shapes. */
const OLD_APPS = {
  roster: {
    find: 'migration:find',
    pick: 'migration:pick',
    run: 'migration:run',
    dialog: 'old-data',
    looking: 'Looking for your old roster data...',
    offerTitle: 'We found your old roster data. Bring it over?',
    title: 'Old roster data',
    offer:
      'This copies your drivers, vans and other saved things from the old Loadout Builder into this one. The old file is not changed.',
    notFound:
      'We could not find your old roster data in its usual place. If you still have the old app, choose its data file. It is called',
    fileName: 'loadout.db',
    notEmpty:
      'This app already has saved data, so nothing was brought over. Old data can only be brought into an app that has nothing saved yet. Your saved data was not changed.',
    nothing: 'That file had no roster data in it, so nothing was brought over.',
    describe: describeCounts,
  },
  performance: {
    find: 'performance:old-data-find',
    pick: 'performance:old-data-pick',
    run: 'performance:old-data-run',
    dialog: 'perf-old-data',
    looking: 'Looking for your weekly performance data...',
    offerTitle: 'We found your weekly performance data. Bring it over?',
    title: 'Old weekly performance data',
    offer:
      'This copies the weekly scores, safety events, thresholds and the list of files already brought in from the old Weekly Performance App into this one. The old file is not changed.',
    notFound:
      'We could not find your weekly performance data in its usual place. If you still have the old Weekly Performance App, choose its data file. It is called',
    fileName: 'app.db',
    notEmpty:
      'This app already has weekly performance data, so nothing was brought over. Old data can only be brought in while this app has none yet. Your data was not changed.',
    nothing: 'That file had no weekly performance data in it, so nothing was brought over.',
    describe: describePerfCounts,
  },
} as const;

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
export function OldDataDialog({ how, about = 'roster', onClose }: OldDataDialogProps) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [step, setStep] = useState<Step>({ name: 'looking' });
  const app = OLD_APPS[about];
  const titleId = `${app.dialog}-title`;

  useEffect(() => {
    const element = dialog.current;
    if (element && !element.open) element.showModal();
  }, []);

  useEffect(() => {
    let cancelled = false;
    void call(app.find).then((reply) => {
      if (cancelled) return;
      if (reply.ok && reply.value) setStep(firstStep(reply.value));
      else
        setStep({ name: 'problem', message: 'The old data could not be looked for. Try again.' });
    });
    return () => {
      cancelled = true;
    };
  }, [app]);

  const close = useCallback(() => {
    dialog.current?.close();
  }, []);

  const run = useCallback(
    async (from: OldDataSource) => {
      setStep({ name: 'working' });
      const reply = await call(app.run, { from });
      if (!reply.ok) {
        setStep({ name: 'problem', message: explain(reply) });
        return;
      }
      if (reply.value.status === 'skipped') {
        setStep({ name: 'not-empty' });
        return;
      }
      const phrases = app.describe(reply.value.counts);
      setStep({
        name: 'done',
        summary: phrases.length > 0 ? `Brought over ${joinWords(phrases)}.` : app.nothing,
      });
    },
    [app],
  );

  const choose = useCallback(async () => {
    const picked = await call(app.pick);
    if (!picked.ok) {
      setStep({ name: 'problem', message: explain(picked) });
      return;
    }
    if (picked.value.chosen) await run('chosen');
  }, [run, app]);

  let body;
  let buttons;
  switch (step.name) {
    case 'looking':
      body = <p>{app.looking}</p>;
      buttons = null;
      break;
    case 'offer':
      body = <p>{app.offer}</p>;
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
          {app.notFound} <strong>{app.fileName}</strong>.
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
      body = <p>{app.notEmpty}</p>;
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
      aria-labelledby={titleId}
      onClose={onClose}
      data-dialog={app.dialog}
      data-how={how}
    >
      <h2 id={titleId}>{step.name === 'offer' ? app.offerTitle : app.title}</h2>
      {body}
      {buttons ? <div className="dialog-buttons">{buttons}</div> : null}
    </dialog>
  );
}
