// Lifetime Routes: the app's measure of tenure. It comes from its own file, the Tenured
// Workforce export, which is a weekly history: only each driver's most recent week counts, and
// counts only ever move forward, so an older file picked by mistake never rolls anybody back. The
// counts are kept apart from the associate list, so clearing or re-importing associates does not
// remove them.

import { FileDrop } from '../../components/FileDrop';
import { useMemo, useState } from 'react';
import { DataGrid, type GridColumn } from '../../components/DataGrid';
import type { AppSnapshot, AssociateView } from '../../../shared/snapshot';
import { databaseLayoutStore } from '../../lib/gridLayoutStore';
import { Button } from '../../ui/button';
import { Chip } from '../../ui/chip';
import { command, dropRefused } from '../dataPages/bringIn';
import { sourceLine } from '../dataPages/format';
import { ConfirmDialog } from '../dataPages/Modal';
import { ButtonStrip, HeaderCard, type Messages } from '../dataPages/PageParts';
import { useDialogs } from '../dataPages/useDialogs';
import { importTenure } from './importTenure';
import { idOf, isActiveStatus, tenureHeadline } from './associateRows';

const COLUMNS: GridColumn<AssociateView>[] = [
  { id: 'name', header: 'Name', value: (view) => view.associate.name },
  {
    id: 'transporter_id',
    header: 'Transporter ID',
    value: (view) => view.associate.transporterId,
    mono: true,
  },
  { id: 'status', header: 'Status', value: (view) => view.associate.status },
  {
    id: 'tenure',
    header: 'Lifetime Routes',
    value: (view) => (view.associate.tenure === null ? '' : String(view.associate.tenure)),
    align: 'center',
    fitExtra: 24,
    cell: (view) =>
      view.associate.tenure === null ? (
        <Chip tone="neutral">No count yet</Chip>
      ) : (
        <span>{view.associate.tenure}</span>
      ),
  },
];

export function LifetimeRoutesTab({
  snapshot,
  messages,
}: {
  snapshot: AppSnapshot;
  messages: Messages;
}) {
  const [busy, setBusy] = useState(false);
  const { ask, host } = useDialogs();
  const { tenure } = snapshot;
  const views = snapshot.associates;
  const covered = views.filter((view) => view.associate.tenure !== null).length;
  const rows = useMemo(() => views, [views]);

  async function bringIn(dropped?: string) {
    if (busy) return;
    setBusy(true);
    try {
      await importTenure(messages, dropped);
    } finally {
      setBusy(false);
    }
  }

  async function clearCounts() {
    if (tenure.records === 0) {
      messages.setStatus('Nothing to clear - no lifetime routes kept.');
      return;
    }
    const yes = await ask<boolean>((done) => (
      <ConfirmDialog
        title="Clear Lifetime Routes?"
        body={`Remove the lifetime route counts of all ${tenure.records} drivers?\n\nThe associate list and the roster are kept. Import the Tenured Workforce file again to get the counts back.`}
        confirmLabel="Yes, clear"
        cancelLabel="No, keep them"
        danger
        onDone={done}
      />
    ));
    if (!yes) return;
    const reply = await command(messages, 'associates:clear-tenure');
    if (!reply.ok) return;
    messages.setStatus('Lifetime routes cleared.');
  }

  return (
    <FileDrop
      page="associates"
      kind="tenure"
      onDropped={(token) => void bringIn(token)}
      onProblem={(words) => dropRefused(messages, words)}
    >
      <HeaderCard
        name="tenure"
        title="Lifetime Routes"
        sub={
          tenure.records === 0
            ? 'No Tenured Workforce file has been imported yet.'
            : sourceLine(tenure.sourceFile, tenure.importedAt)
        }
        metric={tenureHeadline(snapshot)}
        details={views.length === 0 ? [] : [`${covered}/${views.length} associates covered`]}
      >
        <p className="m-0 mt-1.5 max-w-3xl text-sm text-muted" data-testid="tenure-rules">
          The Tenured Workforce file is a weekly history. Only each driver's newest week counts, and
          a count only ever moves forward, so an older file never takes anyone's count back. A
          driver who is missing from this week's file keeps the count an earlier file gave them. The
          counts are kept apart from the associate list: importing or clearing associates leaves
          them as they are.
        </p>
      </HeaderCard>
      <ButtonStrip label="Lifetime Routes actions">
        <Button onClick={() => void bringIn()} disabled={busy} data-testid="import-tenure-tab">
          Import Tenure
        </Button>
        <Button onClick={() => void clearCounts()} data-testid="clear-tenure">
          Clear Lifetime Routes
        </Button>
      </ButtonStrip>
      <div className="min-h-0 flex-1">
        <DataGrid
          view="lifetime-routes"
          label="Lifetime routes"
          columns={COLUMNS}
          rows={rows}
          getRowId={idOf}
          layoutStore={databaseLayoutStore}
          rowTone={(view) => (isActiveStatus(view) ? undefined : 'ghost')}
          empty={{
            title: 'No associate data loaded.',
            body: 'Import the associate list on the Associates tab to see each driver beside their count.',
          }}
        />
      </div>
      {host}
    </FileDrop>
  );
}
