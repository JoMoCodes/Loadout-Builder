// The Performance tab of the Scorecards page: one line per driver for the chosen weeks, with their
// latest week, averages, trend and safety counts, the filter chips, tick boxes, and the buttons
// that make, export and email the reports. Ported from the old app's main window grid.

import { ArrowDown, ArrowRight, ArrowUp, Calculator, Medal } from 'lucide-react';
import {
  useCallback,
  useEffect,
  useEffectEvent,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { DataGrid, type GridColumn, type RowAction } from '../../components/DataGrid';
import type {
  PerfDriverRow,
  PerfDriversView,
  PerfOutput,
  PerfProgress,
  WeekRange,
} from '../../../shared/performance';
import type { WeekRangeChoice } from '../../../shared/performanceSettings';
import type { AppSnapshot } from '../../../shared/snapshot';
import type { AppSettings, SettingsPatch } from '../../../shared/settings';
import { call, explain, listen } from '../../lib/channels';
import { databaseLayoutStore } from '../../lib/gridLayoutStore';
import { Button } from '../../ui/button';
import { Chip } from '../../ui/chip';
import { cn } from '../../ui/cn';
import { plural } from '../dataPages/format';
import { ConfirmDialog, Modal } from '../dataPages/Modal';
import { ButtonStrip, type Messages, type StatusAction } from '../dataPages/PageParts';
import { useDialogs } from '../dataPages/useDialogs';
import type { PageId } from '../types';
import { EmailDryRunDialog, EmailResultDialog } from './EmailDialogs';
import { EmailWordingDialog, WordingSettingsButton } from './EmailWordingDialog';
import { ExplainScoreDialog } from './ExplainScoreDialog';
import {
  ACTIVITY_CHOICES,
  SAFETY_COLUMNS,
  STATUS_CHOICES,
  TIERS,
  checkFileWords,
  deltaText,
  emailWords,
  generateWords,
  numberText,
  passesFilters,
  progressWords,
  rangeWords,
  START_ACTIVITY,
  statusOf,
  tierMoveWords,
  tierTone,
  type DriverFilters,
} from './perfText';
import { SafetyDialog } from './SafetyDialog';
import { WeekRangePicker } from './WeekRangePicker';

export interface PerformanceTabProps {
  snapshot: AppSnapshot;
  settings: AppSettings;
  changeSettings(patch: SettingsPatch): Promise<void>;
  view: PerfDriversView | null;
  range: WeekRange | null;
  filters: DriverFilters;
  onFilters(filters: DriverFilters): void;
  onWeekRange(choice: WeekRangeChoice): void;
  /** The drivers shown now: the chips and the table's search. */
  visible: readonly PerfDriverRow[];
  /** What the table's search box holds, each time it changes. */
  onSearch(query: string): void;
  messages: Messages;
  goTo(page: PageId): void;
  onGoImports(): void;
  /** A driver to scroll to, select and focus (handed over by the Dashboard), or null. */
  reveal?: { rowId: string; columnId?: string } | null;
  onRevealed?(): void;
}

const idOf = (row: PerfDriverRow) => row.transporterId;

type AverageKey = keyof PerfDriverRow['averagesDisplay'];
const AVERAGES: ReadonlyArray<{ key: AverageKey; header: string }> = [
  { key: 'score', header: 'Average Score' },
  { key: 'rank', header: 'Average Rank' },
  { key: 'packages', header: 'Average Packages' },
  { key: 'cdf', header: 'Average CDF' },
  { key: 'dsb', header: 'Average DSB' },
  { key: 'dcr', header: 'Average DC DPMO' },
  { key: 'pod', header: 'Average POD' },
  { key: 'psb', header: 'Average PSB' },
  { key: 'ced', header: 'Average CED' },
];

const TREND_WORDS: Record<string, { icon: typeof ArrowUp; words: string; tone: string }> = {
  Improving: { icon: ArrowUp, words: 'Improving', tone: 'text-ok' },
  Declining: { icon: ArrowDown, words: 'Declining', tone: 'text-bad' },
  Flat: { icon: ArrowRight, words: 'Flat', tone: 'text-muted' },
};

function ChipButton({
  on,
  onClick,
  children,
  testId,
}: {
  on: boolean;
  onClick: () => void;
  children: ReactNode;
  testId: string;
}) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onClick}
      data-testid={testId}
      className={cn(
        'h-7 rounded-full border px-2.5 text-[0.857rem] font-medium',
        on
          ? 'border-accent bg-accent-soft text-fg ring-1 ring-accent'
          : 'border-line-strong bg-sunken text-muted hover:text-fg',
      )}
    >
      {children}
    </button>
  );
}

const NO_FILTERS: DriverFilters = { status: 'ALL', tiers: [], activity: START_ACTIVITY };

type Changes = PerfDriversView['changes'];

/** One name in a "What changed" list: clicking it shows that driver's row. */
interface ChangeLine {
  transporterId: string;
  name: string;
  detail: string;
}

/** The small list a "What changed" count opens. Answers the driver picked, or null. */
function ChangeListDialog({
  title,
  lead,
  lines,
  onDone,
}: {
  title: string;
  lead: string;
  lines: readonly ChangeLine[];
  onDone: (id: string | null) => void;
}) {
  return (
    <Modal
      name="perf-changes-list"
      title={title}
      lead={lead}
      confirmLabel="Close"
      onConfirm={() => onDone(null)}
      onCancel={() => onDone(null)}
    >
      <ul
        className="m-0 max-h-[50vh] list-none overflow-y-auto p-0"
        data-testid="perf-changes-list"
      >
        {lines.map((line) => (
          <li key={line.transporterId} className="border-b border-line last:border-b-0">
            <button
              type="button"
              className="flex w-full items-center justify-between gap-4 px-1 py-1.5 text-left text-sm hover:bg-row-hover"
              onClick={() => onDone(line.transporterId)}
              data-testid="perf-changes-name"
              data-id={line.transporterId}
            >
              <span className="font-medium underline">{line.name || line.transporterId}</span>
              <span className="text-muted">{line.detail}</span>
            </button>
          </li>
        ))}
      </ul>
    </Modal>
  );
}

/**
 * "What changed since last week": the counts, each a button that opens the list of drivers
 * behind it (when the list came with the counts and the count is not zero).
 */
function ChangesStrip({
  changes,
  onOpen,
}: {
  changes: Changes;
  onOpen: (which: 'up' | 'down' | 'safety') => void;
}) {
  if (!changes.newestWeek) return null;
  const label = <span className="font-semibold text-fg">What changed since last week: </span>;
  if (!changes.previousWeek) {
    return (
      <p className="m-0 text-sm text-muted" data-testid="perf-changes">
        {label}
        {changes.newestWeek} is the only week brought in so far.
      </p>
    );
  }
  const part = (which: 'up' | 'down' | 'safety', count: number, words: string, listed: boolean) =>
    count > 0 && listed ? (
      <button
        type="button"
        className="link-button"
        onClick={() => onOpen(which)}
        data-testid={`perf-changes-${which}`}
        aria-haspopup="dialog"
      >
        {words}
      </button>
    ) : (
      <span data-testid={`perf-changes-${which}`}>{words}</span>
    );
  const moves = changes.tierMoves !== undefined;
  return (
    <p className="m-0 text-sm text-muted" data-testid="perf-changes">
      {label}
      {changes.newestWeek} compared with {changes.previousWeek}:{' '}
      {part('up', changes.tierUp, `${plural(changes.tierUp, 'driver')} moved up a tier`, moves)},{' '}
      {part('down', changes.tierDown, `${changes.tierDown} moved down`, moves)},{' '}
      {part(
        'safety',
        changes.newSafetyEvents,
        plural(changes.newSafetyEvents, 'new safety event'),
        changes.safetyDrivers !== undefined,
      )}
      .
    </p>
  );
}

/** The meter shown while reports are made or emailed. */
function ProgressMeter({ progress }: { progress: PerfProgress }) {
  const words = progressWords(progress);
  const percent = progress.total > 0 ? Math.round((progress.done / progress.total) * 100) : 0;
  return (
    <div
      className="flex flex-wrap items-center gap-3 border-t border-line bg-surface px-6 py-1.5 text-sm"
      data-testid="perf-progress"
    >
      <span data-testid="perf-progress-words">{words}</span>
      <div
        role="progressbar"
        aria-label={progress.job === 'email' ? 'Emails sent' : 'Reports made'}
        aria-valuemin={0}
        aria-valuemax={progress.total}
        aria-valuenow={progress.done}
        aria-valuetext={words}
        className="h-2 w-48 max-w-full overflow-hidden rounded-full bg-sunken ring-1 ring-line"
      >
        <span className="block h-full bg-accent" style={{ width: `${percent}%` }} />
      </div>
    </div>
  );
}

export function PerformanceTab({
  snapshot,
  settings,
  changeSettings,
  view,
  range,
  filters,
  onFilters,
  onWeekRange,
  visible,
  onSearch,
  messages,
  goTo,
  onGoImports,
  reveal,
  onRevealed,
}: PerformanceTabProps) {
  const { setStatus, setProblem } = messages;
  const { ask, host } = useDialogs();
  const gridBox = useRef<HTMLDivElement>(null);
  const [current, setCurrent] = useState<PerfDriverRow | null>(null);
  // A driver picked from a "What changed" list, to show in the table.
  const [picked, setPicked] = useState<string | null>(null);

  // Counting up while reports are made or emailed: only while this tab is waiting for one.
  const [working, setWorking] = useState(false);
  const [progress, setProgress] = useState<PerfProgress | null>(null);
  useEffect(() => listen('performance:progress', (next) => setProgress(next)), []);
  async function whileWorking<T>(work: () => Promise<T>): Promise<T> {
    setProgress(null);
    setWorking(true);
    try {
      return await work();
    } finally {
      setWorking(false);
      setProgress(null);
    }
  }

  const rows = useMemo(() => view?.rows ?? [], [view]);
  const weeks = snapshot.performance.weeks;
  const selected = settings.performance.selected;
  const ticked = useMemo(() => new Set(selected), [selected]);

  // ------------------------------------------------------------------ the table's search

  // The table keeps its own search box; the page follows what it holds, so "visible" means
  // what the person sees.
  const readSearch = () => {
    const box = gridBox.current?.querySelector<HTMLInputElement>('input[type="search"]');
    onSearch(box?.value ?? '');
  };
  const followSearch = () => window.setTimeout(readSearch, 0);
  const startSearch = useEffectEvent(() => onSearch(''));
  useEffect(() => startSearch(), []);

  // ---------------------------------------------------------------------------- ticks

  function setTicked(ids: Iterable<string>) {
    void changeSettings({ performance: { selected: [...new Set(ids)] } });
  }
  function toggle(id: string) {
    const next = new Set(ticked);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setTicked(next);
  }
  const tickedRows = () => rows.filter((row) => ticked.has(row.transporterId));

  // -------------------------------------------------------------------------- actions

  function needRange(): WeekRange | null {
    if (!range) setStatus('Bring in some scorecards first. The Imports tab does that.');
    return range;
  }

  async function showOutput(what: PerfOutput) {
    const reply = await call('performance:show-last-output', { what });
    if (!reply.ok) {
      setProblem({ title: 'The folder did not open', message: explain(reply) });
      return;
    }
    if (!reply.value?.opened) setStatus('The folder could not be opened. Try again.');
  }
  const showFolder = (what: PerfOutput): StatusAction => ({
    label: 'Show in folder',
    onClick: () => void showOutput(what),
    testId: 'perf-show-in-folder',
  });

  async function generate(chosen: readonly PerfDriverRow[], what: string) {
    const weeksNow = needRange();
    if (!weeksNow) return;
    if (chosen.length === 0) {
      setStatus(`Tick drivers in the first column first, or use Generate all.`);
      return;
    }
    const yes = await ask<boolean>((done) => (
      <ConfirmDialog
        title={`Make ${plural(chosen.length, 'report')}?`}
        body={`One PDF for each of the ${what}, for weeks ${rangeWords(weeksNow)}.\n\nYou choose the folder they go in next.`}
        confirmLabel="Make reports"
        cancelLabel="Not now"
        onDone={done}
      />
    ));
    if (!yes) return;
    setStatus(`Making ${plural(chosen.length, 'report')}...`);
    const reply = await whileWorking(() =>
      call('performance:generate', { transporterIds: chosen.map(idOf), range: weeksNow }),
    );
    if (!reply.ok) {
      setStatus('');
      setProblem({ title: 'The reports were not made', message: explain(reply) });
      return;
    }
    const done = reply.value;
    setStatus(
      done ? generateWords(done) : '',
      done && done.status === 'written' && done.written > 0 ? showFolder('reports') : null,
    );
  }

  async function exportCheckFile(chosen: readonly PerfDriverRow[]) {
    if (chosen.length === 0) {
      setStatus('There are no drivers to export. Tick some, or change the filters.');
      return;
    }
    const reply = await call('performance:export-check-file', {
      transporterIds: chosen.map(idOf),
    });
    if (!reply.ok) {
      setProblem({ title: 'The check file was not saved', message: explain(reply) });
      return;
    }
    const done = reply.value;
    if (done && done.status === 'written') {
      setStatus(checkFileWords(done), showFolder('check-file'));
    }
  }

  async function email(chosen: readonly PerfDriverRow[], noneWords?: string) {
    const weeksNow = needRange();
    if (!weeksNow) return;
    if (chosen.length === 0) {
      setStatus(noneWords ?? 'Tick the drivers to email in the first column first.');
      return;
    }
    if (!snapshot.performance.emailReady) {
      const open = await ask<boolean>((done) => (
        <ConfirmDialog
          title="Email is not set up yet"
          body="Before the app can email reports, it needs the email address to send from and its app password. Both go in Settings, under Email."
          confirmLabel="Open Settings"
          cancelLabel="Not now"
          onDone={done}
        />
      ));
      if (open) goTo('settings');
      return;
    }
    const ids = chosen.map(idOf);
    setStatus('Working out who would get what...');
    const dry = await call('performance:email', {
      transporterIds: ids,
      range: weeksNow,
      dryRun: true,
    });
    if (!dry.ok || !dry.value) {
      setStatus('');
      if (!dry.ok) setProblem({ title: 'The emails were not sent', message: explain(dry) });
      return;
    }
    setStatus('');
    const dryRun = dry.value;
    const send = await ask<boolean>((done) => (
      <EmailDryRunDialog
        outcome={dryRun}
        range={weeksNow}
        bcc={settings.performance.email.bccAddress}
        onDone={done}
      />
    ));
    if (!send) return;
    const toSend = ids.filter((id) => dryRun.wouldSend.some((one) => one.transporterId === id));
    setStatus(`Emailing ${plural(toSend.length, 'report')}...`);
    const sent = await whileWorking(() =>
      call('performance:email', { transporterIds: ids, range: weeksNow, dryRun: false }),
    );
    if (!sent.ok || !sent.value) {
      setStatus('');
      if (!sent.ok) setProblem({ title: 'The emails were not sent', message: explain(sent) });
      return;
    }
    const outcome = sent.value;
    setStatus(emailWords(outcome));
    await ask<boolean>((done) => <EmailResultDialog outcome={outcome} onDone={() => done(true)} />);
  }

  async function preview(row: PerfDriverRow) {
    const weeksNow = needRange();
    if (!weeksNow) return;
    setStatus(`Opening the report for ${row.name}...`);
    const reply = await call('performance:preview-pdf', {
      transporterId: row.transporterId,
      range: weeksNow,
    });
    if (!reply.ok) {
      setStatus('');
      setProblem({ title: 'The report did not open', message: explain(reply) });
      return;
    }
    setStatus(
      reply.value?.opened
        ? `Opened the report for ${row.name}.`
        : `The report for ${row.name} could not be opened. They may have no scorecard in these weeks.`,
    );
  }

  // The email address is on the driver list (the Associates page), which the snapshot carries.
  async function copyEmail(row: PerfDriverRow) {
    const address = snapshot.associates.find(
      (one) => one.associate.transporterId === row.transporterId,
    )?.associate.email;
    if (!address) {
      setStatus(`There is no email address on file for ${row.name}.`);
      return;
    }
    try {
      await navigator.clipboard.writeText(address);
      setStatus(`Copied the email address for ${row.name}.`);
    } catch {
      setStatus('The email address could not be copied. Try again.');
    }
  }

  async function showSafety(row: PerfDriverRow, metricType: string | null) {
    const weeksNow = needRange();
    if (!weeksNow) return;
    await ask<boolean>((done) => (
      <SafetyDialog
        driver={row}
        range={weeksNow}
        metricType={metricType}
        onDone={() => done(true)}
      />
    ));
  }

  async function explainScore(row: PerfDriverRow) {
    const weeksNow = needRange();
    if (!weeksNow) return;
    await ask<boolean>((done) => (
      <ExplainScoreDialog driver={row} range={weeksNow} onDone={() => done(true)} />
    ));
  }

  /** The subject and message of the report emails (the Reports tab has the same window). */
  async function openWording() {
    await ask<boolean>((done) => (
      <EmailWordingDialog
        name="perf-email-wording"
        lead="What each driver gets with their report. The address and server come from Settings."
        placeholders="{name} {from} {to}"
        subject={settings.email.subjectTemplate}
        body={settings.email.bodyTemplate}
        testPrefix="perf-email"
        onSave={(subjectTemplate, bodyTemplate) =>
          changeSettings({ email: { subjectTemplate, bodyTemplate } })
        }
        onDone={() => done(true)}
      />
    ));
  }

  /** Selects and shows a driver's row, switching off a filter chip that hides them. */
  function showDriver(id: string) {
    const row = rows.find((one) => one.transporterId === id);
    if (!row) {
      setStatus('That driver is not on the driver list, so there is no row to show.');
      return;
    }
    if (!passesFilters(row, filters)) {
      onFilters(NO_FILTERS);
      setStatus(`The filters were hiding ${row.name}, so they are switched off now.`);
    } else if (!visible.some((one) => one.transporterId === id)) {
      setStatus(`The search box is hiding ${row.name}. Clear it to see their row.`);
    }
    setPicked(id);
  }

  async function openChanges(which: 'up' | 'down' | 'safety', changes: Changes) {
    const rank = (tier: string) => TIERS.length - TIERS.indexOf(tier as (typeof TIERS)[number]);
    const moves = changes.tierMoves ?? [];
    const lines: ChangeLine[] =
      which === 'safety'
        ? (changes.safetyDrivers ?? []).map((one) => ({
            transporterId: one.transporterId,
            name: one.name,
            detail: plural(one.count, 'safety event'),
          }))
        : moves
            .filter((move) =>
              which === 'up' ? rank(move.to) > rank(move.from) : rank(move.to) < rank(move.from),
            )
            .map((move) => ({
              transporterId: move.transporterId,
              name: move.name,
              detail: tierMoveWords(move),
            }));
    const title =
      which === 'up'
        ? 'Moved up a tier'
        : which === 'down'
          ? 'Moved down a tier'
          : 'New safety events';
    const lead =
      which === 'safety'
        ? `Drivers with safety events in ${changes.newestWeek}. Click a name to see their row.`
        : `Since ${changes.previousWeek}. Click a name to see their row.`;
    const id = await ask<string | null>((done) => (
      <ChangeListDialog title={title} lead={lead} lines={lines} onDone={done} />
    ));
    if (id) showDriver(id);
  }

  // The keys work only while this tab is showing, and never under an open question.
  const onKey = useEffectEvent((event: KeyboardEvent) => {
    if (!(event.ctrlKey || event.metaKey) || event.altKey || event.shiftKey) return;
    const key = event.key.toLowerCase();
    if (key !== 'g' && key !== 'e') return;
    event.preventDefault();
    if (document.querySelector('dialog[open]')) return;
    if (key === 'g') void generate(tickedRows(), 'ticked drivers');
    else void email(tickedRows());
  });
  useEffect(() => {
    const listener = (event: KeyboardEvent) => onKey(event);
    window.addEventListener('keydown', listener);
    return () => window.removeEventListener('keydown', listener);
  }, []);

  // ------------------------------------------------------------------------- columns

  const columns = useMemo<GridColumn<PerfDriverRow>[]>(() => {
    const pick: GridColumn<PerfDriverRow> = {
      id: 'pick',
      header: 'Pick',
      value: () => '',
      cell: (row) => (
        <span onDoubleClick={(event) => event.stopPropagation()} className="flex items-center">
          <input
            type="checkbox"
            checked={ticked.has(row.transporterId)}
            onChange={() => toggle(row.transporterId)}
            aria-label={`Tick ${row.name}`}
            data-testid="perf-pick"
            tabIndex={-1}
          />
        </span>
      ),
      align: 'center',
      sortable: false,
      hideable: false,
      fitExtra: 28,
    };
    const safety = SAFETY_COLUMNS.map<GridColumn<PerfDriverRow>>((spec) => ({
      id: spec.id,
      header: spec.header,
      align: 'right',
      fitExtra: 16,
      value: (row) => {
        const n = row.safety?.[spec.key] ?? 0;
        return n > 0 ? String(n) : '';
      },
      cell: (row) => {
        const n = row.safety?.[spec.key] ?? 0;
        if (n <= 0) return <span />;
        return (
          <button
            type="button"
            tabIndex={-1}
            onClick={(event) => {
              event.stopPropagation();
              void showSafety(row, spec.metricType);
            }}
            onDoubleClick={(event) => event.stopPropagation()}
            title={`See ${row.name}'s ${spec.metricType ?? 'safety'} events`}
            data-testid={`perf-safety-${spec.key}`}
            className="rounded-sm bg-bad-soft px-2 font-semibold text-bad underline hover:brightness-110"
          >
            {n}
          </button>
        );
      },
    }));
    return [
      pick,
      { id: 'name', header: 'Driver', value: (row) => row.name },
      {
        id: 'transporter-id',
        header: 'Transporter ID',
        value: (row) => row.transporterId,
        mono: true,
      },
      { id: 'status', header: 'Status', value: (row) => statusOf(row) },
      { id: 'latest-week', header: 'Latest Week', value: (row) => row.latestWeek ?? '' },
      {
        id: 'latest-tier',
        header: 'Latest Tier',
        value: (row) => row.latestTier ?? '',
        fitExtra: 28,
        cell: (row) =>
          row.latestTier ? (
            <Chip tone={tierTone(row.latestTier)} icon={Medal} data-testid="perf-tier">
              {row.latestTier}
            </Chip>
          ) : (
            <span className="text-faint">-</span>
          ),
      },
      {
        id: 'latest-score',
        header: 'Latest Score',
        value: (row) => numberText(row.latestScore, 1),
        align: 'right',
      },
      {
        id: 'latest-rank',
        header: 'Latest Rank',
        value: (row) => row.latestRankDisplay,
        align: 'right',
      },
      {
        id: 'latest-packages',
        header: 'Latest Packages',
        value: (row) => numberText(row.latestPackages, 0),
        align: 'right',
      },
      ...AVERAGES.map<GridColumn<PerfDriverRow>>((spec) => ({
        id: `avg-${spec.key}`,
        header: spec.header,
        value: (row) => row.averagesDisplay?.[spec.key] ?? '',
        align: 'right',
      })),
      {
        id: 'score-change',
        header: 'Δ Score',
        value: (row) => deltaText(row.trend?.scoreDelta ?? null),
        align: 'right',
        cell: (row) => {
          const delta = row.trend?.scoreDelta ?? null;
          if (delta === null) return <span className="text-faint">-</span>;
          return (
            <span className={delta < 0 ? 'text-bad' : delta > 0 ? 'text-ok' : ''}>
              {deltaText(delta)}
            </span>
          );
        },
      },
      {
        id: 'trend',
        header: 'Trend',
        value: (row) => row.trend?.trendDirection ?? 'Flat',
        fitExtra: 16,
        cell: (row) => {
          const trend = TREND_WORDS[row.trend?.trendDirection ?? 'Flat'] ?? TREND_WORDS.Flat!;
          const Icon = trend.icon;
          return (
            <span className={cn('flex items-center gap-1', trend.tone)} title={trend.words}>
              <Icon aria-hidden="true" className="size-[1.1em]" />
              <span>{trend.words}</span>
            </span>
          );
        },
      },
      ...safety,
    ];
    // eslint-disable-next-line react-hooks/exhaustive-deps -- the cells read the latest ticks and range on each render
  }, [ticked, range]);

  const filter = useMemo(() => (row: PerfDriverRow) => passesFilters(row, filters), [filters]);

  const rowActions = useMemo<RowAction<PerfDriverRow>[]>(
    () => [
      { id: 'preview', label: 'Preview PDF', onSelect: (row) => void preview(row) },
      { id: 'email', label: 'Email this report', onSelect: (row) => void email([row]) },
      {
        id: 'copy-email',
        label: 'Copy email address',
        disabled: (row) => !row.hasEmail,
        onSelect: (row) => void copyEmail(row),
      },
      {
        id: 'explain-score',
        label: 'Explain this score',
        icon: Calculator,
        separatorBefore: true,
        disabled: (row) => row.latestScore === null,
        onSelect: (row) => void explainScore(row),
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps -- the actions read the latest rows and range on each render
    [rows, range, snapshot.performance.emailReady, settings.performance.email.bccAddress],
  );

  function activate(row: PerfDriverRow, columnId: string) {
    if (columnId === 'pick') return toggle(row.transporterId);
    const safety = SAFETY_COLUMNS.find((spec) => spec.id === columnId);
    if (safety && (row.safety?.[safety.key] ?? 0) > 0) {
      void showSafety(row, safety.metricType);
      return;
    }
    // Double-click, Enter or Space opens the report, as double-clicking a row did.
    void preview(row);
  }

  function setStatusChip(status: string) {
    onFilters({ ...filters, status });
  }
  function toggleTier(tier: string) {
    const tiers = filters.tiers.includes(tier)
      ? filters.tiers.filter((one) => one !== tier)
      : [...filters.tiers, tier];
    onFilters({ ...filters, tiers });
  }

  const revealNow = useMemo(
    () => (picked ? { rowId: picked, columnId: 'name' } : (reveal ?? null)),
    [picked, reveal],
  );
  const onRevealedNow = useCallback(() => {
    if (picked) setPicked(null);
    else onRevealed?.();
  }, [picked, onRevealed]);
  const noData = rows.length === 0;
  const tickedCount = rows.filter((row) => ticked.has(row.transporterId)).length;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2 border-b border-line bg-surface px-6 py-2">
        <WeekRangePicker
          weeks={weeks}
          range={range}
          onChange={onWeekRange}
          onProblem={(words) => setStatus(words)}
        />
        {view ? (
          <ChangesStrip
            changes={view.changes}
            onOpen={(which) => void openChanges(which, view.changes)}
          />
        ) : null}
      </div>
      <div
        className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-line bg-surface px-6 py-2"
        role="group"
        aria-label="Show only"
      >
        <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Status">
          <span className="text-sm text-muted">Status</span>
          {STATUS_CHOICES.map((choice) => (
            <ChipButton
              key={choice.id}
              on={filters.status === choice.id}
              onClick={() => setStatusChip(choice.id)}
              testId={`perf-status-${choice.id.toLowerCase()}`}
            >
              {choice.label}
            </ChipButton>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Tier">
          <span className="text-sm text-muted">Tier</span>
          {TIERS.map((tier) => (
            <ChipButton
              key={tier}
              on={filters.tiers.includes(tier)}
              onClick={() => toggleTier(tier)}
              testId={`perf-tier-${tier.toLowerCase()}`}
            >
              {tier}
            </ChipButton>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Scorecard">
          <span className="text-sm text-muted">In these weeks</span>
          {ACTIVITY_CHOICES.map((choice) => (
            <ChipButton
              key={choice.id}
              on={filters.activity === choice.id}
              onClick={() => onFilters({ ...filters, activity: choice.id })}
              testId={`perf-activity-${choice.id}`}
            >
              {choice.label}
            </ChipButton>
          ))}
        </div>
      </div>
      <ButtonStrip label="Driver actions">
        <Button
          variant="primary"
          title="Ctrl+G"
          onClick={() => void generate(tickedRows(), 'ticked drivers')}
          data-testid="perf-generate-selected"
        >
          Generate for selected
        </Button>
        <Button
          onClick={() => void generate(visible, 'drivers shown')}
          data-testid="perf-generate-all"
        >
          Generate all shown
        </Button>
        <Button
          onClick={() => void exportCheckFile(tickedRows())}
          data-testid="perf-export-selected"
        >
          Export selected
        </Button>
        <Button onClick={() => void exportCheckFile(visible)} data-testid="perf-export-visible">
          Export shown
        </Button>
        <Button
          title="Ctrl+E"
          onClick={() => void email(tickedRows())}
          data-testid="perf-email-selected"
        >
          Email selected
        </Button>
        <Button
          onClick={() =>
            void email(visible, 'There are no drivers shown. Change the filters or the search.')
          }
          data-testid="perf-email-visible"
        >
          Email everyone shown
        </Button>
        <Button
          disabled={current === null}
          title={
            current ? `How ${current.name}'s score is made up` : 'Click a driver in the table first'
          }
          onClick={() => current && void explainScore(current)}
          data-testid="perf-explain-selected"
        >
          <Calculator aria-hidden="true" />
          Explain this score
        </Button>
        <span className="mx-1 h-5 w-px bg-line" aria-hidden="true" />
        <Button
          size="sm"
          onClick={() => setTicked([...ticked, ...visible.map(idOf)])}
          data-testid="perf-select-visible"
        >
          Select all shown
        </Button>
        <Button
          size="sm"
          variant="ghost"
          disabled={ticked.size === 0}
          onClick={() => setTicked([])}
          data-testid="perf-clear-selection"
        >
          Clear selection
        </Button>
        <span className="text-sm text-muted" data-testid="perf-ticked-count">
          {tickedCount > 0
            ? `${plural(tickedCount, 'driver')} ticked.`
            : 'Tick drivers in the first column to act on them.'}
        </span>
        <WordingSettingsButton
          onClick={() => void openWording()}
          testId="scorecards-settings"
          className="ml-auto"
        />
      </ButtonStrip>
      <div
        className="min-h-0 flex-1"
        ref={gridBox}
        onChange={followSearch}
        onClick={followSearch}
        onKeyUp={followSearch}
      >
        <DataGrid
          view="performance-drivers"
          label="Drivers"
          columns={columns}
          rows={rows}
          getRowId={idOf}
          layoutStore={databaseLayoutStore}
          rowActions={rowActions}
          onRowActivate={activate}
          filter={filter}
          searchPlaceholder="Search by name or ID"
          onResetFilters={() => onFilters(NO_FILTERS)}
          onSelectionChange={setCurrent}
          reveal={revealNow}
          onRevealed={onRevealedNow}
          empty={
            noData
              ? {
                  title: 'No weekly performance data yet',
                  body: 'Bring in the scorecards on the Imports tab, and your drivers show up here.',
                  action: (
                    <Button onClick={onGoImports} data-testid="perf-go-imports">
                      Go to Imports
                    </Button>
                  ),
                }
              : undefined
          }
        />
      </div>
      {working && progress ? <ProgressMeter progress={progress} /> : null}
      <p
        className="m-0 border-t border-line bg-surface px-6 py-1 text-sm text-muted"
        data-testid="perf-shown-line"
      >
        Showing {plural(visible.length, 'driver')} of {rows.length}. Weeks held:{' '}
        {weeks.length > 0
          ? rangeWords({ from: weeks[0]!, to: weeks[weeks.length - 1]! })
          : 'none yet'}
        .
      </p>
      {host}
    </div>
  );
}
