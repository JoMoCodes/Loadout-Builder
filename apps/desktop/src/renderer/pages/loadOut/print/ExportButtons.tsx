// Export Roster and Export with DWP: the two fixed sheets, for the Roster tab's toolbar.
//
// Every driver goes on them, in name order, whatever the Roster tab is filtered or sorted to.
// The save window offers the old file names ("Load Out - <day>", "Load Out with DWP - <day>"), and
// the name's extension (.pdf or .xlsx) decides which kind of file is written.

import { useState } from 'react';
import { call, explain } from '../../../lib/channels';
import { Button } from '../../../ui/button';
import { useAsker } from './AskDialog';

export interface ExportButtonsProps {
  /** Where the outcome is said. Without one, the buttons show it themselves. */
  onStatus?(words: string): void;
}

export function ExportButtons({ onStatus }: ExportButtonsProps) {
  const asker = useAsker();
  const [own, setOwn] = useState('');
  const [busy, setBusy] = useState(false);
  const say = (words: string) => (onStatus ? onStatus(words) : setOwn(words));

  async function exportSheet(withDwp: boolean) {
    setBusy(true);
    const reply = await call('print:export', { withDwp });
    setBusy(false);
    if (!reply.ok) {
      say('Export failed.');
      return asker.tell('Export failed', explain(reply));
    }
    const done = reply.value;
    if (done.status === 'cancelled') return say('Export cancelled.');
    if (done.status === 'nothing') {
      if (done.reason === 'no-roster') return say('Nothing to export - no roster loaded.');
      say("Nothing to export - the DWP data isn't on the roster yet.");
      return asker.tell(
        'Nothing to put in those columns',
        'No driver is carrying staging, bags or OVS, so all three would print blank.\n\n' +
          "Use 'Bring Over DWP' first - that is what puts them on the roster." +
          (done.reason === 'no-dwp-sheet'
            ? '\n\nThere is no DWP sheet loaded either; import one on Route Data > DWP.'
            : ''),
      );
    }
    const tail = withDwp ? ` ${done.carryingDwp} of them with bags, OVS and staging.` : '';
    say(`Exported ${done.drivers} drivers to ${done.fileName}.${tail}`);
  }

  return (
    <span className="inline-flex flex-wrap items-center gap-2" data-testid="export-buttons">
      <Button disabled={busy} onClick={() => void exportSheet(false)} data-testid="export-roster">
        Export Roster
      </Button>
      <Button disabled={busy} onClick={() => void exportSheet(true)} data-testid="export-with-dwp">
        Export with DWP
      </Button>
      {!onStatus && own ? (
        <span role="status" className="text-sm" data-testid="export-status">
          {own}
        </span>
      ) : null}
      {asker.element}
    </span>
  );
}
