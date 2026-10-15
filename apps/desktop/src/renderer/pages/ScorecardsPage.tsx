// Scorecards: the weekly scorecards for every driver. Three tabs: Performance (the grid, making
// and emailing the reports), Reports (colours, a preview, the thresholds) and Imports (bringing in
// the weekly exports). Ported from the Weekly Performance App. Phone numbers and emails are on the
// Associates page, with everything else about a driver.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { PerfDriversView } from '../../shared/performance';
import { EMPTY_PERF_SNAPSHOT } from '../../shared/performance';
import type { WeekRangeChoice } from '../../shared/performanceSettings';
import { PAGE_TABS, currentTarget, isTabOf } from '../../shared/windows';
import { call, explain } from '../lib/channels';
import { useAppSnapshot } from '../lib/useAppSnapshot';
import { clearPerformanceHandoff, peekPerformanceHandoff } from './dashboard/handoff';
import { ProblemBanner, StatusLine, useMessages } from './dataPages/PageParts';
import { TabPanel, Tabs } from './dataPages/Tabs';
import { ImportsTab } from './performance/ImportsTab';
import { PerformanceTab } from './performance/PerformanceTab';
import {
  effectiveRange,
  matchesSearch,
  passesFilters,
  readFilters,
  writeFilters,
  type DriverFilters,
} from './performance/perfText';
import { ReportsTab } from './performance/ReportsTab';
import type { PageProps } from './types';

const TABS = PAGE_TABS.scorecards;

const TAB_KEY = 'loadout.scorecards-tab';
/** Where the tab was remembered when the page was called Performance. */
const OLD_TAB_KEY = 'loadout.performance-tab';

const isTab = (id: string | null): id is string => isTabOf('scorecards', id);

/** The tab this id names today, or null: an old tab name ("drivers") leads to the new one. */
const tabFrom = (id: string | null): string | null => currentTarget('scorecards', id)?.tab ?? null;

const NO_FILTERS: DriverFilters = { status: 'ALL', tiers: [], activity: 'all' };

function readTab(): string {
  try {
    const saved = window.localStorage.getItem(TAB_KEY) ?? window.localStorage.getItem(OLD_TAB_KEY);
    return tabFrom(saved) ?? TABS[0]!.id;
  } catch {
    return TABS[0]!.id;
  }
}

export function ScorecardsPage({ settings, changeSettings, goTo, ownWindow, startTab }: PageProps) {
  const { snapshot, loading, error } = useAppSnapshot();
  // What the Dashboard handed over (a driver to show, or a tab), read once when the page opens.
  const [handoff] = useState(peekPerformanceHandoff);
  const [tab, setTab] = useState<string>(() =>
    handoff.driver
      ? 'performance'
      : isTab(handoff.tab)
        ? handoff.tab
        : isTab(startTab)
          ? startTab
          : readTab(),
  );
  const [reveal, setReveal] = useState<string | null>(handoff.driver);
  useEffect(() => clearPerformanceHandoff(), []);
  const messages = useMessages();
  const { setProblem, setStatus } = messages;

  const perf = snapshot?.performance ?? EMPTY_PERF_SNAPSHOT;
  const weeks = perf.weeks;
  const choice = settings.performance.weekRange;
  // The range only moves when its ends (or the weeks held) do, not on every new snapshot.
  const weeksKey = weeks.join(',');
  const { from, to } = choice;
  const range = useMemo(
    () => effectiveRange(weeksKey ? weeksKey.split(',') : [], { from, to }),
    [weeksKey, from, to],
  );

  // The drivers for the chosen weeks: read again when the weeks or the saved data change.
  const [view, setView] = useState<PerfDriversView | null>(null);
  const revision = snapshot?.revision ?? 0;
  useEffect(() => {
    if (!snapshot) return;
    let off = false;
    void call('performance:drivers', { range }).then((reply) => {
      if (off) return;
      if (reply.ok) setView(reply.value ?? null);
      else setProblem({ title: 'The drivers could not be read', message: explain(reply) });
    });
    return () => {
      off = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- read again on a new revision, not a new snapshot object
  }, [revision, range, setProblem, snapshot === null]);

  const filters = useMemo(
    () => readFilters(settings.performance.filters),
    [settings.performance.filters],
  );
  const [search, setSearch] = useState('');
  const visible = useMemo(
    () =>
      (view?.rows ?? []).filter((row) => passesFilters(row, filters) && matchesSearch(row, search)),
    [view, filters, search],
  );

  const setFilters = useCallback(
    (next: DriverFilters) => void changeSettings({ performance: { filters: writeFilters(next) } }),
    [changeSettings],
  );

  const missingSaid = useRef(false);
  // A driver handed over by the Dashboard: make sure no filter chip hides them (and say so), then
  // the table scrolls to their row, selects it and puts the focus on it.
  useEffect(() => {
    if (!reveal || !view) return;
    const row = view.rows.find((one) => one.transporterId === reveal);
    if (!row) {
      // Said once; the table simply never finds the row.
      if (!missingSaid.current) {
        missingSaid.current = true;
        setStatus('That driver is not on the driver list, so there is no row to show.');
      }
      return;
    }
    if (!passesFilters(row, filters)) {
      setFilters(NO_FILTERS);
      setStatus(`The filters were hiding ${row.name}, so they are switched off now.`);
    }
  }, [reveal, view, filters, setFilters, setStatus]);
  const revealed = useCallback(() => setReveal(null), []);
  const revealTarget = useMemo(
    () => (reveal ? { rowId: reveal, columnId: 'name' } : null),
    [reveal],
  );

  const setWeekRange = useCallback(
    (next: WeekRangeChoice) => void changeSettings({ performance: { weekRange: next } }),
    [changeSettings],
  );

  const choose = useCallback(
    (id: string) => {
      setTab(id);
      // A page-only window does not change which tab the main window opens on next time.
      if (!ownWindow) {
        try {
          window.localStorage.setItem(TAB_KEY, id);
        } catch {
          // Only a convenience: the page opens on Performance next time instead.
        }
      }
      // What a tab said last is not news on the next one.
      messages.setStatus('');
      messages.clearProblem();
    },
    [messages, ownWindow],
  );

  return (
    <section
      className="page-full flex min-h-0 flex-1 flex-col"
      data-page="scorecards"
      aria-labelledby="title-scorecards"
    >
      <div className="border-b border-line bg-surface px-6 pt-3 pb-1">
        <h1 id="title-scorecards" className="text-[1.6rem] leading-tight font-semibold">
          Scorecards
        </h1>
      </div>
      <Tabs
        label="Scorecards"
        name="scorecards"
        page="scorecards"
        tabs={TABS}
        value={tab}
        onChange={choose}
      />
      <ProblemBanner problem={messages.problem} onClose={messages.clearProblem} name="scorecards" />
      {error ? (
        <p role="alert" className="problem px-6 py-4" data-testid="scorecards-load-problem">
          {error}
        </p>
      ) : !snapshot ? (
        <p className="px-6 py-4 text-muted">{loading ? 'Getting the saved data...' : ''}</p>
      ) : (
        <TabPanel name="scorecards" id={tab}>
          {tab === 'performance' ? (
            <PerformanceTab
              snapshot={snapshot}
              settings={settings}
              changeSettings={changeSettings}
              view={view}
              range={range}
              filters={filters}
              onFilters={setFilters}
              onWeekRange={setWeekRange}
              visible={visible}
              onSearch={setSearch}
              messages={messages}
              goTo={goTo}
              onGoImports={() => choose('imports')}
              reveal={revealTarget}
              onRevealed={revealed}
            />
          ) : null}
          {tab === 'reports' ? (
            <ReportsTab
              snapshot={snapshot}
              settings={settings}
              changeSettings={changeSettings}
              range={range}
              drivers={visible}
              messages={messages}
            />
          ) : null}
          {tab === 'imports' ? (
            <ImportsTab
              snapshot={snapshot}
              settings={settings}
              changeSettings={changeSettings}
              messages={messages}
            />
          ) : null}
        </TabPanel>
      )}
      <StatusLine text={messages.status} name="scorecards" action={messages.statusAction} />
    </section>
  );
}
