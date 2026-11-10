// The strip at the top of every Route Sheets tab: the open run and its PDF, which route data the
// matching reads, the driver list, the email setup, and the button that brings the PDF in. Above
// it, once, the note about the old Route Sheet Distributor.

import { CircleHelp, FileUp } from 'lucide-react';
import { useState } from 'react';
import type { RouteSheetsStateView } from '../../../shared/routeSheets';
import type { RouteSheetsRouteData } from '../../../shared/settings';
import type { RouteSetView } from '../../../shared/snapshot';
import { Button } from '../../ui/button';
import type { StepId } from '../../help/checklist';
import { WhereToGetDialog } from '../../help/whereToGet';
import { Chip } from '../../ui/chip';
import { plural } from '../dataPages/format';
import type { PageId } from '../types';
import { TopCard } from './parts';
import { daysSince, isOverdue, routeDataWords } from './words';

/** The note's words, as section 3 of the migration plan gives them. */
export const OLD_APP_NOTE =
  "Route Sheet Distributor's work now lives here. Enter your Gmail app password once in Settings > Email, and you can uninstall the old app.";

export function OldAppNote({ onGotIt }: { onGotIt: () => void }) {
  return (
    <div
      role="note"
      className="flex flex-wrap items-center gap-3 border-b border-line bg-info-soft px-6 py-2 text-sm"
      data-testid="route-sheets-old-app-note"
    >
      <p className="m-0 min-w-0 flex-1 text-fg">{OLD_APP_NOTE}</p>
      <Button size="sm" onClick={onGotIt} data-testid="route-sheets-old-app-got-it">
        Got it
      </Button>
    </div>
  );
}

interface TopStripProps {
  state: RouteSheetsStateView;
  busy: boolean;
  onBringIn: () => void;
  /** Starts a new run; the open one stays in History. */
  onNewRun: () => void;
  goTo: (page: PageId) => void;
  /** The route file the roster took its routes from ('' when none). */
  rosterKind: string;
  /** The route data the person picked: the roster's, or the file brought in here. */
  choice: RouteSheetsRouteData;
  /** The route file brought in just for the route sheets, kept apart from the Roster's. */
  ownFile: RouteSetView | null;
  onUseRoster: () => void;
  onUseOwn: () => void;
  onImportRouteFile: () => void;
  onClearOwn: () => void;
}

/** The small "?" that opens the where-to-get note for one file. */
function HelpButton({
  question,
  onClick,
  testId,
}: {
  question: string;
  onClick: () => void;
  testId: string;
}) {
  return (
    <button
      type="button"
      className="checklist-help"
      aria-label={question}
      title={question}
      onClick={onClick}
      data-testid={testId}
    >
      <CircleHelp aria-hidden="true" />
    </button>
  );
}

export function TopStrip({
  state,
  busy,
  onBringIn,
  onNewRun,
  goTo,
  rosterKind,
  choice,
  ownFile,
  onUseRoster,
  onUseOwn,
  onImportRouteFile,
  onClearOwn,
}: TopStripProps) {
  const { run, routeData, driverList, emailProblem } = state;
  const old = driverList.count > 0 && isOverdue(driverList.refreshDueAt);
  const failures = run.checkFailures.length;
  const [helpOpen, setHelpOpen] = useState<StepId | null>(null);
  const ownInUse = routeData?.own === true;

  return (
    // Three columns on a wide window: This run, Route data, and the two short cards (Driver list
    // and Email) stacked in the third, so the buttons fit on a line and no card has empty room
    // under two lines of words. A narrow window stacks the cards one under another.
    <div
      className="grid gap-2 border-b border-line bg-app px-6 py-2 md:grid-cols-[minmax(0,1.1fr)_minmax(0,1.4fr)_minmax(0,1fr)]"
      data-testid="route-sheets-top"
    >
      <TopCard title="This run" testId="route-sheets-run">
        <p className="m-0 font-semibold" data-testid="route-sheets-run-label">
          {run.label}
        </p>
        {run.pdfFileName ? (
          <p className="m-0 text-muted" data-testid="route-sheets-run-pdf">
            {run.pdfFileName} - {plural(run.sheetCount, 'route sheet')}
            {failures
              ? `, ${failures} failed the number check (${run.checkFailures.join(', ')})`
              : ", every sheet's numbers add up"}
          </p>
        ) : (
          <p className="m-0 text-muted">No route sheet PDF yet.</p>
        )}
        {run.warnings.length > 0 ? (
          <details className="mt-1">
            <summary className="cursor-pointer text-muted">
              {plural(run.warnings.length, 'note')} from reading the PDF
            </summary>
            <ul className="m-0 mt-1 list-disc pl-5" data-testid="route-sheets-run-warnings">
              {run.warnings.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          </details>
        ) : null}
        <div className="mt-2 flex flex-wrap gap-2">
          <Button
            size="sm"
            variant={run.pdfFileName ? 'default' : 'primary'}
            onClick={onBringIn}
            disabled={busy}
            data-testid="route-sheets-bring-in"
          >
            <FileUp aria-hidden="true" />
            Bring in the route sheet PDF
          </Button>
          {run.pdfFileName ? (
            <Button
              size="sm"
              onClick={onNewRun}
              disabled={busy}
              title="Start again with an empty run. This one stays in History."
              data-testid="route-sheets-top-new-run"
            >
              New run
            </Button>
          ) : null}
        </div>
        {/* The "?" sits on the sentence under the button: the card is too narrow for both on a line. */}
        <p
          className="m-0 mt-1 flex flex-wrap items-center gap-1 text-muted"
          data-testid="route-sheets-drop-words"
        >
          <span>Or drop the PDF anywhere on this page.</span>
          <HelpButton
            question="Where do I get the route sheet PDF?"
            onClick={() => setHelpOpen('route-sheets')}
            testId="route-sheets-bring-in-help"
          />
        </p>
        {helpOpen ? <WhereToGetDialog step={helpOpen} onClose={() => setHelpOpen(null)} /> : null}
      </TopCard>

      <TopCard title="Route data" testId="route-sheets-route-data">
        <div className="flex items-start gap-1">
          <p className="m-0 min-w-0 flex-1" data-testid="route-sheets-route-data-words">
            {routeDataWords(routeData)}
          </p>
          <HelpButton
            question="Where do I get the route data?"
            onClick={() => setHelpOpen('route-data')}
            testId="route-sheets-route-data-help"
          />
        </div>
        {routeData ? (
          <p className="m-0 mt-1 flex flex-wrap items-center gap-2">
            {routeData.own ? (
              <Chip tone="info" data-testid="route-sheets-own-file">
                Just for the route sheets
              </Chip>
            ) : (
              <Chip tone="ok" data-testid="route-sheets-same-as-roster">
                The Roster&apos;s Route Data
              </Chip>
            )}
            {!routeData.own && ownFile ? (
              <span className="text-muted" data-testid="route-sheets-own-file-waiting">
                Your imported file ({ownFile.label}) is kept, but not in use.
              </span>
            ) : null}
          </p>
        ) : null}
        <div className="mt-2 flex flex-wrap gap-2">
          <Button
            size="sm"
            onClick={onUseRoster}
            disabled={
              busy || !rosterKind || (choice === 'roster' && routeData !== null && !ownInUse)
            }
            data-testid="route-sheets-use-roster"
          >
            Use the Roster&apos;s Route Data
          </Button>
          {ownFile && !ownInUse ? (
            <Button size="sm" onClick={onUseOwn} disabled={busy} data-testid="route-sheets-use-own">
              Use the imported file
            </Button>
          ) : null}
          <Button
            size="sm"
            variant={routeData ? 'default' : 'primary'}
            onClick={onImportRouteFile}
            disabled={busy}
            data-testid="route-sheets-import-route-file"
          >
            Import a new file
          </Button>
          {ownFile ? (
            <Button
              size="sm"
              variant="danger"
              onClick={onClearOwn}
              disabled={busy}
              title="Takes the imported file out of Route Sheets. The Roster is not touched."
              data-testid="route-sheets-clear-own"
            >
              Clear imported file
            </Button>
          ) : null}
        </div>
      </TopCard>

      <div className="grid min-w-0 content-start gap-2">
        <TopCard title="Driver list" testId="route-sheets-driver-list">
          <div className="float-right ml-1">
            <HelpButton
              question="Where do I get the driver list?"
              onClick={() => setHelpOpen('drivers')}
              testId="route-sheets-driver-list-help"
            />
          </div>
          {driverList.count === 0 ? (
            <p className="m-0 flex flex-wrap items-center gap-2">
              <Chip tone="warn" data-testid="route-sheets-driver-list-missing">
                Not loaded
              </Chip>
              <span>Bring in the driver list on the Associates page.</span>
            </p>
          ) : (
            <>
              <p className="m-0 flex flex-wrap items-center gap-2">
                <span data-testid="route-sheets-driver-count">
                  {plural(driverList.count, 'driver')}
                  {driverList.fileName ? ` - ${driverList.fileName}` : ''}
                </span>
                {old ? (
                  <Chip tone="warn" data-testid="route-sheets-driver-list-old">
                    Over a month old
                  </Chip>
                ) : null}
              </p>
              {old ? (
                <p className="m-0 mt-1 text-warn" data-testid="route-sheets-driver-list-old-note">
                  Brought in {plural(daysSince(driverList.importedAt), 'day')} ago. Bring in the
                  latest driver list so new drivers, status changes and email addresses are up to
                  date.
                </p>
              ) : null}
            </>
          )}
          <Button
            size="sm"
            className="mt-2"
            onClick={() => goTo('associates')}
            data-testid="route-sheets-open-associates"
          >
            Open Associates
          </Button>
        </TopCard>

        <TopCard title="Email" testId="route-sheets-email">
          {emailProblem ? (
            <>
              <p className="m-0 text-warn" data-testid="route-sheets-email-problem">
                {emailProblem}
              </p>
              <Button
                size="sm"
                className="mt-2"
                onClick={() => goTo('settings')}
                data-testid="route-sheets-open-settings"
              >
                Open Settings
              </Button>
            </>
          ) : (
            <p className="m-0">
              <Chip tone="ok" data-testid="route-sheets-email-ready">
                Email is ready
              </Chip>
            </p>
          )}
        </TopCard>
      </div>
    </div>
  );
}
