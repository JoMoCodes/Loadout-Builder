// The windows of Import Route Data, one question each:
//
//   1. "What file do you want to import for Route Data?" Routes sits up front, as the usual
//      pick on the day. "Use a different file" shows the others, grouped by when they are used:
//      Itineraries (today), Week-##-Schedule (tomorrow's preview, works for today too) and
//      Dispatch (In Development, can't be picked yet).
//   2. "Do you want to import DWP Data?"
//
// Each kind of file has its own box: drop the file on it, or press Choose for the file window.
// Route Sheets uses the first window too, for a route file just for the route sheets.

import { CircleCheck } from 'lucide-react';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { DropPage } from '../../../shared/channels/files';
import type { RouteKindName } from '../../../shared/channels/routeData';
import { FileDrop } from '../../components/FileDrop';
import { Button } from '../../ui/button';
import { Chip } from '../../ui/chip';
import { cn } from '../../ui/cn';

/** What the person picked: a kind of file, and the dropped file's token (none: the file window). */
export interface FilePick<K extends string> {
  kind: K;
  token?: string;
}

/** The kinds of route file, with the words the windows use for them. */
export const ROUTE_FILE_WORDS: Record<RouteKindName, { name: string; about: string }> = {
  routes: { name: 'Routes', about: "Today's routes. The best pick on the day." },
  itineraries: { name: 'Itineraries', about: 'Each route with its stops and times.' },
  schedule: {
    name: 'Week-##-Schedule',
    about: "Mostly for a preview of tomorrow's schedule. Works for today's routes too.",
  },
};

/** A large window with one question in it. Esc is the same as its way out. */
function StepWindow({
  name,
  step,
  title,
  lead,
  onCancel,
  children,
  footer,
}: {
  name: string;
  step?: string;
  title: string;
  lead?: string;
  onCancel: () => void;
  children: ReactNode;
  footer: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const element = ref.current;
    if (element && !element.open) element.showModal();
    return () => {
      if (element?.open) element.close();
    };
  }, []);
  return (
    <dialog
      ref={ref}
      aria-label={title}
      data-dialog={name}
      onCancel={(event) => {
        event.preventDefault();
        onCancel();
      }}
      className={cn(
        'm-auto max-h-[90vh] w-[min(52rem,calc(100vw-2rem))] flex-col open:flex',
        'rounded-lg border border-line bg-raised p-0 text-fg shadow-popover backdrop:bg-black/50',
      )}
    >
      <div className="flex min-h-0 flex-1 flex-col items-center gap-4 overflow-y-auto px-6 pt-6 pb-4 text-center">
        {step ? (
          <p className="m-0 text-xs font-semibold tracking-wider text-muted uppercase">{step}</p>
        ) : null}
        <h2 className="m-0 text-xl font-semibold text-balance">{title}</h2>
        {lead ? <p className="m-0 max-w-prose text-sm text-muted">{lead}</p> : null}
        {children}
      </div>
      <div className="flex flex-wrap items-center justify-center gap-2 border-t border-line px-6 py-3">
        {footer}
      </div>
    </dialog>
  );
}

/** One kind of file's box: drop the file on it, or press Choose. */
function FileBox({
  page,
  kind,
  name,
  about,
  big,
  recommended,
  chooseLabel = 'Choose',
  onPick,
  onProblem,
}: {
  page: DropPage;
  kind: RouteKindName | 'dwp';
  name: string;
  about?: string;
  big?: boolean;
  recommended?: boolean;
  chooseLabel?: string;
  onPick: (token?: string) => void;
  onProblem: (words: string) => void;
}) {
  return (
    <FileDrop
      page={page}
      kind={kind}
      inDialog
      onDropped={(token) => onPick(token)}
      onProblem={onProblem}
      className={cn(
        'relative flex flex-col items-center gap-1.5 rounded-lg border-2 border-dashed p-4 text-center',
        recommended ? 'border-accent' : 'border-line-strong',
        big ? 'w-full max-w-xl py-7' : 'min-w-0',
      )}
    >
      <p className={cn('m-0 font-semibold', big && 'text-lg')}>{name}</p>
      {recommended ? <Chip tone="info">Best for today</Chip> : null}
      {about ? <p className="m-0 text-sm text-muted">{about}</p> : null}
      <p className="m-0 text-sm text-muted">Drop it here, or</p>
      <Button
        variant="primary"
        size={big ? 'md' : 'sm'}
        onClick={() => onPick()}
        data-testid={`choose-${kind}`}
      >
        {chooseLabel}
      </Button>
    </FileDrop>
  );
}

/** A group of boxes under a small heading ("For today"). */
function Group({ label, note, children }: { label: string; note?: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5 text-left">
      <p className="m-0 text-xs font-semibold tracking-wider text-muted uppercase">{label}</p>
      <div className="grid grid-cols-[repeat(auto-fit,minmax(12rem,1fr))] gap-2">{children}</div>
      {note ? <p className="m-0 text-xs text-muted">{note}</p> : null}
    </div>
  );
}

interface RouteFileWindowProps {
  /** The page the boxes take drops for ("load-out" or "route-sheets"). */
  page: DropPage;
  /** "Step 1 of 2", when this is one of several questions. */
  step?: string;
  title?: string;
  lead?: string;
  onDone: (pick: FilePick<RouteKindName> | null) => void;
  /** A dropped file was refused: plain words to show. */
  onProblem: (words: string) => void;
  /** "Skip to DWP Data": go straight to the DWP question. Left out, there is no such button. */
  onSkip?: () => void;
}

/** "What file do you want to import for Route Data?", with Routes up front. */
export function RouteFileWindow({
  page,
  step,
  title = 'What file do you want to import for Route Data?',
  lead,
  onDone,
  onProblem,
  onSkip,
}: RouteFileWindowProps) {
  const [others, setOthers] = useState(false);
  const box = (kind: RouteKindName, big = false) => (
    <FileBox
      page={page}
      kind={kind}
      name={ROUTE_FILE_WORDS[kind].name}
      about={ROUTE_FILE_WORDS[kind].about}
      big={big}
      recommended={kind === 'routes'}
      chooseLabel={big ? `Choose ${ROUTE_FILE_WORDS[kind].name} file` : 'Choose'}
      onPick={(token) => onDone({ kind, token })}
      onProblem={onProblem}
    />
  );
  return (
    <StepWindow
      name="import-route-data"
      step={step}
      title={title}
      lead={lead}
      onCancel={() => onDone(null)}
      footer={
        <>
          <Button onClick={() => onDone(null)} data-action="cancel">
            Cancel
          </Button>
          {onSkip ? (
            <Button onClick={onSkip} data-testid="skip-to-dwp">
              Skip to DWP Data
            </Button>
          ) : null}
        </>
      }
    >
      {box('routes', true)}
      <Button
        variant="ghost"
        onClick={() => setOthers((open) => !open)}
        aria-expanded={others}
        data-testid="other-route-files"
      >
        {others ? 'Hide other files' : 'Use a different file'}
      </Button>
      {others ? (
        <div className="flex w-full flex-col gap-4" data-testid="other-route-file-boxes">
          <Group label="For today">{box('itineraries')}</Group>
          <Group label="For tomorrow's preview" note="Can be used for today too.">
            {box('schedule')}
          </Group>
          <Group label="Coming later">
            <div
              className="flex flex-col items-center gap-1.5 rounded-lg border-2 border-dashed border-line bg-sunken p-4 text-center"
              data-testid="dispatch-box"
            >
              <p className="m-0 font-semibold text-muted">Dispatch</p>
              <Chip tone="neutral">In Development</Chip>
              <p className="m-0 text-sm text-muted">
                Can&apos;t be picked yet. Coming in a later update.
              </p>
            </div>
          </Group>
        </div>
      ) : null}
    </StepWindow>
  );
}

interface DwpWindowProps {
  /** "Step 2 of 2", after a route file; left out when the DWP sheet is brought in by itself. */
  step?: string;
  /** What came in at step 1, said at the top ("Routes is in"). */
  broughtIn?: string;
  onDone: (pick: FilePick<'dwp'> | null) => void;
  onProblem: (words: string) => void;
}

/** "Do you want to import DWP Data?": the DWP box, or Not today. */
export function DwpWindow({ step, broughtIn, onDone, onProblem }: DwpWindowProps) {
  return (
    <StepWindow
      name="import-dwp"
      step={step}
      title="Do you want to import DWP Data?"
      lead="The DWP sheet fills in staging, bags and OVS on the Roster."
      onCancel={() => onDone(null)}
      footer={
        <Button onClick={() => onDone(null)} data-action="cancel" data-testid="dwp-not-today">
          Not today
        </Button>
      }
    >
      {broughtIn ? (
        <p className="m-0 flex items-center gap-1.5 text-sm text-ok" data-testid="route-file-in">
          <CircleCheck aria-hidden="true" className="size-4" />
          {broughtIn}
        </p>
      ) : null}
      <FileBox
        page="load-out"
        kind="dwp"
        name="DWP Data"
        big
        chooseLabel="Choose DWP file"
        onPick={(token) => onDone({ kind: 'dwp', token })}
        onProblem={onProblem}
      />
    </StepWindow>
  );
}
