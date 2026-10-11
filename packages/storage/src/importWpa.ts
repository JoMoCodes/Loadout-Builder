import Database from 'better-sqlite3';
import { copyFileSync, existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PERF_TABLES } from './migrations';
import type { PerfTable } from './migrations';
import { legacyColumn, PERF_TABLE_SPECS } from './perfTables';
import { PerformanceStore } from './performance';
import type { Store } from './store';

/**
 * One-time import of the old Weekly Performance app's `app.db` into the performance tables.
 *
 * Behaviour, in short (the same rules as the load-out import in ./importV1.ts):
 * - The old file is never changed. It is copied to a temporary folder first and read from there.
 * - Every one of its 13 tables is copied as it is, in one transaction: all of it lands or none.
 *   Rows keep their ids (metric entries point at scorecards by id) and their saved order.
 * - Only while every performance table is empty; otherwise nothing is written and the result
 *   says `skipped`.
 * - An older database that lacks a table, or the columns the old app added later (the drivers'
 *   contact details, the scorecards' file name), is accepted: what is missing reads as empty.
 * - The result carries counts per table, never names or IDs.
 */
export interface WpaTableCount {
  table: PerfTable;
  /** Rows in the old database (0 if it has no such table). */
  source: number;
  /** Rows in the new database after the import. */
  imported: number;
}

export interface ImportWpaResult {
  status: 'imported' | 'skipped';
  /** Why it was skipped. Only set when status is 'skipped'. */
  reason?: 'destination-not-empty';
  tables: WpaTableCount[];
  /** True when every table has as many rows as it had before. */
  identical: boolean;
}

export class ImportWpaError extends Error {
  constructor(readonly code: 'source-missing' | 'source-unreadable') {
    super(`Could not import the old weekly performance database (${code}).`);
    this.name = 'ImportWpaError';
  }
}

type Row = Record<string, unknown>;

/** Copies the old app's database at `sourcePath` into `store`'s performance tables. */
export function importWpaDatabase(sourcePath: string, store: Store): ImportWpaResult {
  if (!existsSync(sourcePath)) throw new ImportWpaError('source-missing');

  const scratch = mkdtempSync(join(tmpdir(), 'loadout-wpa-import-'));
  try {
    const copy = join(scratch, 'app.db');
    copyFileSync(sourcePath, copy);
    for (const suffix of ['-wal', '-shm']) {
      if (existsSync(sourcePath + suffix)) copyFileSync(sourcePath + suffix, copy + suffix);
    }
    let src: Database.Database | undefined;
    try {
      src = new Database(copy);
      src.prepare('SELECT 1 FROM sqlite_master LIMIT 1').get();
    } catch {
      // Close the handle before the scratch folder is removed; on Windows an open file
      // cannot be deleted.
      src?.close();
      throw new ImportWpaError('source-unreadable');
    }
    try {
      return copyAll(src, store.db);
    } finally {
      src.close();
    }
  } finally {
    rmSync(scratch, { recursive: true, force: true, maxRetries: 3 });
  }
}

function hasTable(src: Database.Database, table: string): boolean {
  return !!src.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?").get(table);
}

function columnsOf(src: Database.Database, table: string): Set<string> {
  return new Set(
    (src.prepare(`PRAGMA table_info("${table}")`).all() as { name: string }[]).map((c) => c.name),
  );
}

function countSource(src: Database.Database): Record<PerfTable, number> {
  const out = {} as Record<PerfTable, number>;
  for (const spec of PERF_TABLE_SPECS) {
    out[spec.table] = hasTable(src, spec.legacy)
      ? (src.prepare(`SELECT COUNT(*) AS n FROM "${spec.legacy}"`).get() as { n: number }).n
      : 0;
  }
  return out;
}

function copyAll(src: Database.Database, db: Database.Database): ImportWpaResult {
  const perf = new PerformanceStore(db);
  const before = perf.perfTableCounts();
  const sourceCounts = countSource(src);
  const summary = (counts: Record<PerfTable, number>): WpaTableCount[] =>
    PERF_TABLES.map((table) => ({ table, source: sourceCounts[table], imported: counts[table] }));

  if (Object.values(before).some((n) => n > 0)) {
    return {
      status: 'skipped',
      reason: 'destination-not-empty',
      tables: summary(before),
      identical: false,
    };
  }

  // The old app did not always have its foreign-key checks on, so an old database can hold a
  // row whose driver or scorecard is gone. Copy it as it is rather than refuse the whole file.
  // (The setting cannot change inside a transaction, so it is turned off around it.)
  const foreignKeys = db.pragma('foreign_keys', { simple: true }) as number;
  db.pragma('foreign_keys = OFF');
  try {
    db.transaction(() => {
      for (const spec of PERF_TABLE_SPECS) {
        if (!hasTable(src, spec.legacy)) continue;
        const present = columnsOf(src, spec.legacy);
        const columns = spec.columns.filter(([, field]) => present.has(legacyColumn(field)));
        if (columns.length === 0) continue;
        // The rowid keeps the saved order for tables without an id of their own.
        const keepRowid = !spec.autoId;
        const select = [
          ...(keepRowid ? ['rowid AS "__rowid"'] : []),
          ...columns.map(([, field]) => `"${legacyColumn(field)}" AS "${field}"`),
        ].join(', ');
        const order = spec.autoId ? '"Id"' : 'rowid';
        const names = [...(keepRowid ? ['rowid'] : []), ...columns.map(([column]) => column)];
        const insert = db.prepare(
          `INSERT INTO ${spec.table} (${names.join(', ')}) VALUES (${names.map(() => '?').join(', ')})`,
        );
        // Whole numbers are read exactly: the auto-import record's times are too big for a
        // plain JavaScript number.
        const read = src
          .prepare(`SELECT ${select} FROM "${spec.legacy}" ORDER BY ${order}`)
          .safeIntegers(true);
        for (const row of read.iterate() as Iterable<Row>) {
          insert.run(
            ...[...(keepRowid ? ['__rowid'] : []), ...columns.map(([, field]) => field)].map(
              (key) => row[key] ?? null,
            ),
          );
        }
      }
      copySequences(src, db);
    })();
  } finally {
    db.pragma(`foreign_keys = ${foreignKeys ? 'ON' : 'OFF'}`);
  }

  const tables = summary(perf.perfTableCounts());
  return { status: 'imported', tables, identical: tables.every((t) => t.source === t.imported) };
}

/**
 * Carry over where each id counter had got to, so new rows are numbered after the old app's
 * last one (even one since deleted), the way the old app would have numbered them.
 */
function copySequences(src: Database.Database, db: Database.Database): void {
  if (!hasTable(src, 'sqlite_sequence')) return;
  const old = src
    .prepare('SELECT name, seq FROM sqlite_sequence')
    .safeIntegers(true)
    .all() as Array<{
    name: string;
    seq: bigint;
  }>;
  for (const spec of PERF_TABLE_SPECS) {
    if (!spec.autoId) continue;
    const entry = old.find((row) => row.name === spec.legacy);
    if (!entry) continue;
    const changed = db
      .prepare('UPDATE sqlite_sequence SET seq = MAX(seq, ?) WHERE name = ?')
      .run(entry.seq, spec.table).changes;
    if (changed === 0) {
      db.prepare('INSERT INTO sqlite_sequence (name, seq) VALUES (?, ?)').run(
        spec.table,
        entry.seq,
      );
    }
  }
}
