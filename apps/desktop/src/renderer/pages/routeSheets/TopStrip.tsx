// The strip at the top of every Route Sheets tab: the open run and its PDF, which route data the
// matching reads, the driver list, the email setup, and the button that brings the PDF in. Above
// it, once, the note about the old Route Sheet Distributor.

import { CircleHelp, FileUp } from 'lucide-react';
import { useState } from 'react';
import type { RouteSheetsStateView } from '../../../shared/routeSheets';
import { Button } from '../../ui/button';
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
  goTo: (page: PageId) => void;
}

export function TopStrip({ state, busy, onBringIn, goTo }: TopStripProps) {
  const { run, routeData, driverList, emailProblem } = state;
  const old = driverList.count > 0 && isOverdue(driverList.refreshDueAt);
  const failures = run.checkFailures.length;
  const [helpOpen, setHelpOpen] = useState(false);

  return (
    <div
      className="flex flex-wrap gap-2 border-b border-line bg-app px-6 py-2"
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
        <div className="mt-2">
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
        </div>
        {/* The "?" sits on the sentence under the button: the card is too narrow for both on a line. */}
        <p
          className="m-0 mt-1 flex flex-wrap items-center gap-1 text-muted"
          data-testid="route-sheets-drop-words"
        >
          <span>Or drop the PDF anywhere on this page.</span>
          <button
            type="button"
            className="checklist-help"
            aria-label="Where do I get the route sheet PDF?"
            title="Where do I get the route sheet PDF?"
            onClick={() => setHelpOpen(true)}
            data-testid="route-sheets-bring-in-help"
          >
            <CircleHelp aria-hidden="true" />
          </button>
        </p>
        {helpOpen ? (
          <WhereToGetDialog step="route-sheets" onClose={() => setHelpOpen(false)} />
        ) : null}
      </TopCard>

      <TopCard title="Route data" testId="route-sheets-route-data">
        <p className="m-0" data-testid="route-sheets-route-data-words">
          {routeDataWords(routeData)}
        </p>
        {routeData ? null : (
          <Button
            size="sm"
            className="mt-2"
            onClick={() => goTo('route-data')}
            data-testid="route-sheets-open-route-data"
          >
            Open Route Data
          </Button>
        )}
      </TopCard>

      <TopCard title="Driver list" testId="route-sheets-driver-list">
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
  );
}
