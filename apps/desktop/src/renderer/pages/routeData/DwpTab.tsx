// The DWP tab: bags, OVS and staging for each route, read by route code. Importing here changes
// nothing on the roster by itself: "Bring Over DWP" on the Load Out page copies the three columns
// onto it, after checking the sheet is the roster's day. This tab is where the file is loaded and
// checked against the right routes. Ported from the old app's DwpPage.

import { FileDrop } from '../../components/FileDrop';
import { useCallback, useMemo, useState } from 'react';
import { call, explain } from '../../lib/channels';
import { DataGrid, type GridColumn } from '../../components/DataGrid';
import { databaseLayoutStore } from '../../lib/gridLayoutStore';
import { Button } from '../../ui/button';
import { Chip } from '../../ui/chip';
import type { AppSnapshot } from '../../../shared/snapshot';
import { bringInFile, dropRefused, readNow } from '../dataPages/bringIn';
import { sourceLine } from '../dataPages/format';
import { ConfirmDialog } from '../dataPages/Modal';
import { ButtonStrip, FilterCheck, HeaderCard, type Messages } from '../dataPages/PageParts';
import { useDialogs } from '../dataPages/useDialogs';
import {
  DWP_EMPTY,
  buildDwpRows,
  dwpDayNote,
  dwpImportedMessage,
  dwpMatchLine,
  dwpNotes,
  dwpTone,
  passesUnmatchedOnly,
  rosterCodes,
  type DwpRow,
} from './dwpRows';

const COLUMNS: GridColumn<DwpRow>[] = [
  { id: 'route_code', header: 'Route Code', value: (row) => row.entry.routeCode },
  { id: 'bags', header: 'Bags', value: (row) => row.entry.bags, align: 'center' },
  { id: 'ovs', header: 'OVS', value: (row) => row.entry.ovs, align: 'center' },
  { id: 'staging', header: 'Staging', value: (row) => row.entry.staging },
];

const rowId = (row: DwpRow) => String(row.index);

export function DwpTab({ snapshot, messages }: { snapshot: AppSnapshot; messages: Messages }) {
  const { setStatus, setProblem } = messages;
  const { ask, host } = useDialogs();
  const [unmatchedOnly, setUnmatchedOnly] = useState(false);
  const [busy, setBusy] = useState(false);

  const rows = useMemo(() => buildDwpRows(snapshot), [snapshot]);
  const checkRoster = useMemo(() => rosterCodes(snapshot).size > 0, [snapshot]);
  const empty = rows.length === 0;
  const dayNote = dwpDayNote(snapshot);
  const set = snapshot.dwp.set;

  const filter = useCallback(
    (row: DwpRow) => !unmatchedOnly || passesUnmatchedOnly(row, checkRoster),
    [unmatchedOnly, checkRoster],
  );
  const rowTone = useCallback((row: DwpRow) => dwpTone(row, checkRoster), [checkRoster]);

  async function importSheet(dropped?: string) {
    if (busy) return;
    setBusy(true);
    try {
      const done = await bringInFile('dwp', messages, dropped);
      if (!done) return;
      setUnmatchedOnly(false);
      const fresh = await readNow();
      if (fresh) setStatus(dwpImportedMessage(fresh, done.path));
    } finally {
      setBusy(false);
    }
  }

  async function clearSheet() {
    if (empty) {
      setStatus('Nothing to clear - no DWP sheet loaded.');
      return;
    }
    const yes = await ask<boolean>((done) => (
      <ConfirmDialog
        title="Clear DWP?"
        body={`Remove all ${rows.length} routes?\n\n'Export with DWP' will have no bags, OVS or staging to print until another sheet is imported. The roster and the route exports are kept.`}
        confirmLabel="Yes, clear"
        cancelLabel="No, keep it"
        danger
        onDone={done}
      />
    ));
    if (!yes) return;
    const reply = await call('dwp:clear');
    if (!reply.ok) {
      setProblem({ title: 'That did not go through', message: explain(reply) });
      return;
    }
    setUnmatchedOnly(false);
    setStatus('DWP cleared.');
  }

  return (
    <FileDrop
      page="route-data"
      kind="dwp"
      onDropped={(token) => void importSheet(token)}
      onProblem={(words) => dropRefused(messages, words)}
    >
      <HeaderCard
        name="dwp"
        title={empty ? 'No DWP sheet loaded' : 'DWP  -  bags, OVS and staging by route'}
        sub={
          empty
            ? 'Bags, OVS and staging for the printed sheet, read by route code.'
            : sourceLine(set.sourceFile, set.importedAt)
        }
        metric={empty ? '0 routes' : `${rows.length} routes`}
        details={empty ? [] : [dwpMatchLine(snapshot), dwpNotes(snapshot)]}
      >
        {dayNote ? (
          <p className="m-0 mt-1.5 flex flex-wrap items-center gap-2 text-sm" data-testid="dwp-day">
            <Chip tone={dayNote.tone === 'ok' ? 'ok' : dayNote.tone === 'warn' ? 'warn' : 'info'}>
              {dayNote.chip}
            </Chip>
            <span data-testid="dwp-day-text">{dayNote.text}</span>
          </p>
        ) : null}
      </HeaderCard>
      <ButtonStrip label="DWP actions">
        <Button onClick={() => void importSheet()} disabled={busy} data-testid="import-dwp">
          Import DWP
        </Button>
        <Button onClick={() => void clearSheet()} data-testid="clear-dwp">
          Clear
        </Button>
      </ButtonStrip>
      <div className="min-h-0 flex-1">
        <DataGrid
          view="dwp"
          label="DWP sheet"
          columns={COLUMNS}
          rows={rows}
          getRowId={rowId}
          layoutStore={databaseLayoutStore}
          rowTone={rowTone}
          filter={filter}
          filterControls={
            <FilterCheck
              label="Not on the roster"
              checked={unmatchedOnly}
              onChange={setUnmatchedOnly}
              testId="dwp-not-on-roster"
            />
          }
          onResetFilters={() => setUnmatchedOnly(false)}
          empty={DWP_EMPTY}
        />
      </div>
      {host}
    </FileDrop>
  );
}
