// The Load Out page: today's roster and what is still in the yard, in four tabs as the old app
// had them (loadout_page.py `LoadoutPage`): Roster, Print, Available Vans, Previous Roster.
// Print sits next to the Roster because it is the roster it prints.

import { useCallback, useEffect, useState } from 'react';
import { useAppSnapshot } from '../lib/useAppSnapshot';
import { cn } from '../ui/cn';
import { AvailableVansTab } from './loadOut/AvailableVansTab';
import { PreviousRosterTab } from './loadOut/PreviousRosterTab';
import { PrintTab } from './loadOut/print';
import { RosterTab } from './loadOut/RosterTab';
import type { PageProps } from './types';

export type LoadOutTab = 'roster' | 'print' | 'available-vans' | 'previous-roster';

const TABS: { id: LoadOutTab; label: string }[] = [
  { id: 'roster', label: 'Roster' },
  { id: 'print', label: 'Print' },
  { id: 'available-vans', label: 'Available Vans' },
  { id: 'previous-roster', label: 'Previous Roster' },
];

const TAB_KEY = 'loadout.load-out-tab';

function rememberedTab(): LoadOutTab {
  try {
    const saved = globalThis.localStorage?.getItem(TAB_KEY);
    return TABS.find((tab) => tab.id === saved)?.id ?? 'roster';
  } catch {
    return 'roster';
  }
}

export function LoadOutPage({ request, takeRequest }: PageProps) {
  const { snapshot, loading, error } = useAppSnapshot();
  const [tab, setTab] = useState<LoadOutTab>(rememberedTab);
  const [status, setStatus] = useState('');
  const [pendingPrint, setPendingPrint] = useState(false);
  const printTaken = useCallback(() => setPendingPrint(false), []);

  const choose = useCallback((next: LoadOutTab) => {
    setTab(next);
    // What a tab said last is not news on the next one.
    setStatus('');
    try {
      globalThis.localStorage?.setItem(TAB_KEY, next);
    } catch {
      // The tab is then remembered until the window closes.
    }
  }, []);

  // Ctrl+O (from any page; the shell brings it here) brings in a load-out sheet on the Roster tab.
  const pendingImport = request?.action === 'import-sheet';
  const importTaken = useCallback(() => {
    takeRequest();
    choose('roster');
  }, [takeRequest, choose]);
  const shown: LoadOutTab = pendingImport ? 'roster' : tab;

  // Ctrl+P runs Print Page, the Print tab's main button, from any tab of this page.
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (!(event.ctrlKey || event.metaKey) || event.key.toLowerCase() !== 'p') return;
      if (event.altKey || event.shiftKey) return;
      event.preventDefault();
      // Not while a question is open: it would be pushed aside and never answered.
      if (document.querySelector('dialog[open]')) return;
      choose('print');
      setPendingPrint(true);
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [choose]);

  return (
    <section
      className="page-full flex min-h-0 flex-1 flex-col"
      data-page="load-out"
      aria-labelledby="title-load-out"
    >
      <div className="flex flex-wrap items-end gap-x-6 gap-y-1 border-b border-line bg-surface px-6 pt-3">
        <h1 id="title-load-out" className="pb-2 text-[1.6rem] leading-tight font-semibold">
          Load Out
        </h1>
        <div role="tablist" aria-label="Load Out tabs" className="flex gap-1">
          {TABS.map((entry) => (
            <button
              key={entry.id}
              type="button"
              role="tab"
              id={`tab-${entry.id}`}
              aria-selected={shown === entry.id}
              aria-controls={`panel-${entry.id}`}
              data-tab-button={entry.id}
              onClick={() => choose(entry.id)}
              className={cn(
                'rounded-t-md border border-b-0 px-3 py-1.5 text-sm font-medium',
                shown === entry.id
                  ? 'border-line bg-app text-fg'
                  : 'border-transparent text-muted hover:text-fg',
              )}
            >
              {entry.label}
            </button>
          ))}
        </div>
      </div>

      <div
        role="tabpanel"
        id={`panel-${shown}`}
        aria-labelledby={`tab-${shown}`}
        className="flex min-h-0 flex-1 flex-col"
      >
        {error ? (
          <p role="alert" className="problem p-6" data-testid="load-out-problem">
            {error}
          </p>
        ) : !snapshot ? (
          <p className="p-6 text-muted">{loading ? 'Getting the saved data...' : ''}</p>
        ) : shown === 'roster' ? (
          <RosterTab
            snapshot={snapshot}
            say={setStatus}
            pendingImport={pendingImport}
            onImportTaken={importTaken}
          />
        ) : shown === 'print' ? (
          <div data-tab="print" className="flex min-h-0 flex-1 flex-col">
            <PrintTab onStatus={setStatus} pendingPrint={pendingPrint} onPrintTaken={printTaken} />
          </div>
        ) : shown === 'available-vans' ? (
          <AvailableVansTab snapshot={snapshot} />
        ) : (
          <PreviousRosterTab snapshot={snapshot} say={setStatus} />
        )}
      </div>

      <div
        role="status"
        className="min-h-[2rem] border-t border-line bg-surface px-6 py-1.5 text-sm text-muted"
        data-testid="load-out-status"
      >
        {status}
      </div>
    </section>
  );
}
