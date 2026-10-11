// The weekly performance data of the open saved data: the performance tables (PerformanceStore)
// and one cached read of all of them (PerfData), read again after every write. Built by the
// StateHost on the same database as the day's data, and built again when that is swapped
// (demo mode on or off).

import { getAllWeeks, type PerfData } from '@loadout/performance';
import { PerformanceStore, type Store } from '@loadout/storage';
import { EMPTY_PERF_SNAPSHOT, type PerfSnapshot } from '../../shared/performance';

/** What the snapshot says about weekly performance that the database does not know. */
export interface PerfStatus {
  foldersChosen: number;
  lastSync: PerfSnapshot['lastSync'];
  emailReady: boolean;
  reportsMade: boolean;
  reportsEmailed: boolean;
}

export const NO_PERF_STATUS: PerfStatus = {
  foldersChosen: 0,
  lastSync: null,
  emailReady: false,
  reportsMade: false,
  reportsEmailed: false,
};

export class PerfHost {
  readonly store: PerformanceStore;
  private cached: PerfData | null = null;
  /** False while the made-up demo data is still being written in (the POD files read slowly). */
  ready = true;
  /** Set when the database this was built on has been closed (demo mode switched). */
  closed = false;

  constructor(db: Store, options: { now?: () => Date } = {}) {
    this.store = new PerformanceStore(db.db, options);
  }

  /** Everything in the performance tables. Read once, then kept until the next write. */
  data(): PerfData {
    this.cached ??= this.store.loadPerfData();
    return this.cached;
  }

  /** Call after any write, so the next read sees it. */
  invalidate(): void {
    this.cached = null;
  }

  /** Runs a write and forgets the cached read afterwards, whether it worked or not. */
  write<T>(work: (store: PerformanceStore) => T): T {
    try {
      return work(this.store);
    } finally {
      this.invalidate();
    }
  }

  /** The brief the snapshot carries. While demo data is loading, it says there is none yet. */
  snapshot(status: PerfStatus): PerfSnapshot {
    if (!this.ready) return { ...EMPTY_PERF_SNAPSHOT, ...status };
    const data = this.data();
    const weeks = getAllWeeks(data);
    return {
      hasData: data.scorecards.length > 0 || data.drivers.length > 0,
      weeks,
      drivers: data.drivers.length,
      withEmail: data.drivers.filter((d) => (d.email ?? '').trim() !== '').length,
      thresholds: data.thresholds.length > 0,
      ...status,
    };
  }
}
