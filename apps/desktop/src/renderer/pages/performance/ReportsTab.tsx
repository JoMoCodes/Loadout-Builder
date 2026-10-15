// The Reports tab: the report colours with a live preview of page 1, a preview of any driver's
// report (stepping through the drivers shown on the Performance tab), and the thresholds table.
// Ported from the old app's PDF settings window, its Preview tab and its thresholds window.

import { ChevronLeft, ChevronRight, RotateCcw, ZoomIn, ZoomOut } from 'lucide-react';
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { DataGrid, type GridColumn } from '../../components/DataGrid';
import type { PerfDriverRow, PerfThresholdRow, WeekRange } from '../../../shared/performance';
import { COLOUR_KEYS, type ReportColours } from '../../../shared/performanceSettings';
import type { AppSnapshot } from '../../../shared/snapshot';
import type { AppSettings, SettingsPatch } from '../../../shared/settings';
import { call, explain } from '../../lib/channels';
import { databaseLayoutStore } from '../../lib/gridLayoutStore';
import { Button } from '../../ui/button';
import { Chip } from '../../ui/chip';
import { ConfirmDialog } from '../dataPages/Modal';
import type { Messages } from '../dataPages/PageParts';
import { useDialogs } from '../dataPages/useDialogs';
import { importWords, rangeWords, tierTone } from './perfText';

const COLOUR_LABELS: Record<(typeof COLOUR_KEYS)[number], string> = {
  platinumBackground: 'Platinum: fill',
  platinumForeground: 'Platinum: text',
  goldBackground: 'Gold: fill',
  goldForeground: 'Gold: text',
  silverBackground: 'Silver: fill',
  silverForeground: 'Silver: text',
  bronzeBackground: 'Bronze: fill',
  bronzeForeground: 'Bronze: text',
  headerBarBackground: 'Header bar: fill',
  headerBarForeground: 'Header bar: text',
  tableBorderColor: 'Table lines',
  podRejectBackground: 'Counts above zero: fill',
  podRejectForeground: 'Counts above zero: text',
};

const sameColours = (a: ReportColours, b: ReportColours) =>
  a.useColor === b.useColor && COLOUR_KEYS.every((key) => a[key] === b[key]);

/** A report's HTML from the main process, asked again a moment after what it shows changes. */
function useReportHtml(
  ask: { transporterId: string | null; range: WeekRange | null; colours: ReportColours } | null,
  revision: number,
) {
  const [html, setHtml] = useState('');
  const [problem, setProblem] = useState<string | null>(null);
  const key = JSON.stringify(ask);
  useEffect(() => {
    if (!ask) return;
    let off = false;
    const timer = window.setTimeout(() => {
      void call('performance:report-html', {
        transporterId: ask.transporterId,
        range: ask.range,
        colours: { ...ask.colours },
      }).then((reply) => {
        if (off) return;
        if (reply.ok) {
          setHtml(reply.value?.html ?? '');
          setProblem(null);
        } else setProblem(explain(reply));
      });
    }, 250);
    return () => {
      off = true;
      window.clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `key` stands for what is asked
  }, [key, revision]);
  return { html: ask ? html : '', problem: ask ? problem : null };
}

function ReportFrame({ html, title, testId }: { html: string; title: string; testId: string }) {
  return (
    <iframe
      title={title}
      sandbox=""
      srcDoc={html}
      data-testid={testId}
      className="h-[32rem] w-full rounded-md border border-line bg-white"
    />
  );
}

/** A report page is US Letter: 8.5 by 11 inches at 96 dots an inch. */
const PAGE_WIDTH = 816;
const PAGE_HEIGHT = 1056;
const ZOOM_KEY = 'loadout.perf-colour-preview-zoom';
const ZOOM_MIN = 0.25;
const ZOOM_MAX = 2;
const ZOOM_STEP = 0.25;

/** "fit" (fit width) or a size, 1 being 100%. */
type Zoom = 'fit' | number;

function readZoom(): Zoom {
  try {
    const saved = window.localStorage.getItem(ZOOM_KEY);
    if (saved === null || saved === 'fit') return 'fit';
    const value = Number(saved);
    return Number.isFinite(value) && value >= ZOOM_MIN && value <= ZOOM_MAX ? value : 'fit';
  } catch {
    return 'fit';
  }
}

function writeZoom(zoom: Zoom): void {
  try {
    window.localStorage.setItem(ZOOM_KEY, String(zoom));
  } catch {
    // Only a convenience: the preview fits the width again next time.
  }
}

/**
 * The colour preview with zoom: Fit width, 100%, and zoom in and out. The page is drawn at its
 * real size and scaled, so the scroll bars show how much of it is out of view. The choice is
 * remembered in this window.
 */
function ZoomedPreview({ html, title, testId }: { html: string; title: string; testId: string }) {
  const [zoom, setZoomState] = useState<Zoom>(readZoom);
  const box = useRef<HTMLDivElement>(null);
  const [boxWidth, setBoxWidth] = useState(0);
  useLayoutEffect(() => {
    const element = box.current;
    if (!element) return;
    const measure = () => setBoxWidth(element.clientWidth);
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  const fitScale = boxWidth > 0 ? Math.max(ZOOM_MIN, (boxWidth - 2) / PAGE_WIDTH) : 1;
  const scale = zoom === 'fit' ? fitScale : zoom;
  const setZoom = (next: Zoom) => {
    setZoomState(next);
    writeZoom(next);
  };
  const step = (by: number) => {
    const next = Math.round((scale + by) / ZOOM_STEP) * ZOOM_STEP;
    setZoom(Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, next)));
  };
  const percent = Math.round(scale * 100);
  return (
    <div>
      <div
        className="mb-1 flex flex-wrap items-center gap-1.5"
        role="toolbar"
        aria-label="Preview size"
      >
        <Button
          size="sm"
          aria-pressed={zoom === 'fit'}
          onClick={() => setZoom('fit')}
          data-testid="perf-zoom-fit"
        >
          Fit width
        </Button>
        <Button
          size="sm"
          aria-pressed={zoom === 1}
          onClick={() => setZoom(1)}
          data-testid="perf-zoom-100"
        >
          100%
        </Button>
        <Button
          size="sm"
          aria-label="Zoom out"
          disabled={scale <= ZOOM_MIN}
          onClick={() => step(-ZOOM_STEP)}
          data-testid="perf-zoom-out"
        >
          <ZoomOut aria-hidden="true" />
        </Button>
        <Button
          size="sm"
          aria-label="Zoom in"
          disabled={scale >= ZOOM_MAX}
          onClick={() => step(ZOOM_STEP)}
          data-testid="perf-zoom-in"
        >
          <ZoomIn aria-hidden="true" />
        </Button>
        <span className="text-sm text-muted tabular-nums" data-testid="perf-zoom-level">
          {percent}%
        </span>
      </div>
      <div
        ref={box}
        className="h-[32rem] overflow-auto rounded-md border border-line bg-sunken"
        data-testid="perf-zoom-box"
      >
        <div style={{ width: PAGE_WIDTH * scale, height: PAGE_HEIGHT * scale }}>
          <div
            data-testid="perf-zoom-page"
            data-scale={scale.toFixed(3)}
            style={{
              width: PAGE_WIDTH,
              height: PAGE_HEIGHT,
              transform: `scale(${scale})`,
              transformOrigin: 'top left',
            }}
          >
            <iframe
              title={title}
              sandbox=""
              srcDoc={html}
              data-testid={testId}
              className="block h-full w-full border-0 bg-white"
            />
          </div>
        </div>
      </div>
    </div>
  );
}

export function ReportsTab({
  snapshot,
  settings,
  changeSettings,
  range,
  drivers,
  messages,
}: {
  snapshot: AppSnapshot;
  settings: AppSettings;
  changeSettings(patch: SettingsPatch): Promise<void>;
  range: WeekRange | null;
  /** The drivers shown on the Performance tab, in its order. */
  drivers: readonly PerfDriverRow[];
  messages: Messages;
}) {
  const { setStatus, setProblem } = messages;
  const { ask, host } = useDialogs();
  const saved = settings.performance.colours;
  const [draft, setDraft] = useState<ReportColours>(saved);
  const dirty = !sameColours(draft, saved);

  // ------------------------------------------------------------------- the colours

  const sample = useReportHtml({ transporterId: null, range: null, colours: draft }, 0);

  function setColour(key: (typeof COLOUR_KEYS)[number], value: string) {
    setDraft((now) => ({ ...now, [key]: value.toUpperCase() }));
  }

  async function saveColours() {
    await changeSettings({ performance: { colours: draft } });
    setStatus('Report colours saved.');
  }

  async function resetColours() {
    const reply = await call('performance:reset-colours');
    if (!reply.ok || !reply.value) {
      if (!reply.ok) setProblem({ title: 'The colours were not reset', message: explain(reply) });
      return;
    }
    const colours = reply.value;
    setDraft(colours);
    await changeSettings({ performance: { colours } });
    setStatus('Report colours are back to the old app’s colours.');
  }

  // ------------------------------------------------------------ preview a driver

  const [at, setAt] = useState(0);
  const index = drivers.length === 0 ? -1 : Math.min(at, drivers.length - 1);
  const driver = index >= 0 ? drivers[index]! : null;
  const driverHtml = useReportHtml(
    driver && range ? { transporterId: driver.transporterId, range, colours: draft } : null,
    snapshot.revision,
  );

  function step(by: number) {
    if (drivers.length === 0) return;
    setAt((index + by + drivers.length) % drivers.length);
  }

  function onPreviewKey(event: KeyboardEvent<HTMLElement>) {
    const target = event.target as HTMLElement;
    if (target.closest('select, input, textarea')) return;
    if (event.key === 'ArrowLeft') {
      event.preventDefault();
      step(-1);
    } else if (event.key === 'ArrowRight') {
      event.preventDefault();
      step(1);
    }
  }

  // ---------------------------------------------------------------- thresholds

  const [thresholds, setThresholds] = useState<PerfThresholdRow[]>([]);
  const [importing, setImporting] = useState(false);
  useEffect(() => {
    let off = false;
    void call('performance:thresholds').then((reply) => {
      if (off) return;
      if (reply.ok) setThresholds(reply.value ?? []);
      else setProblem({ title: 'The thresholds could not be read', message: explain(reply) });
    });
    return () => {
      off = true;
    };
  }, [snapshot.revision, setProblem]);

  async function bringInThresholds() {
    if (importing) return;
    if (thresholds.length > 0) {
      const yes = await ask<boolean>((done) => (
        <ConfirmDialog
          title="Replace the thresholds?"
          body="This replaces the thresholds you have. Go ahead?"
          confirmLabel="Yes, choose a file"
          cancelLabel="No, keep them"
          onDone={done}
        />
      ));
      if (!yes) return;
    }
    setImporting(true);
    try {
      const reply = await call('performance:choose-and-import', { kind: 'thresholds' });
      if (!reply.ok) {
        setProblem({ title: 'The thresholds were not brought in', message: explain(reply) });
        return;
      }
      if (!reply.value) return;
      const summary = reply.value;
      setStatus(importWords(summary));
      if (summary.problems.length > 0) {
        setProblem({ title: 'Some lines could not be read', message: summary.problems.join(' ') });
      }
    } finally {
      setImporting(false);
    }
  }

  const thresholdColumns = useMemo<GridColumn<PerfThresholdRow>[]>(() => {
    const tierColumn = (
      id: 'platinum' | 'gold' | 'silver' | 'bronze',
      header: string,
    ): GridColumn<PerfThresholdRow> => ({
      id,
      header,
      value: (row) => row[id],
      align: 'right',
      fitExtra: 24,
      cell: (row) =>
        row[id] ? (
          <Chip tone={tierTone(header)} icon={null}>
            {row[id]}
          </Chip>
        ) : (
          <span className="text-faint">-</span>
        ),
    });
    return [
      { id: 'metric', header: 'Metric', value: (row) => row.metricNameDisplay || row.metricName },
      { id: 'direction', header: 'Better when', value: (row) => row.direction },
      tierColumn('platinum', 'Platinum'),
      tierColumn('gold', 'Gold'),
      tierColumn('silver', 'Silver'),
      tierColumn('bronze', 'Bronze'),
      { id: 'weight', header: 'Weight', value: (row) => row.weight, align: 'right' },
      { id: 'week', header: 'Week', value: (row) => row.sourceWeek },
    ];
  }, []);

  return (
    <div className="min-h-0 flex-1 overflow-auto px-6 py-4" data-testid="perf-reports">
      <section className="card mb-4" aria-labelledby="perf-colours-title">
        <h2 id="perf-colours-title" className="mt-0 text-[1.15rem] font-semibold">
          Report colours
        </h2>
        <div className="grid gap-4 lg:grid-cols-[minmax(16rem,22rem)_1fr]">
          <div>
            <label className="switch-row mb-3">
              <input
                type="checkbox"
                role="switch"
                className="switch"
                checked={draft.useColor}
                onChange={(event) =>
                  setDraft((now) => ({ ...now, useColor: event.target.checked }))
                }
                data-testid="perf-use-colour"
              />
              Print the reports in colour
            </label>
            <p className="m-0 mb-3 text-sm text-muted">
              Turn this off for black-and-white reports that print well on any printer.
            </p>
            <div className="grid grid-cols-[1fr_auto] items-center gap-x-3 gap-y-1.5">
              {COLOUR_KEYS.map((key) => (
                <label key={key} className="contents text-sm">
                  <span className={draft.useColor ? '' : 'text-faint'}>{COLOUR_LABELS[key]}</span>
                  <input
                    type="color"
                    value={draft[key].toLowerCase()}
                    disabled={!draft.useColor}
                    onChange={(event) => setColour(key, event.target.value)}
                    data-testid={`perf-colour-${key}`}
                    className="h-7 w-14 cursor-pointer rounded-sm border border-line-strong bg-sunken disabled:opacity-50"
                  />
                </label>
              ))}
            </div>
            <div className="row-of-buttons mt-4">
              <Button
                variant="primary"
                disabled={!dirty}
                onClick={() => void saveColours()}
                data-testid="perf-save-colours"
              >
                Save colours
              </Button>
              <Button
                disabled={!dirty}
                onClick={() => setDraft(saved)}
                data-testid="perf-undo-colours"
              >
                Undo changes
              </Button>
              <Button
                variant="ghost"
                onClick={() => void resetColours()}
                data-testid="perf-reset-colours"
              >
                <RotateCcw aria-hidden="true" />
                Reset to the old colours
              </Button>
            </div>
            {dirty ? (
              <p className="mt-2 text-sm text-warn" data-testid="perf-colours-unsaved">
                Not saved yet. The preview shows your changes.
              </p>
            ) : null}
          </div>
          <div>
            <p className="m-0 mb-1 text-sm text-muted">Page 1 of a sample report</p>
            {sample.problem ? (
              <p role="alert" className="problem text-sm">
                {sample.problem}
              </p>
            ) : (
              <ZoomedPreview
                html={sample.html}
                title="Sample report, page 1"
                testId="perf-sample-frame"
              />
            )}
          </div>
        </div>
      </section>

      <section
        className="card mb-4"
        aria-labelledby="perf-preview-title"
        onKeyDown={onPreviewKey}
        tabIndex={-1}
        data-testid="perf-driver-preview"
      >
        <h2 id="perf-preview-title" className="mt-0 text-[1.15rem] font-semibold">
          Preview a driver
        </h2>
        {!range ? (
          <p className="text-sm text-muted">
            Bring in some scorecards first. The Imports tab does that.
          </p>
        ) : !driver ? (
          <p className="text-sm text-muted">
            No drivers are shown on the Performance tab. Change its filters to preview a report.
          </p>
        ) : (
          <>
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <Button
                size="sm"
                onClick={() => step(-1)}
                aria-label="Previous driver"
                data-testid="perf-preview-prev"
              >
                <ChevronLeft aria-hidden="true" />
                Previous
              </Button>
              <Button
                size="sm"
                onClick={() => step(1)}
                aria-label="Next driver"
                data-testid="perf-preview-next"
              >
                Next
                <ChevronRight aria-hidden="true" />
              </Button>
              <span className="text-sm tabular-nums" data-testid="perf-preview-position">
                Driver {index + 1} of {drivers.length}
              </span>
              <label className="flex items-center gap-1.5 text-sm text-muted">
                Go to
                <select
                  value={driver.transporterId}
                  onChange={(event) =>
                    setAt(
                      Math.max(
                        0,
                        drivers.findIndex((one) => one.transporterId === event.target.value),
                      ),
                    )
                  }
                  className="h-8 max-w-[16rem] rounded-md border border-line-strong bg-sunken px-2 text-sm text-fg"
                  data-testid="perf-preview-jump"
                >
                  {drivers.map((one) => (
                    <option key={one.transporterId} value={one.transporterId}>
                      {one.name}
                    </option>
                  ))}
                </select>
              </label>
              <span className="text-sm text-muted">
                Weeks {rangeWords(range)}. The arrow keys move between drivers too.
              </span>
            </div>
            <p className="m-0 mb-1 font-semibold" data-testid="perf-preview-name">
              {driver.name}
            </p>
            {driverHtml.problem ? (
              <p role="alert" className="problem text-sm">
                {driverHtml.problem}
              </p>
            ) : (
              <ReportFrame
                html={driverHtml.html}
                title={`Report for ${driver.name}`}
                testId="perf-driver-frame"
              />
            )}
          </>
        )}
      </section>

      <section className="card" aria-labelledby="perf-thresholds-title">
        <div className="mb-2 flex flex-wrap items-center gap-3">
          <h2 id="perf-thresholds-title" className="m-0 text-[1.15rem] font-semibold">
            Thresholds
          </h2>
          <Button
            onClick={() => void bringInThresholds()}
            disabled={importing}
            data-testid="perf-import-thresholds"
          >
            Bring in thresholds
          </Button>
        </div>
        <p className="m-0 mb-2 text-sm text-muted">
          The cut-off for each tier, and how much each metric counts towards the score.
        </p>
        <div className="flex h-[22rem] flex-col">
          <DataGrid
            view="performance-thresholds"
            label="Thresholds"
            columns={thresholdColumns}
            rows={thresholds}
            getRowId={(row) => row.metricName}
            layoutStore={databaseLayoutStore}
            empty={{
              title: 'No thresholds yet',
              body: 'Bring in the scoring metadata file (DSP_Thresholds_Scoring_Metadata_…csv) from the DSP portal.',
            }}
          />
        </div>
      </section>
      {host}
    </div>
  );
}
