// The Sheets tab: a list of every route with a sheet, and beside it exactly the email the driver
// gets, with the ways to send it. Email all, Export all and the Settings button (the emails'
// wording) sit above the list. Ported from the old app's Route Sheets page.

import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import type { RouteResult } from '@loadout/route-sheets';
import type {
  RouteSheetsDistributionView,
  RouteSheetsPreview,
  RouteSheetsStateView,
  SentHow,
} from '../../../shared/routeSheets';
import type { RouteSheetsEmailWording, SettingsPatch } from '../../../shared/settings';
import { call, explain } from '../../lib/channels';
import { Button } from '../../ui/button';
import { Chip } from '../../ui/chip';
import { cn } from '../../ui/cn';
import { command } from '../dataPages/bringIn';
import { ConfirmDialog, MessageDialog } from '../dataPages/Modal';
import type { Messages } from '../dataPages/PageParts';
import type { Asker } from '../dataPages/useDialogs';
import { ButtonStrip } from '../dataPages/PageParts';
import { plural } from '../dataPages/format';
import { EmailWordingDialog, WordingSettingsButton } from '../performance/EmailWordingDialog';
import { PDF_MISSING_WORDS, StateChip, StatusChip } from './parts';
import { emailAllWords, exportWords, sendOneWords, sentWords } from './words';

interface SheetsTabProps {
  state: RouteSheetsStateView;
  dist: RouteSheetsDistributionView;
  revision: number;
  messages: Messages;
  ask: Asker;
  /** The route shown, or null for the page to pick one. */
  picked: string | null;
  onPick: (routeCode: string) => void;
  /** Moves to the Distribute tab. */
  onDistribute: () => void;
  /** The subject and opening lines of the emails (Settings on this tab changes them). */
  wording: RouteSheetsEmailWording;
  changeSettings(patch: SettingsPatch): Promise<void>;
}

const NEED_READY = 'Choose who gets this route sheet on the Distribute tab first';

/** Puts the email on the clipboard, with its look where the computer allows it. */
async function copyToClipboard(html: string, text: string): Promise<boolean> {
  const clipboard = navigator.clipboard as Clipboard | undefined;
  if (!clipboard) return false;
  try {
    if (typeof ClipboardItem !== 'undefined' && typeof clipboard.write === 'function') {
      await clipboard.write([
        new ClipboardItem({
          'text/html': new Blob([html], { type: 'text/html' }),
          'text/plain': new Blob([text], { type: 'text/plain' }),
        }),
      ]);
      return true;
    }
  } catch {
    // Falls back to plain text below.
  }
  try {
    await clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

export function SheetsTab({
  state,
  dist,
  revision,
  messages,
  ask,
  picked,
  onPick,
  onDistribute,
  wording,
  changeSettings,
}: SheetsTabProps) {
  const routes = dist.routes.filter((r) => r.hasSheet);
  const chosen =
    routes.find((r) => r.routeCode === picked) ??
    routes.find((r) => r.state === 'ready') ??
    routes[0] ??
    null;
  const [sending, setSending] = useState(false);
  const busy = sending || state.sending;
  const pdfMissing = state.run.pdfMissing;
  const emailProblem = state.emailProblem;

  async function emailAll() {
    const n = state.unsent;
    const yes = await ask<boolean>((done) => (
      <ConfirmDialog
        title={`Email ${plural(n, 'route sheet')} to their drivers?`}
        body="Each driver gets their own email, with their page of the PDF attached. Route sheets already marked as sent, and drivers with no email address, are left out."
        confirmLabel="Yes, send them"
        cancelLabel="No"
        onDone={done}
      />
    ));
    if (!yes) return;
    setSending(true);
    messages.setStatus('Sending...');
    try {
      const done = await command(messages, 'routeSheets:email-all');
      if (!done.ok) {
        messages.setStatus('Nothing was sent.');
        return;
      }
      const words = emailAllWords(done.value);
      messages.setStatus(words);
      await ask<boolean>((close) => (
        <MessageDialog title="Email all is done" body={words} onDone={() => close(true)} />
      ));
    } finally {
      setSending(false);
    }
  }

  async function exportAll() {
    const done = await command(messages, 'routeSheets:export-all');
    if (!done.ok || done.value === null) return;
    messages.setStatus(exportWords(done.value.drafts, done.value.folder));
  }

  const emailAllOff = busy || state.unsent === 0 || emailProblem !== null;

  async function openWording() {
    await ask<boolean>((done) => (
      <EmailWordingDialog
        name="route-sheets-email-wording"
        lead="What each driver gets with their route sheet. One wording for every route. The address and server come from Settings."
        placeholders="{name} {route} {date} {staging} {wave} {pad}"
        subject={wording.subjectTemplate}
        body={wording.bodyTemplate}
        testPrefix="route-sheets-email"
        onSave={(subjectTemplate, bodyTemplate) =>
          changeSettings({ routeSheetsEmail: { subjectTemplate, bodyTemplate } })
        }
        onDone={() => done(true)}
      />
    ));
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <ButtonStrip label="Send every route sheet">
        <Button
          variant="primary"
          disabled={emailAllOff}
          title={
            emailProblem
              ? emailProblem
              : state.unsent === 0
                ? 'Every route sheet that is ready is already marked as sent.'
                : 'Email every ready route sheet that is not marked as sent yet, each to its own driver'
          }
          onClick={() => void emailAll()}
          data-testid="route-sheets-email-all"
        >
          {sending ? 'Sending...' : `Email all (${state.unsent})`}
        </Button>
        <Button
          disabled={busy || dist.counts.ready === 0}
          title={
            pdfMissing
              ? "Save an email draft for every route that is ready, plus a summary. The route sheet PDF for this day is no longer in the app's data folder, so no PDFs are saved with them."
              : 'Save an email draft and a PDF for every route that is ready, plus a summary'
          }
          onClick={() => void exportAll()}
          data-testid="route-sheets-export-all"
        >
          Export all ({dist.counts.ready})
        </Button>
        <WordingSettingsButton
          onClick={() => void openWording()}
          testId="route-sheets-settings"
          className="ml-auto"
        />
      </ButtonStrip>
      {pdfMissing ? (
        <div
          role="alert"
          className="border-b border-warn bg-warn-soft px-6 py-2 text-sm text-fg"
          data-testid="route-sheets-pdf-missing"
        >
          {PDF_MISSING_WORDS}
        </div>
      ) : null}
      {routes.length === 0 ? (
        <p className="px-6 py-8 text-sm text-muted" data-testid="route-sheets-no-sheets">
          Bring in a route sheet PDF to see the route sheets here.
        </p>
      ) : (
        <div className="flex min-h-0 flex-1">
          <SheetList
            routes={routes}
            state={state}
            chosen={chosen?.routeCode ?? null}
            onPick={onPick}
          />
          {chosen ? (
            <SheetDetail
              key={chosen.routeCode}
              route={chosen}
              state={state}
              revision={revision}
              wording={wording}
              messages={messages}
              ask={ask}
              busy={busy}
              setSending={setSending}
              onDistribute={onDistribute}
            />
          ) : null}
        </div>
      )}
    </div>
  );
}

// ------------------------------------------------------------------------------- the list

const GROUPS: Array<[string, (r: RouteResult) => boolean]> = [
  ['Ready to send', (r) => r.state === 'ready'],
  ['Waiting on you', (r) => r.state === 'needs-decision' || r.state === 'exception'],
  ['Not sending', (r) => r.state === 'skipped'],
];

function SheetList({
  routes,
  state,
  chosen,
  onPick,
}: {
  routes: RouteResult[];
  state: RouteSheetsStateView;
  chosen: string | null;
  onPick: (routeCode: string) => void;
}) {
  const list = useRef<HTMLDivElement>(null);
  const [query, setQuery] = useState('');
  const shownRoutes = routes.filter((r) => matchesSearch(r, query));
  const ordered = GROUPS.flatMap(([, test]) => shownRoutes.filter(test));

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
    if ((event.target as HTMLElement).tagName === 'INPUT') return;
    const at = ordered.findIndex((r) => r.routeCode === chosen);
    const step = event.key === 'ArrowDown' ? 1 : -1;
    const next = ordered[Math.min(ordered.length - 1, Math.max(0, at + step))];
    if (!next) return;
    event.preventDefault();
    onPick(next.routeCode);
    list.current
      ?.querySelector<HTMLButtonElement>(`[data-route="${CSS.escape(next.routeCode)}"]`)
      ?.focus();
  }

  return (
    <div
      ref={list}
      className="w-72 shrink-0 overflow-auto border-r border-line bg-surface py-2"
      role="group"
      aria-label="Route sheets"
      onKeyDown={onKeyDown}
      data-testid="route-sheets-list"
    >
      <div className="px-3 pb-2">
        <input
          type="search"
          value={query}
          placeholder="Search route, staging, or driver"
          aria-label="Search route, staging, or driver"
          onChange={(event) => setQuery(event.target.value)}
          className="h-8 w-full min-w-0 rounded-md border border-line-strong bg-sunken px-2.5 text-sm text-fg placeholder:text-faint focus-visible:border-focus"
          data-testid="route-sheets-search"
        />
      </div>
      {ordered.length === 0 ? (
        <p className="m-0 px-4 py-2 text-sm text-muted">No route matches that search.</p>
      ) : null}
      {GROUPS.map(([label, test]) => {
        const shown = shownRoutes.filter(test);
        if (!shown.length) return null;
        return (
          <div key={label} className="mb-2">
            <p className="m-0 px-4 py-1 text-xs font-semibold tracking-wide text-muted uppercase">
              {label} ({shown.length})
            </p>
            {shown.map((r) => {
              const sent = state.run.sent[r.routeCode];
              const on = r.routeCode === chosen;
              return (
                <button
                  key={r.routeCode}
                  type="button"
                  aria-current={on ? 'true' : undefined}
                  data-route={r.routeCode}
                  onClick={() => onPick(r.routeCode)}
                  className={cn(
                    'flex w-full flex-col gap-0.5 border-l-2 px-4 py-1.5 text-left text-sm hover:bg-row-hover',
                    on ? 'border-accent bg-row-selected' : 'border-transparent',
                  )}
                  data-testid={`route-sheets-pick-${r.routeCode}`}
                >
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold">{r.routeCode}</span>
                    <span className="text-muted">{r.sheet?.staging}</span>
                    <span className="text-muted">{r.sheet?.waveTime}</span>
                    {sent ? (
                      <span className="text-info" aria-label="Sent">
                        ✓
                      </span>
                    ) : r.state === 'ready' && r.recipients.some((p) => !p.email) ? (
                      <Chip tone="warn" data-testid={`route-sheets-no-email-${r.routeCode}`}>
                        No email
                      </Chip>
                    ) : null}
                  </span>
                  <span className="flex flex-wrap items-center gap-2">
                    <StateChip state={r.state} />
                  </span>
                  <span className="truncate text-muted">
                    {r.recipients.length
                      ? `To ${r.recipients.map((p) => p.name).join(' & ')}`
                      : r.headline}
                  </span>
                </button>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}

// -------------------------------------------------------------------------- the preview

function SheetDetail({
  route,
  state,
  revision,
  wording,
  messages,
  ask,
  busy,
  setSending,
  onDistribute,
}: {
  route: RouteResult;
  state: RouteSheetsStateView;
  revision: number;
  wording: RouteSheetsEmailWording;
  messages: Messages;
  ask: Asker;
  busy: boolean;
  setSending: (on: boolean) => void;
  onDistribute: () => void;
}) {
  const code = route.routeCode;
  const [preview, setPreview] = useState<RouteSheetsPreview | null>(null);
  const [problem, setProblem] = useState<string | null>(null);

  // The preview is asked for again when the data changes, and when the wording is saved.
  const wordingKey = `${wording.subjectTemplate}\n${wording.bodyTemplate}`;
  useEffect(() => {
    let off = false;
    void call('routeSheets:preview', { routeCode: code }).then((reply) => {
      if (off) return;
      if (reply.ok) {
        setPreview(reply.value);
        setProblem(null);
      } else {
        setProblem(explain(reply));
      }
    });
    return () => {
      off = true;
    };
  }, [code, revision, wordingKey]);

  const ready = route.state === 'ready';
  const sent = state.run.sent[code];
  const noEmail = ready && route.recipients.some((p) => !p.email);
  const pdfMissing = state.run.pdfMissing;
  const emailProblem = state.emailProblem;

  async function markSent(how: SentHow | null, words: string) {
    const done = await command(messages, 'routeSheets:mark-sent', { routeCode: code, how });
    if (done.ok) messages.setStatus(words);
  }

  async function sendEmail() {
    if (sent) {
      const again = await ask<boolean>((done) => (
        <ConfirmDialog
          title="Send it again?"
          body={`${code} was already marked as sent (${sentWords(sent).replace(/^✓ /, '')}). Send it again?`}
          confirmLabel="Yes, send it again"
          cancelLabel="No"
          onDone={done}
        />
      ));
      if (!again) return;
    }
    setSending(true);
    messages.setStatus('Sending...');
    try {
      const done = await command(messages, 'routeSheets:send-one', { routeCode: code });
      if (!done.ok) {
        messages.setStatus(`${code} was not sent.`);
        return;
      }
      const to = route.recipients.map((p) => p.email).filter(Boolean);
      messages.setStatus(sendOneWords(code, done.value, to));
    } finally {
      setSending(false);
    }
  }

  /** Copies the email; true when it is on the clipboard. */
  async function copy(): Promise<boolean> {
    const done = await command(messages, 'routeSheets:copy-email', { routeCode: code });
    if (!done.ok) return false;
    if (!(await copyToClipboard(done.value.html, done.value.text))) {
      messages.setProblem({
        title: 'That did not go through',
        message: 'The route sheet could not be copied. Try again.',
      });
      return false;
    }
    return true;
  }

  async function copyForEmail() {
    if (!(await copy())) return;
    await markSent(
      'copied',
      'Copied. Paste it into a new email (Ctrl+V). The tables keep their look.',
    );
  }

  async function openDraft() {
    const done = await command(messages, 'routeSheets:open-draft', { routeCode: code });
    if (!done.ok || !done.value.opened) return;
    await markSent(
      'draft',
      'The email draft is open, with the page attached. Check it, then send it.',
    );
  }

  async function mailApp() {
    if (!(await copy())) return;
    const done = await command(messages, 'routeSheets:open-mail-app', { routeCode: code });
    if (!done.ok) return;
    if (!done.value.opened) {
      messages.setProblem({
        title: 'That did not go through',
        message:
          'The mail app could not be opened. The route sheet is copied: paste it into an email.',
      });
      return;
    }
    await markSent(
      'mail-app',
      'Your mail app is opening with the address and subject. Paste the copied sheet into the body.',
    );
  }

  async function savePdf() {
    const done = await command(messages, 'routeSheets:save-pdf-page', { routeCode: code });
    if (done.ok && done.value.saved) messages.setStatus(`Saved ${done.value.fileName ?? ''}.`);
  }

  async function viewOriginal() {
    const done = await command(messages, 'routeSheets:view-original-page', { routeCode: code });
    if (done.ok && !done.value.opened) {
      messages.setProblem({
        title: 'That did not go through',
        message: 'The page could not be opened. Try Save PDF page instead.',
      });
    }
  }

  const sendTitle = !ready
    ? NEED_READY
    : noEmail
      ? 'No email address is on file for this driver'
      : emailProblem
        ? emailProblem
        : pdfMissing
          ? "Sends this route sheet without its PDF page: the route sheet PDF for this day is no longer in the app's data folder."
          : 'Sends this route sheet with its PDF page';
  const readyTitle = ready ? undefined : NEED_READY;

  return (
    <div className="min-w-0 flex-1 overflow-auto px-6 py-4" data-testid="route-sheets-detail">
      <div className="flex flex-wrap items-start gap-3">
        <div className="min-w-0 flex-1">
          <h2 className="m-0 text-[1.3rem] font-semibold" data-testid="route-sheets-detail-code">
            {code} <span className="font-normal text-muted">{route.sheet?.staging}</span>
          </h2>
          <p className="m-0 text-sm text-muted" data-testid="route-sheets-subject">
            {preview?.subject ?? ''}
          </p>
        </div>
        <StateChip state={route.state} />
      </div>

      <div className="mt-2 text-sm" data-testid="route-sheets-recipients">
        <span className="font-semibold">Send to: </span>
        {ready ? (
          route.recipients.map((p) => (
            <span key={p.transporterId} className="mr-3">
              {p.name} <span className="font-mono text-muted">{p.transporterId}</span>{' '}
              {p.email ? (
                <span className="text-muted">{p.email}</span>
              ) : (
                <Chip tone="warn">No email on file</Chip>
              )}
            </span>
          ))
        ) : (
          <>
            <span className="font-semibold text-warn">{route.headline}</span>{' '}
            <Button
              size="sm"
              variant="ghost"
              onClick={onDistribute}
              data-testid="route-sheets-resolve"
            >
              Choose on the Distribute tab
            </Button>
          </>
        )}
      </div>

      <div
        role="toolbar"
        aria-label={`Ways to send ${code}`}
        className="mt-3 flex flex-wrap items-center gap-2"
      >
        <Button
          variant={ready && !noEmail && !emailProblem ? 'primary' : 'default'}
          disabled={!ready || noEmail || busy || emailProblem !== null}
          title={sendTitle}
          onClick={() => void sendEmail()}
          data-testid="route-sheets-send"
        >
          {busy ? 'Sending...' : 'Send email'}
        </Button>
        <Button
          disabled={!ready}
          title={readyTitle}
          onClick={() => void copyForEmail()}
          data-testid="route-sheets-copy"
        >
          Copy for email
        </Button>
        <Button
          disabled={!ready || pdfMissing}
          title={
            pdfMissing
              ? PDF_MISSING_WORDS
              : (readyTitle ?? 'Opens a ready-to-send draft with the PDF page attached')
          }
          onClick={() => void openDraft()}
          data-testid="route-sheets-open-draft"
        >
          Open email draft
        </Button>
        <Button
          disabled={!ready}
          title={readyTitle}
          onClick={() => void mailApp()}
          data-testid="route-sheets-mail-app"
        >
          Copy + open mail app
        </Button>
        <Button
          disabled={pdfMissing}
          title={pdfMissing ? PDF_MISSING_WORDS : undefined}
          onClick={() => void savePdf()}
          data-testid="route-sheets-save-pdf"
        >
          Save PDF page
        </Button>
        <Button
          disabled={pdfMissing}
          title={pdfMissing ? PDF_MISSING_WORDS : undefined}
          onClick={() => void viewOriginal()}
          data-testid="route-sheets-view-original"
        >
          View original page
        </Button>
        {ready ? (
          <Button
            variant="ghost"
            onClick={() =>
              void (sent
                ? markSent(null, `${code} is no longer marked as sent.`)
                : markSent('manual', `${code} is marked as sent.`))
            }
            data-testid="route-sheets-mark-sent"
          >
            {sent ? 'Undo' : 'Mark as sent'}
          </Button>
        ) : null}
        {sent ? (
          <Chip tone="info" icon={null} data-testid="route-sheets-sent-mark">
            {sentWords(sent)}
          </Chip>
        ) : null}
      </div>
      {noEmail ? (
        <p className="m-0 mt-2 text-sm text-warn">
          No email address is on file for this driver. Use Copy for email and send it another way,
          or add their email to the driver list and bring it in again.
        </p>
      ) : null}

      {problem ? (
        <p role="alert" className="problem mt-4 text-sm">
          {problem}
        </p>
      ) : null}
      <p className="m-0 mt-4 mb-1 text-sm text-muted">
        Email preview: exactly what the driver will see
      </p>
      {preview?.html ? (
        <iframe
          title={`Email preview for ${code}`}
          sandbox=""
          srcDoc={preview.html}
          className="h-[48rem] w-full rounded-lg border border-line"
          data-testid="route-sheets-preview"
        />
      ) : (
        <p className="text-sm text-muted">{preview ? 'This route has no page to show.' : ''}</p>
      )}
      <div className="mt-4 grid gap-3 lg:grid-cols-2">
        <SheetPanel route={route} />
        <MatchPanel route={route} />
      </div>
    </div>
  );
}

// ------------------------------------------------------------------- the two side panels

/** The search on the list: the route code, the staging, or a driver's name or ID. */
function matchesSearch(r: RouteResult, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return [
    r.routeCode,
    r.sheet?.staging ?? '',
    ...r.recipients.map((p) => p.name),
    ...r.listed.map((c) => `${c.rosterName ?? ''} ${c.routesName} ${c.transporterId}`),
  ]
    .join(' ')
    .toLowerCase()
    .includes(q);
}

function Fact({ label, value }: { label: string; value: string | number | null | undefined }) {
  const shown = value === null || value === undefined || value === '' ? '-' : String(value);
  return (
    <div className="flex justify-between gap-3 border-b border-line/60 py-1">
      <dt className="text-muted">{label}</dt>
      <dd className="m-0 text-right">{shown}</dd>
    </div>
  );
}

function SheetPanel({ route }: { route: RouteResult }) {
  const s = route.sheet;
  if (!s) return null;
  const pages = s.pageNumbers.length ? s.pageNumbers : [s.pageNumber];
  return (
    <section
      className="rounded-lg border border-line bg-surface px-4 py-3 text-sm"
      aria-labelledby="route-sheets-panel-sheet-title"
      data-testid="route-sheets-panel-sheet"
    >
      <h3 id="route-sheets-panel-sheet-title" className="m-0 mb-1 text-base font-semibold">
        Route sheet
      </h3>
      <dl className="m-0">
        <Fact label="Route" value={route.routeCode} />
        <Fact label="Staging" value={s.staging} />
        <Fact label="Wave" value={s.waveTime} />
        <Fact label="Pad #" value={s.pad} />
        <Fact label="Date" value={s.dateLabel} />
        <Fact label="Service type" value={s.serviceType} />
        <Fact label="Bags" value={s.bagCount} />
        <Fact label="Overflow packages" value={s.overflowCount} />
        <Fact label="Total packages" value={s.totalPackages} />
        <Fact label="Commercial packages" value={s.commercialPackages} />
        <Fact label={pages.length > 1 ? 'PDF pages' : 'PDF page'} value={pages.join(', ')} />
      </dl>
      {s.checkOk ? (
        <p className="m-0 mt-2 text-ok" data-testid="route-sheets-verified">
          ✓ Verified: {s.bagCount} bags, {s.overflowCount} overflow packages, {s.totalPackages}{' '}
          total all add up
        </p>
      ) : (
        <ul className="m-0 mt-2 list-disc pl-5 text-bad" data-testid="route-sheets-check-problems">
          {s.checkProblems.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      )}
      {s.notes.length ? (
        <ul className="m-0 mt-2 list-disc pl-5 text-warn" data-testid="route-sheets-sheet-notes">
          {s.notes.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}

const ISSUE_TONE = { error: 'text-bad', warn: 'text-warn', info: 'text-muted' } as const;

function MatchPanel({ route }: { route: RouteResult }) {
  return (
    <section
      className="rounded-lg border border-line bg-surface px-4 py-3 text-sm"
      aria-labelledby="route-sheets-panel-match-title"
      data-testid="route-sheets-panel-match"
    >
      <h3 id="route-sheets-panel-match-title" className="m-0 mb-1 text-base font-semibold">
        Transporter ID match
      </h3>
      {route.listed.length ? (
        <ul className="m-0 list-none p-0">
          {route.listed.map((c) => (
            <li key={`${c.transporterId}-${c.routesName}`} className="py-1">
              <p className="m-0 font-semibold">{c.rosterName || c.routesName || '(no name)'}</p>
              <p className="m-0 mt-0.5 flex flex-wrap items-center gap-2">
                <span className="font-mono text-muted">{c.transporterId || 'no ID'}</span>
                <StatusChip found={c.found} status={c.status} />
              </p>
            </li>
          ))}
        </ul>
      ) : (
        <p className="m-0 text-muted">Not on the routes file</p>
      )}
      {route.issues.length ? (
        <ul className="m-0 mt-2 list-disc pl-5" data-testid="route-sheets-match-issues">
          {route.issues.map((issue, index) => (
            <li key={`${index}-${issue.text}`} className={ISSUE_TONE[issue.level]}>
              {issue.text}
            </li>
          ))}
        </ul>
      ) : (
        <p className="m-0 mt-2 text-ok" data-testid="route-sheets-exact-match">
          ✓ Exact match, nothing to review
        </p>
      )}
    </section>
  );
}
