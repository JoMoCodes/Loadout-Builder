// The Load Out page: today's roster and what is still in the yard, in the four tabs the old app
// had (loadout_page.py `LoadoutPage`): Roster, Print, Available Vans, Previous Roster, and a
// fifth, Name and ID Links, that lists the links made by hand on the Roster tab.
// Print sits next to the Roster because it is the roster it prints.
//
// Between them, a tab for each file brought in with Import Route Data (Routes, Itineraries,
// Weekly Schedule, DWP), shown only while that file is loaded. They were the Route Data page.

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { RouteKindName } from '../../shared/channels/routeData';
import type { AppSnapshot } from '../../shared/snapshot';
import { LOAD_OUT_TABS, type LoadOutTab } from '../../shared/windows';
import { OpenInNewWindow } from '../components/OpenInNewWindow';
import { useAppSnapshot } from '../lib/useAppSnapshot';
import { cn } from '../ui/cn';
import { ProblemBanner, useMessages } from './dataPages/PageParts';
import { AvailableVansTab } from './loadOut/AvailableVansTab';
import { LinksTab } from './loadOut/LinksTab';
import { LoadOutSettingsButton, LoadOutSettingsDialog } from './loadOut/LoadOutSettings';
import { PreviousRosterTab } from './loadOut/PreviousRosterTab';
import { PrintTab } from './loadOut/print';
import { RosterTab } from './loadOut/RosterTab';
import { DwpTab } from './routeData/DwpTab';
import { RouteSourceTab } from './routeData/RouteSourceTab';
import type { PageProps } from './types';

export type { LoadOutTab };

const TABS = LOAD_OUT_TABS;

const TAB_KEY = 'loadout.load-out-tab';

const isTab = (id: string | null | undefined): id is LoadOutTab =>
  TABS.some((tab) => tab.id === id);

/** The tabs of the files brought in with Import Route Data. */
const FILE_TABS: readonly string[] = ['routes', 'itineraries', 'schedule', 'dwp'];

/** Whether a file's tab has something to show: its file is loaded. Every other tab always does. */
function loaded(snapshot: AppSnapshot | null, id: LoadOutTab): boolean {
  if (!FILE_TABS.includes(id)) return true;
  if (!snapshot) return false;
  if (id === 'dwp') return snapshot.dwp.set.rows.length > 0;
  return snapshot.routeSets.some((set) => set.kind === id && set.rows.length > 0);
}

function rememberedTab(): LoadOutTab {
  try {
    const saved = globalThis.localStorage?.getItem(TAB_KEY);
    return isTab(saved) ? saved : 'roster';
  } catch {
    return 'roster';
  }
}

export function LoadOutPage({
  request,
  takeRequest,
  ownWindow,
  startTab,
  settings,
  changeSettings,
}: PageProps) {
  const { snapshot, loading, error } = useAppSnapshot();
  const [tab, setTab] = useState<LoadOutTab>(() => (isTab(startTab) ? startTab : rememberedTab()));
  const messages = useMessages();
  const { setStatus, clearProblem } = messages;
  const [pendingPrint, setPendingPrint] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const printTaken = useCallback(() => setPendingPrint(false), []);

  const choose = useCallback(
    (next: LoadOutTab) => {
      setTab(next);
      // What a tab said last is not news on the next one.
      setStatus('');
      clearProblem();
      // A page-only window does not change which tab the main window opens on next time.
      if (ownWindow) return;
      try {
        globalThis.localStorage?.setItem(TAB_KEY, next);
      } catch {
        // The tab is then remembered until the window closes.
      }
    },
    [ownWindow, setStatus, clearProblem],
  );

  // Ctrl+O (from any page; the shell brings it here) brings in a load-out sheet on the Roster tab.
  const pendingImport = request?.action === 'import-sheet';
  const importTaken = useCallback(() => {
    takeRequest();
    choose('roster');
  }, [takeRequest, choose]);
  // A file's tab whose file is gone (cleared) shows the Roster instead.
  const shown: LoadOutTab = pendingImport || !loaded(snapshot, tab) ? 'roster' : tab;
  const tabs = useMemo(() => TABS.filter((entry) => loaded(snapshot, entry.id)), [snapshot]);

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
          {tabs.map((entry) => (
            <OpenInNewWindow key={entry.id} target={{ page: 'load-out', tab: entry.id }}>
              <button
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
                {FILE_TABS.includes(entry.id) ? (
                  // A small green dot: this tab is a file brought in with Import Route Data.
                  <span
                    aria-hidden="true"
                    className="mr-1.5 inline-block size-1.5 rounded-full bg-ok align-middle"
                  />
                ) : null}
                {entry.label}
              </button>
            </OpenInNewWindow>
          ))}
        </div>
        <div className="ml-auto pb-2">
          <LoadOutSettingsButton onClick={() => setSettingsOpen(true)} />
        </div>
      </div>

      <div
        role="tabpanel"
        id={`panel-${shown}`}
        aria-labelledby={`tab-${shown}`}
        className="flex min-h-0 flex-1 flex-col"
      >
        <ProblemBanner problem={messages.problem} onClose={clearProblem} name="load-out-import" />
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
            settings={settings}
            changeSettings={changeSettings}
            messages={messages}
            // Back to the tab already open says nothing new, so the status line keeps its words.
            showTab={(next) => {
              if (next !== shown) choose(next);
            }}
          />
        ) : shown === 'dwp' ? (
          <DwpTab snapshot={snapshot} messages={messages} />
        ) : FILE_TABS.includes(shown) ? (
          <RouteSourceTab
            key={shown}
            kind={shown as RouteKindName}
            snapshot={snapshot}
            messages={messages}
          />
        ) : shown === 'print' ? (
          <div data-tab="print" className="flex min-h-0 flex-1 flex-col">
            <PrintTab onStatus={setStatus} pendingPrint={pendingPrint} onPrintTaken={printTaken} />
          </div>
        ) : shown === 'available-vans' ? (
          <AvailableVansTab snapshot={snapshot} />
        ) : shown === 'links' ? (
          <LinksTab snapshot={snapshot} say={setStatus} />
        ) : (
          <PreviousRosterTab snapshot={snapshot} say={setStatus} />
        )}
      </div>

      <div
        role="status"
        className="min-h-[2rem] border-t border-line bg-surface px-6 py-1.5 text-sm text-muted"
        data-testid="load-out-status"
      >
        {messages.status}
      </div>
      {settingsOpen ? (
        <LoadOutSettingsDialog
          settings={settings}
          changeSettings={changeSettings}
          onDone={() => setSettingsOpen(false)}
        />
      ) : null}
    </section>
  );
}
