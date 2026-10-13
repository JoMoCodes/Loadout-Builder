// The day's data, held in the main process. One core `AppState` is built on the data source's
// database when the app opens, and built again when demo mode is switched. Everything a page shows
// comes from it (as a snapshot), and everything a page does goes through it (as a command).
// Nothing in the page touches the database or the file readers.

import path from 'node:path';
import { AppState, todayDate, type IsoDate } from '@loadout/core';
import type { Store } from '@loadout/storage';
import type { DataSource } from './dataSource';
import { ChannelRefusal } from './channels';
import { buildSnapshot } from './snapshot';
import type { AppSnapshot } from '../shared/snapshot';
import type { GridLayoutRecord } from '../shared/channels/layout';
import { loadDemoPerformance } from './performance/demo';
import { NO_PERF_STATUS, PerfHost, type PerfStatus } from './performance/perfHost';
import { memoryLastRun, RouteSheetsHost, type LastRunMemory } from './routeSheets/host';

export interface StateHostOptions {
  /** The made-up weekly performance exports, brought into the demo copy when demo mode opens. */
  demoPerformanceFolder?: string;
  /** Called when the data changed by itself (the demo weekly data finished loading). */
  onAsyncChange?: () => void;
  /** Counts only, for the log. */
  log?: (message: string) => void;
  /**
   * Where the open route sheet run's id is remembered between runs of the app (the settings
   * file's main-only part). Demo mode never uses it. Without it, it is kept in memory.
   */
  lastRouteSheetRun?: LastRunMemory;
  /** The clock for the route sheet runs' times. Defaults to the computer's. */
  now?: () => Date;
}

export class StateHost {
  private current: AppState | null = null;
  private currentStore: Store | null = null;
  private currentPerf: PerfHost | null = null;
  private currentRouteSheets: RouteSheetsHost | null = null;
  /** Demo mode's own memory of the open run, so the real one is never touched. */
  private demoLastRun: LastRunMemory = memoryLastRun();
  /** What the snapshot says about weekly performance that the database does not know. */
  perfStatus: () => PerfStatus = () => NO_PERF_STATUS;
  /** Settles when the demo weekly data has been brought in (at once when there is none to load). */
  perfLoading: Promise<void> = Promise.resolve();
  /** Goes up by one after every command and whenever the data is swapped. */
  revision = 0;

  constructor(
    private readonly dataSource: DataSource,
    /** The day to count as today. Only the clock reads it; tests give a fixed day. */
    readonly today: () => IsoDate = () => todayDate(),
    private readonly options: StateHostOptions = {},
  ) {}

  /** Builds the state on whatever the data source has open now. Call after `dataSource.open()`. */
  rebuild(): void {
    this.revision += 1;
    if (this.currentPerf) this.currentPerf.closed = true;
    this.currentPerf = null;
    this.currentRouteSheets = null;
    this.perfLoading = Promise.resolve();
    const store = this.dataSource.getStore();
    if (store === null) {
      this.current = null;
      this.currentStore = null;
      return;
    }
    const state = new AppState(store);
    state.loadAll();
    this.current = state;
    this.currentStore = store;
    const perf = new PerfHost(store);
    this.currentPerf = perf;
    const demo = this.dataSource.getInfo().mode === 'demo';
    if (demo) this.demoLastRun = memoryLastRun();
    this.currentRouteSheets = new RouteSheetsHost({
      store,
      pdfFolder: path.join(this.dataSource.folder() ?? '.', 'route-sheets'),
      state,
      today: this.today,
      now: this.options.now,
      demo,
      lastRun: demo ? this.demoLastRun : (this.options.lastRouteSheetRun ?? memoryLastRun()),
      log: this.options.log,
    });
    const folder = this.options.demoPerformanceFolder;
    if (demo && folder) {
      perf.ready = false;
      this.perfLoading = loadDemoPerformance(perf, folder)
        .then((rows) => {
          if (perf.closed) return;
          this.options.log?.(`demo weekly performance data loaded: ${rows} rows`);
        })
        .catch(() => {
          if (!perf.closed) this.options.log?.('could not load the demo weekly performance data');
        })
        .finally(() => {
          perf.ready = true;
          perf.invalidate();
          if (!perf.closed) this.options.onAsyncChange?.();
        });
    }
  }

  /** The weekly performance data on the open saved data, or a "no-data" refusal. */
  get perf(): PerfHost {
    void this.state;
    if (this.currentPerf === null) throw new ChannelRefusal('no-data');
    return this.currentPerf;
  }

  /** The route sheets on the open saved data, or a "no-data" refusal. */
  get routeSheets(): RouteSheetsHost {
    void this.state;
    if (this.currentRouteSheets === null) throw new ChannelRefusal('no-data');
    return this.currentRouteSheets;
  }

  /** The state, or a "no-data" refusal when the saved data could not be opened. */
  get state(): AppState {
    if (this.current === null) throw new ChannelRefusal('no-data');
    return this.current;
  }

  /** Counts a change. Returns the new revision. */
  bump(): number {
    this.revision += 1;
    return this.revision;
  }

  snapshot(): AppSnapshot {
    return buildSnapshot(this.state, {
      today: this.today(),
      revision: this.revision,
      mode: this.dataSource.getInfo().mode,
      performance: this.perf.snapshot(this.perfStatus()),
      routeSheets: this.routeSheets.counts(),
    });
  }

  /** The database behind the state, or a "no-data" refusal. */
  private openStore(): Store {
    void this.state;
    return this.currentStore as Store;
  }

  // ---- column layouts (the saved data's own tables)

  getLayout(view: string): GridLayoutRecord {
    const store = this.openStore();
    return { order: store.loadColumnOrder(view), widths: store.loadColumnWidths(view) };
  }

  setLayout(view: string, order: string[], widths: Record<string, number>): void {
    const store = this.openStore();
    store.setColumnOrder(view, order);
    store.setColumnWidths(view, widths);
  }
}
