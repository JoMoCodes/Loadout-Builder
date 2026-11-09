// The Dashboard: how the drivers are doing, and who needs a word, on one screen. Built on the
// weekly performance data (`performance:dashboard`); the design note is docs/DASHBOARD-DESIGN.md.
//
// The week bar is at the top; under it are the sections of the layout in use. The usual layout
// is four tiles, "Who needs a word" beside the ID-expiry list, the movers, and the trend. Every
// number has a "How is this worked out?" button. A driver's line opens a small menu: open them
// on the Scorecards page, preview their report, or put them on the watch list. The gear next to
// the title opens the rule numbers behind the lists (dashboard/DashboardSettingsDialog.tsx).
//
// The page is the person's to arrange (shared/dashboardLayout.ts): Customize moves, resizes,
// hides and adds sections, and sets each one up; the Layout menu keeps several named layouts.

import { X } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  DEFAULT_DASHBOARD,
  LAYOUT_PRESETS,
  MAX_LAYOUTS,
  MAX_WATCH,
  activeLayout,
  changeSection,
  freshId,
  freshName,
  layoutFromFile,
  moveSection,
  newSection,
  removeSection,
  stepSection,
  usualSections,
  withLayout,
  type DashboardLayout,
  type DashboardSection,
  type DashboardSettings,
  type LayoutWeeks,
  type SectionKind,
} from '../../shared/dashboardLayout';
import type { PerfDashboardView } from '../../shared/performance';
import type { WeekRangeChoice } from '../../shared/performanceSettings';
import { call, explain as explainFailure } from '../lib/channels';
import { useAppSnapshot } from '../lib/useAppSnapshot';
import { Button } from '../ui/button';
import {
  CustomizeBar,
  CustomizeButton,
  LayoutMenu,
  NewLayoutDialog,
  RenameLayoutDialog,
} from './dashboard/Customize';
import { DashboardGrid, type GridEdits } from './dashboard/DashboardGrid';
import { SectionOptionsDialog, WatchPickerDialog } from './dashboard/SectionOptions';
import { ConfirmDialog } from './dataPages/Modal';
import {
  DashboardSettingsButton,
  DashboardSettingsDialog,
} from './dashboard/DashboardSettingsDialog';
import { handDriverToPerformance, handTabToPerformance } from './dashboard/handoff';
import { ExplainScoreDialog } from './performance/ExplainScoreDialog';
import { ExplainDialog, WeekBar, type DriverMenuActions } from './dashboard/parts';
import { SectionBody } from './dashboard/sections';
import {
  customSpec,
  layoutRange,
  plural,
  quickPickOf,
  quickRange,
  rangeWords,
  weeksIn,
  type Explanation,
  type QuickPickId,
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
  // Older saved settings have no dashboard part: the usual layout.
  const dashboard: DashboardSettings = settings.dashboard ?? DEFAULT_DASHBOARD;
  const layout = activeLayout(dashboard);
  const own = layout.weeks;
  const range = useMemo(
    () => layoutRange(weeks, own, remembered),
    // The weeks are compared by their text, so a fresh snapshot with the same weeks keeps the range.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [weeksKey, remembered?.from, remembered?.to, own.own, own.pick, own.from, own.to],
  );
  // What the layout needs worked out beyond the usual: its own tiles, and the watch list.
  const custom = useMemo(
    () => layout.sections.filter((section) => section.kind === 'custom').map(customSpec),
    [layout.sections],
  );
  const hasWatch = layout.sections.some((section) => section.kind === 'watch');
  const watch = dashboard.watch;
  const extrasKey = JSON.stringify([custom, hasWatch ? watch : []]);
  const revision = snapshot?.revision ?? null;
  const hasPerf = snapshot?.performance.hasData ?? false;

  const [answer, setAnswer] = useState<Answer | null>(null);
  const [shown, setShown] = useState<PerfDashboardView | null>(null);
  const [tries, setTries] = useState(0);
  const [explaining, setExplaining] = useState<Explanation | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [customizing, setCustomizing] = useState(false);
  /** The window that is open over the page, if any. */
  const [asking, setAsking] = useState<
    | { what: 'options'; section: DashboardSection; adding: boolean }
    | { what: 'new-layout' | 'rename-layout' | 'delete-layout' | 'reset' | 'watch' }
    | null
  >(null);
  const [explainingDriver, setExplainingDriver] = useState<{
    transporterId: string;
    name: string;
  } | null>(null);
  const latest = useRef(0);

  // Ask again whenever the data changes (a new revision), the weeks change, or "Try again".
  useEffect(() => {
    if (revision === null || !hasPerf) return;
    const mine = ++latest.current;
    const key = `${revision}|${range?.from}|${range?.to}|${tries}|${extrasKey}`;
    void call('performance:dashboard', {
      range,
      // Left out when there are none, so the usual Dashboard asks for nothing more.
      custom: custom.length > 0 ? custom : undefined,
      watch: hasWatch && watch.length > 0 ? watch : undefined,
    }).then((reply) => {
      if (mine !== latest.current) return;
      if (reply.ok) {
        setAnswer({ key, ok: true, view: reply.value });
        setShown(reply.value);
      } else setAnswer({ key, ok: false, problem: explainFailure(reply) });
    });
    // The own tiles and the watch list are compared by their text (extrasKey).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [revision, hasPerf, range, tries, extrasKey]);
  const currentKey = `${revision}|${range?.from}|${range?.to}|${tries}|${extrasKey}`;
  const waiting = hasPerf && answer?.key !== currentKey;
  const failed = !waiting && answer && !answer.ok ? answer.problem : null;

  // ---- changing the layouts. Each change is saved straight away.
  const saveDashboard = useCallback(
    (patch: Partial<DashboardSettings>) => void changeSettings({ dashboard: patch }),
    [changeSettings],
  );
  const saveLayout = useCallback(
    (next: DashboardLayout, more: Partial<DashboardSettings> = {}) =>
      saveDashboard({ layouts: withLayout(dashboard.layouts, next), ...more }),
    [saveDashboard, dashboard.layouts],
  );
  const saveSections = useCallback(
    (sections: DashboardSection[]) => saveLayout({ ...layout, sections }),
    [saveLayout, layout],
  );
  const saveWeeks = useCallback(
    (weeksNow: LayoutWeeks) => saveLayout({ ...layout, weeks: weeksNow }),
    [saveLayout, layout],
  );

  const chooseRange = useCallback(
    (next: WeekRangeChoice) => {
      setProblem(null);
      // A layout with its own weeks remembers them itself; the Scorecards page is left alone.
      if (own.own) saveWeeks({ own: true, pick: null, from: next.from, to: next.to });
      else void changeSettings({ performance: { weekRange: { from: next.from, to: next.to } } });
    },
    [changeSettings, own.own, saveWeeks],
  );
  const choosePick = useCallback(
    (pick: QuickPickId) => {
      setProblem(null);
      saveWeeks({ own: true, pick, from: null, to: null });
    },
    [saveWeeks],
  );

  const edits = useMemo<GridEdits>(
    () => ({
      move: (id, targetId, after) =>
        saveSections(moveSection(layout.sections, id, targetId, after)),
      step: (id, direction) => saveSections(stepSection(layout.sections, id, direction)),
      resize: (id, change) => saveSections(changeSection(layout.sections, id, change)),
      options: (id) => {
        const section = layout.sections.find((one) => one.id === id);
        if (section) setAsking({ what: 'options', section, adding: false });
      },
      remove: (id) => saveSections(removeSection(layout.sections, id)),
    }),
    [layout.sections, saveSections],
  );

  function addSection(kind: SectionKind) {
    if (layout.sections.some((section) => section.kind === kind)) return;
    saveSections([...layout.sections, newSection(kind)]);
  }

  function createLayout(name: string, from: string) {
    if (dashboard.layouts.length >= MAX_LAYOUTS) return;
    const preset = LAYOUT_PRESETS.find((one) => one.id === from);
    const made: DashboardLayout = {
      id: freshId(
        'layout',
        dashboard.layouts.map((one) => one.id),
      ),
      name: freshName(name, dashboard.layouts),
      sections: preset ? preset.sections() : layout.sections.map((section) => ({ ...section })),
      weeks: { ...(preset ? preset.weeks : layout.weeks) },
    };
    saveDashboard({ layouts: [...dashboard.layouts, made], active: made.id });
  }

  function bringInLayout(text: string) {
    if (dashboard.layouts.length >= MAX_LAYOUTS) {
      return setProblem(`The app keeps up to ${MAX_LAYOUTS} layouts. Delete one first.`);
    }
    const read = layoutFromFile(text, dashboard.layouts);
    if (!read) {
      return setProblem(
        'That file is not a Dashboard layout from this app. Pick a file that was made with "Save this layout to a file".',
      );
    }
    setProblem(null);
    saveDashboard({ layouts: [...dashboard.layouts, read], active: read.id });
  }

  const toggleWatch = useCallback(
    (transporterId: string) => {
      if (watch.includes(transporterId)) {
        return saveDashboard({ watch: watch.filter((id) => id !== transporterId) });
      }
      if (watch.length >= MAX_WATCH) {
        return setProblem(
          `The watch list holds up to ${MAX_WATCH} drivers. Take someone off first.`,
        );
      }
      setProblem(null);
      // The first driver put on the list brings the Watch list onto the layout, so it shows.
      const shown = layout.sections.some((section) => section.kind === 'watch');
      saveDashboard({
        watch: [...watch, transporterId],
        ...(shown
          ? {}
          : {
              layouts: withLayout(dashboard.layouts, {
                ...layout,
                sections: [...layout.sections, newSection('watch')],
              }),
            }),
      });
    },
    [watch, saveDashboard, layout, dashboard.layouts],
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
      watched: (transporterId) => watch.includes(transporterId),
      toggleWatch,
    }),
    [goTo, range, watch, toggleWatch],
  );

  const view = shown;
  const empty =
    snapshot !== null && (!hasPerf || (!waiting && answer?.ok === true && !answer.view.hasData));
  const picked =
    own.own && own.pick
      ? own.pick
      : quickPickOf(weeks, range, own.own ? undefined : (remembered ?? null));
  const busy = waiting && view !== null;
  // The page's sections are on screen (not the empty line, a problem or "Working out...").
  const bodyShown = !snapshotError && snapshot !== null && !empty && !failed && view !== null;
  const onWiden =
    weeks.length > 1
      ? () => {
          const wider = quickRange(weeks, 13);
          if (wider) chooseRange(wider);
        }
      : null;

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
            {bodyShown ? (
              <>
                <LayoutMenu
                  layouts={dashboard.layouts}
                  active={layout}
                  onSwitch={(id) => saveDashboard({ active: id })}
                  onNew={() => setAsking({ what: 'new-layout' })}
                  onRename={() => setAsking({ what: 'rename-layout' })}
                  onDelete={() => setAsking({ what: 'delete-layout' })}
                  onFile={bringInLayout}
                  onProblem={setProblem}
                />
                <CustomizeButton on={customizing} onClick={() => setCustomizing(!customizing)} />
              </>
            ) : null}
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
          <WeekBar
            weeks={weeks}
            range={range}
            picked={picked}
            onRange={chooseRange}
            onPick={own.own ? choosePick : undefined}
          />
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
        <>
          {customizing ? (
            <CustomizeBar
              layout={layout}
              onAdd={addSection}
              onAddCustom={() =>
                setAsking({
                  what: 'options',
                  adding: true,
                  section: newSection(
                    'custom',
                    freshId(
                      'custom',
                      layout.sections.map((section) => section.id),
                    ),
                  ),
                })
              }
              onOwnWeeks={(on) =>
                saveWeeks(
                  on
                    ? // It starts on the weeks being shown now.
                      picked
                      ? { own: true, pick: picked, from: null, to: null }
                      : { own: true, pick: null, from: range?.from ?? null, to: range?.to ?? null }
                    : { own: false, pick: null, from: null, to: null },
                )
              }
              onReset={() => setAsking({ what: 'reset' })}
              onDuplicate={() => setAsking({ what: 'new-layout' })}
              onDone={() => setCustomizing(false)}
            />
          ) : null}
          {layout.sections.length === 0 ? (
            <div
              className="flex flex-wrap items-center gap-3 rounded-lg border border-line bg-surface px-4 py-4"
              data-testid="dashboard-no-sections"
            >
              <p className="m-0 text-sm">
                This layout has no sections.{' '}
                {customizing ? 'Use Add a section to put one on it.' : 'Customize it to add some.'}
              </p>
              {!customizing ? (
                <Button variant="primary" onClick={() => setCustomizing(true)}>
                  Customize
                </Button>
              ) : null}
            </div>
          ) : null}
          <DashboardGrid
            sections={layout.sections}
            customizing={customizing}
            edits={edits}
            busy={busy}
            render={(section) => (
              <SectionBody
                section={section}
                view={view}
                explain={setExplaining}
                actions={actions}
                onWiden={onWiden}
                watching={watch.length}
                onChooseWatch={() => setAsking({ what: 'watch' })}
              />
            )}
          />
        </>
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
      {explaining ? (
        <ExplainDialog explanation={explaining} onClose={() => setExplaining(null)} />
      ) : null}
      {asking?.what === 'options' ? (
        <SectionOptionsDialog
          section={asking.section}
          adding={asking.adding}
          onCancel={() => setAsking(null)}
          onSave={(section) => {
            saveSections(
              asking.adding
                ? [...layout.sections, section]
                : changeSection(layout.sections, section.id, section),
            );
            setAsking(null);
          }}
        />
      ) : null}
      {asking?.what === 'new-layout' ? (
        <NewLayoutDialog
          current={layout}
          onCancel={() => setAsking(null)}
          onCreate={(name, from) => {
            createLayout(name, from);
            setAsking(null);
          }}
        />
      ) : null}
      {asking?.what === 'rename-layout' ? (
        <RenameLayoutDialog
          layout={layout}
          onCancel={() => setAsking(null)}
          onRename={(name) => {
            saveLayout({
              ...layout,
              name: freshName(
                name,
                dashboard.layouts.filter((one) => one.id !== layout.id),
              ),
            });
            setAsking(null);
          }}
        />
      ) : null}
      {asking?.what === 'delete-layout' ? (
        <ConfirmDialog
          title={`Delete the layout "${layout.name}"?`}
          body="Your other layouts stay as they are. This cannot be undone."
          confirmLabel="Delete"
          cancelLabel="Keep it"
          danger
          onDone={(yes) => {
            setAsking(null);
            if (!yes || dashboard.layouts.length < 2) return;
            const left = dashboard.layouts.filter((one) => one.id !== layout.id);
            saveDashboard({ layouts: left, active: left[0]!.id });
          }}
        />
      ) : null}
      {asking?.what === 'reset' ? (
        <ConfirmDialog
          title={`Reset "${layout.name}" to the usual layout?`}
          body={
            'The four tiles, who needs a word, ID expiry, the movers and the trend come back, at their usual sizes. ' +
            'Tiles you made yourself are taken off this layout.\n\nYour other layouts and the watch list stay as they are.'
          }
          confirmLabel="Reset"
          cancelLabel="Keep it as it is"
          danger
          onDone={(yes) => {
            setAsking(null);
            if (yes) {
              saveLayout({
                ...layout,
                sections: usualSections(),
                weeks: { own: false, pick: null, from: null, to: null },
              });
            }
          }}
        />
      ) : null}
      {asking?.what === 'watch' ? (
        <WatchPickerDialog
          range={range}
          watch={watch}
          onCancel={() => setAsking(null)}
          onSave={(next) => {
            saveDashboard({ watch: next });
            setAsking(null);
          }}
        />
      ) : null}
    </section>
  );
}
