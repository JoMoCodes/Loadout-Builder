// The History tab: every saved run (a day's route sheets with the choices and sent marks), to open
// again or delete, and New run. Runs older than 30 days are cleared when the app opens, so there
// is no question about earlier days and no output folder (migration plan, section 3, items 7 and 8).

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { RouteSheetsRunListing, RouteSheetsStateView } from '../../../shared/routeSheets';
import { DataGrid, type GridColumn, type RowAction } from '../../components/DataGrid';
import { call, explain } from '../../lib/channels';
import { databaseLayoutStore } from '../../lib/gridLayoutStore';
import { Button } from '../../ui/button';
import { Chip } from '../../ui/chip';
import { command } from '../dataPages/bringIn';
import { ConfirmDialog } from '../dataPages/Modal';
import { ButtonStrip, type Messages } from '../dataPages/PageParts';
import type { Asker } from '../dataPages/useDialogs';
import { shortWhen } from './words';

interface HistoryTabProps {
  state: RouteSheetsStateView;
  revision: number;
  messages: Messages;
  ask: Asker;
  /** Moves to the Distribute tab (after opening a run or starting a new one). */
  onDistribute: () => void;
}

const rowId = (run: RouteSheetsRunListing) => run.id;

export function HistoryTab({ state, revision, messages, ask, onDistribute }: HistoryTabProps) {
  const [runs, setRuns] = useState<RouteSheetsRunListing[] | null>(null);
  const openId = state.run.saved ? state.run.id : null;

  useEffect(() => {
    let off = false;
    void call('routeSheets:runs').then((reply) => {
      if (off) return;
      if (reply.ok) setRuns(reply.value);
      else
        messages.setProblem({ title: 'The saved runs could not be read', message: explain(reply) });
    });
    return () => {
      off = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- read again on a new revision only
  }, [revision]);

  const act = useRef({ messages, ask, onDistribute });
  useLayoutEffect(() => {
    act.current = { messages, ask, onDistribute };
  });

  const openRun = useCallback(async (run: RouteSheetsRunListing) => {
    const { messages: m, onDistribute: go } = act.current;
    const done = await command(m, 'routeSheets:load-run', { id: run.id });
    if (!done.ok) return;
    m.setStatus(`Opened ${run.label}.`);
    go();
  }, []);

  const deleteRun = useCallback(async (run: RouteSheetsRunListing) => {
    const { messages: m, ask: question } = act.current;
    const yes = await question<boolean>((done) => (
      <ConfirmDialog
        title="Delete this run?"
        body={`${run.label}\n\nIts choices and sent marks go with it.`}
        confirmLabel="Yes, delete it"
        cancelLabel="No, keep it"
        danger
        onDone={done}
      />
    ));
    if (!yes) return;
    const done = await command(m, 'routeSheets:delete-run', { id: run.id });
    if (done.ok) m.setStatus(`Deleted ${run.label}.`);
  }, []);

  async function newRun() {
    const done = await command(messages, 'routeSheets:new-run');
    if (!done.ok) return;
    messages.setStatus('Started a new run. Bring in the route sheet PDF to fill it.');
    onDistribute();
  }

  const columns = useMemo<GridColumn<RouteSheetsRunListing>[]>(
    () => [
      {
        id: 'day',
        header: 'Run',
        value: (run) => run.label,
        cell: (run) => (
          <span className="flex items-center gap-2 truncate">
            <span className="truncate font-semibold">{run.label}</span>
            {run.id === openId ? (
              <Chip tone="info" icon={null}>
                Open
              </Chip>
            ) : null}
          </span>
        ),
        fitExtra: 70,
      },
      { id: 'sheets', header: 'Route sheets', align: 'right', value: (run) => String(run.sheets) },
      { id: 'pdf', header: 'PDF file', value: (run) => run.pdfFileName ?? '' },
      { id: 'routes', header: 'Routes file', value: (run) => run.routesFileName ?? '' },
      { id: 'changed', header: 'Last changed', value: (run) => shortWhen(run.updatedAt) },
      {
        id: 'pdf-missing',
        header: 'PDF',
        value: (run) => (run.pdfMissing ? 'PDF missing' : ''),
        cell: (run) =>
          run.pdfMissing ? (
            <Chip tone="bad" data-testid={`route-sheets-run-pdf-missing-${run.id}`}>
              PDF missing
            </Chip>
          ) : (
            <span />
          ),
        fitExtra: 28,
      },
      {
        id: 'actions',
        header: 'Actions',
        sortable: false,
        value: () => 'Open Delete',
        cell: (run) => (
          <span
            className="flex items-center gap-2"
            onDoubleClick={(event) => event.stopPropagation()}
          >
            <Button
              size="sm"
              tabIndex={-1}
              disabled={run.id === openId}
              onClick={(event) => {
                event.stopPropagation();
                void openRun(run);
              }}
              data-testid={`route-sheets-open-run-${run.id}`}
            >
              Open
            </Button>
            <Button
              size="sm"
              variant="danger"
              tabIndex={-1}
              onClick={(event) => {
                event.stopPropagation();
                void deleteRun(run);
              }}
              data-testid={`route-sheets-delete-run-${run.id}`}
            >
              Delete
            </Button>
          </span>
        ),
        fitExtra: 60,
      },
    ],
    [openId, openRun, deleteRun],
  );

  const rowActions = useMemo<RowAction<RouteSheetsRunListing>[]>(
    () => [
      {
        id: 'open',
        label: 'Open this run',
        disabled: (run) => run.id === openId,
        onSelect: (run) => void openRun(run),
      },
      {
        id: 'delete',
        label: 'Delete this run...',
        danger: true,
        separatorBefore: true,
        onSelect: (run) => void deleteRun(run),
      },
    ],
    [openId, openRun, deleteRun],
  );

  const activate = useCallback(
    (run: RouteSheetsRunListing) => {
      if (run.id !== openId) void openRun(run);
    },
    [openId, openRun],
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <h2 className="m-0 border-b border-line bg-surface px-6 pt-3 pb-1 text-[1.15rem] font-semibold">
        Saved runs
      </h2>
      <ButtonStrip label="Saved runs">
        <Button onClick={() => void newRun()} data-testid="route-sheets-new-run">
          New run
        </Button>
        <span className="text-sm text-muted" data-testid="route-sheets-history-note">
          Every route sheet PDF you bring in is saved here with your choices, so you can open it
          again. Runs older than 30 days are cleared when the app opens.
        </span>
      </ButtonStrip>
      <div className="min-h-0 flex-1">
        <DataGrid
          view="route-sheets-history"
          label="Saved runs"
          columns={columns}
          rows={runs ?? state.runs}
          getRowId={rowId}
          layoutStore={databaseLayoutStore}
          rowActions={rowActions}
          onRowActivate={activate}
          noActionText="Right-click a run to open it or delete it."
          empty={{
            title: 'No saved runs yet.',
            body: 'A run is saved when a route sheet PDF comes in.',
          }}
        />
      </div>
    </div>
  );
}
