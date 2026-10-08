// Where the app's saved data comes from. Normally that is the person's own database. In demo
// mode it is a throwaway copy of the made-up demo data, so nothing real is touched and
// nothing demo-only is kept.

import { importV1Database, Store } from '@loadout/storage';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import path from 'node:path';
import type { DataSourceInfo } from '../shared/api';

export interface DataSourcePaths {
  /** The folder that holds the person's own database file. */
  dataFolder: string;
  /** The made-up demo database that ships with the app. */
  fixtureDb: string;
  /** A folder for throwaway files (the computer's temp folder). */
  tempFolder: string;
}

export const DB_FILE_NAME = 'loadout.db';

export class DataSource {
  private store: Store | null = null;
  private demoFolder: string | null = null;
  private info: DataSourceInfo = { mode: 'real', ok: false, reason: 'open-failed', counts: {} };

  constructor(private readonly paths: DataSourcePaths) {}

  /** The open database, or null if it could not be opened (see `getInfo().reason`). */
  getStore(): Store | null {
    return this.store;
  }

  getInfo(): DataSourceInfo {
    // The counts are read fresh, so they follow what was saved or brought over since it opened.
    if (this.store && this.info.ok)
      return { ...this.info, counts: { ...this.store.tableCounts() } };
    return this.info;
  }

  /** Opens the real database (demo false) or a fresh demo copy (demo true). */
  open(demo: boolean): DataSourceInfo {
    this.close();
    try {
      if (demo) {
        if (!existsSync(this.paths.fixtureDb)) {
          this.info = { mode: 'demo', ok: false, reason: 'fixture-missing', counts: {} };
          return this.info;
        }
        mkdirSync(this.paths.tempFolder, { recursive: true });
        this.demoFolder = mkdtempSync(path.join(this.paths.tempFolder, 'loadout-demo-'));
        // Work on a copy so the shipped file is never changed.
        const copy = path.join(this.demoFolder, 'demo-source.db');
        copyFileSync(this.paths.fixtureDb, copy);
        const store = new Store(path.join(this.demoFolder, DB_FILE_NAME));
        importV1Database(copy, store);
        this.store = store;
      } else {
        this.store = new Store(path.join(this.paths.dataFolder, DB_FILE_NAME));
      }
      this.info = {
        mode: demo ? 'demo' : 'real',
        ok: true,
        reason: null,
        counts: { ...this.store.tableCounts() },
      };
    } catch {
      this.closeStore();
      this.info = { mode: demo ? 'demo' : 'real', ok: false, reason: 'open-failed', counts: {} };
    }
    return this.info;
  }

  /** Lets go of the database and removes any demo copy. */
  close(): void {
    this.closeStore();
    if (this.demoFolder) {
      try {
        rmSync(this.demoFolder, { recursive: true, force: true });
      } catch {
        // A leftover temp folder is harmless; the computer clears its temp folder itself.
      }
      this.demoFolder = null;
    }
  }

  private closeStore(): void {
    try {
      this.store?.close();
    } catch {
      // Already closed.
    }
    this.store = null;
  }
}

/** Total rows across all tables. For logs: a count, never content. */
export function totalRows(counts: Record<string, number>): number {
  return Object.values(counts).reduce((sum, n) => sum + n, 0);
}
