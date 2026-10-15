// Route Sheets: the day's route sheet PDF, who gets each page, and sending them. Three tabs:
// Distribute (the choices), Sheets (the email each driver gets, and the ways to send it) and
// History (the saved runs). Ported from Route Sheet Distributor; the driver list, the Routes file
// and the pads are the app's own (docs/RSD-MIGRATION-PLAN.md, section 3).

import { useCallback, useEffect, useState } from 'react';
import type { RouteSheetsDistributionView, RouteSheetsStateView } from '../../shared/routeSheets';
import { PAGE_TABS, isTabOf } from '../../shared/windows';
import { FileDrop } from '../components/FileDrop';
import { call, explain } from '../lib/channels';
import { useAppSnapshot } from '../lib/useAppSnapshot';
import { chooseFile } from './dataPages/bringIn';
import { ProblemBanner, StatusLine, useMessages } from './dataPages/PageParts';
import { TabPanel, Tabs } from './dataPages/Tabs';
import { useDialogs } from './dataPages/useDialogs';
import { DistributeTab } from './routeSheets/DistributeTab';
import { HistoryTab } from './routeSheets/HistoryTab';
import { SheetsTab } from './routeSheets/SheetsTab';
import { OldAppNote, TopStrip } from './routeSheets/TopStrip';
import type { PageProps } from './types';

const TABS = PAGE_TABS['route-sheets'];

/** The banner's title when the PDF did not come in (the button's own word). */
const FAILED = 'Could not bring the PDF in';

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

  // The open run and who gets what: read again whenever the app says the data changed.
  const revision = snapshot?.revision ?? 0;
  const ready = snapshot !== null;
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
  }, [revision, ready]);

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
            <TopStrip state={view.state} busy={busy} onBringIn={() => void bringIn()} goTo={goTo} />
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
