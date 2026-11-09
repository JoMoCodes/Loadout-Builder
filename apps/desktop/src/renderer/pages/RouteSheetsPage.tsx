// Route Sheets: the day's route sheet PDF, who gets each page, and sending them. Three tabs:
// Distribute (the choices), Sheets (the email each driver gets, and the ways to send it) and
// History (the saved runs). Ported from Route Sheet Distributor; the driver list, the Routes file
// and the pads are the app's own (docs/RSD-MIGRATION-PLAN.md, section 3).

import { dispatchTimes, routeDataDateLabel } from '@loadout/core';
import { useCallback, useEffect, useState } from 'react';
import type { RouteSheetsDistributionView, RouteSheetsStateView } from '../../shared/routeSheets';
import type { RouteSetView } from '../../shared/snapshot';
import { PAGE_TABS, isTabOf } from '../../shared/windows';
import { FileDrop } from '../components/FileDrop';
import { call, explain } from '../lib/channels';
import { useAppSnapshot } from '../lib/useAppSnapshot';
import type { RouteKindName } from '../../shared/channels/routeData';
import { chooseFile, command, dropRefused, readNow } from './dataPages/bringIn';
import { ConfirmDialog } from './dataPages/Modal';
import { ProblemBanner, StatusLine, useMessages } from './dataPages/PageParts';
import { TabPanel, Tabs } from './dataPages/Tabs';
import { useDialogs } from './dataPages/useDialogs';
import { DistributeTab } from './routeSheets/DistributeTab';
import { HistoryTab } from './routeSheets/HistoryTab';
import { SheetsTab } from './routeSheets/SheetsTab';
import { OldAppNote, TopStrip } from './routeSheets/TopStrip';
import { RouteFileWindow, type FilePick } from './routeData/ImportWindows';
import { PadDialog } from './routeData/PadDialog';
import { padsMessage } from './routeData/routeRows';
import type { PageProps } from './types';

const TABS = PAGE_TABS['route-sheets'];

/** The banner's title when the PDF did not come in (the button's own word). */
const FAILED = 'Could not bring the PDF in';

/** Only the file's name, never its folder (a stored path may use either slash). */
function fileName(set: Pick<RouteSetView, 'sourceFile'>): string {
  return set.sourceFile.split(/[\\/]/).pop() ?? set.sourceFile;
}

interface View {
  state: RouteSheetsStateView;
  dist: RouteSheetsDistributionView;
}

export function RouteSheetsPage({ settings, changeSettings, goTo, startTab }: PageProps) {
  const { snapshot, loading, error } = useAppSnapshot();
  const [tab, setTab] = useState<string>(() =>
    isTabOf('route-sheets', startTab) ? startTab : TABS[0]!.id,
  );
  const messages = useMessages();
  const { setProblem, setStatus, clearProblem } = messages;
  const { ask, host } = useDialogs();
  const [view, setView] = useState<View | null>(null);
  const [readProblem, setReadProblem] = useState<string | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [picked, setPicked] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // The open run and who gets what: read again whenever the app says the data changed, or the
  // route data to match with is changed.
  const revision = snapshot?.revision ?? 0;
  const ready = snapshot !== null;
  const routeChoice = settings.routeSheetsRouteData;
  useEffect(() => {
    if (!ready) return;
    let off = false;
    void Promise.all([call('routeSheets:state'), call('routeSheets:distribution')]).then(
      ([state, dist]) => {
        if (off) return;
        if (state.ok && dist.ok) {
          setView({ state: state.value, dist: dist.value });
          setReadProblem(null);
        } else if (!state.ok) {
          setReadProblem(explain(state));
        } else if (!dist.ok) {
          setReadProblem(explain(dist));
        }
      },
    );
    return () => {
      off = true;
    };
  }, [revision, ready, routeChoice]);

  const choose = useCallback(
    (id: string) => {
      setTab(id);
      // What a tab said last is not news on the next one.
      setStatus('');
      clearProblem();
      setWarnings([]);
    },
    [setStatus, clearProblem],
  );

  const openSheet = useCallback((routeCode: string) => {
    setPicked(routeCode);
    setTab('sheets');
  }, []);

  /** Brings the PDF in: from the file window, or the token of a file dropped on the page. */
  async function bringIn(dropped?: string) {
    if (busy) return;
    setBusy(true);
    try {
      clearProblem();
      setWarnings([]);
      const path = dropped ?? (await chooseFile('route-sheets', messages));
      if (path === null) return;
      const done = await call('files:import', { kind: 'route-sheets', path });
      if (!done.ok) {
        setProblem({ title: FAILED, message: explain(done) });
        setStatus('The PDF did not come in.');
        return;
      }
      const read = done.value.routeSheets;
      setStatus(read?.message ?? `Read ${done.value.rows} route sheets.`);
      setWarnings(read?.warnings ?? []);
      setPicked(null);
    } finally {
      setBusy(false);
    }
  }

  /** Matches with whichever route file the roster took its routes from. */
  async function matchWithRoster() {
    await changeSettings({ routeSheetsRouteData: 'roster' });
    setStatus("Route sheets now match with the Roster's Route Data.");
  }

  /** Matches with the file brought in here, kept from before. */
  async function matchWithOwn() {
    const own = snapshot?.routeSheetsRoute;
    if (!own) return;
    await changeSettings({ routeSheetsRouteData: 'own' });
    setStatus(`Route sheets now match with the file you brought in here: ${fileName(own)}.`);
  }

  /**
   * Puts the dispatch times of the file brought in here into PADs. The words it leaves say what
   * happened, with `lead` in front (what the import just did). True when PADs were saved.
   */
  async function assignOwnPads(lead = ''): Promise<boolean> {
    const fresh = await readNow();
    const own = fresh?.routeSheetsRoute ?? null;
    if (!own || own.rows.length === 0) {
      setStatus('Import a new file on the Route data card first.');
      return false;
    }
    const chosen = await ask<Record<string, number>>((done) => (
      <PadDialog
        sourceLabel={own.label}
        dayLabel={routeDataDateLabel(own)}
        times={dispatchTimes(own)}
        current={own.pads}
        onDone={done}
      />
    ));
    if (chosen === null) {
      setStatus(
        `${lead}No PADs yet. Use Assign PADs on the Route data card when you're ready.`.trim(),
      );
      return false;
    }
    const done = await command(messages, 'routeSheets:set-route-pads', { pads: chosen });
    if (!done.ok) return false;
    setStatus(`${lead}${padsMessage(own.label, own, chosen)}`.trim());
    return true;
  }

  /**
   * "Import a new file": a route file just for the route sheets, Routes up front. It is kept
   * apart from the Roster's route data, so neither side changes the other.
   */
  async function importRouteFile() {
    if (busy) return;
    setBusy(true);
    try {
      const pick = await ask<FilePick<RouteKindName>>((done) => (
        <RouteFileWindow
          page="route-sheets"
          title="Which file should the route sheets use?"
          lead="Routes matches route sheets best. The file is kept just for the route sheets: the Roster is not touched."
          onDone={done}
          onProblem={(words) => dropRefused(messages, words)}
        />
      ));
      if (pick === null) return;
      const path = pick.token ?? (await chooseFile(pick.kind, messages));
      if (path === null) return;
      const done = await command(messages, 'routeSheets:import-route-file', {
        kind: pick.kind,
        path,
      });
      if (!done.ok) return;
      await changeSettings({ routeSheetsRouteData: 'own' });
      await assignOwnPads(`Imported ${done.value.rows} rows just for the route sheets. `);
    } finally {
      setBusy(false);
    }
  }

  /** Takes the file brought in here out. The Roster's route data is not touched. */
  async function clearOwnFile() {
    const own = snapshot?.routeSheetsRoute;
    if (!own) return;
    const yes = await ask<boolean>((done) => (
      <ConfirmDialog
        title="Clear the imported file?"
        body={
          `This takes the ${own.label} file (${fileName(own)}) out of Route Sheets. ` +
          "The Roster's Route Data is not touched.\n\n" +
          "Route sheets will match with the Roster's Route Data again."
        }
        confirmLabel="Yes, clear it"
        cancelLabel="No, keep it"
        danger
        onDone={done}
      />
    ));
    if (!yes) return;
    const done = await command(messages, 'routeSheets:clear-route-file');
    if (!done.ok) return;
    await changeSettings({ routeSheetsRouteData: 'roster' });
    setStatus("Imported file cleared. Route sheets now match with the Roster's Route Data.");
  }

  /** Starts an empty run. The open one stays in History. */
  async function newRun() {
    const done = await command(messages, 'routeSheets:new-run');
    if (!done.ok) return;
    choose('distribute');
    setStatus('Started a new run. Bring in the route sheet PDF to fill it.');
  }

  const showNote = view !== null && view.state.oldAppFolder && !settings.routeSheetsNoteSeen;

  return (
    <section
      className="page-full flex min-h-0 flex-1 flex-col"
      data-page="route-sheets"
      aria-labelledby="title-route-sheets"
    >
      <FileDrop
        page="route-sheets"
        kind="route-sheets"
        onDropped={(token) => void bringIn(token)}
        onProblem={(words) => {
          setProblem({ title: FAILED, message: words });
          setStatus('The PDF did not come in.');
        }}
      >
        <div className="border-b border-line bg-surface px-6 pt-3 pb-1">
          <h1 id="title-route-sheets" className="text-[1.6rem] leading-tight font-semibold">
            Route Sheets
          </h1>
        </div>
        {showNote ? (
          <OldAppNote onGotIt={() => void changeSettings({ routeSheetsNoteSeen: true })} />
        ) : null}
        <Tabs
          label="Route sheets"
          name="route-sheets"
          page="route-sheets"
          tabs={TABS}
          value={tab}
          onChange={choose}
        />
        <ProblemBanner problem={messages.problem} onClose={clearProblem} name="route-sheets" />
        {error || readProblem ? (
          <p role="alert" className="problem px-6 py-4" data-testid="route-sheets-load-problem">
            {error ?? readProblem}
          </p>
        ) : !snapshot || !view ? (
          <p className="px-6 py-4 text-muted">
            {loading || !view ? 'Getting the saved data...' : ''}
          </p>
        ) : (
          <>
            <TopStrip
              state={view.state}
              busy={busy}
              onBringIn={() => void bringIn()}
              onNewRun={() => void newRun()}
              goTo={goTo}
              rosterKind={snapshot.roster.routeSource}
              choice={routeChoice}
              ownFile={snapshot.routeSheetsRoute}
              onUseRoster={() => void matchWithRoster()}
              onUseOwn={() => void matchWithOwn()}
              onImportRouteFile={() => void importRouteFile()}
              onAssignPads={() => void assignOwnPads()}
              onClearOwn={() => void clearOwnFile()}
            />
            <TabPanel name="route-sheets" id={tab}>
              {tab === 'distribute' ? (
                <div className="min-h-0 flex-1 overflow-auto">
                  <DistributeTab
                    state={view.state}
                    dist={view.dist}
                    snapshot={snapshot}
                    messages={messages}
                    openSheet={openSheet}
                  />
                </div>
              ) : null}
              {tab === 'sheets' ? (
                <SheetsTab
                  state={view.state}
                  dist={view.dist}
                  revision={revision}
                  messages={messages}
                  ask={ask}
                  picked={picked}
                  onPick={setPicked}
                  onDistribute={() => choose('distribute')}
                  wording={settings.routeSheetsEmail}
                  changeSettings={changeSettings}
                />
              ) : null}
              {tab === 'history' ? (
                <HistoryTab
                  state={view.state}
                  revision={revision}
                  messages={messages}
                  ask={ask}
                  onDistribute={() => setTab('distribute')}
                />
              ) : null}
            </TabPanel>
          </>
        )}
        <StatusLine text={messages.status} name="route-sheets" action={messages.statusAction} />
        {warnings.length > 0 ? (
          <ul
            className="m-0 list-disc border-t border-line bg-surface py-1 pr-6 pl-11 text-sm text-warn"
            data-testid="route-sheets-warnings"
          >
            {warnings.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        ) : null}
        {host}
      </FileDrop>
    </section>
  );
}
