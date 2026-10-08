// LMR Approved Drivers: who may take a Last Mile Rental out. A separate clearance from the
// qualifications in the associate export - being EDV qualified does not put you in a rental. Van
// assignment treats this as a hard gate: an unapproved driver is never given a rental.
// Ported from the old app's LmrApprovalPage.

import { useCallback, useMemo, useState } from 'react';
import type { GridColumn, RowAction } from '../../components/DataGrid';
import { DataGrid } from '../../components/DataGrid';
import type { AppSnapshot, AssociateView } from '../../../shared/snapshot';
import { databaseLayoutStore } from '../../lib/gridLayoutStore';
import { Button } from '../../ui/button';
import { Chip } from '../../ui/chip';
import { command } from '../dataPages/bringIn';
import { nameList } from '../dataPages/format';
import { ConfirmDialog } from '../dataPages/Modal';
import {
  ButtonStrip,
  FilterCheck,
  FilterSelect,
  HeaderCard,
  type Messages,
} from '../dataPages/PageParts';
import { chosenRows, rowsForMenu, usePicks } from '../dataPages/picks';
import { useDialogs } from '../dataPages/useDialogs';
import { ALL_DRIVERS, SHOW_OPTIONS, idOf, passesLmrFilters, rentalLine } from './lmrRows';

export function LmrTab({ snapshot, messages }: { snapshot: AppSnapshot; messages: Messages }) {
  const { setStatus } = messages;
  const { ask, host } = useDialogs();
  const picks = usePicks();
  const [show, setShow] = useState<string>(ALL_DRIVERS);
  const [onLoadOutOnly, setOnLoadOutOnly] = useState(false);
  const [currentId, setCurrentId] = useState<string | null>(null);

  const views = snapshot.associates;
  const approvedCount = snapshot.lmrApproved.length;

  const columns = useMemo<GridColumn<AssociateView>[]>(
    () => [
      picks.column(idOf),
      { id: 'name', header: 'Associate', value: (view) => view.associate.name },
      {
        id: 'approved',
        header: 'LMR',
        value: (view) => (view.lmrApproved ? 'Approved' : ''),
        align: 'center',
        fitExtra: 24,
        cell: (view) =>
          view.lmrApproved ? (
            <Chip tone="ok">Approved</Chip>
          ) : (
            <span className="text-faint">-</span>
          ),
      },
      {
        id: 'transporter_id',
        header: 'Transporter ID',
        value: (view) => view.associate.transporterId,
      },
      { id: 'vans', header: 'Vans', value: (view) => view.vanBadges },
      { id: 'status', header: 'Status', value: (view) => view.associate.status },
      {
        id: 'on_loadout',
        header: 'On Load Out',
        value: (view) => (view.onRoster ? 'Yes' : ''),
        align: 'center',
      },
      { id: 'position', header: 'Position', value: (view) => view.associate.position },
    ],
    [picks],
  );

  const filter = useCallback(
    (view: AssociateView) => passesLmrFilters(view, show, onLoadOutOnly),
    [show, onLoadOutOnly],
  );

  function theChosen(clicked?: AssociateView): AssociateView[] {
    const rows = clicked
      ? rowsForMenu(views, idOf, picks.ids, clicked)
      : chosenRows(views, idOf, picks.ids, views.find((view) => idOf(view) === currentId) ?? null);
    if (rows.length === 0) setStatus('Select an associate first.');
    return rows;
  }

  async function setApproval(rows: AssociateView[], approved: boolean) {
    if (rows.length === 0) return;
    const changed = rows.filter(
      (view) => view.associate.transporterId !== '' && view.lmrApproved !== approved,
    );
    if (changed.length === 0) {
      setStatus(`Already ${approved ? 'approved' : 'not approved'}.`);
      return;
    }
    const reply = await command(messages, 'vehicles:set-lmr', {
      transporterIds: changed.map((view) => view.associate.transporterId),
      approved,
    });
    if (!reply.ok) return;
    const names = nameList(changed.map((view) => view.associate.name));
    const word = approved ? 'approved for LMR' : 'no longer approved for LMR';
    const total = approvedCount + (approved ? 1 : -1) * changed.length;
    setStatus(`${names} ${word}. ${total} approved.`);
  }

  function toggle(rows: AssociateView[]) {
    if (rows.length === 0) return;
    // Mixed selection follows whatever the first one isn't.
    void setApproval(rows, !rows[0]!.lmrApproved);
  }

  async function clearAll() {
    if (approvedCount === 0) {
      setStatus('Nobody is approved for LMR yet.');
      return;
    }
    const yes = await ask<boolean>((done) => (
      <ConfirmDialog
        title="Clear LMR approvals?"
        body={`Remove LMR approval from all ${approvedCount} associates?\n\nNo one will be auto-assigned a rental until you approve someone again.`}
        confirmLabel="Yes, clear"
        cancelLabel="No, keep them"
        danger
        onDone={done}
      />
    ));
    if (!yes) return;
    const reply = await command(messages, 'vehicles:clear-lmr');
    if (!reply.ok) return;
    picks.clear();
    setStatus('LMR approvals cleared.');
  }

  const rowActions = useMemo<RowAction<AssociateView>[]>(
    () => [
      {
        id: 'approve',
        label: 'Approve for LMR',
        onSelect: (view) => void setApproval(theChosen(view), true),
      },
      {
        id: 'remove',
        label: 'Remove approval',
        onSelect: (view) => void setApproval(theChosen(view), false),
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps -- the actions read the latest rows and ticks on each render
    [views, picks.ids, approvedCount],
  );

  return (
    <>
      <HeaderCard
        name="lmr"
        title="LMR Approved Drivers"
        sub="Only these associates can be given a Last Mile Rental. Separate from qualifications, and enforced when vans are assigned."
        metric={`${approvedCount} approved`}
        details={[rentalLine(snapshot)]}
      />
      <ButtonStrip label="LMR actions">
        <Button onClick={() => void setApproval(theChosen(), true)} data-testid="lmr-approve">
          Approve
        </Button>
        <Button onClick={() => void setApproval(theChosen(), false)} data-testid="lmr-remove">
          Remove
        </Button>
        <Button onClick={() => void clearAll()} data-testid="lmr-clear-all">
          Clear All
        </Button>
        {picks.ids.size > 0 ? (
          <span className="text-sm text-muted" data-testid="picked-count">
            {picks.ids.size} picked.{' '}
            <button type="button" className="underline" onClick={picks.clear}>
              Clear the ticks
            </button>
          </span>
        ) : (
          <span className="text-sm text-muted">
            Tick associates in the first column to change several at once.
          </span>
        )}
      </ButtonStrip>
      <div className="min-h-0 flex-1">
        <DataGrid
          view="lmr-approved"
          label="LMR approved drivers"
          columns={columns}
          rows={views}
          getRowId={idOf}
          layoutStore={databaseLayoutStore}
          rowActions={rowActions}
          onRowActivate={(view, column) => {
            if (column === 'pick') picks.toggle(idOf(view));
            // Double-click or Space toggles approval, as the old table did.
            else toggle(rowsForMenu(views, idOf, picks.ids, view));
          }}
          onSelectionChange={(view) => setCurrentId(view ? idOf(view) : null)}
          rowTone={(view) =>
            view.associate.status.trim().toUpperCase() === 'ACTIVE' ? undefined : 'ghost'
          }
          filter={filter}
          filterControls={
            <>
              <FilterSelect
                label="Show"
                value={show}
                options={SHOW_OPTIONS}
                onChange={setShow}
                testId="lmr-show-filter"
              />
              <FilterCheck
                label="On load out"
                checked={onLoadOutOnly}
                onChange={setOnLoadOutOnly}
                testId="lmr-on-load-out"
              />
            </>
          }
          onResetFilters={() => {
            setShow(ALL_DRIVERS);
            setOnLoadOutOnly(false);
          }}
          empty={{
            title: 'No associate data loaded.',
            body: 'Import the associate export on the Associates page - LMR approval is set against those records.',
          }}
        />
      </div>
      {host}
    </>
  );
}
