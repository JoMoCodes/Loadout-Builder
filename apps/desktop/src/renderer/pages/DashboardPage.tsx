// The Dashboard: how the drivers are doing, and who needs a word, on one screen. Built on the
// weekly performance data (`performance:dashboard`); the design note is docs/DASHBOARD-DESIGN.md.
//
// Top to bottom: the week bar, four tiles, "Who needs a word" beside the ID-expiry list, the
// movers, and the trend. Every number has a "How is this worked out?" button. A driver's line
// opens a small menu: open them on the Scorecards page, or preview their report. The gear next
// to the title opens the rule numbers behind the lists (dashboard/DashboardSettingsDialog.tsx).

import { X } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { PerfDashboardView } from '../../shared/performance';
import type { WeekRangeChoice } from '../../shared/performanceSettings';
import { call, explain as explainFailure } from '../lib/channels';
import { useAppSnapshot } from '../lib/useAppSnapshot';
import { Button } from '../ui/button';
import {
  DashboardSettingsButton,
  DashboardSettingsDialog,
} from './dashboard/DashboardSettingsDialog';
import { handDriverToPerformance, handTabToPerformance } from './dashboard/handoff';
import { ExplainScoreDialog } from './performance/ExplainScoreDialog';
import { ExplainDialog, WeekBar, type DriverMenuActions } from './dashboard/parts';
import { CoachingList, IdExpiryList, Movers, Tiles, Trend } from './dashboard/sections';
import {
  dashboardRange,
  explanation,
  plural,
  quickPickOf,
  quickRange,
  rangeWords,
  weeksIn,
  type ExplainId,
} from './dashboard/words';
import type { PageProps } from './types';

/** The newest answer, and which question it answered (the data's revision, weeks and try). */
type Answer =
  { key: string; ok: true; view: PerfDashboardView } | { key: string; ok: false; problem: string };

export function DashboardPage({ settings, changeSettings, goTo }: PageProps) {
  const { snapshot, error: snapshotError } = useAppSnapshot();
  const weeks = useMemo(() => snapshot?.performance.weeks ?? [], [snapshot]);
  const weeksKey = weeks.join(',');
  const remembered = settings.performance?.weekRange;
  const range = useMemo(
    () => dashboardRange(weeks, remembered),
    // The weeks are compared by their text, so a fresh snapshot with the same weeks keeps the range.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [weeksKey, remembered?.from, remembered?.to],
  );
  const revision = snapshot?.revision ?? null;
  const hasPerf = snapshot?.performance.hasData ?? false;

  const [answer, setAnswer] = useState<Answer | null>(null);
  const [shown, setShown] = useState<PerfDashboardView | null>(null);
  const [tries, setTries] = useState(0);
  const [explaining, setExplaining] = useState<ExplainId | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [explainingDriver, setExplainingDriver] = useState<{
    transporterId: string;
    name: string;
  } | null>(null);
  const latest = useRef(0);

  // Ask again whenever the data changes (a new revision), the weeks change, or "Try again".
  useEffect(() => {
    if (revision === null || !hasPerf) return;
    const mine = ++latest.current;
    const key = `${revision}|${range?.from}|${range?.to}|${tries}`;
    void call('performance:dashboard', { range }).then((reply) => {
      if (mine !== latest.current) return;
      if (reply.ok) {
        setAnswer({ key, ok: true, view: reply.value });
        setShown(reply.value);
      } else setAnswer({ key, ok: false, problem: explainFailure(reply) });
    });
  }, [revision, hasPerf, range, tries]);
  const currentKey = `${revision}|${range?.from}|${range?.to}|${tries}`;
  const waiting = hasPerf && answer?.key !== currentKey;
  const failed = !waiting && answer && !answer.ok ? answer.problem : null;

  const chooseRange = useCallback(
    (next: WeekRangeChoice) => {
      setProblem(null);
      void changeSettings({ performance: { weekRange: { from: next.from, to: next.to } } });
    },
    [changeSettings],
  );

  const actions = useMemo<DriverMenuActions>(
    () => ({
      openOnPerformance: (transporterId) => {
        handDriverToPerformance(transporterId);
        goTo('scorecards');
      },
      previewReport: (transporterId) => {
        setProblem(null);
        if (!range) return;
        void call('performance:preview-pdf', { transporterId, range }).then((reply) => {
          if (!reply.ok) setProblem(explainFailure(reply));
          else if (!reply.value.opened)
            setProblem('The report could not be opened. Try again in a moment.');
        });
      },
      explainScore: (transporterId, name) => setExplainingDriver({ transporterId, name }),
    }),
    [goTo, range],
  );

  const view = shown;
  const empty =
    snapshot !== null && (!hasPerf || (!waiting && answer?.ok === true && !answer.view.hasData));
  const picked = quickPickOf(weeks, range, remembered ?? null);
  const busy = waiting && view !== null;

  return (
    <section
      className="mx-auto flex w-full max-w-[96rem] flex-col gap-4"
      data-page="dashboard"
      aria-labelledby="title-dashboard"
      aria-busy={waiting ? true : undefined}
    >
      <header className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-3">
            <h1 id="title-dashboard" className="m-0 text-[1.6rem] leading-tight font-semibold">
              Dashboard
            </h1>
            <DashboardSettingsButton onClick={() => setSettingsOpen(true)} />
          </div>
          <p className="m-0 mt-0.5 text-sm text-muted" data-testid="dashboard-range-words">
            {range
              ? `${rangeWords(range)} · ${plural(weeksIn(weeks, range), 'week')}` +
                (view && view.hasData ? ` · ${plural(view.activeDrivers, 'driver')}` : '')
              : 'How the drivers are doing, and who needs a word.'}
          </p>
        </div>
        {weeks.length > 0 && !empty ? (
          <WeekBar weeks={weeks} range={range} picked={picked} onRange={chooseRange} />
        ) : null}
      </header>

      {problem ? (
        <div
          role="alert"
          className="flex items-start gap-3 rounded-md border border-bad bg-bad-soft px-3 py-2 text-sm"
          data-testid="dashboard-action-problem"
        >
          <p className="m-0 min-w-0 flex-1 text-fg">{problem}</p>
          <Button
            size="icon"
            variant="ghost"
            aria-label="Close this message"
            onClick={() => setProblem(null)}
          >
            <X aria-hidden="true" />
          </Button>
        </div>
      ) : null}

      {snapshotError ? (
        <p role="alert" className="problem" data-testid="dashboard-problem">
          {snapshotError}
        </p>
      ) : !snapshot ? (
        <p role="status" className="text-muted">
          Getting the saved data...
        </p>
      ) : empty ? (
        <div
          className="flex flex-wrap items-center gap-3 rounded-lg border border-line bg-surface px-4 py-4"
          data-testid="dashboard-empty"
        >
          <p className="m-0 text-sm">
            No weekly scorecards yet. Bring in the exports to fill the dashboard.
          </p>
          <Button
            variant="primary"
            data-testid="dashboard-go-imports"
            onClick={() => {
              handTabToPerformance('imports');
              goTo('scorecards');
            }}
          >
            Go to Imports
          </Button>
        </div>
      ) : failed ? (
        <div
          role="alert"
          className="flex flex-wrap items-center gap-3 rounded-lg border border-bad bg-bad-soft px-4 py-3 text-sm"
          data-testid="dashboard-problem"
        >
          <p className="m-0 min-w-0 flex-1 text-fg">
            The dashboard could not be worked out. {failed}
          </p>
          <Button onClick={() => setTries((n) => n + 1)} data-testid="dashboard-retry">
            Try again
          </Button>
        </div>
      ) : !view ? (
        <p role="status" className="text-muted" data-testid="dashboard-loading">
          Working out the dashboard...
        </p>
      ) : (
        <div
          className={
            busy ? 'flex flex-col gap-4 opacity-70 transition-opacity' : 'flex flex-col gap-4'
          }
          data-testid="dashboard-body"
        >
          <Tiles view={view} explain={setExplaining} />
          <div className="grid items-start gap-4 lg:grid-cols-3">
            <CoachingList view={view} explain={setExplaining} actions={actions} />
            <IdExpiryList view={view} explain={setExplaining} actions={actions} />
          </div>
          <div className="grid items-start gap-4 md:grid-cols-2">
            <Movers view={view} explain={setExplaining} actions={actions} />
          </div>
          <div className="grid items-start gap-4 lg:grid-cols-3">
            <Trend
              view={view}
              explain={setExplaining}
              onWiden={
                weeks.length > 1
                  ? () => {
                      const wider = quickRange(weeks, 13);
                      if (wider) chooseRange(wider);
                    }
                  : null
              }
            />
          </div>
        </div>
      )}

      {settingsOpen ? (
        <DashboardSettingsDialog
          performance={settings.performance}
          changeSettings={changeSettings}
          onDone={() => setSettingsOpen(false)}
        />
      ) : null}
      {explainingDriver && range ? (
        <ExplainScoreDialog
          driver={explainingDriver}
          range={range}
          onDone={() => setExplainingDriver(null)}
        />
      ) : null}
      {explaining && view ? (
        <ExplainDialog
          explanation={explanation(explaining, view)}
          onClose={() => setExplaining(null)}
        />
      ) : null}
    </section>
  );
}
