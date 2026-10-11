// Bringing over the old Weekly Performance App's saved data (its app.db), the one time it is
// wanted. Mirrors ../oldData.ts: the file is looked for in its usual place, or the person
// chooses it in a file window; the page never learns where it is; nothing is ever written over
// weekly data this app already has (the importer skips when any is there).

import { ImportWpaError, importWpaDatabase } from '@loadout/storage';
import type { Store } from '@loadout/storage';
import { existsSync } from 'node:fs';
import path from 'node:path';
import type { OldDataFind, OldDataResult, OldDataSource } from '../../shared/oldData';
import { ChannelRefusal } from '../channels';

/**
 * Where the old app kept its data: %LocalAppData%\WeeklyPerformanceApp\app.db. `localAppData`
 * is the LOCALAPPDATA folder when the computer has one; otherwise it is worked out from home.
 */
export function usualWpaDbPath(home: string, localAppData?: string): string {
  const local = localAppData || path.join(home, 'AppData', 'Local');
  return path.join(local, 'WeeklyPerformanceApp', 'app.db');
}

export interface OldWpaDeps {
  usualFile(): string;
  /** The open real database, or null when it could not be opened. */
  store(): Store | null;
  /** True while demo mode is on. */
  demo(): boolean;
  /** Shows the file window for the old app's file. The chosen file, or null. */
  pickFile(): Promise<string | null>;
  /** The weekly performance tables are empty (nothing would be written over). */
  perfEmpty(): boolean;
  /** Reads the weekly data again after it was brought over. */
  reload(): void;
}

export class OldWpaData {
  private chosen: string | null = null;

  constructor(private readonly deps: OldWpaDeps) {}

  find(): OldDataFind {
    const demo = this.deps.demo();
    const empty = this.deps.store() !== null && this.deps.perfEmpty();
    return { found: existsSync(this.deps.usualFile()), empty, demo };
  }

  async pick(): Promise<boolean> {
    const file = await this.deps.pickFile();
    this.chosen = file !== null && file.toLowerCase().endsWith('.db') ? file : null;
    return this.chosen !== null;
  }

  run(from: OldDataSource): OldDataResult {
    if (this.deps.demo()) {
      throw new ChannelRefusal(
        'refused',
        'Demo mode is on. Turn it off first, then bring over your weekly performance data.',
      );
    }
    const store = this.deps.store();
    if (store === null) throw new ChannelRefusal('no-data');
    const source = from === 'usual' ? this.deps.usualFile() : this.chosen;
    if (source === null) throw new ChannelRefusal('not-allowed');

    let result;
    try {
      result = importWpaDatabase(source, store);
    } catch (error) {
      if (error instanceof ImportWpaError && error.code === 'source-missing') {
        throw new ChannelRefusal(
          'refused',
          "The Weekly Performance App's data file was not found. Use Choose a different file to find it.",
        );
      }
      if (error instanceof ImportWpaError) {
        throw new ChannelRefusal(
          'refused',
          "That file could not be read as the Weekly Performance App's data. Choose the file called app.db from its data folder.",
        );
      }
      throw error;
    }
    if (result.status === 'imported') {
      this.deps.reload();
      this.chosen = null;
    }
    return {
      status: result.status,
      counts: result.tables.map((t) => ({ table: t.table, imported: t.imported })),
    };
  }
}
