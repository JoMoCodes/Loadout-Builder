// The associate list: the anchor records behind route and van data. Ported from the old app's
// AssociatesPage. Import and Clear ask first, since they replace or remove the list.

import { FileDrop } from '../../components/FileDrop';
import { useCallback, useEffect, useEffectEvent, useMemo, useState } from 'react';
import { DataGrid, type GridColumn } from '../../components/DataGrid';
import type { AppSnapshot, AssociateView } from '../../../shared/snapshot';
import { databaseLayoutStore } from '../../lib/gridLayoutStore';
import { Button } from '../../ui/button';
import { Chip } from '../../ui/chip';
import { bringInFile, command, dropRefused, readNow } from '../dataPages/bringIn';
import { baseName, sourceLine } from '../dataPages/format';
import { ConfirmDialog } from '../dataPages/Modal';
import {
  ButtonStrip,
  FilterCheck,
  FilterSelect,
  HeaderCard,
  type Messages,
} from '../dataPages/PageParts';
import { useDialogs } from '../dataPages/useDialogs';
import { importTenure } from './importTenure';
import {
  ALL_QUALS,
  ALL_STATUSES,
  ASSOCIATES_EMPTY,
  ASSOCIATE_COLUMNS,
  STATUS_OPTIONS,
  associateCell,
  associateCountLine,
  associateTone,
  associatesImportedMessage,
  expiryLine,
  expiryText,
  idOf,
  passesAssociateFilters,
  qualificationLine,
  qualificationOptions,
} from './associateRows';

export function AssociatesTab({
  snapshot,
  messages,
  pendingImport = false,
  onImportTaken,
}: {
  snapshot: AppSnapshot;
  messages: Messages;
  /** Ctrl+I was pressed: run Import Associates, then call `onImportTaken`. */
  pendingImport?: boolean;
  onImportTaken?: () => void;
}) {
  const { setStatus } = messages;
  const { ask, host } = useDialogs();
  const [status, setStatusFilter] = useState<string>(ALL_STATUSES);
  const [qualification, setQualification] = useState(ALL_QUALS);
  const [onLoadOutOnly, setOnLoadOutOnly] = useState(false);
  const [busy, setBusy] = useState(false);

  const views = snapshot.associates;
  const empty = views.length === 0;
  const quals = useMemo(() => qualificationOptions(views), [views]);
  // The drop-down falls back to "all" when its qualification is no longer in the list.
  const qualChoice = quals.includes(qualification) ? qualification : ALL_QUALS;

  const columns = useMemo<GridColumn<AssociateView>[]>(
    () =>
      ASSOCIATE_COLUMNS.map((spec) => {
        const base: GridColumn<AssociateView> = {
          id: spec.id,
          header: spec.header,
          value: (view) => associateCell(view, spec.id),
          align: 'align' in spec ? spec.align : undefined,
          mono: 'mono' in spec ? spec.mono : undefined,
        };
        if (spec.id !== 'id_expiration') return base;
        return {
          ...base,
          fitExtra: 24,
          cell: (view) => {
            const { text, tone } = expiryText(view);
            if (!text) return <span className="text-faint">-</span>;
            return tone ? (
              <Chip tone={tone}>{text}</Chip>
            ) : (
              <span className="truncate">{text}</span>
            );
          },
        };
      }),
    [],
  );

  const filter = useCallback(
    (view: AssociateView) => passesAssociateFilters(view, status, qualChoice, onLoadOutOnly),
    [status, qualChoice, onLoadOutOnly],
  );

  function resetFilters() {
    setStatusFilter(ALL_STATUSES);
    setQualification(ALL_QUALS);
    setOnLoadOutOnly(false);
  }

  async function importAssociates(dropped?: string) {
    if (busy) return;
    if (!empty) {
      const yes = await ask<boolean>((done) => (
        <ConfirmDialog
          title="Replace the associate list?"
          body={`The ${views.length} associate records now in the app will be replaced by ${dropped ? 'the file you dropped' : 'the file you choose'}.\n\nLifetime route counts and the load-out roster are kept.`}
          confirmLabel={dropped ? 'Yes, replace it' : 'Yes, choose a file'}
          cancelLabel="No, keep the list"
          onDone={done}
        />
      ));
      if (!yes) return;
    }
    setBusy(true);
    try {
      const done = await bringInFile('associates', messages, dropped);
      if (!done) return;
      resetFilters();
      const fresh = await readNow();
      if (fresh) setStatus(associatesImportedMessage(fresh, done.rows, baseName(done.path)));
    } finally {
      setBusy(false);
    }
  }

  // Run a moment after the tab is drawn, so a page that has only just opened for it is settled
  // first (the dev server draws everything twice on purpose, and would close the question).
  const importFromKey = useEffectEvent(() => void importAssociates());
  useEffect(() => {
    if (!pendingImport) return;
    const timer = setTimeout(() => {
      onImportTaken?.();
      importFromKey();
    }, 0);
    return () => clearTimeout(timer);
  }, [pendingImport, onImportTaken]);

  async function importTenureFile() {
    if (busy) return;
    setBusy(true);
    try {
      await importTenure(messages);
    } finally {
      setBusy(false);
    }
  }

  async function clearAssociates() {
    if (empty) {
      setStatus('Nothing to clear - no associate data loaded.');
      return;
    }
    const yes = await ask<boolean>((done) => (
      <ConfirmDialog
        title="Clear associate data?"
        body={`Remove all ${views.length} associate records?\n\nLoad-out drivers will lose their Transporter IDs and qualifications until you import again. The load-out roster itself is kept.`}
        confirmLabel="Yes, clear"
        cancelLabel="No, keep them"
        danger
        onDone={done}
      />
    ));
    if (!yes) return;
    const reply = await command(messages, 'associates:clear');
    if (!reply.ok) return;
    resetFilters();
    setStatus('Associate data cleared.');
  }

  return (
    <FileDrop
      page="associates"
      kind="associates"
      onDropped={(token) => void importAssociates(token)}
      onProblem={(words) => dropRefused(messages, words)}
    >
      <HeaderCard
        name="associates"
        title={empty ? 'No associate data loaded' : 'Associates'}
        sub={
          empty
            ? ''
            : sourceLine(
                snapshot.sources.associates.sourceFile,
                snapshot.sources.associates.importedAt,
              )
        }
        metric={empty ? '0 associates' : associateCountLine(snapshot)}
        details={empty ? [] : [qualificationLine(views), expiryLine(snapshot)]}
      />
      <ButtonStrip label="Associate actions">
        <Button
          onClick={() => void importAssociates()}
          title="Ctrl+I"
          disabled={busy}
          data-testid="import-associates"
        >
          Import Associates
        </Button>
        <Button onClick={() => void importTenureFile()} disabled={busy} data-testid="import-tenure">
          Import Tenure
        </Button>
        <Button onClick={() => void clearAssociates()} data-testid="clear-associates">
          Clear Associates
        </Button>
      </ButtonStrip>
      <div className="min-h-0 flex-1">
        <DataGrid
          view="associates"
          label="Associates"
          columns={columns}
          rows={views}
          getRowId={idOf}
          layoutStore={databaseLayoutStore}
          rowTone={associateTone}
          needsAttention={(view) => {
            const tone = associateTone(view);
            return tone === 'bad' || tone === 'warn';
          }}
          filter={filter}
          filterControls={
            <>
              <FilterSelect
                label="Status"
                value={status}
                options={STATUS_OPTIONS}
                onChange={setStatusFilter}
                testId="associate-status-filter"
              />
              <FilterSelect
                label="Qualification"
                value={qualChoice}
                options={quals}
                onChange={setQualification}
                testId="associate-qualification-filter"
              />
              <FilterCheck
                label="On load out"
                checked={onLoadOutOnly}
                onChange={setOnLoadOutOnly}
                testId="associate-on-load-out"
              />
            </>
          }
          onResetFilters={resetFilters}
          empty={ASSOCIATES_EMPTY}
        />
      </div>
      {host}
    </FileDrop>
  );
}
