// The day's data, held in the main process. One core `AppState` is built on the data source's
// database when the app opens, and built again when demo mode is switched. Everything a page shows
// comes from it (as a snapshot), and everything a page does goes through it (as a command).
// Nothing in the page touches the database or the file readers.

import { AppState, todayDate, type IsoDate } from '@loadout/core';
import type { Store } from '@loadout/storage';
import type { DataSource } from './dataSource';
import { ChannelRefusal } from './channels';
import { buildSnapshot } from './snapshot';
import type { AppSnapshot } from '../shared/snapshot';
import type { GridLayoutRecord } from '../shared/channels/layout';

export class StateHost {
  private current: AppState | null = null;
  private currentStore: Store | null = null;
  /** Goes up by one after every command and whenever the data is swapped. */
  revision = 0;

  constructor(
    private readonly dataSource: DataSource,
    /** The day to count as today. Only the clock reads it; tests give a fixed day. */
    readonly today: () => IsoDate = () => todayDate(),
  ) {}

  /** Builds the state on whatever the data source has open now. Call after `dataSource.open()`. */
  rebuild(): void {
    this.revision += 1;
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
