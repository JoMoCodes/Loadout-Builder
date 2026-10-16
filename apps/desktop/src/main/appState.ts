// The day's data, held in the main process. One core `AppState` is built on the data source's
// database when the app opens, and built again when demo mode is switched. Everything a page shows
// comes from it (as a snapshot), and everything a page does goes through it (as a command).
// Nothing in the page touches the database or the file readers.

import path from 'node:path';
import { AppState, todayDate, type IsoDate } from '@loadout/core';
import type { RouteSheetWording } from '@loadout/route-sheets';
import type { Store } from '@loadout/storage';
import type { DataSource } from './dataSource';
import { ChannelRefusal } from './channels';
import { buildSnapshot } from './snapshot';
import type { AppSnapshot } from '../shared/snapshot';
import type { GridLayoutRecord } from '../shared/channels/layout';
import type { RouteSheetsRouteData } from '../shared/settings';
import { loadDemoPerformance } from './performance/demo';
import { NO_PERF_STATUS, PerfHost, type PerfStatus } from './performance/perfHost';
import { loadDemoRouteSheets } from './routeSheets/demo';
import { memoryLastRun, RouteSheetsHost, type LastRunMemory } from './routeSheets/host';

export interface StateHostOptions {
  /** The made-up weekly performance exports, brought into the demo copy when demo mode opens. */
  demoPerformanceFolder?: string;
  /**
   * The made-up fixtures folder (it holds routes, associates and route-sheets). Demo mode brings
   * in the made-up route sheet day from it when demo mode opens.
   */
  demoFixturesFolder?: string;
  /** Called when the data changed by itself (the demo weekly data finished loading). */
  onAsyncChange?: () => void;
  /** Counts only, for the log. */
  log?: (message: string) => void;
  /**
   * Where the open route sheet run's id is remembered between runs of the app (the settings
   * file's main-only part). Demo mode never uses it. Without it, it is kept in memory.
   */
  lastRouteSheetRun?: LastRunMemory;
  /** The route sheet emails' subject and opening lines, as set now. The old app's words without it. */
  routeSheetsWording?: () => RouteSheetWording;
  /** Which route data the route sheets match with, as set now (the Roster's without it). */
  routeSheetsRouteData?: () => RouteSheetsRouteData;
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
  /** Settles when the demo route sheet day has been brought in (at once when there is none to load). */
  routeSheetsLoading: Promise<void> = Promise.resolve();
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
    this.routeSheetsLoading = Promise.resolve();
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
    // The Performance page reads the Associates list for its drivers, so any change to the
    // day's data (an associate import or clear, a route export that adds someone) means its
    // next read starts over.
    state.subscribe(() => perf.invalidate());
    // And the other way: a scorecard import can add a name-only driver to that list.
    perf.driversChanged = () => state.reloadAssociates();
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
      wording: this.options.routeSheetsWording,
      routeDataChoice: this.options.routeSheetsRouteData,
      log: this.options.log,
    });
    const fixtures = this.options.demoFixturesFolder;
    if (demo && fixtures) {
      const sheets = this.currentRouteSheets;
      this.routeSheetsLoading = loadDemoRouteSheets(state, sheets, fixtures, this.today())
        .then((count) => {
          if (this.currentRouteSheets !== sheets) return;
          this.options.log?.(`demo route sheets loaded: ${count} sheets`);
        })
        .catch((error: unknown) => {
          if (this.currentRouteSheets === sheets) {
            // The kind of error only (a code), never its message: it can hold a path.
            const kind = error instanceof Error ? error.name : 'unknown';
            this.options.log?.(`could not load the demo route sheets (${kind})`);
          }
        })
        .finally(() => {
          if (this.currentRouteSheets === sheets) this.options.onAsyncChange?.();
        });
    }
    const folder = this.options.demoPerformanceFolder;
    if (demo && folder) {
      perf.ready = false;
      this.perfLoading = loadDemoPerformance(perf, folder, state)
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
