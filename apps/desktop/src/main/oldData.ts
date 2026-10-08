// Bringing over the old app's saved data, the one time it is wanted. The old file is looked for
// in its usual place, or the person chooses it in a file window. The page never learns where it
// is. Nothing is ever written over saved data: the importer refuses a database that holds any.

import { ImportV1Error, importV1Database } from '@loadout/storage';
import type { Store } from '@loadout/storage';
import { existsSync } from 'node:fs';
import path from 'node:path';
import type { OldDataFind, OldDataResult, OldDataSource } from '../shared/oldData';
import { ChannelRefusal } from './channels';

/** Where the old app kept its data: the OneDrive "Desktop App - Loadout Builder" folder. */
export function usualOldDbPath(home: string): string {
  return path.join(home, 'OneDrive', 'Desktop App - Loadout Builder', 'data', 'loadout.db');
}

export interface OldDataDeps {
  /** The old app's file in its usual place (it may not be there). */
  usualFile(): string;
  /** The open real database, or null when it could not be opened. */
  store(): Store | null;
  /** True while demo mode is on. */
  demo(): boolean;
  /** Shows the file window for the old app's file. The chosen file, or null. */
  pickFile(): Promise<string | null>;
  /** Builds the day's data again on what is now saved. */
  rebuild(): void;
}

export class OldData {
  private chosen: string | null = null;

  constructor(private readonly deps: OldDataDeps) {}

  find(): OldDataFind {
    const demo = this.deps.demo();
    const store = this.deps.store();
    const empty = store !== null && Object.values(store.tableCounts()).every((n) => n === 0);
    return { found: existsSync(this.deps.usualFile()), empty, demo };
  }

  /** Remembers the file the person chose. Whether they chose one. */
  async pick(): Promise<boolean> {
    const file = await this.deps.pickFile();
    // Only a file the person chose in the file window can be read later, and only a .db file.
    this.chosen = file !== null && file.toLowerCase().endsWith('.db') ? file : null;
    return this.chosen !== null;
  }

  run(from: OldDataSource): OldDataResult {
    if (this.deps.demo()) {
      throw new ChannelRefusal(
        'refused',
        'Demo mode is on. Turn it off first, then bring over your old data.',
      );
    }
    const store = this.deps.store();
    if (store === null) throw new ChannelRefusal('no-data');
    const source = from === 'usual' ? this.deps.usualFile() : this.chosen;
    if (source === null) throw new ChannelRefusal('not-allowed');

    let result;
    try {
      result = importV1Database(source, store);
    } catch (error) {
      if (error instanceof ImportV1Error && error.code === 'source-missing') {
        throw new ChannelRefusal(
          'refused',
          "The old app's data file was not found. Use Choose a different file to find it.",
        );
      }
      if (error instanceof ImportV1Error) {
        throw new ChannelRefusal(
          'refused',
          "That file could not be read as the old app's data. Choose the file called loadout.db from the old app's data folder.",
        );
      }
      throw error;
    }
    if (result.status === 'imported') this.deps.rebuild();
    if (result.status === 'imported') this.chosen = null;
    return {
      status: result.status,
      counts: result.tables.map((t) => ({ table: t.table, imported: t.imported })),
    };
  }
}
