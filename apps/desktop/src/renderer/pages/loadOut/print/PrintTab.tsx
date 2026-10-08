// The Print tab: build the sheet you actually want, see it, then print it.
//
// Ported from the old app's Print tab (print_page.py). Three panels, left to right, in the order
// the questions get asked (what goes on the page, how the page is set up, who is on it), the three
// buttons, the saved layouts, and under it all the page as it will print. What prints in a cell is
// what the Roster tab shows in it: the rows come from the core's own print rows, and the preview is
// drawn from the same marks the PDF is written from.

import { printing } from '@loadout/core';
import { useEffect, useEffectEvent, useMemo, useRef, useState } from 'react';
import { drawPrintSheet, planPrint } from '../../../../shared/print/sheet';
import { call, explain } from '../../../lib/channels';
import { Button } from '../../../ui/button';
import { useAsker } from './AskDialog';
import { ColumnsPanel } from './ColumnsPanel';
import { SetupPanel } from './SetupPanel';
import { SheetPreview } from './SheetPreview';
import { WhoPanel } from './WhoPanel';
import { pagesWord, summary, writtenNote } from './logic';
import { usePrintTab } from './usePrintTab';

type PrintSpec = printing.PrintSpec;

interface PrintTabProps {
  /** Plain words for the Load Out page's status line at the bottom. */
  onStatus: (words: string) => void;
  /** Ctrl+P was pressed: run Print Page once the layout is ready, then call `onPrintTaken`. */
  pendingPrint?: boolean;
  onPrintTaken?: () => void;
}

export function PrintTab({ onStatus: setStatus, pendingPrint, onPrintTaken }: PrintTabProps) {
  const tab = usePrintTab();
  const asker = useAsker();
  const [selected, setSelected] = useState<number | null>(0);
  const [preset, setPreset] = useState('');
  const [openAfter, setOpenAfter] = useState(true);
  const [busy, setBusy] = useState(false);
  const { spec, view } = tab;

  const doc = useMemo(() => {
    if (!spec || !view || view.rosterEmpty || spec.columns.length === 0) return null;
    const plan = planPrint(view.rows, spec, view.dateLabel);
    if (plan.pages.length === 0) return null;
    return drawPrintSheet(plan.printing, spec, plan.geo, plan.pages, plan.title);
  }, [spec, view]);

  async function write(vans: boolean) {
    if (!spec) return;
    await tab.flush();
    setBusy(true);
    const reply = await call('print:print', {
      spec: printing.specToDict(spec),
      vans,
      openAfter,
    });
    setBusy(false);
    if (!reply.ok) {
      if (view?.rosterEmpty) {
        setStatus('Nothing to print - no roster loaded.');
        return asker.tell('No roster', explain(reply));
      }
      setStatus('Nothing written.');
      return asker.tell("Couldn't print that", explain(reply));
    }
    const done = reply.value;
    if (done.status === 'cancelled') return setStatus('Printing cancelled.');
    setStatus(
      writtenNote(done, vans ? 'without a van' : '') +
        (done.openFailed ? ' It was written, but could not be opened.' : ''),
    );
  }

  // Ctrl+P: Print Page, once the layout is ready. Taken once, even when the tab has only just
  // opened for it (the dev server runs effects twice on purpose).
  const printFromKey = useEffectEvent(() => void write(false));
  const taking = useRef(false);
  const ready = Boolean(spec && view);
  useEffect(() => {
    if (!pendingPrint) {
      taking.current = false;
      return;
    }
    if (!ready || taking.current) return;
    taking.current = true;
    onPrintTaken?.();
    printFromKey();
  }, [pendingPrint, ready, onPrintTaken]);

  if (!spec || !view) {
    return (
      <div className="p-4" data-testid="print-tab">
        {tab.problem ? (
          <p role="alert" className="problem" data-testid="print-problem">
            {tab.problem}
          </p>
        ) : (
          <p className="text-muted">Getting the print layout...</p>
        )}
      </div>
    );
  }

  const top = summary(spec, view.rows, view.dateLabel, view.rosterEmpty);
  const columnCount = spec.columns.length;
  const selectedIndex = columnCount ? Math.min(selected ?? 0, columnCount - 1) : null;
  const presetShown = tab.presets.includes(preset) ? preset : '';

  async function preview() {
    if (!spec) return;
    setBusy(true);
    const reply = await call('print:preview', { spec: printing.specToDict(spec) });
    setBusy(false);
    if (!reply.ok) {
      if (view?.rosterEmpty) {
        setStatus('Nothing to print - no roster loaded.');
        return asker.tell('No roster', explain(reply));
      }
      return asker.tell('Nothing to preview', explain(reply));
    }
    setStatus(
      `Preview: ${reply.value.drivers} drivers on ${pagesWord(reply.value.pages)}.` +
        (reply.value.openFailed ? ' It could not be opened.' : ''),
    );
  }

  async function savePreset() {
    if (!spec) return;
    const typed = await asker.ask(
      'Save this layout',
      'What should this layout be called?\n\n' +
        'Everything on this tab is saved under it - the columns, the page setup, and who is left off.',
      presetShown,
    );
    if (typed === null) return;
    const name = typed.trim();
    if (!name) return setStatus('A saved layout needs a name.');
    if (
      tab.presets.includes(name) &&
      !(await asker.confirm(
        'Replace that layout?',
        `'${name}' already exists.\n\nReplace it with what is on the tab now?`,
      ))
    ) {
      return;
    }
    const reply = await call('print:save-preset', { name, spec: printing.specToDict(spec) });
    if (!reply.ok) return setStatus(explain(reply));
    setPreset(name);
    setStatus(`Saved this layout as '${name}'.`);
  }

  async function loadPreset(name: string) {
    setPreset(name);
    if (!name) return;
    const reply = await call('print:load-preset', { name });
    if (!reply.ok) return setStatus(explain(reply));
    tab.replace(reply.value);
    setSelected(0);
    setStatus(`Loaded the '${name}' layout.`);
  }

  async function deletePreset() {
    if (!presetShown) return setStatus('Pick a saved layout to delete first.');
    const name = presetShown;
    const sure = await asker.confirm(
      'Delete that layout?',
      `Remove the saved layout '${name}'?\n\nWhat is on the tab now is kept - only the saved copy goes.`,
    );
    if (!sure) return;
    const reply = await call('print:delete-preset', { name });
    if (!reply.ok) return setStatus(explain(reply));
    setPreset('');
    setStatus(`Deleted the '${name}' layout.`);
  }

  async function resetLayout() {
    const sure = await asker.confirm(
      'Reset the layout?',
      'Put the columns, the page setup and who prints back to the sheet this tab started with - ' +
        "the same five columns 'Export Roster' writes, with a blank either side.\n\n" +
        'Saved layouts are kept.',
    );
    if (!sure) return;
    const reply = await call('print:reset');
    if (!reply.ok) return setStatus(explain(reply));
    tab.replace(reply.value);
    setPreset('');
    setSelected(0);
    setStatus('Print layout back to how it started.');
  }

  const change = (next: PrintSpec, typed?: boolean) => tab.change(next, typed);

  return (
    <div className="flex min-w-0 flex-col gap-3 p-4" data-testid="print-tab">
      <header className="flex flex-wrap items-start justify-between gap-3 rounded-lg border border-line bg-surface px-4 py-3">
        <div className="min-w-0">
          <h2 className="text-lg font-semibold" data-testid="print-title">
            {top.title}
          </h2>
          <p className="text-sm text-muted" data-testid="print-subtitle">
            {top.subtitle}
          </p>
        </div>
        <div className="text-right">
          <p className="text-lg font-semibold tabular-nums" data-testid="print-page-count">
            {top.pages}
          </p>
          <p className="text-sm text-muted" data-testid="print-shape">
            {top.shape}
          </p>
          <p className="text-sm text-muted" data-testid="print-warning">
            {top.warning}
          </p>
        </div>
      </header>

      <div className="flex flex-wrap items-center gap-2 rounded-lg border border-line bg-surface px-3 py-2">
        <Button
          variant="primary"
          disabled={busy}
          onClick={() => void write(false)}
          data-testid="print-page"
          title="Ctrl+P"
        >
          Print Page
        </Button>
        <Button disabled={busy} onClick={() => void write(true)} data-testid="print-vans">
          Print Vans
        </Button>
        <Button disabled={busy} onClick={() => void preview()} data-testid="print-preview-file">
          Preview
        </Button>
        <label className="ml-2 flex items-center gap-1.5 text-sm">
          <input
            type="checkbox"
            checked={openAfter}
            onChange={(event) => setOpenAfter(event.target.checked)}
            data-testid="print-open-after"
          />
          Open it when saved
        </label>
        <span className="ml-auto flex flex-wrap items-center gap-2">
          <label htmlFor="print-preset" className="text-sm">
            Saved layout
          </label>
          <select
            id="print-preset"
            className="h-8 w-48 rounded-md border border-line-strong bg-sunken px-2 text-sm"
            value={presetShown}
            onChange={(event) => void loadPreset(event.target.value)}
            data-testid="print-preset"
          >
            <option value="" />
            {tab.presets.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
          <Button onClick={() => void savePreset()} data-testid="print-save-preset">
            Save As...
          </Button>
          <Button onClick={() => void deletePreset()} data-testid="print-delete-preset">
            Delete
          </Button>
          <Button onClick={() => void resetLayout()} data-testid="print-reset">
            Reset Layout
          </Button>
        </span>
      </div>
      {tab.problem ? (
        <p role="alert" className="problem" data-testid="print-problem">
          {tab.problem}
        </p>
      ) : null}

      <div className="grid grid-cols-1 gap-3 xl:grid-cols-[minmax(22rem,1fr)_minmax(20rem,1fr)_minmax(22rem,1.3fr)]">
        <ColumnsPanel
          spec={spec}
          rows={view.rows}
          selected={selectedIndex}
          select={setSelected}
          change={change}
          say={setStatus}
          asker={asker}
        />
        <SetupPanel spec={spec} change={change} />
        <WhoPanel spec={spec} view={view} change={change} say={setStatus} />
      </div>

      <SheetPreview doc={doc} />
      {asker.element}
    </div>
  );
}
